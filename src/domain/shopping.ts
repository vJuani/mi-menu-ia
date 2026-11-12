/**
 * Lista de compras = necesidades del menú planificado − inventario disponible.
 * El inventario se asigna en orden cronológico: lo que usa la comida del lunes
 * ya no está disponible para la del miércoles. Planificar no descuenta stock real.
 */
import type { Ingredient, InventoryLot, Member, PlannedMeal, Recipe, Unit } from './types.ts';
import { buildAdultVersion } from './adaptations.ts';
import { availableQty } from './inventory.ts';
import { convert, round, toBase } from './units.ts';

/** Estimación SOLO para comprar: no es una porción que se le imponga al bebé. */
export const BABY_SHOPPING_FACTOR = 0.25;

export interface Need { ingredientId: string; qty: number; unit: Unit; mealId: string; date: string; }

export interface ShoppingLine {
  ingredientId: string;
  name: string;
  unit: Unit;
  needed: number;
  available: number;
  toBuy: number;
  mealIds: string[];
  firstDate: string;
}

export function baseUnitFor(ing: Ingredient): Unit {
  return toBase(1, ing.defaultUnit).unit;
}

export function needsForMeal(
  meal: PlannedMeal,
  recipe: Recipe,
  members: Member[],
  ingredients: Map<string, Ingredient>,
): Need[] {
  const acc = new Map<string, number>();
  const add = (id: string, qty: number, unit: Unit) => {
    const ing = ingredients.get(id);
    if (!ing) return;
    const u = baseUnitFor(ing);
    const q = convert(qty, unit, u, ing);
    if (q === null) return;
    acc.set(id, (acc.get(id) ?? 0) + q);
  };
  for (const m of members.filter((x) => meal.memberIds.includes(x.id))) {
    const portion = meal.portionsByMember[m.id] ?? 1;
    if (m.kind === 'bebe') {
      for (const ri of recipe.ingredients) {
        if (ri.optional || ri.addedAfterBabySplit) continue;
        const id = meal.substitutions[ri.ingredientId] ?? ri.ingredientId;
        add(id, (ri.qty / recipe.servings) * BABY_SHOPPING_FACTOR, ri.unit);
      }
      continue;
    }
    const v = buildAdultVersion(recipe, m, portion, ingredients, meal.substitutions);
    if (v.status === 'no_apta') continue;
    for (const l of v.lines) add(l.ingredientId, l.qty, l.unit);
  }
  return [...acc.entries()].map(([ingredientId, qty]) => ({
    ingredientId, qty: round(qty, 2), unit: baseUnitFor(ingredients.get(ingredientId)!), mealId: meal.id, date: meal.date,
  }));
}

export function computeShoppingList(
  meals: PlannedMeal[],
  recipes: Map<string, Recipe>,
  members: Member[],
  ingredients: Map<string, Ingredient>,
  lots: InventoryLot[],
  opts: { includeStaples?: boolean } = {},
): ShoppingLine[] {
  const pending = meals
    .filter((m) => m.status === 'planificada')
    .sort((a, b) => (a.date + slotOrder(a.slot)).localeCompare(b.date + slotOrder(b.slot)));
  const remaining = new Map<string, number>(); // disponible restante en unidad base
  const lines = new Map<string, ShoppingLine>();

  for (const meal of pending) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) continue;
    for (const need of needsForMeal(meal, recipe, members, ingredients)) {
      const ing = ingredients.get(need.ingredientId)!;
      // Básicos de alacena (sal, aceite, especias) no se listan salvo que se pida.
      if (!opts.includeStaples && ing.tags.includes('basico')) continue;
      if (!remaining.has(need.ingredientId)) remaining.set(need.ingredientId, availableQty(need.ingredientId, lots, need.unit, ing));
      const avail = remaining.get(need.ingredientId)!;
      const used = Math.min(avail, need.qty);
      remaining.set(need.ingredientId, avail - used);
      const line = lines.get(need.ingredientId) ?? {
        ingredientId: need.ingredientId, name: ing.name, unit: need.unit,
        needed: 0, available: 0, toBuy: 0, mealIds: [], firstDate: need.date,
      };
      line.needed = round(line.needed + need.qty, 2);
      line.available = round(line.available + used, 2);
      line.toBuy = round(line.toBuy + (need.qty - used), 2);
      if (!line.mealIds.includes(meal.id)) line.mealIds.push(meal.id);
      lines.set(need.ingredientId, line);
    }
  }
  return [...lines.values()]
    .filter((l) => l.toBuy > 0.009)
    .map((l) => ({ ...l, toBuy: roundUpForPurchase(l.toBuy, l.unit) }))
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.name.localeCompare(b.name));
}

/** Redondea hacia arriba a cantidades comprables (10 g / 10 ml / 1 un). */
export function roundUpForPurchase(qty: number, unit: Unit): number {
  if (unit === 'un') return Math.ceil(qty - 1e-9);
  return Math.ceil(qty / 10 - 1e-9) * 10;
}

const SLOT_ORDER: Record<string, string> = { desayuno: '1', colacion: '2', almuerzo: '3', merienda: '4', cena: '5' };
function slotOrder(s: string): string { return SLOT_ORDER[s] ?? '9'; }

/** Mensaje humano: "Para cocinar esta noche te faltan 300 g de pollo y 2 zapallitos". */
export function missingSentence(lines: ShoppingLine[], when: string): string {
  if (!lines.length) return `Tenés todo para ${when}.`;
  const parts = lines.map((l) => (l.unit === 'un' ? `${l.toBuy} ${l.toBuy > 1 ? plural(l.name.toLowerCase()) : l.name.toLowerCase()}` : `${l.toBuy} ${l.unit} de ${l.name.toLowerCase()}`));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  return `Para ${when} te faltan ${list}.`;
}

export type ShoppingItemStatus = 'pendiente' | 'comprado' | 'no_conseguido';

export interface ShoppingItem {
  id: string;
  ingredientId: string;
  suggestedQty: number;
  unit: Unit;
  status: ShoppingItemStatus;
  boughtQty?: number;
}

export function plural(name: string): string {
  const [head, ...rest] = name.split(' ');
  const p = /[aeiouáéó]$/.test(head) ? head + 's' : /z$/.test(head) ? head.slice(0, -1) + 'ces' : head + 'es';
  return [p, ...rest].join(' ');
}
