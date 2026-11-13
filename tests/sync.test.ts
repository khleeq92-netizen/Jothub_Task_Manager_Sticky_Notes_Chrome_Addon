import { beforeEach, describe, expect, it } from 'vitest';
import { loadAll, save } from '../src/core/db';
import { newNote, newTask, tombstone, type AnyRecord, type Note } from '../src/core/types';
import type { Platform } from '../src/platform';
import { setPlatform } from '../src/platform';
import { getAuth, setAuthFetch, signInWithEmail, signOut } from '../src/sync/auth';
import { saveCloudConfig } from '../src/sync/config';
import { reconcile, syncWith } from '../src/sync/engine';
import { FirestoreRemote } from '../src/sync/firestore';
import { FakeCloud, freshDevice } from './helpers';

// Two simulated devices share one fake cloud. `on(device)` switches which
// device's local storage the code is talking to.
let laptop: Platform;
let desktop: Platform;
let cloud: FakeCloud;
const on = (device: Platform) => setPlatform(device);
const sync = (device: Platform) => (on(device), syncWith(cloud, 'user-1'));
const notes = async (device: Platform) => (on(device), (await loadAll()).filter((r): r is Note => r.type === 'note' && !r.purged));
const tick = () => new Promise((r) => setTimeout(r, 3));

beforeEach(() => {
  laptop = freshDevice();
  desktop = freshDevice();
  cloud = new FakeCloud();
});

describe('sync between two devices', () => {
  it('uploads local data and downloads it on another device', async () => {
    on(laptop);
    const [note] = await save(newNote({ title: 'From laptop', text: 'hello' }));
    const [task] = await save(newTask({ title: 'Call Sam', due: '2026-11-20' }));
    expect(await sync(laptop)).toMatchObject({ pushed: 2, pulled: 0 });
    expect(await sync(desktop)).toMatchObject({ pushed: 0, pulled: 2 });
    on(desktop);
    const ids = (await loadAll()).map((r) => r.id).sort();
    expect(ids).toEqual([note.id, task.id].sort());
  });

  it('does nothing when nothing changed', async () => {
    on(laptop);
    await save(newNote({ title: 'A' }));
    await sync(laptop);
    await sync(desktop);
    const before = cloud.pushes;
    expect(await sync(laptop)).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0 });
    expect(await sync(desktop)).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0 });
    expect(cloud.pushes).toBe(before);
  });

  it('carries an edit from one device to the other', async () => {
    on(laptop);
    const [note] = await save(newNote({ title: 'Plan', text: 'v1' }));
    await sync(laptop);
    await sync(desktop);
    on(desktop);
    await save({ ...(await notes(desktop))[0], text: 'v2 from desktop' });
    await sync(desktop);
    expect(await sync(laptop)).toMatchObject({ pulled: 1, conflicts: 0 });
    expect((await notes(laptop)).find((n) => n.id === note.id)!.text).toBe('v2 from desktop');
  });

  it('keeps both versions when the same note is edited on two devices', async () => {
    on(laptop);
    const [note] = await save(newNote({ title: 'Shared', html: 'base', text: 'base' }));
    await sync(laptop);
    await sync(desktop);

    on(laptop);
    await save({ ...note, html: 'laptop edit', text: 'laptop edit' });
    await tick();
    on(desktop);
    await save({ ...(await notes(desktop))[0], html: 'desktop edit (newer)', text: 'desktop edit (newer)' });

    await sync(desktop); // desktop uploads first
    expect(await sync(laptop)).toMatchObject({ conflicts: 1 });
    await sync(desktop);

    for (const device of [laptop, desktop]) {
      const list = await notes(device);
      expect(list).toHaveLength(2);
      expect(list.find((n) => n.id === note.id)!.text).toBe('desktop edit (newer)'); // newest edit wins
      const copy = list.find((n) => n.id !== note.id)!;
      expect(copy.title).toBe('Shared (conflict copy)');
      expect(copy.text).toBe('laptop edit'); // the other version is not lost
    }
  });

  it('syncs trash, restore and permanent deletion', async () => {
    on(laptop);
    const [note] = await save(newNote({ title: 'Temp', text: 'private text' }));
    await sync(laptop);
    await sync(desktop);

    on(desktop);
    const [trashed] = await save({ ...(await notes(desktop))[0], deletedAt: Date.now() });
    await sync(desktop);
    await sync(laptop);
    expect((await notes(laptop))[0].deletedAt).toBe(trashed.deletedAt);

    on(laptop);
    await save(tombstone((await notes(laptop))[0]));
    await sync(laptop);
    await sync(desktop);
    expect(await notes(desktop)).toHaveLength(0);
    expect(JSON.stringify(cloud.get(note.id))).not.toContain('private text');
  });

  it('merges data that already exists on a device when it signs in', async () => {
    on(laptop);
    await save(newNote({ title: 'Laptop only' }));
    on(desktop);
    await save(newNote({ title: 'Desktop only' }));
    await sync(laptop);
    await sync(desktop);
    await sync(laptop);
    for (const device of [laptop, desktop]) expect((await notes(device)).map((n) => n.title).sort()).toEqual(['Desktop only', 'Laptop only']);
  });

  it('starts over cleanly when a different account signs in', async () => {
    on(laptop);
    await save(newNote({ title: 'Mine' }));
    await syncWith(cloud, 'user-1');
    const other = new FakeCloud();
    expect(await syncWith(other, 'user-2')).toMatchObject({ pushed: 1 });
    expect(other.size).toBe(1);
  });
});

