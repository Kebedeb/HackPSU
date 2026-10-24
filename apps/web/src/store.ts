import Dexie, { type Table } from 'dexie';
import type { CaseRecord } from '@aman/types';

export interface LocalCase {
  id: string;
  record: CaseRecord;
  synced: 0 | 1;
  savedAt: string;
}

class AmanDB extends Dexie {
  cases!: Table<LocalCase, string>;
  constructor() {
    super('aman');
    this.version(1).stores({ cases: 'id, synced, savedAt' });
  }
}

export const localDb = new AmanDB();

export async function saveLocal(record: CaseRecord): Promise<void> {
  await localDb.cases.put({ id: record.id, record, synced: 0, savedAt: new Date().toISOString() });
}

export async function pendingCount(): Promise<number> {
  return localDb.cases.where('synced').equals(0).count();
}

let syncing: Promise<number> | null = null;

/** POSTs unsynced cases. Safe to repeat: the server upserts by id. */
export function syncNow(): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    let sent = 0;
    const pending = await localDb.cases.where('synced').equals(0).toArray();
    for (const c of pending) {
      try {
        const res = await fetch('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c.record),
        });
        if (!res.ok) continue;
        await localDb.cases.update(c.id, { synced: 1 });
        sent++;
      } catch {
        break;
      }
    }
    return sent;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
