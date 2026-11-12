/**
 * SqlDriver para la versión web: SQLite real (sql.js / WebAssembly) en memoria,
 * persistido en IndexedDB después de cada escritura. Mismo esquema, migraciones
 * y repositorio que la app nativa.
 */
import type { SqlDriver, SqlValue } from '../../src/data/driver.ts';

declare const initSqlJs: (cfg: { locateFile: (f: string) => string }) => Promise<{ Database: new (data?: Uint8Array) => SqlJsDb }>;
interface SqlJsStmt { bind(p: SqlValue[]): void; step(): boolean; getAsObject(): Record<string, SqlValue>; free(): void; }
interface SqlJsDb { exec(sql: string): unknown; run(sql: string, p?: SqlValue[]): void; prepare(sql: string): SqlJsStmt; export(): Uint8Array; getRowsModified(): number; close(): void; }

const IDB_NAME = 'mi-menu-ia';
const IDB_STORE = 'kv';
const IDB_KEY = 'sqlite';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Uint8Array | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => res(r.result as Uint8Array | undefined);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(data: Uint8Array): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function openWebDb(): Promise<SqlDriver & { flush(): Promise<void> }> {
  const SQL = await initSqlJs({ locateFile: (f) => `./vendor/${f}` });
  const saved = await idbGet().catch(() => undefined);
  const db = new SQL.Database(saved);
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }

  let depth = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty || depth > 0) return;
    dirty = false;
    await idbPut(db.export());
  };
  const touch = () => {
    dirty = true;
    if (depth > 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { flush().catch((e) => console.error('No se pudo guardar', e)); }, 250);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => { flush(); });

  const query = (sql: string, params: SqlValue[] = []) => {
    const st = db.prepare(sql);
    try {
      st.bind(params.map((p) => (p === undefined ? null : p)));
      const rows: Record<string, SqlValue>[] = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  };
  const isRead = (sql: string) => /^\s*(select|pragma\s+user_version\s*$|pragma\s+\w+\s*$)/i.test(sql);

  return {
    async exec(sql) { db.exec(sql); if (!/^\s*pragma\s+foreign_keys/i.test(sql)) touch(); },
    async run(sql, params = []) {
      db.run(sql, params.map((p) => (p === undefined ? null : p)));
      const changes = db.getRowsModified();
      touch();
      return { changes };
    },
    async all<T>(sql: string, params: SqlValue[] = []) { return query(sql, params) as T[]; },
    async get<T>(sql: string, params: SqlValue[] = []) {
      const rows = query(sql, params);
      if (!isRead(sql)) touch();
      return rows[0] as T | undefined;
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const sp = `sp${depth}`;
      db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      depth++;
      try {
        const r = await fn();
        depth--;
        db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        if (depth === 0) touch();
        return r;
      } catch (e) {
        depth--;
        db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    },
    async close() { await flush(); db.close(); },
    flush,
  };
}
