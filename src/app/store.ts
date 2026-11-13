import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLocal, loadAll, putRaw, stamp, watchLocal, watchRecords } from '../core/db';
import { completeTask, reopenTask } from '../core/tasks';
import { defaultSettings, tombstone, type AnyRecord, type Folder, type Note, type Settings, type Task, type Template } from '../core/types';

// In-memory view of the local store for React. Writes update memory first
// (instant UI) and then storage; changes made elsewhere (content script,
// background sync, another window) arrive through watchRecords.

export interface Data {
  ready: boolean;
  notes: Note[];
  folders: Folder[];
  tasks: Task[];
  templates: Template[];
  trash: AnyRecord[];
  settings: Settings;
  byId: Map<string, AnyRecord>;
}

const records = new Map<string, AnyRecord>();
const listeners = new Set<() => void>();
let ready = false;
let data: Data = { ready: false, notes: [], folders: [], tasks: [], templates: [], trash: [], settings: defaultSettings(), byId: records };

function rebuild() {
  const next: Data = { ready, notes: [], folders: [], tasks: [], templates: [], trash: [], settings: defaultSettings(), byId: records };
  for (const r of records.values()) {
    if (r.purged) continue;
    if (r.type === 'settings') next.settings = { ...defaultSettings(), ...r };
    else if (r.deletedAt) next.trash.push(r);
    else if (r.type === 'note') next.notes.push(r);
    else if (r.type === 'task') next.tasks.push(r);
    else if (r.type === 'folder') next.folders.push(r);
    else if (r.type === 'template') next.templates.push(r);
  }
  next.notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  next.folders.sort((a, b) => a.name.localeCompare(b.name));
  next.templates.sort((a, b) => a.name.localeCompare(b.name));
  next.trash.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  data = next;
  listeners.forEach((l) => l());
}

export async function initStore() {
  for (const r of await loadAll()) records.set(r.id, r);
  ready = true;
  rebuild();
  watchRecords((changed) => {
    let dirty = false;
    for (const r of changed) {
      const mine = records.get(r.id);
      if (mine && mine.updatedAt > r.updatedAt) continue;
      records.set(r.id, r);
      dirty = true;
    }
    if (dirty) rebuild();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useData = () => useSyncExternalStore(subscribe, () => data);
export const getData = () => data;

export function saveRecords(...list: AnyRecord[]) {
  const stamped = list.map((r) => stamp(r));
  for (const r of stamped) records.set(r.id, r);
  rebuild();
  void putRaw(stamped);
  return stamped;
}

export const saveRecord = <T extends AnyRecord>(record: T): T => saveRecords(record)[0] as T;

/** Applies a change to the latest copy of a record, so edits never clobber each other. */
export function patch<T extends AnyRecord>(id: string, change: Partial<T>): T | null {
  const current = records.get(id) as T | undefined;
  if (!current || current.purged) return null;
  return saveRecord({ ...current, ...change });
}

export const updateSettings = (change: Partial<Settings>) => saveRecord({ ...data.settings, ...change });

export const moveToTrash = (id: string) => patch(id, { deletedAt: Date.now() });
export const restoreFromTrash = (id: string) => patch(id, { deletedAt: null });

export function purge(...ids: string[]) {
  const stubs = ids.map((id) => records.get(id)).filter((r): r is AnyRecord => !!r).map((r) => tombstone(r));
  for (const r of stubs) records.set(r.id, r);
  rebuild();
  void putRaw(stubs);
}

// ---- bulk actions (multi-select) ----

/** Moves records to the trash in one write. Returns the ids actually moved. */
export function trashMany(ids: string[]): string[] {
  const now = Date.now();
  const list = ids.map((id) => records.get(id)).filter((r): r is AnyRecord => !!r && !r.purged && !r.deletedAt);
  if (list.length) saveRecords(...list.map((r) => ({ ...r, deletedAt: now })));
  return list.map((r) => r.id);
}

export function restoreMany(ids: string[]): number {
  const list = ids.map((id) => records.get(id)).filter((r): r is AnyRecord => !!r && !r.purged && !!r.deletedAt);
  if (list.length) saveRecords(...list.map((r) => ({ ...r, deletedAt: null })));
  return list.length;
}

/** Marks open tasks done (a repeating task gets its next copy, as with a single tick). */
export function completeMany(ids: string[]): number {
  const changed: AnyRecord[] = [];
  for (const id of ids) {
    const task = records.get(id);
    if (!task || task.type !== 'task' || task.deletedAt || task.status === 'completed') continue;
    const { done, next } = completeTask(task);
    changed.push(done, ...(next ? [next] : []));
  }
  if (changed.length) saveRecords(...changed);
  return changed.filter((r) => r.type === 'task' && r.status === 'completed').length;
}

export function toggleTask(id: string) {
  const task = records.get(id);
  if (!task || task.type !== 'task') return;
  if (task.status === 'completed') saveRecord(reopenTask(task));
  else {
    const { done, next } = completeTask(task);
    saveRecords(...(next ? [done, next] : [done]));
  }
}

/** A device-local value (sync status, sign-in, snapshots…) that updates live. */
export function useLocal<T>(name: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    void getLocal<T>(name, fallback).then((v) => alive && setValue(v));
    const stop = watchLocal<T>(name, (v) => setValue(v === undefined ? fallback : v));
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return value;
}

/** Re-renders once a minute so "overdue" and "2 min ago" stay true. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
