import { INGREDIENTS, DEMO_RECIPES, DEMO_MEMBERS } from '../src/data/catalog.ts';
import type { BabyContext } from '../src/domain/babySafety.ts';
import type { FoodIntroduction, Ingredient, InventoryLot, PlannedMeal, Recipe } from '../src/domain/types.ts';

export const ingredients = new Map<string, Ingredient>(INGREDIENTS.map((i) => [i.id, i]));
export const recipes = new Map<string, Recipe>(DEMO_RECIPES.map((r) => [r.id, r]));
export const members = DEMO_MEMBERS;
export const yo = members.find((m) => m.id === 'yo')!;
export const ro = members.find((m) => m.id === 'ro')!;
export const helena = members.find((m) => m.id === 'helena')!;

export function babyCtx(intros: Partial<Record<string, FoodIntroduction['status']>> = {}, overrides: Partial<BabyContext['profile']> = {}, ageMonths = 6): BabyContext {
  return {
    ageMonths,
    ingredients,
    introductions: Object.entries(intros).map(([ingredientId, status], i) => ({ id: `fi${i}`, memberId: 'helena', ingredientId, status: status! })),
    profile: {
      memberId: 'helena', startedComplementary: true, readinessSigns: true, pediatricianNotes: [],
      allowedTextures: ['pure', 'pisado', 'picado_fino'], ...overrides,
    },
  };
}

/** Intros típicas: alimentos que ya toleró en la demo de pruebas. */
export const TOLERATED = { pollo: 'tolerado', calabaza: 'tolerado', zapallito: 'tolerado', aceite_oliva: 'tolerado', oregano: 'tolerado', zanahoria: 'tolerado', carne_picada: 'tolerado', cebolla: 'tolerado', merluza: 'tolerado', banana: 'tolerado' } as const;

export function lot(ingredientId: string, qty: number, unit: InventoryLot['unit'], extra: Partial<InventoryLot> = {}): InventoryLot {
  return { id: `lot_${ingredientId}_${Math.random().toString(36).slice(2, 6)}`, ingredientId, qty, unit, location: 'heladera', state: 'cerrado', ...extra };
}

export function meal(recipeId: string, date: string, slot: PlannedMeal['slot'], memberIds = ['yo', 'ro'], extra: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    id: `meal_${recipeId}_${date}_${slot}`, date, slot, recipeId, memberIds,
    portionsByMember: Object.fromEntries(memberIds.map((m) => [m, 1])), status: 'planificada', substitutions: {}, ...extra,
  };
}
