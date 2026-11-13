import { ALERT_PREFS, ALERT_WINDOW, ALERTS, DEFAULT_ALERT_PREFS, mergeAlerts, SNOOZES, TEST_ALERT_ID, type AlertItem, type AlertPrefs } from '../core/alerts';
import { autoBackupDue } from '../core/backup';
import { friendlyDate, friendlyTime } from '../core/dates';
import { getLocal, loadAll, putRaw, rebuildStickyIndex, save, setLocal } from '../core/db';
import { hostOf, normalizeUrl, textToHtml } from '../core/notes';
import { loadSettings } from '../core/settings';
import { reminderAt } from '../core/tasks';
import { newNote, newTask, tombstone, type Task } from '../core/types';
import { platform } from '../platform';
import { backupNow, runSync } from '../sync/engine';

// Background logic: reminders, sync scheduling, automatic backups, context
// menus and keyboard commands. Runs as the extension's service worker.

const DAY = 86400000;
const TRASH_DAYS = 30;

export function startBackground() {
  const p = platform;
  let reminderTimer: ReturnType<typeof setTimeout> | undefined;

  async function setup() {
    await p.menus.setup([
      { id: 'jh-note-selection', title: 'Add selection to a new sticky note', contexts: ['selection'] },
      { id: 'jh-note-page', title: 'New sticky note on this page', contexts: ['page'] },
      { id: 'jh-task', title: 'Create a task from this page', contexts: ['page', 'selection'] },
    ]);
    await p.alarms.set('sync', { periodInMinutes: 15 });
    await p.alarms.set('maintenance', { delayInMinutes: 2, periodInMinutes: 60 });
    await rebuildStickyIndex();
    await checkReminders();
  }

  /** Sends due reminders (and finished snoozes) and sets one alarm for the next upcoming one. */
  async function checkReminders() {
    const now = Date.now();
    const [records, reminded, snoozes, settings] = await Promise.all([
      loadAll(),
      getLocal<Record<string, number>>('reminded', {}),
      getLocal<Record<string, number>>(SNOOZES, {}),
      loadSettings(),
    ]);
    const tasks = new Map(records.filter((r): r is Task => r.type === 'task' && !r.purged).map((t) => [t.id, t]));
    const due: Task[] = [];
    let next = Infinity;
    let changed = false;
    for (const task of tasks.values()) {
      const when = reminderAt(task);
      if (when == null || reminded[task.id] === when) continue;
      if (when > now) {
        next = Math.min(next, when);
        continue;
      }
      reminded[task.id] = when;
      changed = true;
      if (now - when < DAY) due.push(task);
    }
    let snoozesChanged = false;
    for (const [id, when] of Object.entries(snoozes)) {
      const task = tasks.get(id);
      if (!task || task.status === 'completed' || task.deletedAt) {
        delete snoozes[id];
        snoozesChanged = true;
      } else if (when <= now) {
        delete snoozes[id];
        snoozesChanged = true;
        if (!due.includes(task)) due.push(task);
      } else next = Math.min(next, when);
    }
    if (changed) await setLocal('reminded', reminded);
    if (snoozesChanged) await setLocal(SNOOZES, snoozes);
    if (next < Infinity) await p.alarms.set('reminder', { when: next });
    else await p.alarms.clear('reminder');
    if (due.length && settings.notifications) await raiseAlerts(due.map((t) => ({ taskId: t.id, at: now })), due);
  }

  /** The pop-up window in front of everything, the chime, and a system notification as a backup. */
  async function raiseAlerts(items: AlertItem[], tasks: Task[]) {
    const prefs = { ...DEFAULT_ALERT_PREFS, ...(await getLocal<Partial<AlertPrefs>>(ALERT_PREFS, {})) };
    await setLocal(ALERTS, mergeAlerts(await getLocal<AlertItem[]>(ALERTS, []), items));
    if (prefs.popup) {
      const open = await getLocal<number | null>(ALERT_WINDOW, null);
      if (open == null || !(await p.windows.raise(open))) {
        const id = await p.windows.alert(p.runtime.url('alert.html'), 440, 420);
        await setLocal(ALERT_WINDOW, id ?? null);
      }
    }
    if (prefs.sound) await p.sound.play();
    for (const task of tasks) await notify(task);
  }

  const notify = (task: Task) =>
    p.notifications.show(
      `task:${task.id}`,
      task.reminder === 0 ? 'Task due now' : 'Task reminder',
      `${task.title || 'Untitled task'} — due ${friendlyDate(task.due)}${task.dueTime ? ` at ${friendlyTime(task.dueTime)}` : ''}`,
    );

  async function snooze(taskId: string, minutes: number) {
    const snoozes = await getLocal<Record<string, number>>(SNOOZES, {});
    snoozes[taskId] = Date.now() + minutes * 60000;
    await setLocal(SNOOZES, snoozes);
    await checkReminders();
  }

  async function maintenance() {
    const now = Date.now();
    const records = await loadAll();

    // Empty trash items after 30 days, leaving a stub so the deletion syncs.
    const expired = records.filter((r) => !r.purged && r.deletedAt && now - r.deletedAt > TRASH_DAYS * DAY);
    if (expired.length) await putRaw(expired.map((r) => tombstone(r, now)));

    const settings = await loadSettings();
    if (autoBackupDue(settings.autoBackup, await getLocal('lastBackupAt', 0), now) && records.some((r) => !r.purged)) await backupNow('auto');
    await rebuildStickyIndex();
  }

  const openApp = (hash = '') => p.tabs.open(p.runtime.url('app.html') + hash);

  async function newNoteOn(tabId: number | undefined, text: string, pageUrl?: string) {
    if (tabId != null && (await p.tabs.send(tabId, { type: 'jh-new-note', text }))) return;
    // No content script there (browser pages, the Web Store): keep the note in the hub instead.
    const settings = await loadSettings();
    const web = pageUrl && /^https?:/.test(pageUrl);
    await save(newNote({ text, html: textToHtml(text), color: settings.noteColor, ...(web ? { scope: 'page' as const, url: normalizeUrl(pageUrl), host: hostOf(pageUrl) } : {}) }));
    await p.notifications.show(`saved:${Date.now()}`, 'Saved to Taskmark', web ? 'The note is in My Notes.' : 'Notes cannot float on this page, so it is in My Notes.');
  }

  async function quickTaskOn(tabId: number | undefined, text: string, pageUrl?: string) {
    if (tabId != null && (await p.tabs.send(tabId, { type: 'jh-quick-task', text }))) return;
    const settings = await loadSettings();
    const [task] = await save(newTask({ title: text.trim().slice(0, 140) || 'New task', sourceUrl: pageUrl ?? '', reminder: settings.defaultReminder }));
    await openApp(`#/tasks/${task.id}`);
  }

  p.runtime.onInstalled(() => void setup());
  p.runtime.onStartup(() => void setup());

  p.storage.onChanged((changes) => {
    if (!Object.keys(changes).some((key) => key.startsWith('r:'))) return;
    void p.alarms.set('sync-soon', { delayInMinutes: 0.5 });
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(() => void checkReminders(), 1500);
  });

  p.alarms.onAlarm((name) => {
    if (name === 'sync' || name === 'sync-soon') void runSync();
    else if (name === 'reminder') void checkReminders();
    else if (name === 'maintenance') void maintenance();
  });

  p.windows.onRemoved((id) => {
    void getLocal<number | null>(ALERT_WINDOW, null).then(async (open) => {
      if (open !== id) return;
      await setLocal(ALERT_WINDOW, null);
      await setLocal(ALERTS, []);
      await p.sound.stop();
    });
  });

  p.notifications.onClick((id) => {
    if (id.startsWith('task:')) void openApp(`#/tasks/${id.slice(5)}`);
    else void openApp('#/notes');
  });

  p.menus.onClick((click) => {
    if (click.id === 'jh-task') void quickTaskOn(click.tabId, click.selectionText ?? '', click.pageUrl);
    else void newNoteOn(click.tabId, click.id === 'jh-note-selection' ? (click.selectionText ?? '') : '', click.pageUrl);
  });

  p.commands.onCommand((name, tabId) => {
    if (name === 'new-note') void newNoteOn(tabId, '');
    else if (name === 'quick-task') void quickTaskOn(tabId, '');
    else if (name === 'open-hub') void openApp();
  });

  p.runtime.onMessage((message) => {
    switch (message?.type) {
      case 'sync-now':
        return runSync({ full: !!message.full });
      case 'backup-now':
        return backupNow('manual');
      case 'open-app':
        return openApp(typeof message.hash === 'string' ? message.hash : '').then(() => true);
      case 'check-reminders':
        return checkReminders().then(() => true);
      case 'snooze':
        return snooze(String(message.taskId), Number(message.minutes) || 5).then(() => true);
      case 'stop-sound':
        return p.sound.stop().then(() => true);
      case 'test-reminder':
        return raiseAlerts([{ taskId: TEST_ALERT_ID, at: Date.now(), test: true }], []).then(() => true);
    }
    return undefined;
  });
}
