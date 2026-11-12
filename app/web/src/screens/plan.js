import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, DishImage, Row, Screen, alertMsg, go, sheet, back } from '../ui.js';
import { addDays, generateWeek, suggestRecipes } from '../../../src/domain/planner.js';
import { evaluateRecipeForBaby } from '../../../src/domain/babySafety.js';
import { newId } from '../../../src/domain/inventory.js';
import { SLOT_LABEL, dayLabel } from '../util.js';
const SLOTS = ['desayuno', 'almuerzo', 'merienda', 'cena'];
function mondayOf(iso) { const d = new Date(iso + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); }
export function Plan() {
    const { data, todayISO, commit } = useApp();
    const [start, setStart] = useState(mondayOf(todayISO));
    const [view, setView] = useState('semana');
    const [day, setDay] = useState(todayISO);
    const days = view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [day];
    const shift = (n) => (view === 'semana' ? setStart(addDays(start, 7 * n)) : setDay(addDays(day, n)));
    async function fillEmpty() {
        const adults = data.members.filter((m) => m.kind === 'adulto');
        const proposal = generateWeek(start, data.recipeList, adults, data.lots, data.ingredients, SLOTS);
        const taken = new Set(data.meals.map((m) => `${m.date}|${m.slot}`));
        const fresh = proposal.filter((m) => !taken.has(`${m.date}|${m.slot}`) && m.date >= todayISO);
        await commit(async (repo) => { for (const m of fresh)
            await repo.saveMeal(m); });
        alertMsg('Plan actualizado', `${fresh.length} comidas agregadas. El inventario no se modifica hasta que cocines.`);
    }
    function mealMenu(meal, name) {
        if (meal.leftoverOf) {
            return sheet(name, 'Almuerzo con las sobras de la cena anterior. Para cambiarlo, cambiá esa cena.', [
                { text: 'Ver receta', onPress: () => go(`receta/${meal.recipeId}`, { mealId: meal.id }) },
                { text: 'Ir a la cena', onPress: () => go(`receta/${meal.recipeId}`, { mealId: meal.leftoverOf }) },
            ]);
        }
        sheet(name, SLOT_LABEL[meal.slot], [
            { text: 'Ver receta', onPress: () => go(`receta/${meal.recipeId}`, { mealId: meal.id }) },
            { text: meal.forOffice ? 'Quitar vianda' : 'Marcar como vianda', onPress: () => commit((r) => r.saveMeal({ ...meal, forOffice: !meal.forOffice || undefined })) },
            { text: 'Cambiar comida', onPress: () => go(`cambiar/${meal.id}`) },
            { text: 'Eliminar', style: 'destructive', onPress: () => commit((r) => r.deleteMeal(meal.id)) },
        ]);
    }
    return (_jsxs(Screen, { children: [_jsxs(Row, { between: true, children: [_jsx("button", { class: "link big", onClick: () => shift(-1), children: "\u2039" }), _jsx(Body, { bold: true, children: view === 'semana' ? `${dayLabel(start, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(start, 6), { day: 'numeric', month: 'short' })}` : dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' }) }), _jsx("button", { class: "link big", onClick: () => shift(1), children: "\u203A" })] }), _jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, kind: view === 'semana' ? 'primary' : 'secondary', title: "Semana", onPress: () => setView('semana') }), _jsx(Button, { small: true, kind: view === 'dia' ? 'primary' : 'secondary', title: "D\u00EDa", onPress: () => setView('dia') })] }), days.map((date) => (_jsxs(Card, { tone: date === todayISO ? 'primary' : undefined, children: [_jsx("button", { class: "link bold", onClick: () => { setDay(date); setView('dia'); }, children: dayLabel(date, { weekday: 'long', day: 'numeric' }) }), SLOTS.map((slot) => {
                        const slotMeals = data.meals.filter((m) => m.date === date && m.slot === slot && data.recipes.get(m.recipeId));
                        if (!slotMeals.length)
                            return _jsxs("div", { class: "plan-slot empty", onClick: () => go('cambiar/nuevo', { date, slot }), children: [_jsx("span", { class: "muted small", children: SLOT_LABEL[slot] }), _jsx("span", { class: "muted small", children: "\uFF0B agregar" })] });
                        return slotMeals.map((meal) => {
                            const r = data.recipes.get(meal.recipeId);
                            const who = meal.memberIds.length < data.members.filter((m) => m.kind === 'adulto').length ? ` · ${meal.memberIds.map((id) => data.members.find((m) => m.id === id)?.shortName ?? id).join(', ')}` : '';
                            return (_jsxs("div", { class: "plan-slot", onClick: () => mealMenu(meal, r.name), children: [_jsx(DishImage, { recipe: r, size: 40 }), _jsxs("div", { class: "grow", children: [_jsxs(Body, { small: true, muted: true, children: [SLOT_LABEL[slot], who, meal.leftoverOf ? ' · 🥡 sobras' : meal.forOffice ? ' · 🥡' : '', meal.extraPortions ? ' · cociná el doble' : '', meal.status !== 'planificada' ? ` · ${meal.status}` : ''] }), _jsx(Body, { children: r.name })] })] }));
                        });
                    })] }))), _jsx(Button, { title: "Completar huecos con lo que tengo", onPress: fillEmpty })] }));
}
export function Cambiar({ mealId, date, slot }) {
    const { data, commit } = useApp();
    const meal = data.meals.find((m) => m.id === mealId);
    const targetSlot = (meal?.slot ?? slot ?? 'cena');
    const [maxMin, setMaxMin] = useState();
    const [office, setOffice] = useState(!!meal?.forOffice);
    const adults = data.members.filter((m) => m.kind === 'adulto' && (!meal || meal.memberIds.includes(m.id)));
    const recent = data.meals.slice(-8).map((m) => m.recipeId);
    const list = useMemo(() => suggestRecipes(data.recipeList, adults, data.lots, data.ingredients, { slot: targetSlot, maxMinutes: maxMin, forOffice: office, recentRecipeIds: recent }), [data, targetSlot, maxMin, office]);
    async function pick(recipeId) {
        const next = meal
            ? { ...meal, recipeId, substitutions: {}, forOffice: office || undefined }
            : { id: newId('meal'), date: date, slot: targetSlot, recipeId, memberIds: data.members.filter((m) => m.kind === 'adulto').map((m) => m.id), portionsByMember: Object.fromEntries(data.members.map((m) => [m.id, 1])), status: 'planificada', substitutions: {}, forOffice: office || undefined };
        await commit((repo) => repo.saveMeal(next));
        back('plan');
    }
    return (_jsxs(Screen, { children: [_jsxs(Body, { muted: true, children: [SLOT_LABEL[targetSlot], date ? ` · ${dayLabel(date, { weekday: 'long', day: 'numeric' })}` : '', " \u00B7 ordenado por lo que ten\u00E9s en casa"] }), _jsxs(Row, { wrap: true, children: [_jsx(Chip, { label: "\u2264 20 min", active: maxMin === 20, onPress: () => setMaxMin(maxMin === 20 ? undefined : 20) }), _jsx(Chip, { label: "\u2264 30 min", active: maxMin === 30, onPress: () => setMaxMin(maxMin === 30 ? undefined : 30) }), _jsx(Chip, { label: "\uD83E\uDD61 Vianda", active: office, onPress: () => setOffice(!office) })] }), list.length === 0 ? _jsx(Body, { muted: true, children: "No hay recetas que cumplan los filtros y sirvan para todos." }) : null, list.map((s) => {
                const baby = data.babyCtx ? evaluateRecipeForBaby(s.recipe, data.babyCtx) : null;
                return (_jsxs(Card, { onPress: () => pick(s.recipe.id), tone: s.recipe.id === meal?.recipeId ? 'primary' : undefined, cls: "meal-row", children: [_jsx(DishImage, { recipe: s.recipe, size: 52 }), _jsxs("div", { class: "grow", children: [_jsx(Body, { bold: true, children: s.recipe.name }), _jsxs(Body, { small: true, muted: true, children: [s.recipe.totalMinutes, " min \u00B7 ", Math.round(s.coverage * 100), " % en casa", s.missing.length ? ` · faltan ${s.missing.length}` : ''] }), baby ? _jsxs(Body, { small: true, muted: true, children: ["Helena: ", baby.verdict === 'bloqueado' ? 'necesita alternativa' : baby.verdict === 'requiere_confirmacion' ? 'con alimentos nuevos' : 'puede compartir adaptada'] }) : null] })] }));
            })] }));
}
