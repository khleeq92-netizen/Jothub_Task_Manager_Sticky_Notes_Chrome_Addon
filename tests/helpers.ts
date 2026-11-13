import { setPlatform } from '../src/platform';
import { createWebPlatform } from '../src/platform/web';
import type { AnyRecord } from '../src/core/types';
import type { Cursor, Remote } from '../src/sync/firestore';

/** Gives each test (or each simulated device) a clean in-memory store. */
export function freshDevice() {
  const platform = createWebPlatform(false);
  setPlatform(platform);
  return platform;
}

/**
 * Stands in for Firestore: keeps the latest copy of every record with a
 * server sequence number, and serves "everything after this cursor".
 */
export class FakeCloud implements Remote {
  private docs = new Map<string, { record: AnyRecord; seq: number }>();
  private seq = 0;
  pushes = 0;

  async pull(cursor: Cursor | null) {
    const after = cursor ? Number(cursor.time) : 0;
    const rows = [...this.docs.values()].filter((d) => d.seq > after).sort((a, b) => a.seq - b.seq);
    const last = rows.at(-1);
    return { records: rows.map((d) => structuredClone(d.record)), cursor: last ? { time: String(last.seq), name: last.record.id } : cursor };
  }

  async push(records: AnyRecord[]) {
    this.pushes += records.length;
    for (const record of records) this.docs.set(record.id, { record: structuredClone(record), seq: ++this.seq });
    return [];
  }

  get(id: string) {
    return this.docs.get(id)?.record;
  }
  get size() {
    return this.docs.size;
  }
}
