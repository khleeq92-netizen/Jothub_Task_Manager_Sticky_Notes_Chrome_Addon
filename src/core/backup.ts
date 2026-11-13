import { platform } from '../platform';
import { getLocal, loadAll, putRaw, setLocal, stamp } from './db';
import { textToHtml } from './notes';
import { sanitizeHtml } from './sanitize';
import { newNote, validateRecord, type AnyRecord, type Settings } from './types';

export interface BackupFile {
  /** 'taskmark'; files made before the rename say 'jot-hub' and are still accepted. */
  app: 'taskmark' | 'jot-hub';
  format: 1;
  exportedAt: string;
  records: AnyRecord[];
}

export interface SnapshotMeta {
  id: string;
  at: number;
  reason: 'manual' | 'auto' | 'before-restore';
  count: number;
  bytes: number;
}

export interface MergeResult {
  write: AnyRecord[];
  added: number;
  updated: number;
  skipped: number;
}

const MAX_SNAPSHOTS = 5;
const SNAP = 'snap:';
const PERIOD: Record<Settings['autoBackup'], number> = { off: Infinity, daily: 86400000, weekly: 7 * 86400000, monthly: 30 * 86400000 };

export const buildBackup = (records: AnyRecord[], now = Date.now()): BackupFile => ({
  app: 'taskmark',
  format: 1,
  exportedAt: new Date(now).toISOString(),
  records: records.filter((r) => !r.purged),
});

/** Parses and validates a backup file. Malformed records are dropped, never trusted. */
export function parseBackup(text: string): { records: AnyRecord[]; rejected: number } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  // Backups from the earlier "Jot" popup extension: { app: 'jot', notes: [{ text, color, … }] }.
  if (data?.app === 'jot' && Array.isArray(data.notes)) {
    const records = data.notes
      .filter((n: any) => n && typeof n.text === 'string')
      .map((n: any) =>
        validateRecord(
          newNote({
            id: typeof n.id === 'string' && n.id ? n.id : undefined,
            text: n.text,
            html: textToHtml(n.text),
            color: n.color,
            pinned: n.pinned === true,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt ?? n.createdAt,
          } as any),
        ),
      )
      .filter(Boolean) as AnyRecord[];
    return { records, rejected: data.notes.length - records.length };
  }

  if ((data?.app !== 'taskmark' && data?.app !== 'jot-hub') || !Array.isArray(data.records)) throw new Error('This file is not a Task-Mark-stickynote backup.');
  if (data.format !== 1) throw new Error('This backup was made by a newer version of Task-Mark-stickynote.');

  const canSanitize = typeof DOMParser !== 'undefined';
  const records: AnyRecord[] = [];
  for (const raw of data.records) {
    const record = validateRecord(raw);
    if (!record || record.purged) continue;
    if (canSanitize && (record.type === 'note' || record.type === 'template')) record.html = sanitizeHtml(record.html);
    records.push(record);
  }
  return { records, rejected: data.records.length - records.length };
}

/**
 * Works out what a restore should write. Nothing local is ever removed:
 * - merge: add what is missing, and take the backup's copy only where it is newer.
 * - overwrite: the backup's copy replaces matching records (to roll back edits).
 */
export function mergeBackup(local: Map<string, AnyRecord>, incoming: AnyRecord[], mode: 'merge' | 'overwrite', now = Date.now()): MergeResult {
  const result: MergeResult = { write: [], added: 0, updated: 0, skipped: 0 };
  for (const record of incoming) {
    const mine = local.get(record.id);
    if (!mine || mine.purged) {
      // Stamp so the restored record wins over any stale tombstone in the cloud.
      result.write.push(mine ? stamp({ ...record, updatedAt: mine.updatedAt }, now) : record);
      result.added++;
    } else if (mode === 'overwrite' && JSON.stringify({ ...mine, updatedAt: 0 }) !== JSON.stringify({ ...record, updatedAt: 0 })) {
      result.write.push(stamp({ ...record, updatedAt: mine.updatedAt }, now));
      result.updated++;
    } else if (mode === 'merge' && record.updatedAt > mine.updatedAt) {
      result.write.push(record);
      result.updated++;
    } else result.skipped++;
  }
  return result;
}

const listSnapshots = () => getLocal<SnapshotMeta[]>('snapshots', []);
export { listSnapshots };

/** Saves a restorable copy of everything on this device. Keeps the newest few. */
export async function createSnapshot(reason: SnapshotMeta['reason'], now = Date.now()): Promise<SnapshotMeta> {
  const records = await loadAll();
  const json = JSON.stringify(buildBackup(records, now));
  const meta: SnapshotMeta = { id: String(now), at: now, reason, count: records.filter((r) => !r.purged && !r.deletedAt && r.type !== 'settings').length, bytes: json.length };
  const all = [meta, ...(await listSnapshots()).filter((s) => s.id !== meta.id)];
  const drop = all.splice(MAX_SNAPSHOTS);
  await platform.storage.set({ [SNAP + meta.id]: json });
  if (drop.length) await platform.storage.remove(drop.map((s) => SNAP + s.id));
  await setLocal('snapshots', all);
  if (reason !== 'before-restore') await setLocal('lastBackupAt', now);
  return meta;
}

export async function readSnapshot(id: string): Promise<string | null> {
  return (await platform.storage.get([SNAP + id]))[SNAP + id] ?? null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await platform.storage.remove([SNAP + id]);
  await setLocal('snapshots', (await listSnapshots()).filter((s) => s.id !== id));
}

/** Restores from backup text. A safety snapshot is taken first, so a restore can itself be undone. */
export async function restoreBackup(text: string, mode: 'merge' | 'overwrite'): Promise<MergeResult & { rejected: number }> {
  const { records, rejected } = parseBackup(text);
  const local = new Map((await loadAll()).map((r) => [r.id, r]));
  const result = mergeBackup(local, records, mode);
  if (result.write.length) {
    if (local.size) await createSnapshot('before-restore');
    await putRaw(result.write);
  }
  return { ...result, rejected };
}

export const autoBackupDue = (frequency: Settings['autoBackup'], lastBackupAt: number, now = Date.now()) => now - lastBackupAt >= PERIOD[frequency];
