import { addDays, addMonths, parseDate, today } from './dates';
import { uid, type Priority, type Recurrence, type Task } from './types';

export type DisplayStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
};
export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};
export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At the deadline' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

function at(date: string, time: string, fallback: [number, number, number]): number {
  const d = parseDate(date);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else d.setHours(...fallback, 0);
  return d.getTime();
}

/** The moment a task becomes overdue. Without a time, that is the end of its due day. */
export const dueAt = (task: Task): number | null => (task.due ? at(task.due, task.dueTime, [23, 59, 59]) : null);

/** When to notify. Tasks without a time are treated as due at 9:00 for reminders. */
export function reminderAt(task: Task): number | null {
  if (!task.due || task.reminder == null || task.status === 'completed' || task.deletedAt) return null;
  return at(task.due, task.dueTime, [9, 0, 0]) - task.reminder * 60000;
}

export function displayStatus(task: Task, now = Date.now()): DisplayStatus {
  if (task.status === 'completed') return 'completed';
  const due = dueAt(task);
  return due != null && due < now ? 'overdue' : task.status;
}

export function nextDate(date: string, recurrence: Recurrence): string {
  switch (recurrence) {
    case 'daily':
      return addDays(date, 1);
    case 'weekdays': {
      let next = addDays(date, 1);
      while ([0, 6].includes(parseDate(next).getDay())) next = addDays(next, 1);
      return next;
    }
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addMonths(date, 12);
    default:
      return date;
  }
}

/**
 * Completes a task. A repeating task is closed as a one-off and a fresh copy
 * is returned for its next occurrence (always after today).
 */
export function completeTask(task: Task, now = Date.now()): { done: Task; next: Task | null } {
  const done: Task = { ...task, status: 'completed', completedAt: now, recurrence: 'none' };
  if (task.recurrence === 'none') return { done, next: null };

  const t = today(now);
  const from = task.due || t;
  let due = nextDate(from, task.recurrence);
  while (due <= t) due = nextDate(due, task.recurrence);
  const shift = Math.round((parseDate(due).getTime() - parseDate(from).getTime()) / 86400000);

  const next: Task = {
    ...task,
    id: uid(),
    status: 'pending',
    completedAt: null,
    due,
    start: task.start ? addDays(task.start, shift) : '',
    subtasks: task.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
    createdAt: now,
    updatedAt: now,
  };
  return { done, next };
}

export const reopenTask = (task: Task): Task => ({ ...task, status: 'pending', completedAt: null });

export function compareTasks(now: number) {
  return (a: Task, b: Task) => {
    const da = dueAt(a) ?? Infinity;
    const db = dueAt(b) ?? Infinity;
    if (da !== db) return da - db;
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return a.createdAt - b.createdAt;
  };
}

export const isOpen = (task: Task) => task.status !== 'completed';
export const subtaskProgress = (task: Task) => `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`;
