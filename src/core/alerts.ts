import { friendlyDate, friendlyTime } from './dates';
import { dueAt } from './tasks';
import type { Task } from './types';

// Reminder alerts: the pop-up window, its sound, and snoozing.
// All of this is device-local (local:* keys), so each browser profile decides
// for itself whether it wants to be interrupted.

export interface AlertItem {
  taskId: string;
  /** When the reminder fired. */
  at: number;
  test?: boolean;
}

export interface AlertPrefs {
  popup: boolean;
  sound: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { popup: true, sound: true };

/** local:* key names */
export const ALERTS = 'alerts';
export const ALERT_WINDOW = 'alertWindow';
export const SNOOZES = 'snoozes';
export const ALERT_PREFS = 'alertPrefs';

export const TEST_ALERT_ID = 'test';

export const SNOOZE_OPTIONS = [
  { minutes: 5, label: '5 min' },
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 hour' },
];

/** Adds new alerts, keeping one entry per task (the newest). */
export function mergeAlerts(current: AlertItem[], incoming: AlertItem[]): AlertItem[] {
  const byTask = new Map(current.map((a) => [a.taskId, a]));
  for (const item of incoming) byTask.set(item.taskId, item);
  return [...byTask.values()];
}

/** "Due now", "Due in 15 min · 3:30 PM", "Overdue · was due Today at 2:00 PM" */
export function describeDue(task: Task, now = Date.now()): string {
  const due = dueAt(task);
  if (due == null) return '';
  const when = `${friendlyDate(task.due, now)}${task.dueTime ? ` at ${friendlyTime(task.dueTime)}` : ''}`;
  const minutes = Math.round((due - now) / 60000);
  if (Math.abs(minutes) <= 1 && task.dueTime) return `Due now · ${when}`;
  if (minutes > 1 && minutes < 60) return `Due in ${minutes} min · ${when}`;
  if (minutes >= 60 && minutes < 24 * 60 && task.dueTime) return `Due in ${Math.round(minutes / 60)} h · ${when}`;
  if (minutes < -1) return `Overdue · was due ${when}`;
  return `Due ${when}`;
}
