/**
 * Interfaz mínima de SQLite. En el iPhone se implementa con expo-sqlite
 * (expoDriver.ts); en las pruebas, con node:sqlite (tests/nodeDriver.ts).
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  /** Ejecuta fn de forma atómica: si falla, se revierte todo. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const json = {
  enc: (v: unknown): string => JSON.stringify(v ?? null),
  dec: <T>(s: unknown, fallback: T): T => {
    if (typeof s !== 'string') return fallback;
    try { return (JSON.parse(s) ?? fallback) as T; } catch { return fallback; }
  },
};

export const bool = (v: unknown): boolean => v === 1 || v === true;
export const num = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));
export const str = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));
