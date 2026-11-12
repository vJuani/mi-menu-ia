import { parseInventoryText, normalize, matchIngredient } from './textParser.js';
import { suggestRecipes } from './planner.js';
import { findSubstitutes } from './substitutions.js';
import { evaluateRecipeForBaby, proposeSafeBabyAlternative } from './babySafety.js';
import { aversionFor } from './adaptations.js';
export function detectIntent(text) {
    const t = normalize(text);
    const mins = t.match(/(\d+)\s*(min|minutos)/);
    if (/helena|bebe|la nena|puede comer/.test(t))
        return { intent: 'bebe_puede' };
    if (/no (consegui|habia|tengo|encontre)/.test(t))
        return { intent: 'no_consegui' };
    if (/^compre|^compramos|^traje/.test(t))
        return { intent: 'compre' };
    if (/no entrene|no fui al gimnasio|descanso/.test(t))
        return { intent: 'no_entrene' };
    if (mins)
        return { intent: 'tiempo_limitado', minutes: Number(mins[1]) };
    if (/oficina|vianda|tupper|llevar/.test(t))
        return { intent: 'vianda' };
    if (/proteic|mas proteina/.test(t))
        return { intent: 'merienda_proteica' };
    if (/gastar menos|ahorrar|barato|economic/.test(t))
        return { intent: 'ahorrar' };
    if (/^tengo|^me quedan|^hay /.test(t))
        return { intent: 'tengo_ingredientes' };
    if (/que (puedo )?(cocin|comemos|como|hago)/.test(t))
        return { intent: 'que_cocino' };
    return { intent: 'desconocido' };
}
function adults(ctx) { return ctx.members.filter((m) => m.kind === 'adulto'); }
function listRecipes(s, n = 3) {
    return s.slice(0, n).map((x) => `• ${x.recipe.name} (${x.recipe.totalMinutes} min${x.missing.length ? `, faltan ${x.missing.length}` : ', tenés todo'})`).join('\n');
}
export function reply(text, ctx) {
    const { intent, minutes } = detectIntent(text);
    const ings = [...ctx.ingredients.values()];
    const base = { intent, suggestions: [], actions: [] };
    switch (intent) {
        case 'que_cocino':
        case 'tiempo_limitado': {
            const s = suggestRecipes(ctx.recipes, adults(ctx), ctx.lots, ctx.ingredients, { slot: 'cena', maxMinutes: minutes });
            if (!s.length)
                return { ...base, text: minutes ? `No encontré recetas de ${minutes} minutos o menos que sirvan para todos.` : 'No encontré recetas aptas para todos con los filtros actuales.' };
            return { ...base, suggestions: s.slice(0, 3), text: `Con lo que tenés en casa te propongo:\n${listRecipes(s)}` };
        }
        case 'tengo_ingredientes': {
            const items = parseInventoryText(text, ings);
            const known = items.filter((i) => i.ingredientId).map((i) => i.ingredientId);
            const s = suggestRecipes(ctx.recipes, adults(ctx), ctx.lots, ctx.ingredients, { mustUse: known });
            const actions = items.some((i) => i.qty !== null) ? [{ type: 'agregar_inventario', items }] : [];
            const unknown = items.filter((i) => !i.ingredientId).map((i) => i.name);
            return {
                ...base, suggestions: s.slice(0, 3), actions,
                text: `${s.length ? `Con eso podés hacer:\n${listRecipes(s)}` : 'No encontré recetas con esos ingredientes.'}${unknown.length ? `\nNo reconocí: ${unknown.join(', ')}.` : ''}${actions.length ? '\n¿Querés que lo cargue al inventario? Revisá las cantidades antes de confirmar.' : ''}`,
            };
        }
        case 'no_consegui': {
            const name = normalize(text).replace(/.*no (consegui|habia|tengo|encontre)\s*/, '');
            const ing = matchIngredient(name, ings);
            if (!ing)
                return { ...base, text: `No identifiqué "${name}". Probá con el nombre del ingrediente.` };
            const upcoming = ctx.meals.filter((m) => m.status === 'planificada' && m.date >= ctx.todayISO &&
                ctx.recipes.find((r) => r.id === m.recipeId)?.ingredients.some((ri) => (m.substitutions[ri.ingredientId] ?? ri.ingredientId) === ing.id));
            if (!upcoming.length)
                return { ...base, text: `No tenés comidas planificadas con ${ing.name.toLowerCase()}.` };
            const actions = [];
            const lines = [];
            for (const m of upcoming) {
                const recipe = ctx.recipes.find((r) => r.id === m.recipeId);
                const ri = recipe.ingredients.find((x) => (m.substitutions[x.ingredientId] ?? x.ingredientId) === ing.id);
                const subs = findSubstitutes(ing.id, m, ctx.members, ctx.ingredients, ctx.lots, ctx.babyCtx, { addedAfterBabySplit: ri.addedAfterBabySplit });
                if (subs[0]) {
                    actions.push({ type: 'sustituir', mealId: m.id, fromId: ing.id, toId: subs[0].ingredient.id, label: `${recipe.name}: usar ${subs[0].ingredient.name.toLowerCase()}` });
                    lines.push(`• ${recipe.name} (${m.date}): ${subs.slice(0, 3).map((x) => x.ingredient.name.toLowerCase() + (x.inStock > 0 ? ' ✓ en casa' : '') + (x.babyNeedsConfirmation ? ' (nuevo para Helena)' : '')).join(', ')}`);
                }
                else {
                    lines.push(`• ${recipe.name} (${m.date}): no hay reemplazo válido; conviene cambiar la comida.`);
                }
            }
            return { ...base, actions, text: `Reemplazos posibles para ${ing.name.toLowerCase()}:\n${lines.join('\n')}` };
        }
        case 'no_entrene':
            return {
                ...base,
                actions: [{ type: 'registrar_entrenamiento', date: ctx.todayISO, trained: false }],
                text: 'Lo registro como día sin entrenamiento. No hace falta compensar: mantené la proteína y, si querés, achicá un poco la porción de carbohidratos de la cena. Un día no cambia el resultado.',
            };
        case 'vianda': {
            const tomorrow = addDaysISO(ctx.todayISO, 1);
            const lunch = ctx.meals.find((m) => m.date === tomorrow && m.slot === 'almuerzo');
            const s = suggestRecipes(ctx.recipes, adults(ctx).filter((m) => m.isPrimary), ctx.lots, ctx.ingredients, { forOffice: true });
            const actions = lunch ? [{ type: 'marcar_vianda', mealId: lunch.id }] : [];
            return { ...base, actions, suggestions: s.slice(0, 3), text: `${lunch ? 'Marco el almuerzo de mañana como vianda y te aviso la noche anterior.' : 'No tenés almuerzo planificado para mañana.'}\nOpciones que viajan bien:\n${listRecipes(s)}` };
        }
        case 'merienda_proteica': {
            const s = suggestRecipes(ctx.recipes, adults(ctx).filter((m) => m.isPrimary), ctx.lots, ctx.ingredients, { slot: 'merienda', highProtein: true });
            return { ...base, suggestions: s.slice(0, 3), text: `Meriendas con más proteína:\n${listRecipes(s)}` };
        }
        case 'bebe_puede': {
            if (!ctx.babyCtx)
                return { ...base, text: 'Primero completá el perfil de Helena (inicio de alimentación complementaria y señales de preparación).' };
            const meal = ctx.meals.find((m) => m.date === ctx.todayISO && m.status === 'planificada' && (m.slot === 'almuerzo' || m.slot === 'cena'));
            const recipe = ctx.recipes.find((r) => r.id === (ctx.currentRecipeId ?? meal?.recipeId));
            if (!recipe)
                return { ...base, text: 'Abrí una receta o planificá una comida para revisarla.' };
            const ev = evaluateRecipeForBaby(recipe, ctx.babyCtx, meal?.substitutions);
            if (ev.verdict === 'bloqueado') {
                const alt = proposeSafeBabyAlternative(recipe, ctx.recipes, ctx.babyCtx);
                return { ...base, text: `${recipe.name} no es apta para Helena:\n${ev.issues.filter((i) => i.severity === 'bloqueo').map((i) => '• ' + i.message).join('\n')}${alt ? `\nAlternativa segura: ${alt.recipe.name}.` : '\nNecesita una preparación aparte.'}` };
            }
            return {
                ...base,
                text: `${recipe.name}: ${ev.verdict === 'requiere_confirmacion' ? 'puede compartirse, pero tiene alimentos nuevos que tenés que confirmar' : 'puede compartirse con adaptación'}.\n${ev.issues.filter((i) => i.severity !== 'control').map((i) => '• ' + i.message).join('\n')}\nAntes de servir: temperatura tibia, sin espinas ni huesos, textura adecuada. Esto no reemplaza la indicación del pediatra.`,
            };
        }
        case 'compre': {
            const items = parseInventoryText(text, ings);
            return {
                ...base,
                actions: [{ type: 'agregar_inventario', items }],
                text: `Entendí:\n${items.map((i) => `• ${i.name}: ${i.qty ?? '¿cantidad?'} ${i.unit ?? ''}${i.ingredientId ? '' : ' (nuevo producto)'}`).join('\n')}\nConfirmá para sumarlo al inventario.`,
            };
        }
        case 'ahorrar': {
            const s = suggestRecipes(ctx.recipes, adults(ctx), ctx.lots, ctx.ingredients, {}).filter((x) => x.coverage >= 0.6 || x.recipe.tags.includes('economico'));
            return { ...base, suggestions: s.slice(0, 4), text: `Para gastar menos: priorizá lo que ya tenés, cociná por lote y usá cortes y proteínas más económicas (pollo entero, carne picada, legumbres).\n${listRecipes(s, 4)}` };
        }
        default:
            return { ...base, requiresOnline: true, text: 'No entendí la consulta sin conexión. Probá con: "¿Qué puedo cocinar hoy?", "Tengo 20 minutos", "No conseguí carne" o "Compré un kilo de pollo".' };
    }
}
function addDaysISO(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
/**
 * Valida una propuesta generada por IA online (lista de ingredientes por integrante).
 * Rechaza lo que viole restricciones o la seguridad infantil. La IA nunca tiene la última palabra.
 */
export function validateGeneratedProposal(proposal, ctx) {
    const problems = [];
    const ings = [...ctx.ingredients.values()];
    for (const p of proposal) {
        const member = ctx.members.find((m) => m.id === p.memberId);
        if (!member) {
            problems.push(`Integrante desconocido: ${p.memberId}`);
            continue;
        }
        for (const name of p.ingredientNames) {
            const ing = matchIngredient(name, ings);
            if (!ing) {
                problems.push(`${member.name}: ingrediente no reconocido "${name}" (requiere revisión manual).`);
                continue;
            }
            if (member.kind === 'adulto' && aversionFor(member, ing) === 'excluir')
                problems.push(`${member.name} no come ${ing.name}.`);
            if (member.kind === 'bebe') {
                if (!ctx.babyCtx) {
                    problems.push('Perfil de Helena incompleto.');
                    continue;
                }
                const fake = { id: 'tmp', name: 'tmp', totalMinutes: 0, difficulty: 'facil', servings: 1, ingredients: [{ ingredientId: ing.id, qty: 1, unit: 'g', state: 'cocido' }], steps: [], utensils: [], tags: [], babyTextures: ctx.babyCtx.profile.allowedTextures };
                const ev = evaluateRecipeForBaby(fake, ctx.babyCtx);
                for (const i of ev.issues)
                    if (i.severity === 'bloqueo' || i.severity === 'confirmacion')
                        problems.push(`Helena: ${i.message}`);
            }
        }
    }
    return { ok: problems.length === 0, problems };
}
