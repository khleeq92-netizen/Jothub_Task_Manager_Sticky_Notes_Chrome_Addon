import { ArrowDown, ArrowUp, CalendarDays, Check, CheckSquare, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, Globe, Plus, RefreshCw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, addMonths, dateStr, friendlyDate, longDate, parseDate, startOfMonth, startOfWeek, timeAgo, today } from '../../core/dates';
import { compareTasks, displayStatus, isOpen, PRIORITY_LABEL } from '../../core/tasks';
import { PRIORITIES, WIDGETS, type Task, type Widget } from '../../core/types';
import type { SyncStatus } from '../../sync/engine';
import type { PublicAuth } from '../../sync/auth';
import { platform } from '../../platform';
import { createNote, createTask, requestSync, stickyOnPage } from '../actions';
import { NoteCard, TaskEditor, TaskRow } from '../components';
import { completeMany, restoreMany, trashMany, updateSettings, useData, useLocal, useNow } from '../store';
import { Empty, go, IconButton, Modal, PageHead, SelectBar, toast, useSelection } from '../ui';

// ---- shared: sync status ------------------------------------------------------

export function useSync() {
  const status = useLocal<SyncStatus>('syncStatus', { state: 'off' });
  const auth = useLocal<PublicAuth | null>('auth', null);
  const lastBackupAt = useLocal<number>('lastBackupAt', 0);
  const now = useNow();
  let label = 'Saved on this device';
  let tone: 'muted' | 'ok' | 'warn' | 'bad' = 'muted';
  if (auth) {
    if (status.state === 'syncing') label = 'Syncing…';
    else if (status.state === 'ok') {
      label = `Synced ${timeAgo(status.lastSyncAt ?? now, now)}`;
      tone = 'ok';
    } else if (status.state === 'offline') {
      label = 'Offline — will sync later';
      tone = 'warn';
    } else if (status.state === 'error') {
      label = 'Sync problem';
      tone = 'bad';
    } else label = 'Signed in';
  }
  return { status, auth, lastBackupAt, label, tone, now };
}

// ---- Tasks -------------------------------------------------------------------------

type Tab = 'all' | 'today' | 'week' | 'month' | 'done';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'done', label: 'Completed' },
];

interface Group {
  label: string;
  tasks: Task[];
  tone?: 'bad';
  showDate?: boolean;
}

