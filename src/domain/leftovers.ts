/**
 * "Cocinar una vez, comer dos veces": el almuerzo de ciertos integrantes es la
 * cena del día anterior. La cena se cocina con porciones extra para ellos y el
 * almuerzo queda vinculado (no se cocina ni se compra aparte).
 *
 * `planLeftoverLunches` es pura e idempotente: dado el plan, devuelve qué comidas
 * crear/actualizar y cuáles borrar. Se ejecuta después de cada cambio del plan,
 * así que cambiar o borrar una cena actualiza solo su almuerzo de sobras.
 */
import type { PlannedMeal } from './types.ts';
import { addDays } from './planner.ts';

export interface LeftoverConfig {
  enabled: boolean;
  /** Quiénes almuerzan la cena del día anterior (por defecto, solo el usuario principal). */
  memberIds: string[];
  /** Marcar el almuerzo de sobras como vianda para la oficina (solo de lunes a viernes). */
  forOffice: boolean;
  /** Días de la semana en que aplica (0=dom … 6=sáb). */
  weekdays: number[];
}

export const DEFAULT_LEFTOVER_CONFIG: LeftoverConfig = { enabled: true, memberIds: ['yo'], forOffice: true, weekdays: [0, 1, 2, 3, 4, 5, 6] };

export const leftoverMealId = (dinnerId: string): string => `sobras_${dinnerId}`;

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]));
  return v;
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null)); }
function clean<T extends Record<string, number>>(o: T): T | undefined { return Object.keys(o).length ? o : undefined; }

export function planLeftoverLunches(meals: PlannedMeal[], cfg: LeftoverConfig, todayISO: string): { upserts: PlannedMeal[]; deletes: string[] } {
  const upserts = new Map<string, PlannedMeal>();
  const deletes = new Set<string>();
  const byId = new Map(meals.map((m) => [m.id, m]));
  const put = (m: PlannedMeal) => { upserts.set(m.id, m); byId.set(m.id, m); };
  const editable = (m: PlannedMeal) => m.status === 'planificada' && m.date >= todayISO;
  const wanted = new Set<string>();

  if (cfg.enabled) {
    for (const dinner of meals.filter((m) => m.slot === 'cena' && !m.leftoverOf)) {
      const lunchDate = addDays(dinner.date, 1);
      const wd = new Date(lunchDate + 'T12:00:00').getDay();
      const who = cfg.memberIds.filter((id) => dinner.memberIds.includes(id));
      if (!cfg.weekdays.includes(wd) || !who.length || lunchDate < todayISO) continue;
      const id = leftoverMealId(dinner.id);
      wanted.add(id);
      const existing = byId.get(id);

      // 1) Cena: porciones extra para quienes almuerzan sobras.
      if (editable(dinner)) {
        const extra = Object.fromEntries(who.map((m) => [m, dinner.portionsByMember[m] ?? 1]));
        if (!same(dinner.extraPortions, extra)) put({ ...dinner, extraPortions: extra });
      }
      // 2) Almuerzo de sobras: sigue la receta y los reemplazos de la cena.
      if (!existing || editable(existing)) {
        const lunch: PlannedMeal = {
          id, date: lunchDate, slot: 'almuerzo', recipeId: dinner.recipeId, memberIds: who,
          portionsByMember: Object.fromEntries(who.map((m) => [m, dinner.portionsByMember[m] ?? 1])),
          substitutions: { ...dinner.substitutions }, forOffice: (cfg.forOffice && wd >= 1 && wd <= 5) || undefined,
          status: existing?.status ?? 'planificada', leftoverOf: dinner.id,
        };
        if (!existing || !same({ ...existing, extraPortions: undefined }, lunch)) put(lunch);
      }
      // 3) Quienes comen sobras salen del almuerzo "normal" de ese día.
      for (const other of meals.filter((m) => m.date === lunchDate && m.slot === 'almuerzo' && !m.leftoverOf && editable(m))) {
        const rest = other.memberIds.filter((x) => !who.includes(x));
        if (rest.length === other.memberIds.length) continue;
        if (!rest.length) { deletes.add(other.id); upserts.delete(other.id); }
        else put({ ...other, memberIds: rest, forOffice: undefined, portionsByMember: Object.fromEntries(Object.entries(other.portionsByMember).filter(([k]) => rest.includes(k))) });
      }
    }
  }

  // Sobras huérfanas (cena borrada, cambiada de día o función desactivada) y cenas sin sobras.
  for (const m of meals) {
    if (m.leftoverOf && !wanted.has(m.id) && editable(m)) deletes.add(m.id);
    if (m.slot === 'cena' && m.extraPortions && !wanted.has(leftoverMealId(m.id)) && editable(m)) {
      put({ ...(byId.get(m.id) ?? m), extraPortions: undefined });
    }
  }
  for (const d of deletes) upserts.delete(d);
  return { upserts: [...upserts.values()].map((m) => ({ ...m, extraPortions: m.extraPortions ? clean(m.extraPortions) : undefined })), deletes: [...deletes] };
}

/** Texto para la receta de la cena: cuánto cocinar de más y para quién. */
export function extraPortionsNote(meal: PlannedMeal, names: Map<string, string>): string | null {
  const e = meal.extraPortions;
  if (!e || !Object.keys(e).length) return null;
  const parts = Object.entries(e).map(([id, n]) => `${n === 1 ? '1 porción' : `${n} porciones`} más para ${names.get(id) ?? id}`);
  return `Cociná el doble: ${parts.join(' y ')} (almuerzo de mañana). Las cantidades ya lo incluyen.`;
}
