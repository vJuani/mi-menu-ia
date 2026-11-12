/**
 * Cálculo determinístico de recordatorios locales.
 * iOS no permite recalcular con la app cerrada: todo se calcula al cambiar
 * plan/inventario/ajustes y se programa con la información conocida en ese momento.
 * Cada recordatorio tiene una clave estable → reconciliar evita duplicados.
 */
import type { Ingredient, InventoryLot, MealSlot, Member, PlannedMeal, Recipe, Reminder } from './types.ts';
import { computeShoppingList, missingSentence, needsForMeal } from './shopping.ts';
import { availableQty } from './inventory.ts';
import { addDays } from './planner.ts';

export interface ReminderSettings {
  enabled: boolean;
  mealTimes: Record<MealSlot, string>; // "HH:mm"
  reviewTomorrowAt: string; // hora del día anterior
  cookLeadMinutes: number; // aviso "en X minutos podés empezar"
  thawHoursBefore: number; // descongelar en heladera
  officePrepAt: string; // noche anterior
  weighInWeekdays: number[]; // 0=dom ... 6=sáb
  weighInAt: string;
  lowStock: Record<string, number>; // ingredientId -> umbral en unidad base
  kinds: Record<Reminder['kind'], boolean>;
  horizonDays: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  mealTimes: { desayuno: '08:00', almuerzo: '13:00', merienda: '17:00', cena: '21:00', colacion: '11:00' },
  reviewTomorrowAt: '19:30',
  cookLeadMinutes: 30,
  thawHoursBefore: 24,
  officePrepAt: '21:30',
  weighInWeekdays: [1],
  weighInAt: '08:00',
  lowStock: {},
  kinds: { faltantes: true, descongelar: true, vianda: true, empezar_cocina: true, stock_bajo: true, peso: true },
  horizonDays: 7,
};

/** Fecha/hora local en formato ISO sin zona ("2026-11-12T19:30:00"). */
export function at(dateISO: string, hhmm: string, minusMinutes = 0): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m - minusMinutes, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export interface ReminderInput {
  now: Date;
  meals: PlannedMeal[];
  recipes: Map<string, Recipe>;
  members: Member[];
  ingredients: Map<string, Ingredient>;
  lots: InventoryLot[];
  settings: ReminderSettings;
  lastWeighInISO?: string;
}

const SLOT_LABEL: Record<MealSlot, string> = { desayuno: 'el desayuno', almuerzo: 'el almuerzo', merienda: 'la merienda', cena: 'la cena', colacion: 'la colación' };

