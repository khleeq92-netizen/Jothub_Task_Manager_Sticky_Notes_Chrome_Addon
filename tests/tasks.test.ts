import { describe, expect, it } from 'vitest';
import { addMonths, startOfWeek } from '../src/core/dates';
import { completeTask, displayStatus, dueAt, nextDate, reminderAt, reopenTask } from '../src/core/tasks';
import { newTask } from '../src/core/types';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('task status', () => {
  it('is overdue once the deadline has passed', () => {
    const task = newTask({ due: '2026-11-13', dueTime: '14:00' });
    expect(displayStatus(task, at(2026, 11, 13, 13, 59))).toBe('pending');
    expect(displayStatus(task, at(2026, 11, 13, 14, 1))).toBe('overdue');
    expect(displayStatus({ ...task, status: 'in_progress' }, at(2026, 11, 13, 9))).toBe('in_progress');
    expect(displayStatus({ ...task, status: 'completed' }, at(2026, 12, 1))).toBe('completed');
  });

  it('gives a task without a time until the end of its due day', () => {
    const task = newTask({ due: '2026-11-13' });
    expect(displayStatus(task, at(2026, 11, 13, 23, 30))).toBe('pending');
    expect(displayStatus(task, at(2026, 11, 14, 0, 1))).toBe('overdue');
    expect(dueAt(newTask())).toBeNull();
  });
});

describe('reminders', () => {
  it('fires the chosen number of minutes before the deadline', () => {
    const task = newTask({ due: '2026-11-13', dueTime: '14:00', reminder: 30 });
    expect(reminderAt(task)).toBe(at(2026, 11, 13, 13, 30));
    expect(reminderAt({ ...task, reminder: null })).toBeNull();
    expect(reminderAt({ ...task, status: 'completed' })).toBeNull();
    expect(reminderAt({ ...task, deletedAt: 1 })).toBeNull();
  });

  it('treats a date-only task as due at 9:00', () => {
    expect(reminderAt(newTask({ due: '2026-11-13', reminder: 0 }))).toBe(at(2026, 11, 13, 9));
    expect(reminderAt(newTask({ due: '2026-11-13', reminder: 1440 }))).toBe(at(2026, 11, 12, 9));
  });
});

describe('recurring tasks', () => {
  it('computes the next date for each pattern', () => {
    expect(nextDate('2026-11-13', 'daily')).toBe('2026-11-14');
    expect(nextDate('2026-11-13', 'weekdays')).toBe('2026-11-16'); // Friday → Monday
    expect(nextDate('2026-11-13', 'weekly')).toBe('2026-11-20');
    expect(nextDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDate('2024-02-29', 'yearly')).toBe('2025-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('creates the next occurrence when a repeating task is completed', () => {
    const task = newTask({ title: 'Water plants', start: '2026-11-12', due: '2026-11-13', recurrence: 'weekly', subtasks: [{ id: 's', title: 'fern', done: true }] });
    const { done, next } = completeTask(task, at(2026, 11, 13));
    expect(done).toMatchObject({ status: 'completed', recurrence: 'none' });
    expect(next).toMatchObject({ status: 'pending', due: '2026-11-20', start: '2026-11-19', recurrence: 'weekly', title: 'Water plants' });
    expect(next!.id).not.toBe(task.id);
    expect(next!.subtasks[0].done).toBe(false);
  });

  it('skips missed occurrences so the next one is in the future', () => {
    const { next } = completeTask(newTask({ due: '2026-11-01', recurrence: 'daily' }), at(2026, 11, 13));
    expect(next!.due).toBe('2026-11-14');
  });

  it('does not repeat one-off tasks, and can reopen', () => {
    const { done, next } = completeTask(newTask({ due: '2026-11-13' }), at(2026, 11, 13));
    expect(next).toBeNull();
    expect(reopenTask(done)).toMatchObject({ status: 'pending', completedAt: null });
  });
});

describe('calendar helpers', () => {
  it('finds the start of the week for Monday and Sunday starts', () => {
    expect(startOfWeek('2026-11-13', 1)).toBe('2026-11-09');
    expect(startOfWeek('2026-11-13', 0)).toBe('2026-11-08');
    expect(startOfWeek('2026-11-09', 1)).toBe('2026-11-09');
  });
});
