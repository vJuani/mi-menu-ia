import { buildAdultVersion } from './adaptations.js';
import { availableQty } from './inventory.js';
import { convert, round, toBase } from './units.js';
/** Estimación SOLO para comprar: no es una porción que se le imponga al bebé. */
export const BABY_SHOPPING_FACTOR = 0.25;
export function baseUnitFor(ing) {
    return toBase(1, ing.defaultUnit).unit;
}
export function needsForMeal(meal, recipe, members, ingredients) {
    if (meal.leftoverOf)
        return []; // sobras: lo que se usa ya se cocinó (y compró) en la cena
    const acc = new Map();
    const add = (id, qty, unit) => {
        const ing = ingredients.get(id);
        if (!ing)
            return;
        const u = baseUnitFor(ing);
        const q = convert(qty, unit, u, ing);
        if (q === null)
            return;
        acc.set(id, (acc.get(id) ?? 0) + q);
    };
    for (const m of members.filter((x) => meal.memberIds.includes(x.id))) {
        const portion = (meal.portionsByMember[m.id] ?? 1) + (meal.extraPortions?.[m.id] ?? 0);
        if (m.kind === 'bebe') {
            for (const ri of recipe.ingredients) {
                if (ri.optional || ri.addedAfterBabySplit)
                    continue;
                const id = meal.substitutions[ri.ingredientId] ?? ri.ingredientId;
                add(id, (ri.qty / recipe.servings) * BABY_SHOPPING_FACTOR, ri.unit);
            }
            continue;
        }
        const v = buildAdultVersion(recipe, m, portion, ingredients, meal.substitutions);
        if (v.status === 'no_apta')
            continue;
        for (const l of v.lines)
            add(l.ingredientId, l.qty, l.unit);
    }
    return [...acc.entries()].map(([ingredientId, qty]) => ({
        ingredientId, qty: round(qty, 2), unit: baseUnitFor(ingredients.get(ingredientId)), mealId: meal.id, date: meal.date,
    }));
}
export function computeShoppingList(meals, recipes, members, ingredients, lots, opts = {}) {
    const pending = meals
        .filter((m) => m.status === 'planificada')
        .sort((a, b) => (a.date + slotOrder(a.slot)).localeCompare(b.date + slotOrder(b.slot)));
    const remaining = new Map(); // disponible restante en unidad base
    const lines = new Map();
    for (const meal of pending) {
        const recipe = recipes.get(meal.recipeId);
        if (!recipe)
            continue;
        for (const need of needsForMeal(meal, recipe, members, ingredients)) {
            const ing = ingredients.get(need.ingredientId);
            // Básicos de alacena (sal, aceite, especias) no se listan salvo que se pida.
            if (!opts.includeStaples && ing.tags.includes('basico'))
                continue;
            if (!remaining.has(need.ingredientId))
                remaining.set(need.ingredientId, availableQty(need.ingredientId, lots, need.unit, ing));
            const avail = remaining.get(need.ingredientId);
            const used = Math.min(avail, need.qty);
            remaining.set(need.ingredientId, avail - used);
            const line = lines.get(need.ingredientId) ?? {
                ingredientId: need.ingredientId, name: ing.name, unit: need.unit,
                needed: 0, available: 0, toBuy: 0, mealIds: [], firstDate: need.date,
            };
            line.needed = round(line.needed + need.qty, 2);
            line.available = round(line.available + used, 2);
            line.toBuy = round(line.toBuy + (need.qty - used), 2);
            if (!line.mealIds.includes(meal.id))
                line.mealIds.push(meal.id);
            lines.set(need.ingredientId, line);
        }
    }
    return [...lines.values()]
        .filter((l) => l.toBuy > 0.009)
        .map((l) => ({ ...l, toBuy: roundUpForPurchase(l.toBuy, l.unit) }))
        .sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.name.localeCompare(b.name));
}
/** Redondea hacia arriba a cantidades comprables (10 g / 10 ml / 1 un). */
export function roundUpForPurchase(qty, unit) {
    if (unit === 'un')
        return Math.ceil(qty - 1e-9);
    return Math.ceil(qty / 10 - 1e-9) * 10;
}
const SLOT_ORDER = { desayuno: '1', colacion: '2', almuerzo: '3', merienda: '4', cena: '5' };
function slotOrder(s) { return SLOT_ORDER[s] ?? '9'; }
/** Mensaje humano: "Para cocinar esta noche te faltan 300 g de pollo y 2 zapallitos". */
export function missingSentence(lines, when) {
    if (!lines.length)
        return `Tenés todo para ${when}.`;
    const parts = lines.map((l) => (l.unit === 'un' ? `${l.toBuy} ${l.toBuy > 1 ? plural(l.name.toLowerCase()) : l.name.toLowerCase()}` : `${l.toBuy} ${l.unit} de ${l.name.toLowerCase()}`));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    return `Para ${when} te faltan ${list}.`;
}
export function plural(name) {
    const [head, ...rest] = name.split(' ');
    const p = /[aeiouáéó]$/.test(head) ? head + 's' : /z$/.test(head) ? head.slice(0, -1) + 'ces' : head + 'es';
    return [p, ...rest].join(' ');
}