export function buildReminders(i: ReminderInput): Reminder[] {
  const s = i.settings;
  if (!s.enabled) return [];
  const out: Reminder[] = [];
  const todayISO = localDate(i.now);
  const horizonEnd = addDays(todayISO, s.horizonDays);
  const pending = i.meals.filter((m) => m.status === 'planificada' && m.date >= todayISO && m.date <= horizonEnd);

  // 1) Faltantes del día siguiente (un aviso por día).
  if (s.kinds.faltantes) {
    const dates = [...new Set(pending.map((m) => m.date))];
    for (const date of dates) {
      const dayMeals = pending.filter((m) => m.date === date);
      const list = computeShoppingList(dayMeals, i.recipes, i.members, i.ingredients, i.lots);
      if (!list.length) continue;
      out.push({
        key: `faltantes:${date}`,
        kind: 'faltantes',
        title: 'Revisá la comida de mañana',
        body: list.length === 1 ? `Te falta 1 ingrediente. ${missingSentence(list, 'mañana')}` : `Te faltan ${list.length} ingredientes. ${missingSentence(list, 'mañana')}`,
        fireAt: at(addDays(date, -1), s.reviewTomorrowAt),
        refId: date,
      });
    }
  }

  for (const meal of pending) {
    const recipe = i.recipes.get(meal.recipeId);
    if (!recipe) continue;
    const mealTime = s.mealTimes[meal.slot];

    // 2) Descongelar: si lo necesario solo está en el freezer.
    if (s.kinds.descongelar) {
      for (const need of needsForMeal(meal, recipe, i.members, i.ingredients)) {
        const ing = i.ingredients.get(need.ingredientId)!;
        const nonFrozen = availableQty(need.ingredientId, i.lots.filter((l) => l.state !== 'congelado'), need.unit, ing);
        const frozen = availableQty(need.ingredientId, i.lots.filter((l) => l.state === 'congelado'), need.unit, ing);
        if (nonFrozen < need.qty && frozen > 0) {
          out.push({
            key: `descongelar:${meal.id}:${need.ingredientId}`,
            kind: 'descongelar',
            title: 'Sacá del freezer',
            body: `Pasá ${ing.name.toLowerCase()} del freezer a la heladera para ${SLOT_LABEL[meal.slot]} del ${fmtDay(meal.date)}. Descongelar en heladera, no a temperatura ambiente.`,
            fireAt: at(meal.date, mealTime, s.thawHoursBefore * 60),
            refId: meal.id,
          });
        }
      }
    }

    // 3) Vianda para la oficina.
    if (s.kinds.vianda && meal.forOffice) {
      out.push({
        key: `vianda:${meal.id}`, kind: 'vianda', title: 'Vianda para mañana',
        body: `Prepará ${recipe.name.toLowerCase()} para llevar a la oficina.`,
        fireAt: at(addDays(meal.date, -1), s.officePrepAt), refId: meal.id,
      });
    }

    // 4) Empezar a cocinar.
    if (s.kinds.empezar_cocina && !meal.forOffice && (meal.slot === 'almuerzo' || meal.slot === 'cena')) {
      out.push({
        key: `empezar:${meal.id}`, kind: 'empezar_cocina',
        title: `En ${s.cookLeadMinutes} minutos podés empezar ${SLOT_LABEL[meal.slot]}`,
        body: `${recipe.name} · ${recipe.totalMinutes} min.`,
        fireAt: at(meal.date, mealTime, recipe.totalMinutes + s.cookLeadMinutes), refId: meal.id,
      });
    }
  }

  // 5) Stock bajo (estado actual del inventario).
  if (s.kinds.stock_bajo) {
    for (const [ingredientId, threshold] of Object.entries(s.lowStock)) {
      const ing = i.ingredients.get(ingredientId);
      if (!ing) continue;
      const unit = ing.defaultUnit === 'kg' ? 'g' : ing.defaultUnit === 'l' ? 'ml' : ing.defaultUnit;
      const have = availableQty(ingredientId, i.lots, unit, ing);
      if (have <= threshold) {
        const next = nextTime(i.now, s.reviewTomorrowAt);
        out.push({ key: `stock_bajo:${ingredientId}`, kind: 'stock_bajo', title: 'Stock bajo', body: `Te quedan pocos/as ${ing.name.toLowerCase()} (${have} ${unit}).`, fireAt: next, refId: ingredientId });
      }
    }
  }

  // 6) Pesaje en los días elegidos.
  if (s.kinds.peso) {
    for (let d = 0; d <= s.horizonDays; d++) {
      const date = addDays(todayISO, d);
      const wd = new Date(date + 'T12:00:00').getDay();
      if (!s.weighInWeekdays.includes(wd)) continue;
      if (i.lastWeighInISO === date) continue;
      out.push({ key: `peso:${date}`, kind: 'peso', title: 'Hoy podés registrar tu peso', body: 'En ayunas, después del baño. Lo que importa es la tendencia, no un día aislado.', fireAt: at(date, s.weighInAt) });
    }
  }

  const nowLocal = toLocalISO(i.now);
  const unique = new Map<string, Reminder>();
  for (const r of out) if (r.fireAt > nowLocal && !unique.has(r.key)) unique.set(r.key, r);
  return [...unique.values()].sort((a, b) => a.fireAt.localeCompare(b.fireAt));
}

export interface ScheduledRecord { key: string; osId: string; hash: string; }

export function reminderHash(r: Reminder): string {
  return `${r.fireAt}|${r.title}|${r.body}`;
}

/** Diferencia entre lo deseado y lo ya programado en el sistema operativo. */
export function reconcile(desired: Reminder[], scheduled: ScheduledRecord[]): { toSchedule: Reminder[]; toCancel: ScheduledRecord[]; unchanged: ScheduledRecord[] } {
  const byKey = new Map(desired.map((r) => [r.key, r]));
  const toCancel: ScheduledRecord[] = [];
  const unchanged: ScheduledRecord[] = [];
  const keep = new Set<string>();
  const seen = new Set<string>();
  for (const s of scheduled) {
    const d = byKey.get(s.key);
    if (!d || seen.has(s.key) || reminderHash(d) !== s.hash) { toCancel.push(s); continue; }
    seen.add(s.key);
    keep.add(s.key);
    unchanged.push(s);
  }
  return { toSchedule: desired.filter((r) => !keep.has(r.key)), toCancel, unchanged };
}

function localDate(d: Date): string { return toLocalISO(d).slice(0, 10); }
export function toLocalISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function nextTime(now: Date, hhmm: string): string {
  const today = at(localDate(now), hhmm);
  return today > toLocalISO(now) ? today : at(addDays(localDate(now), 1), hhmm);
}
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function fmtDay(iso: string): string { return DAYS[new Date(iso + 'T12:00:00').getDay()]; }
