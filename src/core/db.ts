import { platform } from '../platform';
import type { AnyRecord } from './types';

// Local-first storage. Every record is its own key ("r:<id>") so a write is
// small and other contexts (popup, side panel, content script, background)
// see exactly what changed. Keys starting with "local:" never leave the device.

const REC = 'r:';
const LOCAL = 'local:';
const STICKY = LOCAL + 'sticky';

export async function loadAll(): Promise<AnyRecord[]> {
  const all = await platform.storage.get(null);
  const out: AnyRecord[] = [];
  for (const key in all) if (key.startsWith(REC)) out.push(all[key]);
  return out;
}

export async function getRecords(ids: string[]): Promise<AnyRecord[]> {
  if (!ids.length) return [];
  return Object.values(await platform.storage.get(ids.map((id) => REC + id)));
}

const isSticky = (r: AnyRecord) => r.type === 'note' && !r.purged && !r.deletedAt && r.scope !== 'none';

/** Writes records exactly as given (no timestamp changes). */
export async function putRaw(records: AnyRecord[]): Promise<void> {
  if (!records.length) return;
  const items: Record<string, unknown> = {};
  for (const r of records) items[REC + r.id] = r;

  // Keep the list of page-attached notes current, so the content script can
  // find its notes without reading the whole store on every page load.
  if (records.some((r) => r.type === 'note')) {
    const before: string[] = (await platform.storage.get([STICKY]))[STICKY] ?? [];
    const ids = new Set(before);
    for (const r of records) if (r.type === 'note') isSticky(r) ? ids.add(r.id) : ids.delete(r.id);
    if (ids.size !== before.length || before.some((id) => !ids.has(id))) items[STICKY] = [...ids];
  }
  await platform.storage.set(items);
}

/** Marks a record as edited now. updatedAt always moves forward. */
export const stamp = <T extends AnyRecord>(record: T, now = Date.now()): T => ({
  ...record,
  updatedAt: Math.max(now, (record.updatedAt || 0) + 1),
});

export async function save<T extends AnyRecord>(...records: T[]): Promise<T[]> {
  const stamped = records.map((r) => stamp(r));
  await putRaw(stamped);
  return stamped;
}

export function watchRecords(cb: (changed: AnyRecord[]) => void): () => void {
  return platform.storage.onChanged((changes) => {
    const changed: AnyRecord[] = [];
    for (const key in changes) if (key.startsWith(REC) && changes[key].newValue) changed.push(changes[key].newValue as AnyRecord);
    if (changed.length) cb(changed);
  });
}

export const getStickyIds = async (): Promise<string[]> => (await platform.storage.get([STICKY]))[STICKY] ?? [];

export async function rebuildStickyIndex(): Promise<void> {
  const ids = (await loadAll()).filter(isSticky).map((r) => r.id);
  await platform.storage.set({ [STICKY]: ids });
}

export async function getLocal<T>(name: string, fallback: T): Promise<T> {
  const key = LOCAL + name;
  const value = (await platform.storage.get([key]))[key];
  return value === undefined ? fallback : (value as T);
}

export const setLocal = (name: string, value: unknown) => platform.storage.set({ [LOCAL + name]: value });
export const removeLocal = (name: string) => platform.storage.remove([LOCAL + name]);

export function watchLocal<T>(name: string, cb: (value: T | undefined) => void): () => void {
  const key = LOCAL + name;
  return platform.storage.onChanged((changes) => {
    if (key in changes) cb(changes[key].newValue as T | undefined);
  });
}
