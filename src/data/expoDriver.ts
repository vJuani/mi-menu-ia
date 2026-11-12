// Adaptador expo-sqlite (SDK 52+) → SqlDriver.
import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './driver';

export async function openExpoDb(name = 'mimenu.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  let depth = 0;
  // Serializa transacciones de primer nivel para que dos operaciones no se mezclen.
  let queue: Promise<unknown> = Promise.resolve();

  const driver: SqlDriver = {
    async exec(sql) { await db.execAsync(sql); },
    async run(sql, params: SqlValue[] = []) { const r = await db.runAsync(sql, params); return { changes: r.changes }; },
    async all<T>(sql: string, params: SqlValue[] = []) { return db.getAllAsync<T>(sql, params); },
    async get<T>(sql: string, params: SqlValue[] = []) { return (await db.getFirstAsync<T>(sql, params)) ?? undefined; },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) {
        const sp = `sp${depth}`;
        await db.execAsync(`SAVEPOINT ${sp}`);
        depth++;
        try { const r = await fn(); depth--; await db.execAsync(`RELEASE ${sp}`); return r; }
        catch (e) { depth--; await db.execAsync(`ROLLBACK TO ${sp}; RELEASE ${sp}`); throw e; }
      }
      const run = async () => {
        await db.execAsync('BEGIN');
        depth = 1;
        try { const r = await fn(); depth = 0; await db.execAsync('COMMIT'); return r; }
        catch (e) { depth = 0; await db.execAsync('ROLLBACK'); throw e; }
      };
      const p = queue.then(run, run);
      queue = p.catch(() => undefined);
      return p as Promise<T>;
    },
    async close() { await db.closeAsync(); },
  };
  return driver;
}
