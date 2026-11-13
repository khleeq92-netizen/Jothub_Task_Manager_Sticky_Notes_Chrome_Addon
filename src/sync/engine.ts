import { createSnapshot, readSnapshot, restoreBackup, type SnapshotMeta } from '../core/backup';
import { getLocal, loadAll, putRaw, setLocal } from '../core/db';
import { can } from '../core/entitlements';
import { uid as newId, type AnyRecord, type Note } from '../core/types';
import { getAuth, getIdToken } from './auth';
import { getCloudConfig } from './config';
import { FirestoreRemote, type Cursor, type Remote } from './firestore';

export interface SyncStatus {
  state: 'off' | 'syncing' | 'ok' | 'offline' | 'error';
  lastSyncAt?: number;
  error?: string;
  warning?: string;
  pulled?: number;
  pushed?: number;
  conflicts?: number;
}

interface SyncState {
  uid: string;
  cursor: Cursor | null;
  /** updatedAt of each record as of the last time local and cloud agreed. */
  synced: Record<string, number>;
  lastFullAt: number;
}

const DAY = 86400000;
const CLOUD_SNAPSHOTS = 5;

/**
 * Decides what to do with records that arrived from the cloud.
 *
 * A record is "dirty" when it changed locally since the last agreement.
 * - Only the cloud changed  → take the cloud copy.
 * - Only local changed      → keep local (it is uploaded afterwards).
 * - Both changed (conflict) → the most recent edit wins. For notes whose
 *   content differs, the losing version is kept as a separate
 *   "(conflict copy)" note, so no writing is ever lost.
 */
