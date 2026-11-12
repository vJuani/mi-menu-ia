import { aversionFor } from './adaptations.js';
import { isIngredientSafeForBaby } from './babySafety.js';
import { availableQty } from './inventory.js';
import { baseUnitFor } from './shopping.js';
export function groupsOf(ing) {
    return ing.tags.filter((t) => t.startsWith('grupo:'));
}
export function findSubstitutes(originalId, meal, members, ingredients, lots, babyCtx, opts = {}) {
    const original = ingredients.get(originalId);
    if (!original)
        return [];
    const groups = groupsOf(original);
    if (!groups.length)
        return [];
    const eaters = members.filter((m) => meal.memberIds.includes(m.id));
    const out = [];
    for (const cand of ingredients.values()) {
        if (cand.id === originalId || opts.exclude?.includes(cand.id))
            continue;
        if (!groupsOf(cand).some((g) => groups.includes(g)))
            continue;
        if (eaters.some((m) => m.kind === 'adulto' && aversionFor(m, cand) === 'excluir'))
            continue;
        let babyNeedsConfirmation = false;
        if (babyCtx && eaters.some((m) => m.kind === 'bebe')) {
            const s = isIngredientSafeForBaby(cand, babyCtx, { addedAfterSplit: opts.addedAfterBabySplit });
            if (!s.ok)
                continue;
            babyNeedsConfirmation = !!s.needsConfirmation;
        }
        const inStock = availableQty(cand.id, lots, baseUnitFor(cand), cand);
        out.push({
            ingredient: cand,
            inStock,
            babyNeedsConfirmation,
            reason: inStock > 0 ? 'Lo tenés en casa' : 'Mismo tipo de ingrediente',
        });
    }
    return out.sort((a, b) => Number(a.babyNeedsConfirmation) - Number(b.babyNeedsConfirmation) ||
        Number(b.inStock > 0) - Number(a.inStock > 0) ||
        a.ingredient.name.localeCompare(b.ingredient.name));
}
/** Aplica una sustitución a la comida planificada (inmutable). El llamador recalcula compras y recordatorios. */
export function applySubstitution(meal, fromId, toId) {
    const substitutions = { ...meal.substitutions };
    // si "from" ya era un reemplazo, buscamos el ingrediente original
    const originalKey = Object.keys(substitutions).find((k) => substitutions[k] === fromId) ?? fromId;
    if (originalKey === toId)
        delete substitutions[originalKey];
    else
        substitutions[originalKey] = toId;
    return { ...meal, substitutions };
}
