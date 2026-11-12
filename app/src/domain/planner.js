import { recipeFitsMember } from './adaptations.js';
import { availableQty, newId } from './inventory.js';
import { baseUnitFor } from './shopping.js';
import { convert } from './units.js';
const SLOT_TAG = {
    desayuno: ['desayuno'],
    merienda: ['merienda', 'desayuno'],
    almuerzo: ['principal'],
    cena: ['principal'],
    colacion: ['colacion', 'merienda'],
};
export function inventoryCoverage(recipe, lots, ingredients) {
    const required = recipe.ingredients.filter((i) => !i.optional && !ingredients.get(i.ingredientId)?.tags.includes('basico'));
    if (!required.length)
        return { coverage: 1, missing: [] };
    const missing = [];
    let covered = 0;
    for (const ri of required) {
        const ing = ingredients.get(ri.ingredientId);
        if (!ing) {
            missing.push(ri.ingredientId);
            continue;
        }
        const unit = baseUnitFor(ing);
        const need = convert(ri.qty, ri.unit, unit, ing) ?? ri.qty;
        const have = availableQty(ri.ingredientId, lots, unit, ing);
        if (have >= need)
            covered += 1;
        else {
            covered += have / need;
            missing.push(ri.ingredientId);
        }
    }
    return { coverage: covered / required.length, missing };
}
export function suggestRecipes(catalog, eaters, lots, ingredients, o = {}) {
    const adults = eaters.filter((m) => m.kind === 'adulto');
    return catalog
        .filter((r) => !o.slot || SLOT_TAG[o.slot].some((t) => r.tags.includes(t)))
        .filter((r) => !o.maxMinutes || r.totalMinutes <= o.maxMinutes)
        .filter((r) => !o.forOffice || r.tags.includes('vianda'))
        .filter((r) => adults.every((m) => recipeFitsMember(r, m, ingredients)))
        .map((r) => {
        const { coverage, missing } = inventoryCoverage(r, lots, ingredients);
        let score = coverage * 60;
        if (o.recentRecipeIds?.includes(r.id))
            score -= 25;
        if (o.highProtein && r.tags.includes('proteico'))
            score += 15;
        if (r.difficulty === 'facil')
            score += 5;
        if (o.mustUse?.length)
            score += 10 * r.ingredients.filter((i) => o.mustUse.includes(i.ingredientId)).length;
        return { recipe: r, score, coverage, missing };
    })
        .sort((a, b) => b.score - a.score);
}
export function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
/** Genera una semana en borrador. NO toca el inventario. */
export function generateWeek(startISO, catalog, members, lots, ingredients, slots = ['desayuno', 'almuerzo', 'merienda', 'cena']) {
    const meals = [];
    const recent = [];
    for (let d = 0; d < 7; d++) {
        const date = addDays(startISO, d);
        for (const slot of slots) {
            const sug = suggestRecipes(catalog, members, lots, ingredients, { slot, recentRecipeIds: recent.slice(-6) })[0];
            if (!sug)
                continue;
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