describe('reconcile', () => {
  const map = (...records: AnyRecord[]) => new Map(records.map((r) => [r.id, r]));
  const note = (patch: Partial<Note>) => newNote({ id: 'n', updatedAt: 100, ...patch });

  it('takes the cloud copy when only the cloud changed', () => {
    const r = reconcile(map(note({ text: 'old' })), [note({ text: 'new', updatedAt: 200 })], { n: 100 });
    expect(r.apply).toHaveLength(1);
    expect(r.conflicts).toBe(0);
    expect(r.synced.n).toBe(200);
  });

  it('keeps the local copy when only local changed', () => {
    const r = reconcile(map(note({ text: 'mine', updatedAt: 300 })), [note({ text: 'old', updatedAt: 100 })], { n: 100 });
    expect(r.apply).toHaveLength(0);
    expect(r.synced.n).toBe(100); // still dirty → will be uploaded
  });

  it('lets a newer local edit win a conflict but still saves the cloud version as a copy', () => {
    const r = reconcile(map(note({ html: 'mine', updatedAt: 400 })), [note({ html: 'theirs', updatedAt: 300 })], { n: 100 }, 999);
    expect(r.apply).toHaveLength(0);
    expect(r.copies).toHaveLength(1);
    expect(r.copies[0]).toMatchObject({ html: 'theirs', scope: 'none', updatedAt: 999 });
  });

  it('does not create copies for identical content or for non-notes', () => {
    expect(reconcile(map(note({ pinned: true, updatedAt: 400 })), [note({ updatedAt: 300 })], { n: 100 }).copies).toHaveLength(0);
    const task = newTask({ id: 't', title: 'a', updatedAt: 400 });
    const r = reconcile(map(task), [{ ...task, title: 'b', updatedAt: 500 }], { t: 100 });
    expect(r.copies).toHaveLength(0);
    expect(r.apply[0]).toMatchObject({ title: 'b' });
  });
});

describe('Firebase requests', () => {
  it('signs in with email, stores the session locally and signs out without touching data', async () => {
    freshDevice();
    await saveCloudConfig({ apiKey: 'KEY', projectId: 'proj', googleClientId: '' });
    await save(newNote({ title: 'stays' }));
    const calls: { url: string; body: any }[] = [];
    setAuthFetch((async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ localId: 'uid-9', email: 'me@example.com', idToken: 'id', refreshToken: 'refresh', expiresIn: '3600' }), { status: 200 });
    }) as any);

    await signInWithEmail('me@example.com', 'hunter22');
    expect(calls[0].url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY');
    expect(calls[0].body).toEqual({ email: 'me@example.com', password: 'hunter22', returnSecureToken: true });
    expect(await getAuth()).toEqual({ uid: 'uid-9', email: 'me@example.com', provider: 'password' });

    await signOut();
    expect(await getAuth()).toBeNull();
    expect(await loadAll()).toHaveLength(1);
  });

  it('turns Firebase error codes into readable messages', async () => {
    freshDevice();
    await saveCloudConfig({ apiKey: 'KEY', projectId: 'proj', googleClientId: '' });
    setAuthFetch((async () => new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 })) as any);
    await expect(signInWithEmail('a@b.c', 'wrongpw')).rejects.toThrow('Email or password is incorrect.');
  });

  it('writes each record under the signed-in user only, with a server timestamp', async () => {
    const requests: { url: string; headers: any; body: any }[] = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      requests.push({ url, headers: init.headers, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: 200 });
    }) as any;
    const remote = new FirestoreRemote('proj', 'uid-9', async () => 'TOKEN', fetchStub);
    const record = newNote({ id: 'note-1', title: 'Hi' });
    expect(await remote.push([record, newNote({ id: 'huge', html: 'x'.repeat(400_000) })])).toEqual(['huge']);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents:commit');
    expect(requests[0].headers.Authorization).toBe('Bearer TOKEN');
    const [write] = requests[0].body.writes;
    expect(write.update.name).toBe('projects/proj/databases/(default)/documents/users/uid-9/items/note-1');
    expect(JSON.parse(write.update.fields.json.stringValue)).toEqual(record);
    expect(write.updateTransforms).toEqual([{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }]);
  });

  it('reads pages of changes and ignores unreadable documents', async () => {
    const doc = (id: string, json: string, time: string) => ({ document: { name: `projects/proj/databases/(default)/documents/users/u/items/${id}`, fields: { json: { stringValue: json }, syncedAt: { timestampValue: time } } } });
    const bodies: any[] = [];
    const fetchStub = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify([doc('a', JSON.stringify(newNote({ id: 'a' })), 'T1'), doc('b', '{broken', 'T2'), { readTime: 'x' }]), { status: 200 });
    }) as any;
    const remote = new FirestoreRemote('proj', 'u', async () => 'TOKEN', fetchStub);
    const result = await remote.pull({ time: 'T0', name: 'prev' });
    expect(result.records.map((r) => r.id)).toEqual(['a']);
    expect(result.cursor).toEqual({ time: 'T2', name: 'projects/proj/databases/(default)/documents/users/u/items/b' });
    expect(bodies[0].structuredQuery.startAt).toEqual({ values: [{ timestampValue: 'T0' }, { referenceValue: 'prev' }], before: false });
  });
});
