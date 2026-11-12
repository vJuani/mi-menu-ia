import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Repo } from '../../src/data/repo.ts';
import type { BabyContext } from '../../src/domain/babySafety.ts';
import type { BabyFeedingProfile, FoodIntroduction, Ingredient, InventoryLot, Member, PlannedMeal, Recipe } from '../../src/domain/types.ts';
import { ageInMonths } from '../../src/domain/nutrition.ts';
import { computeShoppingList } from '../../src/domain/shopping.ts';
import { DEFAULT_REMINDER_SETTINGS } from '../../src/domain/reminders.ts';
import type { ReminderSettings } from '../../src/domain/reminders.ts';
import { addDays } from '../../src/domain/planner.ts';

export interface Snapshot {
  members: Member[];
  ingredients: Map<string, Ingredient>;
  ingredientList: Ingredient[];
  recipes: Map<string, Recipe>;
  recipeList: Recipe[];
  allRecipes: Recipe[];
  lots: InventoryLot[];
  meals: PlannedMeal[];
  babyProfile: BabyFeedingProfile | null;
  introductions: FoodIntroduction[];
  babyCtx?: BabyContext;
  reminderSettings: ReminderSettings;
  onboarded: boolean;
  lastWeighIn?: string;
}

export interface Ctx {
  repo: Repo;
  data: Snapshot;
  todayISO: string;
  commit: (fn?: (repo: Repo) => Promise<unknown>) => Promise<void>;
  version: number;
}

export const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx) as Ctx | null;
  if (!c) throw new Error('Sin contexto');
  return c;
}

export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function loadSnapshot(repo: Repo): Promise<Snapshot> {
  const [members, ingredientList, all, lots, meals, reminderSettings, onboarded, weights] = await Promise.all([
    repo.members(), repo.ingredients(), repo.recipes(), repo.lots(), repo.meals(addDays(localToday(), -35)),
    repo.getSetting<ReminderSettings>('reminders', DEFAULT_REMINDER_SETTINGS), repo.getSetting<boolean>('onboarded', false), repo.weights(),
  ]);
  const baby = members.find((m) => m.kind === 'bebe');
  const babyProfile = baby ? await repo.babyProfile(baby.id) : null;
  const introductions = baby ? await repo.introductions(baby.id) : [];
  const ingredients = new Map(ingredientList.map((i) => [i.id, i]));
  return {
    members, ingredients, ingredientList, recipes: new Map(all.map((r) => [r.id, r])), recipeList: all.filter((r) => !r.archived), allRecipes: all,
    lots, meals, babyProfile, introductions, reminderSettings: { ...DEFAULT_REMINDER_SETTINGS, ...reminderSettings }, onboarded,
    lastWeighIn: weights.at(-1)?.date,
    babyCtx: baby && babyProfile && baby.birthDate ? { profile: babyProfile, ageMonths: ageInMonths(baby.birthDate), introductions, ingredients } : undefined,
  };
}

export async function syncShopping(repo: Repo, s: Snapshot): Promise<void> {
  const upcoming = s.meals.filter((m) => m.date >= localToday() && m.date <= addDays(localToday(), 7));
  await repo.syncShoppingList(computeShoppingList(upcoming, s.recipes, s.members, s.ingredients, s.lots));
}
