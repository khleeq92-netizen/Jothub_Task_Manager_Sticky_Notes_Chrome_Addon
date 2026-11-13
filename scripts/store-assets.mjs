// Generates the Chrome Web Store images into store/:
//   5 screenshots (1280x800), the small promo tile (440x280) and the marquee (1400x560).
// Uses demo data in a throwaway browser profile; your own data is never touched.
//   npm run build && node scripts/store-assets.mjs        (set CHROME_PATH if needed)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'store');
fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH.');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const png = (buffer) => `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
const icon = png(fs.readFileSync(path.join(root, 'public/icons/icon128.png')));

// ---- an invented article page for the floating notes ----
const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><title>Plan a calmer week</title>
<style>
  body { margin: 0; font: 18px/1.65 Georgia, 'Times New Roman', serif; color: #222; background: #fbfaf7; }
  header { padding: 18px 48px; border-bottom: 1px solid #e6e1d6; font: 600 15px system-ui, sans-serif; letter-spacing: .04em; color: #6b5f4b; background: #fff; }
  main { max-width: 640px; margin: 0 0 0 64px; padding: 36px 0 80px; }
  h1 { font-size: 40px; line-height: 1.15; margin: 0 0 8px; }
  .meta { font: 14px system-ui, sans-serif; color: #8a8173; margin-bottom: 28px; }
  h2 { font-size: 24px; margin: 32px 0 6px; }
</style></head><body>
<header>THE PLANNING JOURNAL</header>
<main>
  <h1>Plan a calmer week in 20 minutes</h1>
  <div class="meta">6 min read</div>
  <p>Most weeks go wrong on Monday morning, when everything feels urgent at once. A short plan the evening before changes that. You decide what matters while you are calm, not while the inbox is shouting.</p>
  <h2>1. Empty your head first</h2>
  <p>Write down every task, errand and worry you can think of. Do not sort yet. The goal is to get it out of your memory and onto a list you trust.</p>
  <h2>2. Pick three outcomes</h2>
  <p>From that list, choose the three things that would make the week a success. Give each one a day and a time. Everything else is optional.</p>
  <h2>3. Protect the time</h2>
  <p>Block the slots in your calendar and set a reminder a little before each one, so the plan reaches you when it matters.</p>
</main></body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(ARTICLE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const articleUrl = `${base}/plan-a-calmer-week`;

// ---- demo data ----
const DAY = 86400000;
// Demo clock: the pictures always show a morning, whenever they are made.
const clockAt = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const now = clockAt(9, 40);
const pad = (n) => String(n).padStart(2, '0');
const date = (offset) => {
  const d = new Date(now + offset * DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
let seq = 0;
const rec = (type, extra, age = 0) => ({ id: `demo-${type}-${++seq}`, type, createdAt: now - age, updatedAt: now - age, deletedAt: null, ...extra });
const html = (...lines) => lines.join('');
const note = (title, body, text, extra = {}, age = 0) =>
  rec('note', { title, html: body, text, color: 'yellow', folderId: null, pinned: false, favorite: false, scope: 'none', url: '', host: '', pos: null, minimized: false, font: '', ...extra }, age);
const task = (title, extra = {}, age = 0) =>
  rec('task', { title, description: '', start: '', due: '', dueTime: '', priority: 'medium', category: '', tags: [], status: 'pending', completedAt: null, recurrence: 'none', subtasks: [], noteIds: [], reminder: null, favorite: false, sourceUrl: '', ...extra }, age);

const work = rec('folder', { name: 'Work', color: 'blue' });
const college = rec('folder', { name: 'College', color: 'green' });
const personal = rec('folder', { name: 'Personal', color: 'pink' });

const reminderTask = task('Submit the quarterly report', { due: date(0), dueTime: '17:00', priority: 'high', category: 'Work', reminder: 15, description: 'Final numbers from finance, then send to the team before 5 PM.', subtasks: [{ id: 's1', title: 'Get final numbers', done: true }, { id: 's2', title: 'Write summary', done: true }, { id: 's3', title: 'Send to the team', done: false }] });
const records = [
  work,
  college,
  personal,
  note('Plan for the week', html('<p><b>Top three this week</b></p><ul><li>Quarterly report (Fri)</li><li>Exam revision, chapters 3–5</li><li>Book the car service</li></ul>'), 'Top three this week\nQuarterly report (Fri)\nExam revision, chapters 3–5\nBook the car service', { pinned: true, color: 'yellow', folderId: work.id }, 20 * 60000),
  note('Project kickoff notes', html('<p>Owner: Priya · Launch target: end of month</p><ul><li>Agree scope by Wednesday</li><li>Design review Thursday 3 PM</li><li>Share timeline with the client</li></ul>'), 'Owner: Priya · Launch target: end of month\nAgree scope by Wednesday\nDesign review Thursday 3 PM\nShare timeline with the client', { color: 'blue', folderId: work.id }, 2 * 3600000),
  note('Exam topics', html('<ul><li>Cell structure and transport</li><li>Enzymes and reaction rates</li><li>Photosynthesis — light and dark stages</li></ul>'), 'Cell structure and transport\nEnzymes and reaction rates\nPhotosynthesis — light and dark stages', { color: 'green', folderId: college.id, favorite: true }, 5 * 3600000),
  note('Grocery list', html('<ul><li>Oats and milk</li><li>Spinach, tomatoes</li><li>Coffee beans</li><li>Batteries (AA)</li></ul>'), 'Oats and milk\nSpinach, tomatoes\nCoffee beans\nBatteries (AA)', { color: 'pink', folderId: personal.id }, 26 * 3600000),
  note('Ideas for the weekend', html('<p>Morning walk by the lake, try the new bakery, call grandma, finish the book.</p>'), 'Morning walk by the lake, try the new bakery, call grandma, finish the book.', { color: 'purple', folderId: personal.id }, 2 * DAY),
  note('Trading rules', html('<ol><li>Risk no more than 1% per trade</li><li>Always set a stop loss</li><li>Review the journal every Friday</li></ol>'), 'Risk no more than 1% per trade\nAlways set a stop loss\nReview the journal every Friday', { color: 'orange', pinned: true }, 3 * DAY),
  // floating on the article page
  note('Key idea', html('<p>Plan on <b>Sunday evening</b>, not Monday morning.</p><ul><li>Brain dump first</li><li>Then pick 3 outcomes</li></ul>'), 'Plan on Sunday evening, not Monday morning.\nBrain dump first\nThen pick 3 outcomes', { color: 'yellow', scope: 'page', url: articleUrl, host: '127.0.0.1', pos: { x: 760, y: 150, w: 290, h: 210 } }, 10 * 60000),
  note('Try this week', html('<ul><li>☐ Write the brain dump</li><li>☐ Block 3 focus slots</li><li>☐ Set reminders</li></ul>'), 'Write the brain dump\nBlock 3 focus slots\nSet reminders', { color: 'green', scope: 'page', url: articleUrl, host: '127.0.0.1', pos: { x: 790, y: 400, w: 260, h: 190 } }, 8 * 60000),
  reminderTask,
  task('Call the bank about the card renewal', { due: date(-1), dueTime: '11:00', priority: 'urgent', category: 'Personal' }, DAY),
  task('Prepare slides for Monday', { due: date(1), dueTime: '10:00', priority: 'medium', category: 'Work', reminder: 60, subtasks: [{ id: 'a', title: 'Outline', done: true }, { id: 'b', title: 'Charts', done: false }] }),
  task('Revise chapters 3–5', { due: date(2), priority: 'high', category: 'College', tags: ['exam'], reminder: 1440 }),
  task('Pay the electricity bill', { due: date(3), priority: 'medium', category: 'Personal', recurrence: 'monthly', reminder: 1440 }),
  task('Review the trading journal', { due: date(0), dueTime: '20:00', priority: 'low', category: 'Trading', recurrence: 'daily' }),
  task('Book the car service', { priority: 'low', category: 'Personal' }),
  task('Book a dentist appointment', { status: 'completed', completedAt: now - 2 * 3600000, priority: 'medium', category: 'Personal' }, DAY),
  task('Send the invoice to the client', { status: 'completed', completedAt: now - 4 * 3600000, due: date(0), priority: 'high', category: 'Work' }, DAY),
];
const stickyIds = records.filter((r) => r.type === 'note' && r.scope !== 'none').map((r) => r.id);

// ---- browser ----
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-store-'));
const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, enableExtensions: true, userDataDir: profile, args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--no-first-run', '--lang=en-US'] });
try {
  const id = await browser.installExtension(dist);
  const worker = await (await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id))).worker();
  await worker.evaluate(
    async (list, sticky) => {
      await chrome.storage.local.set(Object.fromEntries(list.map((r) => ['r:' + r.id, r])));
      await chrome.storage.local.set({ 'local:sticky': sticky, 'local:alertPrefs': { popup: false, sound: false } });
    },
    records,
    stickyIds,
  );
  const ext = (p) => `chrome-extension://${id}/${p}`;

  async function shot(url, width, height, before, at = now) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    // Shift this page's clock to the demo time.
    await page.evaluateOnNewDocument((offset) => {
      const Real = Date;
      class DemoDate extends Real {
        constructor(...args) {
          if (args.length) super(...args);
          else super(Real.now() + offset);
        }
        static now() {
          return Real.now() + offset;
        }
      }
      globalThis.Date = DemoDate;
    }, at - Date.now());
    await page.goto(url);
    await wait(1200);
    if (before) await before(page);
    const buffer = await page.screenshot({ type: 'png' });
    await page.close();
    return png(buffer);
  }

  // raw captures
  const article = await shot(articleUrl, 1180, 640);
  const articleNarrow = await shot(articleUrl, 820, 640, (page) => page.evaluate(() => document.querySelector('jot-hub-notes')?.remove()));
  const dashboard = await shot(ext('app.html#/'), 1180, 640);
  const tasks = await shot(ext(`app.html#/tasks/${reminderTask.id}`), 1180, 640);
  await worker.evaluate((taskId, at) => chrome.storage.local.set({ 'local:alerts': [{ taskId, at }] }), reminderTask.id, clockAt(16, 45));
  const alert = await shot(ext('alert.html'), 440, 296, undefined, clockAt(16, 45));
  const panel = await shot(ext('panel.html#/tasks'), 360, 640);

  // ---- compose: caption + a browser-window frame ----
  const frame = (inner, address = 'example.com/plan-a-calmer-week') => `
    <div class="win"><div class="bar"><i></i><i></i><i></i><span>${address}</span></div><div class="view">${inner}</div></div>`;
  const scene = (title, sub, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; width: 1280px; height: 800px; overflow: hidden; font-family: -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif;
      background: linear-gradient(135deg, #4f46e5 0%, #6d5ce8 55%, #8b7cf0 100%); color: #fff; }
    .cap { height: 112px; display: flex; flex-direction: column; justify-content: center; padding: 0 50px; }
    .cap h1 { margin: 0; font-size: 34px; letter-spacing: -0.01em; } .cap p { margin: 4px 0 0; font-size: 18px; opacity: .88; }
    .stage { position: relative; height: 688px; padding: 0 50px; }
    .win { position: absolute; left: 50px; top: 0; width: 1180px; height: 676px; border-radius: 12px 12px 0 0; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
    .bar { height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #ecebf2; color: #555; font-size: 13px; }
    .bar i { width: 11px; height: 11px; border-radius: 50%; background: #d4d2dc; } .bar span { margin-left: 14px; padding: 4px 14px; border-radius: 12px; background: #fff; min-width: 380px; }
    .view { position: relative; height: 640px; overflow: hidden; } .view img.full { width: 1180px; height: 640px; display: block; }
    .float { position: absolute; border-radius: 10px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.38); }
  </style></head><body><div class="cap"><h1>${title}</h1><p>${sub}</p></div><div class="stage">${body}</div></body></html>`;

  const scenes = [
    ['1-floating-notes', scene('Sticky notes that float on any web page', 'Pin a note to a page, a whole site or every website. Drag, resize and edit it in place.', frame(`<img class="full" src="${article}">`))],
    ['2-dashboard', scene('Your day at a glance', 'Due today, overdue, upcoming tasks, pinned notes and progress — in one place.', frame(`<img class="full" src="${dashboard}">`, 'Task-Mark-stickynote'))],
    ['3-tasks', scene('A task manager with deadlines and reminders', 'Priorities, categories, subtasks, repeating tasks and reminders before the deadline.', frame(`<img class="full" src="${tasks}">`, 'Task-Mark-stickynote'))],
    [
      '4-reminder',
      scene('Reminders you will not miss', 'A pop-up and a chime in front of whatever you are doing. Mark done or snooze in one click.', frame(`<img class="full" src="${article}" style="filter: brightness(.82)"><div class="float" style="left:370px; top:130px; width:440px; height:296px"><img src="${alert}" style="width:440px;height:296px;display:block"></div>`)),
    ],
    [
      '5-side-panel',
      scene('Keep it open beside any page', 'Use the side panel, the toolbar pop-up or a full tab. Your notes and tasks sync across your computers.', frame(`<div style="display:flex"><img src="${articleNarrow}" style="width:820px;height:640px;display:block"><img src="${panel}" style="width:360px;height:640px;display:block;border-left:1px solid #ddd"></div>`)),
    ],
  ];

  const render = async (htmlText, width, height, file) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(htmlText, { waitUntil: 'load' });
    await wait(300);
    await page.screenshot({ path: file, type: 'png' });
    await page.close();
  };
  for (const [name, htmlText] of scenes) await render(htmlText, 1280, 800, path.join(out, 'screenshots', `${name}.png`));

  // ---- promo images ----
  const promo = (w, h, big) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; display: flex; align-items: center; gap: ${big ? 48 : 22}px; padding: 0 ${big ? 90 : 34}px; box-sizing: border-box;
      font-family: -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #7c6cf0 100%); }
    img.icon { width: ${big ? 190 : 104}px; height: ${big ? 190 : 104}px; filter: drop-shadow(0 10px 22px rgba(0,0,0,.3)); }
    h1 { margin: 0; font-size: ${big ? 62 : 30}px; letter-spacing: -0.02em; line-height: 1.05; } p { margin: ${big ? 16 : 8}px 0 0; font-size: ${big ? 26 : 15}px; opacity: .9; line-height: 1.35; }
    ${big ? `.shot { margin-left: auto; width: 520px; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }` : ''}
  </style></head><body><img class="icon" src="${icon}"><div><h1>Task-Mark<br>stickynote</h1><p>Sticky notes on any page,<br>tasks and reminders${big ? ' that sync across your computers.' : '.'}</p></div>${big ? `<img class="shot" src="${dashboard}">` : ''}</body></html>`;
  await render(promo(440, 280, false), 440, 280, path.join(out, 'promo-small-440x280.png'));
  await render(promo(1400, 560, true), 1400, 560, path.join(out, 'promo-marquee-1400x560.png'));
  fs.copyFileSync(path.join(root, 'public/icons/icon128.png'), path.join(out, 'store-icon-128.png'));
  console.log('Wrote store/ images:');
  for (const f of [...fs.readdirSync(path.join(out, 'screenshots')).map((f) => `screenshots/${f}`), 'promo-small-440x280.png', 'promo-marquee-1400x560.png', 'store-icon-128.png']) console.log('  store/' + f);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
