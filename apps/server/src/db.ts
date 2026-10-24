import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { clinics as seedClinics } from '@aman/protocol';
import { OUTCOME_RANK, type CaseRecord, type CaseStatus, type Clinic } from '@aman/types';

export type DB = Database.Database;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      outcome TEXT NOT NULL,
      age_months REAL,
      record TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clinics (
      id TEXT PRIMARY KEY,
      record TEXT NOT NULL
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM clinics').get() as { n: number };
  if (count.n === 0) {
    const ins = db.prepare('INSERT INTO clinics (id, record) VALUES (?, ?)');
    for (const c of seedClinics) ins.run(c.id, JSON.stringify(c));
  }
  return db;
}

export function getCase(db: DB, id: string): CaseRecord | null {
  const row = db.prepare('SELECT record FROM cases WHERE id = ?').get(id) as { record: string } | undefined;
  return row ? (JSON.parse(row.record) as CaseRecord) : null;
}

export function saveCase(db: DB, c: CaseRecord): void {
  db.prepare(
    `INSERT INTO cases (id, created_at, updated_at, status, outcome, age_months, record)
     VALUES (@id, @created_at, @updated_at, @status, @outcome, @age_months, @record)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, status = excluded.status,
       outcome = excluded.outcome, age_months = excluded.age_months, record = excluded.record`,
  ).run({
    id: c.id,
    created_at: c.createdAt,
    updated_at: new Date().toISOString(),
    status: c.status,
    outcome: c.decision.outcome,
    age_months: c.patient.ageMonths,
    record: JSON.stringify(c),
  });
}

export function compareUrgency(a: CaseRecord, b: CaseRecord): number {
  const o = OUTCOME_RANK[b.decision.outcome] - OUTCOME_RANK[a.decision.outcome];
  if (o !== 0) return o;
  const aa = a.patient.ageMonths;
  const ba = b.patient.ageMonths;
  if (aa !== ba) {
    if (aa === null) return 1;
    if (ba === null) return -1;
    return aa - ba;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

export function listCases(db: DB, status?: CaseStatus): CaseRecord[] {
  const rows = (status
    ? db.prepare('SELECT record FROM cases WHERE status = ?').all(status)
    : db.prepare('SELECT record FROM cases').all()) as { record: string }[];
  return rows.map((r) => JSON.parse(r.record) as CaseRecord).sort(compareUrgency);
}

export function listClinics(db: DB): Clinic[] {
  return (db.prepare('SELECT record FROM clinics ORDER BY id').all() as { record: string }[]).map((r) => JSON.parse(r.record));
}

export function getClinic(db: DB, id: string): Clinic | null {
  const row = db.prepare('SELECT record FROM clinics WHERE id = ?').get(id) as { record: string } | undefined;
  return row ? JSON.parse(row.record) : null;
}

export function saveClinic(db: DB, c: Clinic): void {
  db.prepare('UPDATE clinics SET record = ? WHERE id = ?').run(JSON.stringify(c), c.id);
}
