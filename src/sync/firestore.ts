import type { SnapshotMeta } from '../core/backup';
import { validateRecord, type AnyRecord } from '../core/types';

// Cloud Firestore through its REST API.
//
//   users/{uid}/items/{recordId}            one document per note/task/folder/template/settings
//       type       string
//       updatedAt  integer   (client edit time, used for conflict decisions)
//       json       string    (the whole record)
//       syncedAt   timestamp (set by the server on every write; the pull cursor)
//   users/{uid}/backups/{snapshotId}        snapshot description
//   users/{uid}/backups/{snapshotId}/parts/{n}   snapshot data, split to fit document limits

export interface Cursor {
  time: string;
  name: string;
}

export interface Remote {
  pull(cursor: Cursor | null): Promise<{ records: AnyRecord[]; cursor: Cursor | null }>;
  /** Returns the ids that could not be stored (too large for one document). */
  push(records: AnyRecord[]): Promise<string[]>;
}

export class CloudError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const PAGE = 300;
const MAX_DOC_CHARS = 300_000; // stays under Firestore's 1 MiB document limit even for 3-byte characters
const PART_CHARS = 250_000;

export class FirestoreRemote implements Remote {
  private root: string;
  private user: string;

  constructor(projectId: string, uid: string, private token: () => Promise<string>, private fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.user = `${this.root}/users/${uid}`;
  }

  private async call(path: string, body?: unknown, method = 'POST'): Promise<any> {
    const res = await this.fetchImpl(`https://firestore.googleapis.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (Array.isArray(data) ? data[0] : data)?.error?.message;
      const hint = res.status === 403 ? ' Check that the Firestore security rules from the setup guide are published.' : res.status === 404 ? ' Check the project ID and that the Firestore database has been created.' : '';
      throw new CloudError(`${detail ?? `Cloud request failed (${res.status}).`}${hint}`, res.status);
    }
    return data;
  }

  async pull(cursor: Cursor | null) {
    const records: AnyRecord[] = [];
    for (;;) {
      const rows: any[] = await this.call(`${this.user}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: 'items' }],
          orderBy: [
            { field: { fieldPath: 'syncedAt' }, direction: 'ASCENDING' },
            { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
          ],
          ...(cursor ? { startAt: { values: [{ timestampValue: cursor.time }, { referenceValue: cursor.name }], before: false } } : {}),
          limit: PAGE,
        },
      });
      const docs = (rows ?? []).map((row) => row.document).filter(Boolean);
      for (const doc of docs) {
        cursor = { time: doc.fields?.syncedAt?.timestampValue ?? cursor?.time ?? '', name: doc.name };
        try {
          const record = validateRecord(JSON.parse(doc.fields?.json?.stringValue ?? 'null'));
          if (record) records.push(record);
        } catch {
          /* unreadable document: ignore it rather than fail the whole sync */
        }
      }
      if (docs.length < PAGE) return { records, cursor };
    }
  }

  async push(records: AnyRecord[]) {
    const tooLarge: string[] = [];
    let batch: object[] = [];
    let size = 0;
    const flush = async () => {
      if (batch.length) await this.call(`${this.root}:commit`, { writes: batch });
      batch = [];
      size = 0;
    };
    for (const record of records) {
      const json = JSON.stringify(record);
      if (json.length > MAX_DOC_CHARS) {
        tooLarge.push(record.id);
        continue;
      }
      if (batch.length >= 200 || size + json.length > 3_000_000) await flush();
      batch.push({
        update: {
          name: `${this.user}/items/${record.id}`,
          fields: { type: { stringValue: record.type }, updatedAt: { integerValue: String(record.updatedAt) }, json: { stringValue: json } },
        },
        updateTransforms: [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      size += json.length;
    }
    await flush();
    return tooLarge;
  }

  // ---- cloud snapshots -----------------------------------------------------

  async uploadSnapshot(meta: SnapshotMeta, json: string): Promise<void> {
    const parts = Math.max(1, Math.ceil(json.length / PART_CHARS));
    for (let i = 0; i < parts; i++) {
      await this.call(`${this.root}:commit`, {
        writes: [{ update: { name: `${this.user}/backups/${meta.id}/parts/${i}`, fields: { data: { stringValue: json.slice(i * PART_CHARS, (i + 1) * PART_CHARS) } } } }],
      });
    }
    // The description is written last, so a half-uploaded snapshot is never listed.
    await this.call(`${this.root}:commit`, {
      writes: [
        {
          update: {
            name: `${this.user}/backups/${meta.id}`,
            fields: {
              at: { integerValue: String(meta.at) },
              reason: { stringValue: meta.reason },
              count: { integerValue: String(meta.count) },
              bytes: { integerValue: String(meta.bytes) },
              parts: { integerValue: String(parts) },
            },
          },
        },
      ],
    });
  }

  async listSnapshots(): Promise<(SnapshotMeta & { parts: number })[]> {
    const data = await this.call(`${this.user}/backups?pageSize=100`, undefined, 'GET');
    return ((data?.documents ?? []) as any[])
      .map((doc) => ({
        id: String(doc.name).split('/').pop()!,
        at: Number(doc.fields?.at?.integerValue ?? 0),
        reason: (doc.fields?.reason?.stringValue ?? 'manual') as SnapshotMeta['reason'],
        count: Number(doc.fields?.count?.integerValue ?? 0),
        bytes: Number(doc.fields?.bytes?.integerValue ?? 0),
        parts: Number(doc.fields?.parts?.integerValue ?? 1),
      }))
      .sort((a, b) => b.at - a.at);
  }

  async downloadSnapshot(id: string, parts: number): Promise<string> {
    let json = '';
    for (let i = 0; i < parts; i++) {
      const doc = await this.call(`${this.user}/backups/${id}/parts/${i}`, undefined, 'GET');
      json += doc?.fields?.data?.stringValue ?? '';
    }
    return json;
  }

  async deleteSnapshot(id: string, parts: number): Promise<void> {
    const writes = [{ delete: `${this.user}/backups/${id}` }];
    for (let i = 0; i < parts; i++) writes.push({ delete: `${this.user}/backups/${id}/parts/${i}` });
    await this.call(`${this.root}:commit`, { writes });
  }
}
