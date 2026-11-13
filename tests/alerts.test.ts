import { describe, expect, it } from 'vitest';
import { describeDue, mergeAlerts } from '../src/core/alerts';
import { newTask } from '../src/core/types';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();

describe('reminder alerts', () => {
  it('keeps one alert per task, newest wins', () => {
    const merged = mergeAlerts([{ taskId: 'a', at: 1 }, { taskId: 'b', at: 1 }], [{ taskId: 'a', at: 5 }, { taskId: 'c', at: 5 }]);
    expect(merged).toEqual([{ taskId: 'a', at: 5 }, { taskId: 'b', at: 1 }, { taskId: 'c', at: 5 }]);
  });

  it('says when a task is due', () => {
    const task = newTask({ due: '2026-11-14', dueTime: '15:00' });
    expect(describeDue(task, at(2026, 11, 14, 15, 0))).toMatch(/^Due now · Today at/);
    expect(describeDue(task, at(2026, 11, 14, 14, 45))).toMatch(/^Due in 15 min · Today at/);
    expect(describeDue(task, at(2026, 11, 14, 13, 0))).toMatch(/^Due in 2 h · Today at/);
    expect(describeDue(task, at(2026, 11, 14, 16, 30))).toMatch(/^Overdue · was due Today at/);
    expect(describeDue(task, at(2026, 11, 13, 9, 0))).toMatch(/^Due Tomorrow at/);
  });

  it('handles a deadline with no time', () => {
    const task = newTask({ due: '2026-11-14' });
    expect(describeDue(task, at(2026, 11, 14, 9, 0))).toBe('Due Today');
    expect(describeDue(newTask(), at(2026, 11, 14, 9, 0))).toBe('');
  });
});
