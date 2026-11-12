/**
 * Planificador: elige recetas priorizando lo que hay en casa, la variedad,
 * el tiempo disponible y que sirvan para todos los adultos que comen.
 */
import type { Ingredient, InventoryLot, Member, MealSlot, PlannedMeal, Recipe } from './types.ts';
import { recipeFitsMember } from './adaptations.ts';
import { availableQty, newId } from './inventory.ts';
import { baseUnitFor } from './shopping.ts';
import { convert } from './units.ts';

export interface SuggestOptions {
  slot?: MealSlot;
  maxMinutes?: number;
  forOffice?: boolean;
  highProtein?: boolean;
  recentRecipeIds?: string[];
  /** Ingredientes que el usuario dice tener ahora (texto libre ya parseado). */
  mustUse?: string[];
}

export interface Suggestion {
  recipe: Recipe;
  score: number;
  coverage: number; // 0..1 proporción de ingredientes (no opcionales) cubiertos por el inventario
  missing: string[];
}

const SLOT_TAG: Record<MealSlot, string[]> = {
  desayuno: ['desayuno'],
  merienda: ['merienda', 'desayuno'],
  almuerzo: ['principal'],
  cena: ['principal'],
  colacion: ['colacion', 'merienda'],
};

export function inventoryCoverage(recipe: Recipe, lots: InventoryLot[], ingredients: Map<string, Ingredient>): { coverage: number; missing: string[] } {
  const required = recipe.ingredients.filter((i) => !i.optional && !ingredients.get(i.ingredientId)?.tags.includes('basico'));
  if (!required.length) return { coverage: 1, missing: [] };
  const missing: string[] = [];
  let covered = 0;
  for (const ri of required) {
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) { missing.push(ri.ingredientId); continue; }
    const unit = baseUnitFor(ing);
    const need = convert(ri.qty, ri.unit, unit, ing) ?? ri.qty;
    const have = availableQty(ri.ingredientId, lots, unit, ing);
    if (have >= need) covered += 1;
    else { covered += have / need; missing.push(ri.ingredientId); }
  }
  return { coverage: covered / required.length, missing };
}

export function suggestRecipes(
  catalog: Recipe[],
  eaters: Member[],
  lots: InventoryLot[],
  ingredients: Map<string, Ingredient>,
  o: SuggestOptions = {},
): Suggestion[] {
  const adults = eaters.filter((m) => m.kind === 'adulto');
  return catalog
    .filter((r) => !o.slot || SLOT_TAG[o.slot].some((t) => r.tags.includes(t)))
    .filter((r) => !o.maxMinutes || r.totalMinutes <= o.maxMinutes)
    .filter((r) => !o.forOffice || r.tags.includes('vianda'))
    .filter((r) => adults.every((m) => recipeFitsMember(r, m, ingredients)))
    .map((r) => {
      const { coverage, missing } = inventoryCoverage(r, lots, ingredients);
      let score = coverage * 60;
      if (o.recentRecipeIds?.includes(r.id)) score -= 25;
      if (o.highProtein && r.tags.includes('proteico')) score += 15;
      if (r.difficulty === 'facil') score += 5;
      if (o.mustUse?.length) score += 10 * r.ingredients.filter((i) => o.mustUse!.includes(i.ingredientId)).length;
      return { recipe: r, score, coverage, missing };
    })
    .sort((a, b) => b.score - a.score);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Genera una semana en borrador. NO toca el inventario. */
export function generateWeek(
  startISO: string,
  catalog: Recipe[],
  members: Member[],
  lots: InventoryLot[],
  ingredients: Map<string, Ingredient>,
  slots: MealSlot[] = ['desayuno', 'almuerzo', 'merienda', 'cena'],
): PlannedMeal[] {
  const meals: PlannedMeal[] = [];
  const recent: string[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(startISO, d);
    for (const slot of slots) {
      const sug = suggestRecipes(catalog, members, lots, ingredients, { slot, recentRecipeIds: recent.slice(-6) })[0];
      if (!sug) continue;
      recent.push(sug.recipe.id);
      meals.push({
        id: newId('meal'), date, slot, recipeId: sug.recipe.id,
        memberIds: members.map((m) => m.id),
        portionsByMember: Object.fromEntries(members.map((m) => [m.id, 1])),
        status: 'planificada', substitutions: {},
      });
    }
  }
  return meals;
}
