/**
 * Progreso físico. La variación de un día es mayormente agua, glucógeno y
 * contenido intestinal: nunca se interpreta como grasa ganada o perdida.
 * Se usa una media móvil exponencial y una regresión sobre la tendencia.
 */
import type { ConsumptionLog, PlannedMeal, WeightEntry } from './types.ts';

export function sortByDate<T extends { date: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.date.localeCompare(b.date));
}

/** Media móvil exponencial (alfa 0,1 ≈ ventana de ~10 días). */
export function trendSeries(entries: WeightEntry[], alpha = 0.1): { date: string; kg: number; trend: number }[] {
  const s = sortByDate(entries);
  let t: number | null = null;
  let prevDate: string | null = null;
  return s.map((e) => {
    if (t === null) t = e.kg;
    else {
      const gap = prevDate ? Math.max(1, daysBetween(prevDate, e.date)) : 1;
      const a = 1 - (1 - alpha) ** gap;
      t = t + a * (e.kg - t);
    }
    prevDate = e.date;
    return { date: e.date, kg: e.kg, trend: Math.round(t * 100) / 100 };
  });
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
}

/** Pendiente de regresión lineal en kg/semana sobre los últimos `days` días. */
export function weeklyRate(entries: WeightEntry[], days = 28, todayISO?: string): { kgPerWeek: number | null; daysOfData: number } {
  const s = sortByDate(entries);
  if (s.length < 2) return { kgPerWeek: null, daysOfData: 0 };
  const end = todayISO ?? s[s.length - 1].date;
  const win = s.filter((e) => daysBetween(e.date, end) <= days && daysBetween(e.date, end) >= 0);
  if (win.length < 3) return { kgPerWeek: null, daysOfData: win.length ? daysBetween(win[0].date, end) : 0 };
  const xs = win.map((e) => daysBetween(win[0].date, e.date));
  const ys = win.map((e) => e.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return { kgPerWeek: null, daysOfData: 0 };
  return { kgPerWeek: Math.round((num / den) * 7 * 100) / 100, daysOfData: daysBetween(win[0].date, end) };
}

export function weeklyAverages(entries: WeightEntry[]): { weekStart: string; avg: number; n: number }[] {
  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const d = new Date(e.date + 'T12:00:00');
    const diff = (d.getDay() + 6) % 7; // lunes
    d.setDate(d.getDate() - diff);
    const key = d.toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), e.kg]);
  }
  return [...groups.entries()].sort().map(([weekStart, v]) => ({ weekStart, avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, n: v.length }));
}

export function dailyChangeMessage(prev: number, curr: number): string {
  const d = Math.round((curr - prev) * 10) / 10;
  if (Math.abs(d) < 0.1) return 'Sin cambios respecto al registro anterior.';
  return `${d > 0 ? '+' : ''}${d} kg desde el último registro. Es normal que varíe día a día por agua y digestión: mirá la tendencia.`;
}

export function adherence(meals: PlannedMeal[], fromISO: string, toISO: string): { planned: number; done: number; pct: number } {
  const inRange = meals.filter((m) => m.date >= fromISO && m.date <= toISO);
  const done = inRange.filter((m) => m.status === 'comida' || m.status === 'cocinada').length;
  return { planned: inRange.length, done, pct: inRange.length ? Math.round((done / inRange.length) * 100) : 0 };
}

export function averageIntake(logs: ConsumptionLog[], memberId: string, fromISO: string, toISO: string): { kcal: number | null; proteinG: number | null; daysLogged: number } {
  const xs = logs.filter((l) => l.memberId === memberId && l.date >= fromISO && l.date <= toISO);
  const days = new Map<string, { kcal: number; p: number; hasK: boolean; hasP: boolean }>();
  for (const l of xs) {
    const d = days.get(l.date) ?? { kcal: 0, p: 0, hasK: false, hasP: false };
    if (l.kcal != null) { d.kcal += l.kcal; d.hasK = true; }
    if (l.proteinG != null) { d.p += l.proteinG; d.hasP = true; }
    days.set(l.date, d);
  }
  const k = [...days.values()].filter((d) => d.hasK);
  const p = [...days.values()].filter((d) => d.hasP);
  return {
    kcal: k.length ? Math.round(k.reduce((a, d) => a + d.kcal, 0) / k.length) : null,
    proteinG: p.length ? Math.round(p.reduce((a, d) => a + d.p, 0) / p.length) : null,
    daysLogged: days.size,
  };
}
