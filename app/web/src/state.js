import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { ageInMonths } from '../../src/domain/nutrition.js';
import { computeShoppingList } from '../../src/domain/shopping.js';
import { DEFAULT_REMINDER_SETTINGS } from '../../src/domain/reminders.js';
import { addDays } from '../../src/domain/planner.js';
import { DEFAULT_LEFTOVER_CONFIG, planLeftoverLunches } from '../../src/domain/leftovers.js';
export const AppCtx = createContext(null);
export function useApp() {
    const c = useContext(AppCtx);
    if (!c)
        throw new Error('Sin contexto');
    return c;
}
export function localToday(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export async function loadSnapshot(repo) {
    const [members, ingredientList, all, lots, meals, reminderSettings, onboarded, weights] = await Promise.all([
        repo.members(), repo.ingredients(), repo.recipes(), repo.lots(), repo.meals(addDays(localToday(), -35)),
        repo.getSetting('reminders', DEFAULT_REMINDER_SETTINGS), repo.getSetting('onboarded', false), repo.weights(),
    ]);
    const leftoverCfg = { ...DEFAULT_LEFTOVER_CONFIG, ...(await repo.getSetting('plan.leftovers', {})) };
    const baby = members.find((m) => m.kind === 'bebe');
    const babyProfile = baby ? await repo.babyProfile(baby.id) : null;
    const introductions = baby ? await repo.introductions(baby.id) : [];
    const ingredients = new Map(ingredientList.map((i) => [i.id, i]));
    return {
        members, ingredients, ingredientList, recipes: new Map(all.map((r) => [r.id, r])), recipeList: all.filter((r) => !r.archived), allRecipes: all,
        lots, meals, babyProfile, introductions, reminderSettings: { ...DEFAULT_REMINDER_SETTINGS, ...reminderSettings }, onboarded,
        lastWeighIn: weights.at(-1)?.date, leftoverCfg,
        babyCtx: baby && babyProfile && baby.birthDate ? { profile: babyProfile, ageMonths: ageInMonths(baby.birthDate), introductions, ingredients } : undefined,
    };
}
/** Mantiene los almuerzos de sobras alineados con las cenas. Devuelve true si cambió algo. */
export async function syncLeftovers(repo, s) {
    const { upserts, deletes } = planLeftoverLunches(s.meals, s.leftoverCfg, localToday());
    if (!upserts.length && !deletes.length)
        return false;
    await repo.db.transaction(async () => {
        for (const id of deletes)
            await repo.deleteMeal(id);
        for (const m of upserts)
            await repo.saveMeal(m);
    });
    return true;
}
export async function syncShopping(repo, s) {
    const upcoming = s.meals.filter((m) => m.date >= localToday() && m.date <= addDays(localToday(), 7));
    await repo.syncShoppingList(computeShoppingList(upcoming, s.recipes, s.members, s.ingredients, s.lots));
}
