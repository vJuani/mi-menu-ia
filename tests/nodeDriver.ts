// Driver de pruebas sobre node:sqlite (Node ≥ 22.5). Mismo SQL que en el iPhone.
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue } from '../src/data/driver.ts';

export function openNodeDb(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
  let depth = 0;
  const driver: SqlDriver = {
    async exec(sql) { db.exec(sql); },
    async run(sql, params: SqlValue[] = []) { const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    async all<T>(sql: string, params: SqlValue[] = []) { return db.prepare(sql).all(...params) as T[]; },
    async get<T>(sql: string, params: SqlValue[] = []) { return db.prepare(sql).get(...params) as T | undefined; },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const sp = `sp${depth}`;
      db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      depth++;
      try {
        const r = await fn();
        depth--;
        db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        depth--;
        db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    },
    async close() { db.close(); },
  };
  return driver;
}
