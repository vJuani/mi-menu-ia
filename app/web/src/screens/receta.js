import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, DishHero, H2, Notice, Row, Screen, Stepper, go, sheet, alertMsg } from '../ui.js';
import { extraPortionsNote } from '../../../src/domain/leftovers.js';
import { buildFamilyVersions } from '../../../src/domain/adaptations.js';
import { proposeSafeBabyAlternative, TEXTURE_LABEL } from '../../../src/domain/babySafety.js';
import { availableQty } from '../../../src/domain/inventory.js';
import { baseUnitFor, computeShoppingList } from '../../../src/domain/shopping.js';
import { findSubstitutes, applySubstitution } from '../../../src/domain/substitutions.js';
import { convert, formatQty } from '../../../src/domain/units.js';
import { DIFFICULTY_LABEL } from '../util.js';
export function Receta({ id, mealId }) {
    const { data, commit, todayISO, repo } = useApp();
    const recipe = data.recipes.get(id);
    const meal = data.meals.find((m) => m.id === mealId);
    const [tab, setTab] = useState('receta');
    const [scale, setScale] = useState(1);
    const eaters = data.members.filter((m) => (meal ? meal.memberIds.includes(m.id) || m.kind === 'bebe' : true));
    const basePortions = meal?.portionsByMember ?? Object.fromEntries(data.members.map((m) => [m.id, 1]));
    // Las porciones extra (almuerzo de mañana) se cocinan ahora: se suman a cada versión.
    const portions = Object.fromEntries(Object.entries(basePortions).map(([k, v]) => [k, v + (meal?.extraPortions?.[k] ?? 0)]));
    const dinner = meal?.leftoverOf ? data.meals.find((m) => m.id === meal.leftoverOf) : undefined;
    const subs = meal?.substitutions ?? {};
    const family = useMemo(() => (recipe ? buildFamilyVersions(recipe, eaters, Object.fromEntries(Object.entries(portions).map(([k, v]) => [k, v * scale])), data.ingredients, data.babyCtx, subs) : null), [recipe, data, scale, mealId]);
    const missing = useMemo(() => (recipe && meal ? computeShoppingList([meal], data.recipes, data.members, data.ingredients, data.lots) : []), [recipe, meal, data]);
    if (!recipe || !family)
        return _jsx(Screen, { children: _jsx(Body, { children: "Receta no encontrada." }) });
    const baby = family.versions.find((v) => v.status === 'bebe');
    const adults = family.versions.filter((v) => v.status !== 'bebe');
    function noTengo(ingredientId) {
        if (!meal)
            return alertMsg('Planificá la comida primero para guardar reemplazos.');
        const ri = recipe.ingredients.find((x) => (subs[x.ingredientId] ?? x.ingredientId) === ingredientId);
        const options = findSubstitutes(ingredientId, meal, data.members, data.ingredients, data.lots, data.babyCtx, { addedAfterBabySplit: ri?.addedAfterBabySplit });
        if (!options.length)
            return sheet('Sin reemplazo válido', 'No hay un reemplazo que respete las restricciones de todos.', [{ text: 'Cambiar comida', onPress: () => go(`cambiar/${meal.id}`) }]);
        sheet(`Reemplazar ${data.ingredients.get(ingredientId)?.name}`, 'Se actualizan receta, nutrición y compras.', options.slice(0, 4).map((o) => ({
            text: `${o.ingredient.name}${o.inStock > 0 ? ' ✓ en casa' : ''}${o.babyNeedsConfirmation ? ' (nuevo p/ Helena)' : ''}`,
            onPress: () => commit((r) => r.saveMeal(applySubstitution(meal, ingredientId, o.ingredient.id))),
        })));
    }
    function ateIt() {
        if (!meal)
            return;
        const mine = adults.find((v) => data.members.find((m) => m.id === v.memberId)?.isPrimary);
        sheet('¿Comiste esta comida?', 'Se registra con la porción planificada.', [
            { text: 'Sí, tal cual', onPress: () => commit(async (repo) => {
                    await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, plannedMealId: meal.id, description: recipe.name, kcal: mine?.nutrition?.kcal, proteinG: mine?.nutrition?.proteinG });
                    await repo.setMealStatus(meal.id, 'comida');
                }) },
            { text: 'Comí otra cosa', onPress: () => commit(async (repo) => {
                    await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, description: 'Otra comida (sin detalle)' });
                    await repo.setMealStatus(meal.id, 'salteada');
                }) },
        ]);
    }
    function leftovers() {
        sheet('Guardar sobrantes', recipe.storage ?? '¿Dónde lo guardás?', [
            { text: 'Heladera (1 porción)', onPress: () => commit((r) => r.addLeftover({ recipeId: recipe.id, plannedMealId: meal?.id, description: recipe.name, portions: 1, location: 'heladera' })) },
            { text: 'Freezer (1 porción)', onPress: () => commit((r) => r.addLeftover({ recipeId: recipe.id, plannedMealId: meal?.id, description: recipe.name, portions: 1, location: 'freezer' })) },
        ]);
    }
    function confirmNewFood(ingredientId) {
        const helena = data.members.find((m) => m.kind === 'bebe');
        if (!helena)
            return;
        sheet(`¿Introducir ${data.ingredients.get(ingredientId)?.name}?`, 'Ofrecelo solo, en pequeña cantidad, de día, y observá durante las horas siguientes. Si el pediatra indicó otra cosa, seguí su indicación.', [
            { text: 'Sí, lo voy a ofrecer', onPress: () => commit((r) => r.setIntroduction(helena.id, ingredientId, 'introducido', { date: todayISO })) },
            { text: 'Todavía no', style: 'cancel' },
        ]);
    }
    async function actions() {
        sheet(recipe.name, undefined, [
            { text: 'Editar', onPress: () => go('editar', { id: recipe.id }) },
            { text: 'Duplicar y modificar', onPress: () => go('editar', { dup: recipe.id }) },
            recipe.archived
                ? { text: 'Restaurar', onPress: () => commit((r) => r.setRecipeArchived(recipe.id, false)) }
                : { text: 'Archivar', style: 'destructive', onPress: async () => {
                        const n = await repo.upcomingMealsWithRecipe(recipe.id, todayISO);
                        const doIt = () => commit((r) => r.setRecipeArchived(recipe.id, true));
                        if (!n)
                            return doIt();
                        sheet('Está en el plan', `Hay ${n} comida(s) futuras con esta receta. Se mantienen; cambialas desde el plan si querés.`, [{ text: 'Archivar igual', style: 'destructive', onPress: doIt }]);
                    } },
        ]);
    }
    const alt = baby?.baby?.verdict === 'bloqueado' && data.babyCtx ? proposeSafeBabyAlternative(recipe, data.recipeList, data.babyCtx) : null;
    return (_jsxs(Screen, { children: [_jsxs(Row, { between: true, children: [_jsx("span", {}), _jsx("button", { class: "link bold", onClick: actions, children: "Editar \u22EF" })] }), recipe.archived ? _jsx(Notice, { children: "Receta archivada: no se propone en el plan." }) : null, _jsx(DishHero, { recipe: recipe, caption: recipe.imageUri ? 'Tu foto' : 'Así tiene que quedar (ilustración)' }), _jsxs("div", { children: [_jsx("h1", { class: "h1-small", children: recipe.name }), _jsxs(Body, { small: true, muted: true, children: ["\u23F1 ", recipe.totalMinutes, " min \u00B7 ", DIFFICULTY_LABEL[recipe.difficulty], " \u00B7 ", family.versions.length, " versiones"] })] }), meal?.leftoverOf ? (_jsxs(Notice, { tone: "primary", children: ["\uD83E\uDD61 ", _jsxs("b", { children: ["Sobras de la cena", dinner ? ` del ${new Date(dinner.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long' })}` : ' de ayer'] }), ": no hay que cocinar ni comprar nada. Recalentalo bien hasta que humee (74 \u00B0C en el centro) y consumilo dentro de los 3 d\u00EDas."] })) : null, meal && extraPortionsNote(meal, new Map(data.members.map((m) => [m.id, m.shortName ?? m.name]))) ? (_jsxs(Notice, { tone: "primary", children: ["\uD83C\uDF73 ", extraPortionsNote(meal, new Map(data.members.map((m) => [m.id, m.shortName ?? m.name])))] })) : null, meal?.leftoverOf ? null : missing.length ? _jsxs(Notice, { children: ["Faltan: ", missing.map((l) => `${l.name} (${formatQty(l.toBuy, l.unit)})`).join(', ')] }) : meal ? _jsx(Notice, { tone: "primary", children: "Ten\u00E9s todos los ingredientes." }) : null, _jsx("div", { class: "segmented", children: ['receta', 'ingredientes', 'nutricion'].map((t) => _jsx(Chip, { label: { receta: 'Receta', ingredientes: 'Ingredientes', nutricion: 'Nutrición' }[t], active: tab === t, onPress: () => setTab(t) })) }), tab === 'receta' && (_jsxs(_Fragment, { children: [_jsx(Body, { muted: true, children: "Una receta base para todos, con adaptaciones para cada uno." }), adults.map((v) => _jsx(VersionCard, { v: v, tone: data.members.find((m) => m.id === v.memberId)?.isPrimary ? 'primary' : 'ro' })), baby ? (_jsxs(Card, { tone: "baby", children: [_jsxs(Body, { bold: true, children: ["Para ", baby.memberName] }), baby.baby.verdict === 'bloqueado' ? (_jsxs(_Fragment, { children: [_jsx(Body, { children: "\u26D4 Necesita una alternativa independiente." }), baby.baby.issues.filter((i) => i.severity === 'bloqueo').map((i) => _jsxs(Body, { small: true, children: ["\u2022 ", i.message] })), alt ? _jsx(Button, { small: true, kind: "secondary", title: `Ver alternativa: ${alt.recipe.name}`, onPress: () => go(`receta/${alt.recipe.id}`) }) : null] })) : (_jsxs(_Fragment, { children: [baby.baby.texture ? _jsxs(Body, { small: true, children: ["Textura: ", TEXTURE_LABEL[baby.baby.texture]] }) : null, baby.lines.length ? _jsxs(Body, { small: true, children: ["Puede comer: ", baby.lines.map((l) => l.name.toLowerCase()).join(', ')] }) : null, baby.removed.length ? _jsxs(Body, { small: true, children: ["Sin: ", baby.removed.map((r) => r.name.toLowerCase()).join(', '), " (separar su porci\u00F3n antes)"] }) : null, baby.baby.newFoods.map((f) => (_jsxs(Row, { between: true, children: [_jsxs(Body, { small: true, children: ["\uD83C\uDD95 ", data.ingredients.get(f)?.name, ": nuevo para ella"] }), _jsx(Button, { small: true, kind: "ghost", title: "Confirmar", onPress: () => confirmNewFood(f) })] }))), _jsx(Body, { small: true, muted: true, children: "Porci\u00F3n seg\u00FAn su apetito. Antes de servir:" }), baby.baby.checklist.slice(0, 4).map((c) => _jsxs(Body, { small: true, muted: true, children: ["\u2713 ", c] }))] }))] })) : null, _jsx(H2, { children: "Pasos" }), recipe.steps.map((s) => (_jsxs(Card, { tone: s.babySplit ? 'baby' : undefined, children: [_jsxs(Body, { children: [_jsxs("b", { children: [s.order, ". "] }), s.text] }), s.tip ? _jsxs(Body, { small: true, muted: true, children: ["\uD83D\uDCA1 ", s.tip] }) : null] }))), recipe.utensils.length ? _jsxs(Body, { small: true, muted: true, children: ["Utensilios: ", recipe.utensils.join(', ')] }) : null, recipe.storage ? _jsxs(Body, { small: true, muted: true, children: ["Conservaci\u00F3n: ", recipe.storage] }) : null] })), tab === 'ingredientes' && (_jsxs(_Fragment, { children: [_jsxs(Row, { between: true, children: [_jsx(Body, { children: "Escalar receta" }), _jsx(Stepper, { value: scale, step: 0.5, min: 0.5, onChange: setScale, suffix: "\u00D7" })] }), recipe.ingredients.map((ri) => {
                        const ingId = subs[ri.ingredientId] ?? ri.ingredientId;
                        const ing = data.ingredients.get(ingId);
                        if (!ing)
                            return null;
                        const unit = baseUnitFor(ing);
                        const have = availableQty(ingId, data.lots, unit, ing);
                        const need = convert(ri.qty * scale, ri.unit, unit, ing) ?? ri.qty * scale;
                        return (_jsx(Card, { children: _jsxs(Row, { between: true, children: [_jsxs("div", { class: "grow", children: [_jsxs(Body, { bold: true, children: [ing.name, subs[ri.ingredientId] ? ' (reemplazo)' : ''] }), _jsxs(Body, { small: true, muted: true, children: [formatQty(ri.qty * scale, ri.unit), " \u00B7 peso ", ri.state, ri.optional ? ' · opcional' : '', ri.separable ? ' · se puede servir aparte' : '', ri.addedAfterBabySplit ? ' · después de separar a Helena' : ''] }), ri.note ? _jsx(Body, { small: true, muted: true, children: ri.note }) : null] }), _jsxs("div", { class: "right-col", children: [_jsx(Body, { small: true, children: have >= need ? '✓ en casa' : have > 0 ? `tenés ${formatQty(have, unit)}` : 'falta' }), meal && !ing.tags.includes('basico') ? _jsx("button", { class: "link small", onClick: () => noTengo(ingId), children: "No tengo" }) : null] })] }) }));
                    })] })), tab === 'nutricion' && (_jsxs(_Fragment, { children: [_jsx(Notice, { children: "Estimaciones con tablas de referencia, por porci\u00F3n. Los pesos se indican en crudo o cocido seg\u00FAn cada ingrediente." }), adults.map((v) => _jsxs(Card, { children: [_jsx(Body, { bold: true, children: v.memberName }), _jsxs(Body, { children: ["\u2248 ", v.nutrition?.kcal, " kcal \u00B7 ", v.nutrition?.proteinG, " g prote\u00EDna \u00B7 ", v.nutrition?.carbsG, " g HC \u00B7 ", v.nutrition?.fatG, " g grasa"] })] })), _jsx(Body, { small: true, muted: true, children: "Para Helena no se calculan calor\u00EDas ni metas." })] })), meal?.leftoverOf ? null : _jsx(Button, { title: "Empezar a cocinar", icon: "\uD83D\uDC68\u200D\uD83C\uDF73", onPress: () => go(`cocina/${recipe.id}`, { mealId: meal?.id, scale: String(scale) }) }), meal ? (_jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, kind: "secondary", title: meal.leftoverOf ? 'Ver la cena' : 'Cambiar comida', onPress: () => (meal.leftoverOf ? go(`receta/${recipe.id}`, { mealId: meal.leftoverOf }) : go(`cambiar/${meal.id}`)) }), _jsx(Button, { small: true, kind: "secondary", title: "Ya com\u00ED", onPress: ateIt })] })) : null, _jsx(Button, { small: true, kind: "ghost", title: "Guardar sobrantes", onPress: leftovers })] }));
}
function VersionCard({ v, tone }) {
    return (_jsxs(Card, { tone: tone, children: [_jsxs(Body, { bold: true, children: ["Para ", v.memberName, v.status === 'no_apta' ? ' — no apta' : ''] }), v.lines.map((l) => _jsxs(Body, { small: true, children: [l.extra ? '➕ ' : '• ', formatQty(l.qty, l.unit), " de ", l.name.toLowerCase(), " (", l.state, ")"] })), v.removed.length ? _jsxs(Body, { small: true, muted: true, children: ["Sin: ", v.removed.map((r) => `${r.name.toLowerCase()} (${r.reason.toLowerCase()})`).join(', ')] }) : null, v.notes.map((n) => _jsx(Body, { small: true, muted: true, children: n })), v.nutrition ? _jsxs(Body, { small: true, muted: true, children: ["\u2248 ", v.nutrition.kcal, " kcal \u00B7 ", v.nutrition.proteinG, " g prot \u00B7 ", v.nutrition.carbsG, " g HC \u00B7 ", v.nutrition.fatG, " g grasa"] }) : null] }));
}
