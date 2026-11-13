import { beforeEach, describe, expect, it } from 'vitest';
import { autoBackupDue, buildBackup, createSnapshot, listSnapshots, mergeBackup, parseBackup, readSnapshot, restoreBackup } from '../src/core/backup';
import { loadAll, save } from '../src/core/db';
import { newFolder, newNote, newTask, tombstone, type AnyRecord, type Note } from '../src/core/types';
import { freshDevice } from './helpers';

beforeEach(() => void freshDevice());

const byId = async () => new Map((await loadAll()).map((r) => [r.id, r]));

describe('export and restore', () => {
  it('round-trips everything through a JSON backup', async () => {
    const saved = await save<AnyRecord>(newNote({ title: 'A', html: '<b>a</b>', text: 'a' }), newTask({ title: 'T', due: '2026-11-13', tags: ['x'] }), newFolder({ name: 'Work' }));
    const json = JSON.stringify(buildBackup(await loadAll()));

    freshDevice(); // a brand-new, empty install
    const result = await restoreBackup(json, 'merge');
    expect(result).toMatchObject({ added: 3, updated: 0, skipped: 0, rejected: 0 });
    const restored = await byId();
    for (const record of saved) expect(restored.get(record.id)).toEqual(record);
  });

  it('never deletes local records and keeps newer local edits when merging', async () => {
    const [note] = await save(newNote({ title: 'Original', text: 'v1' }));
    const backup = JSON.stringify(buildBackup(await loadAll()));
    const [edited] = await save({ ...note, text: 'v2 (newer)' });
    const [extra] = await save(newNote({ title: 'Written after the backup' }));

    const result = await restoreBackup(backup, 'merge');
    expect(result).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    const now = await byId();
    expect((now.get(note.id) as Note).text).toBe(edited.text);
    expect(now.has(extra.id)).toBe(true);
  });

  it('rolls back matching records in overwrite mode, still without deleting anything', async () => {
    const [note] = await save(newNote({ title: 'Original', text: 'v1' }));
    const backup = JSON.stringify(buildBackup(await loadAll()));
    const [edited] = await save({ ...note, text: 'oops' });
    const [extra] = await save(newNote({ title: 'Later note' }));

    const result = await restoreBackup(backup, 'overwrite');
    expect(result).toMatchObject({ updated: 1 });
    const now = await byId();
    const restored = now.get(note.id) as Note;
    expect(restored.text).toBe('v1');
    expect(restored.updatedAt).toBeGreaterThan(edited.updatedAt); // so the rollback also wins when syncing
    expect(now.has(extra.id)).toBe(true);
    expect((await listSnapshots())[0].reason).toBe('before-restore'); // and the restore itself can be undone
  });

  it('brings back something that was permanently deleted', async () => {
    const [note] = await save(newNote({ title: 'Keep me', text: 'important' }));
    const backup = JSON.stringify(buildBackup(await loadAll()));
    await save(tombstone(note));
    const merged = mergeBackup(await byId(), parseBackup(backup).records, 'merge');
    expect(merged.added).toBe(1);
    expect(merged.write[0]).toMatchObject({ id: note.id, title: 'Keep me' });
    expect(merged.write[0].purged).toBeUndefined();
  });
});

describe('backup validation', () => {
  it('rejects files that are not Jot Hub backups', () => {
    expect(() => parseBackup('not json')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a Jot Hub backup/);
    expect(() => parseBackup('{"app":"jot-hub","format":99,"records":[]}')).toThrow(/newer version/);
  });

  it('drops malformed records and removes unsafe HTML', () => {
    const file = { app: 'jot-hub', format: 1, records: [{ type: 'note', id: 'ok', html: '<b>hi</b><script>x()</script>', text: 'hi' }, { type: 'note' }, 'junk', { type: 'task', id: 'bad id' }] };
    const { records, rejected } = parseBackup(JSON.stringify(file));
    expect(records).toHaveLength(1);
    expect(rejected).toBe(3);
    expect((records[0] as Note).html).toBe('<b>hi</b>');
  });

  it('imports backups from the earlier Jot extension', () => {
    const { records } = parseBackup(JSON.stringify({ app: 'jot', version: 1, notes: [{ id: 'j1', text: 'Buy milk\n<eggs>', color: 'blue', pinned: true, createdAt: 5, updatedAt: 9 }] }));
    expect(records[0]).toMatchObject({ type: 'note', id: 'j1', color: 'blue', pinned: true, text: 'Buy milk\n<eggs>', html: '<div>Buy milk</div><div>&lt;eggs&gt;</div>' });
  });
});

describe('snapshots', () => {
  it('keeps the newest five and can be read back', async () => {
    await save(newNote({ title: 'x' }));
    for (let i = 1; i <= 7; i++) await createSnapshot('manual', 1000 + i);
    const list = await listSnapshots();
    expect(list.map((s) => s.id)).toEqual(['1007', '1006', '1005', '1004', '1003']);
    expect(await readSnapshot('1001')).toBeNull();
    expect(parseBackup((await readSnapshot('1007'))!).records).toHaveLength(1);
  });

  it('knows when an automatic backup is due', () => {
    const day = 86400000;
    expect(autoBackupDue('off', 0, 10 * day)).toBe(false);
    expect(autoBackupDue('daily', 0, day)).toBe(true);
    expect(autoBackupDue('weekly', day, 3 * day)).toBe(false);
    expect(autoBackupDue('monthly', 0, 31 * day)).toBe(true);
  });
});
