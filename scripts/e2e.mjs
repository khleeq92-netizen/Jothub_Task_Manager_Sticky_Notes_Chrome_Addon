// End-to-end smoke test: loads the built extension (dist/) into a real Chrome
// with a throwaway profile and exercises the service worker, the floating
// notes on a web page, the quick-task form and the hub pages.
//
//   npm run build && node scripts/e2e.mjs
//
// Set CHROME_PATH if Chrome is not in its default location.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH.');

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value || Date.now() > end) return value;
    await wait(100);
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><title>Test page ${req.url}</title><body style="height:2000px"><h1>Test page</h1><p id="p">Some text to select on ${req.url}</p></body>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jot-hub-e2e-'));
const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, enableExtensions: true, userDataDir: profile, args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--no-first-run', '--no-default-browser-check'] });

try {
  const id = await browser.installExtension(dist);
  check('extension installs', !!id, id);

  const workerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id), { timeout: 10000 });
  const worker = await workerTarget.worker();
  worker.on('console', (m) => m.type() === 'error' && problems.push(`worker: ${m.text()}`));
  const sw = (fn, ...args) => worker.evaluate(fn, ...args);
  const records = () => sw(async () => Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith('r:')).map(([, v]) => v));

  check('service worker starts', true);
  const commands = await sw(() => chrome.commands.getAll());
  check('four keyboard commands registered', commands.length === 4, commands.map((c) => `${c.name}=${c.shortcut || 'unset'}`).join(', '));
  const alarms = await until(async () => {
    const all = await sw(() => chrome.alarms.getAll());
    return all.some((a) => a.name === 'sync') && all.some((a) => a.name === 'maintenance') ? all : null;
  });
  check('sync and maintenance alarms scheduled', !!alarms);

  // ---- floating note on a web page ----
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`page: ${e.message}`));
  await page.goto(`${base}/article?x=1`);
  await wait(400);
  const send = (message) => sw(async (msg, urlPrefix) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.startsWith(urlPrefix)) ?? tabs.find((t) => t.active);
    return chrome.tabs.sendMessage(tab.id, msg);
  }, message, base);

  check('page with no notes gets no injected UI', await page.evaluate(() => !document.querySelector('jot-hub-notes')));
  check('content script answers a message', (await send({ type: 'jh-new-note', text: 'Captured selection' })) === true);
  const noteSel = () => page.evaluate(() => document.querySelector('jot-hub-notes')?.shadowRoot?.querySelectorAll('.note').length ?? 0);
  check('sticky note appears on the page', (await until(async () => (await noteSel()) === 1)) === true);
  check('selected text is captured into the note', await page.evaluate(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('.body blockquote')?.textContent === 'Captured selection'));

  // type into the note (the editor is focused after creation)
  await page.keyboard.type('Typed on the page');
  const stored = await until(async () => (await records()).find((r) => r.type === 'note' && r.text.includes('Typed on the page')));
  check('typing auto-saves to storage', !!stored, stored ? `scope=${stored.scope} url=${stored.url}` : '');
  check('note is attached to this page', stored?.scope === 'page' && stored?.url === `${base}/article?x=1`);

  // checklist button inside the shadow root
  await page.evaluate(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('button[title="Checklist"]').click());
  await page.keyboard.type('todo item');
  const withList = await until(async () => (await records()).find((r) => r.type === 'note' && r.html.includes('class="checklist"')));
  check('formatting toolbar works inside the page', !!withList);

  // drag by the header
  const box = await page.evaluate(() => {
    const r = document.querySelector('jot-hub-notes').shadowRoot.querySelector('.head .grip').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y + 120, { steps: 6 });
  await page.mouse.up();
  const moved = await until(async () => (await records()).find((r) => r.type === 'note' && r.pos && Math.abs(r.pos.y - (box.y + 120)) < 40));
  check('dragging moves the note and saves its position', !!moved, moved ? JSON.stringify(moved.pos) : '');

  // persistence across reload, and scoping to the page
  await page.reload();
  check('note reappears after reloading the page', (await until(async () => (await noteSel()) === 1)) === true);
  check('text survives the reload', await page.evaluate(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('.body').innerText.includes('Typed on the page')));
  await page.goto(`${base}/other-page`);
  await wait(600);
  check('note does not show on a different page', (await noteSel()) === 0);

  // ---- quick task from a page ----
  check('quick-task form opens', (await send({ type: 'jh-quick-task', text: 'Follow up on this article' })) === true);
  await until(() => page.evaluate(() => !!document.querySelector('jot-hub-notes')?.shadowRoot?.querySelector('form.card')));
  await page.evaluate(() => {
    const form = document.querySelector('jot-hub-notes').shadowRoot.querySelector('form.card');
    [...form.querySelectorAll('button')].find((b) => b.textContent === 'Tomorrow').click();
    form.requestSubmit();
  });
  const task = await until(async () => (await records()).find((r) => r.type === 'task'));
  check('quick task is saved with its source page', task?.title === 'Follow up on this article' && task?.sourceUrl === `${base}/other-page` && !!task?.due, task ? `due=${task.due} reminder=${task.reminder}` : '');
  const reminderAlarm = await until(async () => (await sw(() => chrome.alarms.getAll())).find((a) => a.name === 'reminder'), 5000);
  check('a reminder alarm is scheduled for the task', !!reminderAlarm, reminderAlarm ? new Date(reminderAlarm.scheduledTime).toLocaleString() : '');

  // ---- hub pages ----
  for (const file of ['app.html', 'popup.html', 'panel.html']) {
    const hub = await browser.newPage();
    const errors = [];
    hub.on('pageerror', (e) => errors.push(e.message));
    hub.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await hub.goto(`chrome-extension://${id}/${file}#/notes`);
    const loaded = await until(() => hub.evaluate(() => document.querySelectorAll('.note-card').length === 1), 6000);
    check(`${file} loads and shows the note made on the page`, !!loaded && errors.length === 0, errors.join(' | '));
    if (file === 'app.html') {
      await hub.evaluate(() => (location.hash = '#/tasks'));
      const seen = await until(() => hub.evaluate(() => [...document.querySelectorAll('.task-title')].some((e) => e.textContent === 'Follow up on this article')));
      check('hub lists the task created from the page', !!seen);
      // complete it in the hub, then confirm the stored record changed
      await hub.evaluate(() => document.querySelector('.task-row .check').click());
      const done = await until(async () => (await records()).find((r) => r.type === 'task' && r.status === 'completed'));
      check('completing a task in the hub saves to storage', !!done);
      // a hub edit reaches the open web page live
      await page.goto(`${base}/article?x=1`);
      await until(async () => (await noteSel()) === 1);
      await hub.evaluate(() => (location.hash = '#/notes'));
      await until(() => hub.evaluate(() => !!document.querySelector('.note-card')));
      await hub.evaluate(() => document.querySelector('.note-card').click());
      await until(() => hub.evaluate(() => !!document.querySelector('.editor-title')));
      await hub.type('.editor-title', 'Renamed in hub');
      const live = await until(() => page.evaluate(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('.title').value === 'Renamed in hub'));
      check('editing in the hub updates the floating note live', !!live);
    }
    await hub.close();
  }

  // ---- removing a note from the page, from the note itself ----
  const shadow = (fn) => page.evaluate(fn);
  await shadow(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('button[aria-label="More options"]').click());
  const menuInfo = await shadow(() => {
    const root = document.querySelector('jot-hub-notes').shadowRoot;
    const items = [...root.querySelectorAll('.menu .item')];
    const last = items.at(-1).getBoundingClientRect();
    const hit = root.elementFromPoint(last.x + 10, last.y + last.height / 2);
    return { labels: items.map((i) => i.textContent), lastReachable: hit === items.at(-1), inWindow: last.bottom <= innerHeight };
  });
  check('note menu shows every option without being cut off', menuInfo.lastReachable && menuInfo.inWindow && menuInfo.labels.includes('Remove from page (keep note)') && menuInfo.labels.includes('Delete note'), menuInfo.labels.join(' / '));
  await shadow(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('button[aria-label="Remove from this page"]').click());
  check('close button removes the note from the page', (await until(async () => (await noteSel()) === 0)) === true);
  const kept = await until(async () => (await records()).find((r) => r.type === 'note' && r.scope === 'none' && !r.deletedAt));
  check('the removed note is kept in the hub', !!kept);
  await shadow(() => document.querySelector('jot-hub-notes').shadowRoot.querySelector('.toast button').click());
  check('Undo puts the note back on the page', (await until(async () => (await noteSel()) === 1)) === true);

  // ---- sync stays off (and harmless) without an account ----
  const status = await sw(async () => (await chrome.storage.local.get('local:syncStatus'))['local:syncStatus'] ?? { state: 'off' });
  check('cloud sync is off until the user signs in', status.state === 'off');
  check('no runtime errors', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