export function TasksView({ id }: { id: string }) {
  const { tasks, settings } = useData();
  const now = useNow();
  const t = today(now);
  const [tab, setTab] = useState<Tab>('all');
  const [offset, setOffset] = useState(0);
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [quick, setQuick] = useState('');

  const categories = useMemo(() => [...new Set(tasks.map((x) => x.category).filter(Boolean))].sort(), [tasks]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((x) => x.tags))].sort(), [tasks]);

  const filtered = useMemo(
    () =>
      tasks
        .filter((x) => (!priority || x.priority === priority) && (!category || x.category === category) && (!tag || x.tags.includes(tag)) && (!status || displayStatus(x, now) === status))
        .sort(compareTasks(now)),
    [tasks, priority, category, tag, status, now],
  );

  let range = '';
  const groups: Group[] = [];
  const open = filtered.filter(isOpen);
  const overdue = open.filter((x) => displayStatus(x, now) === 'overdue');
  const notOverdue = open.filter((x) => displayStatus(x, now) !== 'overdue');

  if (tab === 'all') {
    groups.push({ label: 'Overdue', tasks: overdue, tone: 'bad' });
    groups.push({ label: 'Today', tasks: notOverdue.filter((x) => x.due === t), showDate: false });
    groups.push({ label: 'Upcoming', tasks: notOverdue.filter((x) => x.due > t) });
    groups.push({ label: 'No deadline', tasks: notOverdue.filter((x) => !x.due) });
  } else if (tab === 'today') {
    const day = addDays(t, offset);
    range = friendlyDate(day, now);
    if (offset === 0) groups.push({ label: 'Overdue', tasks: overdue.filter((x) => x.due < day), tone: 'bad' });
    groups.push({ label: 'Due this day', tasks: open.filter((x) => x.due === day), showDate: false });
    groups.push({ label: 'Starting this day', tasks: open.filter((x) => x.start === day && x.due !== day) });
    groups.push({ label: 'Completed', tasks: filtered.filter((x) => !isOpen(x) && (x.due === day || (x.completedAt != null && dateStr(new Date(x.completedAt)) === day))) });
  } else if (tab === 'week') {
    const start = addDays(startOfWeek(t, settings.weekStart), offset * 7);
    range = `${friendlyDate(start, now)} – ${friendlyDate(addDays(start, 6), now)}`;
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      groups.push({ label: friendlyDate(day, now), tasks: filtered.filter((x) => x.due === day), showDate: false, tone: undefined });
    }
  } else if (tab === 'month') {
    const first = addMonths(startOfMonth(t), offset);
    const next = addMonths(first, 1);
    range = parseDate(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const inMonth = filtered.filter((x) => x.due >= first && x.due < next);
    for (const day of [...new Set(inMonth.map((x) => x.due))].sort()) groups.push({ label: friendlyDate(day, now), tasks: inMonth.filter((x) => x.due === day), showDate: false });
  } else {
    groups.push({ label: 'Completed', tasks: filtered.filter((x) => !isOpen(x)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) });
  }

  const visible = groups.filter((g) => g.tasks.length || tab === 'week');
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const shownIds = [...new Set(visible.flatMap((g) => g.tasks.map((x) => x.id)))];

  const selection = useSelection();
  const trashChosen = (chosen: string[]) => {
    const moved = trashMany(chosen);
    selection.stop();
    if (id && moved.includes(id)) go('tasks');
    toast(`${moved.length} task${moved.length === 1 ? '' : 's'} moved to trash`, { label: 'Undo', run: () => restoreMany(moved) });
  };
  const completeChosen = (chosen: string[]) => {
    const n = completeMany(chosen);
    selection.stop();
    toast(n ? `${n} task${n === 1 ? '' : 's'} marked done` : 'Those tasks were already done');
  };

  const add = () => {
    if (!quick.trim()) return;
    createTask({ title: quick.trim(), due: tab === 'today' ? addDays(t, offset) : '' }, false);
    setQuick('');
  };
  const switchTab = (next: Tab) => {
    setTab(next);
    setOffset(0);
  };

  return (
    <div className="page">
      <PageHead title="Tasks" subtitle={`${tasks.filter(isOpen).length} open · ${tasks.filter((x) => displayStatus(x, now) === 'overdue').length} overdue`}>
        {tasks.length > 0 && !selection.active && <button className="btn" onClick={selection.start}><CheckSquare size={16} /> Select</button>}
        <button className="btn primary" onClick={() => createTask({ due: tab === 'today' ? addDays(t, offset) : '' })}><Plus size={16} /> New task</button>
      </PageHead>

      <div className="tabs" role="tablist" aria-label="Task views">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'active' : ''} onClick={() => switchTab(x.key)}>{x.label}</button>
        ))}
      </div>

      {range && (
        <div className="range">
          <IconButton label="Previous" onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></IconButton>
          <strong>{range}</strong>
          <IconButton label="Next" onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></IconButton>
          {offset !== 0 && <button className="btn small" onClick={() => setOffset(0)}>Today</button>}
        </div>
      )}

      <div className="filters">
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>
        <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        {categories.length > 0 && (
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tags.length > 0 && (
          <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Any tag</option>
            {tags.map((c) => <option key={c} value={c}>#{c}</option>)}
          </select>
        )}
      </div>

      {selection.active && (
        <SelectBar selection={selection} all={shownIds} noun={['task', 'tasks']}>
          {(chosen) => (
            <>
              <button type="button" className="btn small" disabled={!chosen.length} onClick={() => completeChosen(chosen)}><Check size={14} /> Mark done</button>
              <button type="button" className="btn small danger" disabled={!chosen.length} onClick={() => trashChosen(chosen)}><Trash2 size={14} /> Move to trash</button>
            </>
          )}
        </SelectBar>
      )}

      {tab !== 'done' && !selection.active && (
        <div className="quick-add">
          <Plus size={16} className="muted" />
          <input value={quick} placeholder={tab === 'today' ? 'Add a task for this day and press Enter' : 'Add a task and press Enter'} aria-label="Quick add task" onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>
      )}

      {total === 0 && tab !== 'week' ? (
        <Empty icon={<CheckSquare size={26} />} title={tasks.length ? 'Nothing here' : 'No tasks yet'} hint={tasks.length ? 'No tasks match this view and these filters.' : 'Type a task above and press Enter.'} />
      ) : (
        visible.map((g) => (
          <section key={g.label} className="section">
            <h2 className={g.tone === 'bad' ? 'bad' : ''}>{g.label} {g.tasks.length > 0 && <span className="count">{g.tasks.length}</span>}</h2>
            {g.tasks.length ? (
              <div className="panel list">
                {g.tasks.map((x) =>
                  selection.active ? (
                    <TaskRow key={x.id} task={x} showDate={g.showDate !== false} selected={selection.ids.has(x.id)} onSelect={() => selection.toggle(x.id)} />
                  ) : (
                    <TaskRow key={x.id} task={x} showDate={g.showDate !== false} />
                  ),
                )}
              </div>
            ) : (
              <p className="muted small nothing">Nothing due</p>
            )}
          </section>
        ))
      )}

      {id && <TaskEditor key={id} id={id} onClose={() => go('tasks')} />}
    </div>
  );
}

// ---- Calendar ----------------------------------------------------------------------

export function CalendarView() {
  const { tasks, settings } = useData();
  const now = useNow();
  const t = today(now);
  const [month, setMonth] = useState(startOfMonth(t));
  const [selected, setSelected] = useState(t);
  const [quick, setQuick] = useState('');

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of [...tasks].sort(compareTasks(now))) if (task.due) map.set(task.due, [...(map.get(task.due) ?? []), task]);
    return map;
  }, [tasks, now]);

  const start = startOfWeek(month, settings.weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = days.slice(0, 7).map((d) => parseDate(d).toLocaleDateString(undefined, { weekday: 'short' }));
  const dayTasks = byDay.get(selected) ?? [];

  const add = () => {
    if (!quick.trim()) return;
    createTask({ title: quick.trim(), due: selected }, false);
    setQuick('');
  };

  return (
    <div className="page">
      <PageHead title="Calendar" subtitle="Deadlines by day.">
        <div className="range inline">
          <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={18} /></IconButton>
          <strong>{parseDate(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></IconButton>
          <button className="btn small" onClick={() => { setMonth(startOfMonth(t)); setSelected(t); }}>Today</button>
        </div>
      </PageHead>
      <div className="cal-layout">
        <div className="cal" role="grid" aria-label="Month">
          {weekdays.map((w) => <div key={w} className="cal-weekday" role="columnheader">{w}</div>)}
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const openCount = list.filter(isOpen).length;
            return (
              <button
                key={day}
                role="gridcell"
                aria-selected={day === selected}
                aria-label={`${friendlyDate(day, now)}, ${list.length} task${list.length === 1 ? '' : 's'}`}
                className={`cal-day ${day.slice(0, 7) !== month.slice(0, 7) ? 'other' : ''} ${day === t ? 'today' : ''} ${day === selected ? 'selected' : ''}`}
                onClick={() => setSelected(day)}
              >
                <span className="cal-num">{Number(day.slice(8))}</span>
                {list.slice(0, 3).map((task) => (
                  <span key={task.id} className={`cal-chip prio-${task.priority} ${isOpen(task) ? '' : 'done'} ${displayStatus(task, now) === 'overdue' ? 'late' : ''}`}>{task.title || 'Untitled'}</span>
                ))}
                {list.length > 3 && <span className="cal-more">+{list.length - 3} more</span>}
                {openCount > 0 && <span className="cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <aside className="cal-side">
          <h2>{friendlyDate(selected, now)}</h2>
          <div className="quick-add">
            <Plus size={16} className="muted" />
            <input value={quick} placeholder="Add a task for this day" aria-label="Add a task for the selected day" onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          {dayTasks.length ? (
            <div className="panel list">{dayTasks.map((task) => <TaskRow key={task.id} task={task} showDate={false} />)}</div>
          ) : (
            <p className="muted small">No deadlines on this day.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---- Dashboard ----------------------------------------------------------------------

const WIDGET_LABEL: Record<Widget, string> = {
  overview: 'Daily overview',
  today: "Today's tasks",
  overdue: 'Overdue tasks',
  upcoming: 'Upcoming deadlines',
  pinned: 'Pinned notes',
  recent: 'Recently edited notes',
  sync: 'Sync and backup',
};

export function DashboardView() {
  const { tasks, notes, settings } = useData();
  const sync = useSync();
  const now = sync.now;
  const t = today(now);
  const [customizing, setCustomizing] = useState(false);

  const open = tasks.filter(isOpen).sort(compareTasks(now));
  const overdue = open.filter((x) => displayStatus(x, now) === 'overdue');
  const dueToday = open.filter((x) => x.due === t && displayStatus(x, now) !== 'overdue');
  const upcoming = open.filter((x) => x.due > t && x.due <= addDays(t, 7));
  const doneOn = (day: string) => tasks.filter((x) => x.completedAt != null && dateStr(new Date(x.completedAt)) === day).length;
  const doneToday = doneOn(t);
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)).map((day) => ({ day, count: doneOn(day) }));
  const peak = Math.max(1, ...week.map((d) => d.count));
  const planned = doneToday + dueToday.length + overdue.length;
  const percent = planned ? Math.round((doneToday / planned) * 100) : 0;
  const pinned = notes.filter((n) => n.pinned);
  const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const hour = new Date(now).getHours();

  const taskList = (list: Task[], emptyText: string) =>
    list.length ? (
      <div className="list">
        {list.slice(0, 6).map((x) => <TaskRow key={x.id} task={x} />)}
        {list.length > 6 && <button className="link" onClick={() => go('tasks')}>View all {list.length}</button>}
      </div>
    ) : (
      <p className="muted small">{emptyText}</p>
    );

  const widgets: Record<Widget, JSX.Element> = {
    overview: (
      <>
        <div className="stats">
          <div className="stat"><strong>{dueToday.length}</strong><span>Due today</span></div>
          <div className={`stat ${overdue.length ? 'bad' : ''}`}><strong>{overdue.length}</strong><span>Overdue</span></div>
          <div className="stat"><strong>{doneToday}</strong><span>Done today</span></div>
          <div className="stat"><strong>{notes.length}</strong><span>Notes</span></div>
        </div>
        <div className="progress" role="img" aria-label={`${percent}% of today's planned tasks done`}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <p className="muted small">{planned ? `${percent}% of today's plan done (${doneToday} of ${planned}).` : 'Nothing planned for today yet.'}</p>
        <div className="bars" role="img" aria-label={`Tasks completed in the last 7 days: ${week.map((d) => `${friendlyDate(d.day, now)} ${d.count}`).join(', ')}`}>
          {week.map((d) => (
            <div key={d.day} className="bar-col" title={`${friendlyDate(d.day, now)}: ${d.count} completed`}>
              <span className="bar-value">{d.count || ''}</span>
              <div className="bar" style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }} data-empty={d.count === 0} />
              <span className="bar-label">{parseDate(d.day).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Tasks completed, last 7 days</p>
      </>
    ),
    today: taskList(dueToday, 'Nothing due today.'),
    overdue: taskList(overdue, 'Nothing overdue. Nice.'),
    upcoming: taskList(upcoming, 'No deadlines in the next 7 days.'),
    pinned: pinned.length ? <div className="note-grid wide">{pinned.slice(0, 6).map((n) => <NoteCard key={n.id} note={n} onOpen={() => go('notes', n.id)} />)}</div> : <p className="muted small">Pin a note to keep it here.</p>,
    recent: recent.length ? <div className="note-grid wide">{recent.map((n) => <NoteCard key={n.id} note={n} onOpen={() => go('notes', n.id)} />)}</div> : <p className="muted small">No notes yet.</p>,
    sync: (
      <>
        <p className={`sync-line tone-${sync.tone}`}><span className="sync-dot" /> {sync.label}</p>
        {sync.status.error && <p className="small bad">{sync.status.error}</p>}
        <p className="muted small">
          {sync.auth ? `Signed in as ${sync.auth.email}.` : 'Sign in to sync across devices — it is optional.'} Last backup: {sync.lastBackupAt ? timeAgo(sync.lastBackupAt, now) : 'never'}.
        </p>
        <div className="row">
          {sync.auth && <button className="btn small" onClick={() => void requestSync()}><RefreshCw size={14} /> Sync now</button>}
          <button className="btn small" onClick={async () => { await platform.runtime.send({ type: 'backup-now' }); toast('Backup saved'); }}><Save size={14} /> Back up now</button>
          <button className="btn small" onClick={() => go('settings', 'cloud')}>{sync.auth ? 'Manage' : 'Set up sync'}</button>
        </div>
      </>
    ),
  };

  const order = settings.dashboard.order.filter((w) => !settings.dashboard.hidden.includes(w));

  return (
    <div className="page">
      <PageHead title={hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'} subtitle={longDate(now)}>
        <IconButton label="Customize dashboard" onClick={() => setCustomizing(true)}><SlidersHorizontal size={18} /></IconButton>
      </PageHead>
      <div className="quick-create">
        <button className="btn primary" onClick={() => createNote()}><FileText size={16} /> New note</button>
        <button className="btn primary" onClick={() => createTask({ due: t })}><CheckSquare size={16} /> New task</button>
        {platform.name === 'chrome' && <button className="btn" onClick={() => void stickyOnPage()}><Globe size={16} /> Floating note on this page</button>}
        <button className="btn" onClick={() => go('calendar')}><CalendarDays size={16} /> Calendar</button>
      </div>
      <div className="widgets">
        {order.map((w) => (
          <section key={w} className={`panel widget widget-${w}`}>
            <h2>{WIDGET_LABEL[w]}</h2>
            {widgets[w]}
          </section>
        ))}
      </div>
      {order.length === 0 && <Empty icon={<SlidersHorizontal size={26} />} title="All widgets are hidden" hint="Use Customize to show some."><button className="btn" onClick={() => setCustomizing(true)}>Customize</button></Empty>}

      {customizing && (
        <Modal title="Customize dashboard" onClose={() => setCustomizing(false)} width={400}>
          <p className="muted small" style={{ marginTop: 0 }}>Show, hide and reorder the dashboard sections.</p>
          <div className="list">
            {settings.dashboard.order.map((w, i) => {
              const hiddenNow = settings.dashboard.hidden.includes(w);
              const move = (delta: number) => {
                const next = [...settings.dashboard.order];
                [next[i], next[i + delta]] = [next[i + delta], next[i]];
                updateSettings({ dashboard: { ...settings.dashboard, order: next } });
              };
              return (
                <div key={w} className="custom-row">
                  <span className={`grow ${hiddenNow ? 'muted' : ''}`}>{WIDGET_LABEL[w]}</span>
                  <IconButton label="Move up" disabled={i === 0} onClick={() => move(-1)}><ArrowUp size={15} /></IconButton>
                  <IconButton label="Move down" disabled={i === settings.dashboard.order.length - 1} onClick={() => move(1)}><ArrowDown size={15} /></IconButton>
                  <IconButton label={hiddenNow ? 'Show' : 'Hide'} active={!hiddenNow} onClick={() => updateSettings({ dashboard: { ...settings.dashboard, hidden: hiddenNow ? settings.dashboard.hidden.filter((x) => x !== w) : [...settings.dashboard.hidden, w] } })}>
                    {hiddenNow ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                </div>
              );
            })}
          </div>
          <div className="modal-actions spread">
            <button className="btn" onClick={() => updateSettings({ dashboard: { order: [...WIDGETS], hidden: [] } })}>Reset</button>
            <button className="btn primary" onClick={() => setCustomizing(false)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