export function reconcile(local: Map<string, AnyRecord>, remote: AnyRecord[], syncedIn: Record<string, number>, now = Date.now()) {
  const synced = { ...syncedIn };
  const apply: AnyRecord[] = [];
  const copies: Note[] = [];
  let conflicts = 0;

  for (const theirs of remote) {
    const mine = local.get(theirs.id);
    if (!mine || mine.updatedAt === theirs.updatedAt) {
      if (!mine) apply.push(theirs);
      synced[theirs.id] = theirs.updatedAt;
      continue;
    }
    const base = synced[theirs.id];
    if (base === theirs.updatedAt) continue; // cloud copy is old news; local is newer and will be pushed
    if (base !== undefined && mine.updatedAt === base) {
      apply.push(theirs); // only the cloud changed
      synced[theirs.id] = theirs.updatedAt;
      continue;
    }

    // Both sides changed.
    conflicts++;
    const cloudWins = theirs.updatedAt >= mine.updatedAt;
    const loser = cloudWins ? mine : theirs;
    const winner = cloudWins ? theirs : mine;
    if (loser.type === 'note' && winner.type === 'note' && !loser.purged && !loser.deletedAt && !winner.purged && (loser.html !== winner.html || loser.title !== winner.title)) {
      copies.push({
        ...loser,
        id: newId(),
        title: `${loser.title || 'Untitled note'} (conflict copy)`,
        scope: 'none',
        pinned: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (cloudWins) {
      apply.push(theirs);
      synced[theirs.id] = theirs.updatedAt;
    }
  }
  return { apply, copies, synced, conflicts };
}

/** One full sync round against any Remote. Exported for tests. */
export async function syncWith(remote: Remote, uid: string, options: { full?: boolean } = {}, now = Date.now()) {
  let state = await getLocal<SyncState | null>('syncState', null);
  if (!state || state.uid !== uid) state = { uid, cursor: null, synced: {}, lastFullAt: 0 };
  const full = options.full || now - state.lastFullAt > DAY;

  const pulled = await remote.pull(full ? null : state.cursor);
  const local = new Map((await loadAll()).map((r) => [r.id, r]));
  const result = reconcile(local, pulled.records, state.synced, now);

  const incoming = [...result.apply, ...result.copies];
  if (incoming.length) {
    await putRaw(incoming);
    for (const record of incoming) local.set(record.id, record);
  }

  const dirty = [...local.values()].filter((r) => r.updatedAt !== result.synced[r.id]);
  const tooLarge = dirty.length ? await remote.push(dirty) : [];
  for (const record of dirty) if (!tooLarge.includes(record.id)) result.synced[record.id] = record.updatedAt;

  await setLocal('syncState', { uid, cursor: pulled.cursor ?? state.cursor, synced: result.synced, lastFullAt: full ? now : state.lastFullAt } satisfies SyncState);
  return { pulled: result.apply.length, pushed: dirty.length - tooLarge.length, conflicts: result.conflicts, tooLarge: tooLarge.length };
}

async function remoteFor(): Promise<{ remote: FirestoreRemote; uid: string } | null> {
  const [config, auth] = await Promise.all([getCloudConfig(), getAuth()]);
  if (!config || !auth || !can('cloudSync')) return null;
  return { remote: new FirestoreRemote(config.projectId, auth.uid, getIdToken), uid: auth.uid };
}

const setStatus = (status: SyncStatus) => setLocal('syncStatus', status);
export const getStatus = () => getLocal<SyncStatus>('syncStatus', { state: 'off' });

let running: Promise<SyncStatus> | null = null;

/** Syncs with the cloud if signed in. Safe to call at any time; overlapping calls share one run. */
export function runSync(options: { full?: boolean } = {}): Promise<SyncStatus> {
  running ??= (async () => {
    const previous = await getStatus();
    const target = await remoteFor();
    if (!target) {
      const off: SyncStatus = { state: 'off' };
      await setStatus(off);
      return off;
    }
    await setStatus({ ...previous, state: 'syncing', error: undefined });
    let status: SyncStatus;
    try {
      const r = await syncWith(target.remote, target.uid, options);
      status = {
        state: 'ok',
        lastSyncAt: Date.now(),
        pulled: r.pulled,
        pushed: r.pushed,
        conflicts: r.conflicts,
        warning: r.tooLarge ? `${r.tooLarge} item${r.tooLarge === 1 ? ' is' : 's are'} too large to sync and stay on this device only.` : undefined,
      };
    } catch (error: any) {
      const offline = error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
      status = { state: offline ? 'offline' : 'error', lastSyncAt: previous.lastSyncAt, error: offline ? 'No internet connection. Changes are saved here and will sync later.' : (error?.message ?? String(error)) };
    }
    await setStatus(status);
    return status;
  })().finally(() => (running = null));
  return running;
}

// ---- backups ---------------------------------------------------------------

/** Local snapshot, plus a cloud copy and a sync when signed in. */
export async function backupNow(reason: SnapshotMeta['reason'] = 'manual'): Promise<{ meta: SnapshotMeta; cloud: boolean; error?: string }> {
  const meta = await createSnapshot(reason);
  const target = can('cloudBackup') ? await remoteFor() : null;
  if (!target) return { meta, cloud: false };
  try {
    const json = await readSnapshot(meta.id);
    await target.remote.uploadSnapshot(meta, json ?? '');
    const all = await target.remote.listSnapshots();
    for (const old of all.slice(CLOUD_SNAPSHOTS)) await target.remote.deleteSnapshot(old.id, old.parts);
    void runSync();
    return { meta, cloud: true };
  } catch (error: any) {
    return { meta, cloud: false, error: error?.message ?? String(error) };
  }
}

export async function listCloudSnapshots() {
  const target = await remoteFor();
  return target ? target.remote.listSnapshots() : [];
}

export async function restoreCloudSnapshot(id: string, parts: number, mode: 'merge' | 'overwrite') {
  const target = await remoteFor();
  if (!target) throw new Error('Sign in to restore from the cloud.');
  return restoreBackup(await target.remote.downloadSnapshot(id, parts), mode);
}

export async function deleteCloudSnapshot(id: string, parts: number) {
  const target = await remoteFor();
  if (target) await target.remote.deleteSnapshot(id, parts);
}
