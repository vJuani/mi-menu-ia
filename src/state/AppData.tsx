/**
 * Estado global: abre la base, aplica migraciones, carga una "foto" de los datos
 * y expone helpers. Después de cada cambio, `commit()` recarga, recalcula la
 * lista de compras y resincroniza las notificaciones.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { openExpoDb } from '../data/expoDriver';
import { migrate } from '../data/migrations';
import { Repo } from '../data/repo';
import { seedBase } from '../data/seed';
import type { BabyContext } from '../domain/babySafety';
import type { BabyFeedingProfile, FoodIntroduction, Ingredient, InventoryLot, Member, PlannedMeal, Recipe } from '../domain/types';
import { ageInMonths } from '../domain/nutrition';
import { computeShoppingList } from '../domain/shopping';
import { DEFAULT_REMINDER_SETTINGS } from '../domain/reminders';
import type { ReminderSettings } from '../domain/reminders';
import { syncNotifications } from '../services/notifications';
import { addDays } from '../domain/planner';
import { DEFAULT_LEFTOVER_CONFIG, planLeftoverLunches } from '../domain/leftovers';
import type { LeftoverConfig } from '../domain/leftovers';

export interface Snapshot {
  members: Member[];
  ingredients: Map<string, Ingredient>;
  ingredientList: Ingredient[];
  recipes: Map<string, Recipe>;
  /** Recetas activas (las archivadas no se proponen). */
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

interface Ctx {
  ready: boolean;
  error?: string;
  repo: Repo;
  data: Snapshot;
  todayISO: string;
  commit: (fn?: (repo: Repo) => Promise<unknown>) => Promise<void>;
}

const AppDataContext = createContext<Ctx | null>(null);

export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function load(repo: Repo): Promise<Snapshot> {
  const [members, ingredientList, recipeList, lots, meals, reminderSettings, onboarded, weights] = await Promise.all([
    repo.members(), repo.ingredients(), repo.recipes(), repo.lots(), repo.meals(addDays(localToday(), -35)),
    repo.getSetting<ReminderSettings>('reminders', DEFAULT_REMINDER_SETTINGS), repo.getSetting<boolean>('onboarded', false), repo.weights(),
  ]);
  const baby = members.find((m) => m.kind === 'bebe');
  const babyProfile = baby ? await repo.babyProfile(baby.id) : null;
  const introductions = baby ? await repo.introductions(baby.id) : [];
  const ingredients = new Map(ingredientList.map((i) => [i.id, i]));
  return {
    members, ingredients, ingredientList, recipes: new Map(recipeList.map((r) => [r.id, r])), recipeList: recipeList.filter((r) => !r.archived), allRecipes: recipeList, lots, meals,
    babyProfile, introductions, reminderSettings: { ...DEFAULT_REMINDER_SETTINGS, ...reminderSettings }, onboarded,
    lastWeighIn: weights.at(-1)?.date,
    babyCtx: baby && babyProfile && baby.birthDate
      ? { profile: babyProfile, ageMonths: ageInMonths(baby.birthDate), introductions, ingredients }
      : undefined,
  };
}

const EMPTY: Snapshot = {
  members: [], ingredients: new Map(), ingredientList: [], recipes: new Map(), recipeList: [], allRecipes: [], lots: [], meals: [],
  babyProfile: null, introductions: [], reminderSettings: DEFAULT_REMINDER_SETTINGS, onboarded: false,
};

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string>();
  const [todayISO, setToday] = useState(localToday());
  const syncing = useRef(false);

  const afterChange = useCallback(async (r: Repo) => {
    let snap = await load(r);
    // Almuerzo = cena del día anterior (misma lógica que la versión web).
    const cfg = { ...DEFAULT_LEFTOVER_CONFIG, ...(await r.getSetting<Partial<LeftoverConfig>>('plan.leftovers', {})) };
    const lo = planLeftoverLunches(snap.meals, cfg, localToday());
    if (lo.upserts.length || lo.deletes.length) {
      await r.db.transaction(async () => { for (const id of lo.deletes) await r.deleteMeal(id); for (const m of lo.upserts) await r.saveMeal(m); });
      snap = await load(r);
    }
    setData(snap);
    if (syncing.current) return;
    syncing.current = true;
    try {
      const upcoming = snap.meals.filter((m) => m.date >= localToday() && m.date <= addDays(localToday(), 7));
      await r.syncShoppingList(computeShoppingList(upcoming, snap.recipes, snap.members, snap.ingredients, snap.lots));
      await syncNotifications(r, {
        now: new Date(), meals: snap.meals, recipes: snap.recipes, members: snap.members, ingredients: snap.ingredients,
        lots: snap.lots, settings: snap.reminderSettings, lastWeighInISO: snap.lastWeighIn,
      });
    } catch (e) {
      console.warn('sync', e);
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = await openExpoDb();
        await migrate(db);
        const r = new Repo(db);
        await seedBase(r);
        setRepo(r);
        await afterChange(r);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [afterChange]);

  // Al volver a primer plano: nueva fecha y reprogramación con datos frescos.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && repo) { setToday(localToday()); afterChange(repo); }
    });
    return () => sub.remove();
  }, [repo, afterChange]);

  const commit = useCallback(async (fn?: (repo: Repo) => Promise<unknown>) => {
    if (!repo) return;
    if (fn) await fn(repo);
    await afterChange(repo);
  }, [repo, afterChange]);

  const value = useMemo<Ctx | null>(() => (repo ? { ready: true, repo, data, todayISO, commit, error } : null), [repo, data, todayISO, commit, error]);

  if (!value) return <AppDataContext.Provider value={{ ready: false, error, repo: null as unknown as Repo, data: EMPTY, todayISO, commit: async () => undefined }}>{children}</AppDataContext.Provider>;
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): Ctx {
  const c = useContext(AppDataContext);
  if (!c) throw new Error('useAppData fuera del proveedor');
  return c;
}

export function memberName(m?: Member): string {
  return m ? m.shortName ?? m.name : '';
}
