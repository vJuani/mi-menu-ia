import { convert } from './units.js';
import { evaluateRecipeForBaby } from './babySafety.js';
export function matchesTag(ing, tag) {
    const t = tag.toLowerCase();
    return ing.id === t || ing.name.toLowerCase() === t || ing.tags.includes(t) || ing.aliases.some((a) => a.toLowerCase() === t);
}
/** ¿El integrante rechaza este ingrediente? Devuelve el nivel o null. */
export function aversionFor(member, ing) {
    let level = null;
    for (const a of member.aversions) {
        if (matchesTag(ing, a.tag)) {
            if (a.level === 'excluir')
                return 'excluir';
            level = 'evitar';
        }
    }
    if (member.allergies.some((al) => matchesTag(ing, al) || ing.tags.includes(`alergeno:${al}`)))
        return 'excluir';
    return level;
}
export function scaleQty(ri, servings, portion) {
    return (ri.qty / servings) * portion;
}
export function estimateNutrition(lines, ingredients) {
    const total = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    for (const l of lines) {
        const ing = ingredients.get(l.ingredientId);
        if (!ing?.per100g)
            continue;
        // Solo usamos la tabla si coincide el estado (crudo/cocido) declarado.
        if (ing.nutritionBasis && ing.nutritionBasis !== l.state)
            continue;
        const grams = convert(l.qty, l.unit, 'g', ing);
        if (grams === null)
            continue;
        const f = grams / 100;
        total.kcal += ing.per100g.kcal * f;
        total.proteinG += ing.per100g.proteinG * f;
        total.carbsG += ing.per100g.carbsG * f;
        total.fatG += ing.per100g.fatG * f;
    }
    return {
        kcal: Math.round(total.kcal),
        proteinG: Math.round(total.proteinG),
        carbsG: Math.round(total.carbsG),
        fatG: Math.round(total.fatG),
    };
}
export function buildAdultVersion(recipe, member, portion, ingredients, substitutions = {}) {
    const v = { memberId: member.id, memberName: member.shortName ?? member.name, status: 'apta', lines: [], removed: [], added: [], notes: [] };
    for (const orig of recipe.ingredients) {
        const sub = substitutions[orig.ingredientId];
        const ri = sub ? { ...orig, ingredientId: sub } : orig;
        const ing = ingredients.get(ri.ingredientId);
        if (!ing)
            continue;
        const av = aversionFor(member, ing);
        const isExtra = !!ri.optional && member.optionalExtras.some((t) => matchesTag(ing, t));
        if (ri.optional && !isExtra)
            continue; // opcionales: solo para quien los pide
        if (av) {
            if (ri.optional || ri.separable) {
                v.removed.push({ ingredientId: ing.id, name: ing.name, reason: av === 'excluir' ? 'No lo come' : 'Prefiere evitarlo' });
                continue;
            }
            if (av === 'excluir') {
                v.status = 'no_apta';
                v.removed.push({ ingredientId: ing.id, name: ing.name, reason: 'No lo come y es parte de la base' });
                continue;
            }
            // 'evitar' en un ingrediente no separable: se acepta pero se avisa.
            v.notes.push(`Contiene ${ing.name}, que prefiere evitar.`);
            if (v.status === 'apta')
                v.status = 'apta_con_cambios';
        }
        v.lines.push({ ingredientId: ing.id, name: ing.name, qty: scaleQty(ri, recipe.servings, portion), unit: ri.unit, state: ri.state, extra: isExtra || undefined });
        if (isExtra)
            v.added.push({ ingredientId: ing.id, name: ing.name });
    }
    if (v.status === 'apta' && (v.removed.length || v.added.length))
        v.status = 'apta_con_cambios';
    if (v.removed.length && v.status !== 'no_apta') {
        v.notes.push('Compensá con más verdura o proteína de la base si querés mantener el volumen.');
    }
    v.nutrition = estimateNutrition(v.lines, ingredients);
    return v;
}
export function buildFamilyVersions(recipe, members, portions, ingredients, babyCtx, substitutions = {}) {
    const versions = [];
    let babyNeedsSeparateMeal = false;
    for (const m of members) {
        if (m.kind === 'bebe') {
            if (!babyCtx)
                continue;
            const ev = evaluateRecipeForBaby(recipe, babyCtx, substitutions);
            const ok = ev.verdict === 'apto' || ev.verdict === 'apto_con_adaptacion';
            if (!ok)
                babyNeedsSeparateMeal = ev.verdict === 'bloqueado';
            versions.push({
                memberId: m.id,
                memberName: m.shortName ?? m.name,
                status: 'bebe',
                lines: ok || ev.verdict === 'requiere_confirmacion'
                    ? recipe.ingredients
                        .filter((ri) => !ri.optional && !ri.addedAfterBabySplit && !ev.newFoods.includes(substitutions[ri.ingredientId] ?? ri.ingredientId))
                        .map((ri) => {
                        const id = substitutions[ri.ingredientId] ?? ri.ingredientId;
                        return { ingredientId: id, name: ingredients.get(id)?.name ?? id, qty: 0, unit: ri.unit, state: 'cocido' };
                    })
                    : [],
                removed: ev.excludedFromBabyPortion.map((id) => ({ ingredientId: id, name: ingredients.get(id)?.name ?? id, reason: 'Se agrega después de separar su porción' })),
                added: [],
                notes: [
                    'Porción según su apetito: sin cantidades rígidas.',
                    ...ev.issues.filter((i) => i.severity !== 'control').map((i) => i.message),
                ],
                baby: ev,
            });
            continue;
        }
        versions.push(buildAdultVersion(recipe, m, portions[m.id] ?? 1, ingredients, substitutions));
    }
    return { base: recipe, versions, babyNeedsSeparateMeal };
}
/** ¿Puede este adulto comer la receta (aunque sea con cambios)? Usado por el planificador. */
export function recipeFitsMember(recipe, member, ingredients) {
    return buildAdultVersion(recipe, member, 1, ingredients).status !== 'no_apta';
}
