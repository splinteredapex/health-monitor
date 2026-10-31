/**
 * JSON backup / restore. Imports are untrusted: size-limited, parsed safely,
 * every row schema-validated, duplicates detected, previewed, and applied in a
 * single atomic transaction (an interrupted import changes nothing).
 */
import type { Table } from 'dexie';
import { db, DB_SCHEMA_VERSION } from './db';
import { TABLE_NAMES, TABLE_SCHEMAS, type TableName } from './schemas';

export const BACKUP_FORMAT = 'health-recovery-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export type Row = Record<string, unknown> & { id: string };
export type BackupTables = Record<TableName, Row[]>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
}

/** Secondary unique keys that would otherwise make an atomic merge fail. */
const UNIQUE_KEYS: Partial<Record<TableName, string>> = { nutrition: 'localDate', dailyMetrics: 'localDate' };

const tableOf = (name: TableName) => db.table(name) as Table<Row, string>;

export async function exportBackup(now = new Date()): Promise<Backup> {
  const tables = {} as BackupTables;
  await db.transaction('r', TABLE_NAMES.map(tableOf), async () => {
    for (const name of TABLE_NAMES) tables[name] = await tableOf(name).toArray();
  });
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: DB_SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

export type ParseResult = { ok: true; backup: Backup; warnings: string[] } | { ok: false; errors: string[] };

/** Validate an untrusted backup file. Never throws. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ['File is too large to be a Health Recovery backup.'] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Unexpected file structure.'] };
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) return { ok: false, errors: ['This is not a Health Recovery backup file.'] };
  if (typeof obj.formatVersion !== 'number' || obj.formatVersion > BACKUP_FORMAT_VERSION)
    return { ok: false, errors: ['This backup was made by a newer version of the app. Update the app and try again.'] };
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > DB_SCHEMA_VERSION)
    return { ok: false, errors: ['This backup uses a newer data format than this app supports.'] };
  const tablesRaw = obj.tables;
  if (!tablesRaw || typeof tablesRaw !== 'object' || Array.isArray(tablesRaw)) return { ok: false, errors: ['Backup has no data section.'] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const tables = {} as BackupTables;
  for (const name of TABLE_NAMES) {
    const rows = (tablesRaw as Record<string, unknown>)[name];
    if (rows === undefined) {
      tables[name] = [];
      if (name !== 'dailyMetrics') warnings.push(`No "${name}" section – treated as empty.`);
      continue;
    }
    if (!Array.isArray(rows)) { errors.push(`"${name}" is not a list.`); continue; }
    const seen = new Set<string>();
    const uniq = UNIQUE_KEYS[name];
    const seenUniq = new Set<unknown>();
    const out: Row[] = [];
    rows.forEach((r, i) => {
      // Older backups (schema v1) may lack `source`; the schema defaults it.
      const parsed = TABLE_SCHEMAS[name].safeParse(r);
      if (!parsed.success) {
        if (errors.length < 20) errors.push(`${name} #${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'record'} – ${x.message}`).join('; ')}`);
        return;
      }
      const row = parsed.data as Row;
      if (seen.has(row.id)) { errors.push(`${name}: duplicate id ${row.id}`); return; }
      seen.add(row.id);
      if (uniq) {
        if (seenUniq.has(row[uniq])) { errors.push(`${name}: two records for ${String(row[uniq])}`); return; }
        seenUniq.add(row[uniq]);
      }
      out.push(row);
    });
    tables[name] = out;
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    backup: { format: BACKUP_FORMAT, formatVersion: obj.formatVersion, schemaVersion: obj.schemaVersion, exportedAt: String(obj.exportedAt ?? ''), tables },
  };
}

export interface TablePreview { table: TableName; incoming: number; existing: number; added: number; identical: number; conflicts: number }
export interface ImportPreview { tables: TablePreview[]; totalIncoming: number; totalExisting: number; totalConflicts: number; totalAdded: number }

const stable = (o: unknown): string => JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

export async function previewImport(backup: Backup): Promise<ImportPreview> {
  const tables: TablePreview[] = [];
  for (const name of TABLE_NAMES) {
    const existing = await tableOf(name).toArray();
    const byId = new Map(existing.map((r) => [r.id, r]));
    const uniq = UNIQUE_KEYS[name];
    const uniqVals = new Set(uniq ? existing.map((r) => r[uniq]) : []);
    let added = 0, identical = 0, conflicts = 0;
    for (const r of backup.tables[name]) {
      const cur = byId.get(r.id);
      if (cur) {
        if (stable(cur) === stable(r)) identical++;
        else conflicts++;
      }
      else if (uniq && uniqVals.has(r[uniq])) conflicts++;
      else added++;
    }
    tables.push({ table: name, incoming: backup.tables[name].length, existing: existing.length, added, identical, conflicts });
  }
  const s = (k: keyof Omit<TablePreview, 'table'>) => tables.reduce((a, t) => a + t[k], 0);
  return { tables, totalIncoming: s('incoming'), totalExisting: s('existing'), totalConflicts: s('conflicts'), totalAdded: s('added') };
}

/**
 * merge   – add records that don't exist yet; existing records are never overwritten.
 * replace – delete all local data and load the backup. Caller must confirm first.
 * Runs in one transaction: any failure rolls back everything.
 */
export async function applyImport(backup: Backup, mode: 'merge' | 'replace'): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  await db.transaction('rw', TABLE_NAMES.map(tableOf), async () => {
    for (const name of TABLE_NAMES) {
      const t = tableOf(name);
      const rows = backup.tables[name];
      if (mode === 'replace') {
        await t.clear();
        await t.bulkAdd(rows);
        added += rows.length;
        continue;
      }
      const existing = await t.toArray();
      const ids = new Set(existing.map((r) => r.id));
      const uniq = UNIQUE_KEYS[name];
      const uniqVals = new Set(uniq ? existing.map((r) => r[uniq]) : []);
      const toAdd = rows.filter((r) => !ids.has(r.id) && !(uniq && uniqVals.has(r[uniq])));
      skipped += rows.length - toAdd.length;
      await t.bulkAdd(toAdd);
      added += toAdd.length;
    }
  });
  return { added, skipped };
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', TABLE_NAMES.map(tableOf), async () => {
    for (const name of TABLE_NAMES) await tableOf(name).clear();
  });
}
