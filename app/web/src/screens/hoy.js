import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, DishImage, H2, Notice, Row, Screen, go } from '../ui.js';
import { computeShoppingList, missingSentence } from '../../../src/domain/shopping.js';
import { generateWeek } from '../../../src/domain/planner.js';
import { buildReminders } from '../../../src/domain/reminders.js';
import { DIFFICULTY_LABEL, SLOT_LABEL, SLOTS_ORDER } from '../util.js';
export function Hoy() {
    const { data, todayISO, commit } = useApp();
    const me = data.members.find((m) => m.isPrimary);
    const todays = data.meals.filter((m) => m.date === todayISO).sort((a, b) => SLOTS_ORDER.indexOf(a.slot) - SLOTS_ORDER.indexOf(b.slot));
    const missing = useMemo(() => computeShoppingList(todays, data.recipes, data.members, data.ingredients, data.lots), [data, todayISO]);
    // En la web no hay avisos con la app cerrada: se muestran acá los de las próximas 24 h.
    const soon = useMemo(() => {
        const now = new Date();
        const limit = new Date(now.getTime() + 24 * 3600_000);
        const p = (n) => String(n).padStart(2, '0');
        const lim = `${limit.getFullYear()}-${p(limit.getMonth() + 1)}-${p(limit.getDate())}T${p(limit.getHours())}:${p(limit.getMinutes())}:00`;
        return buildReminders({ now, meals: data.meals, recipes: data.recipes, members: data.members, ingredients: data.ingredients, lots: data.lots, settings: data.reminderSettings, lastWeighInISO: data.lastWeighIn })
            .filter((r) => r.fireAt <= lim && r.kind !== 'faltantes');
    }, [data]);
    const dateLabel = new Date(todayISO + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    async function planWeek() {
        const adults = data.members.filter((m) => m.kind === 'adulto');
        const week = generateWeek(todayISO, data.recipeList, adults, data.lots, data.ingredients);
        await commit(async (repo) => { for (const m of week)
            await repo.saveMeal(m); });
    }
    return (_jsxs(Screen, { children: [_jsxs("div", { class: "hello", children: [_jsxs("h1", { children: ["Hola \uD83D\uDC4B", _jsx("br", {}), "\u00BFQu\u00E9 comemos hoy?"] }), _jsx(Body, { muted: true, children: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) })] }), _jsxs("div", { class: "grid2", children: [_jsxs(Card, { tone: "primary", onPress: () => go('progreso'), children: [_jsx(Body, { small: true, muted: true, children: "Tu objetivo" }), _jsx(Body, { bold: true, children: me?.goal === 'perder_grasa' ? 'Bajar grasa' : me?.goal === 'ganar_musculo' ? 'Ganar músculo' : 'Mantener' }), me?.targets ? _jsxs(Body, { small: true, muted: true, children: [me.targets.kcal, " kcal \u00B7 ", me.targets.proteinG, " g prot."] }) : null] }), _jsxs(Card, { tone: "accent", onPress: () => go('compras'), children: [_jsx(Body, { small: true, muted: true, children: "Inventario" }), _jsx(Body, { bold: true, children: missing.length ? `${missing.length} faltante${missing.length > 1 ? 's' : ''}` : 'Tenés todo' }), _jsx(Body, { small: true, muted: true, children: "Para hoy" })] })] }), missing.length ? _jsx(Notice, { children: missingSentence(missing, 'hoy') }) : null, soon.map((r) => _jsxs(Notice, { tone: "primary", children: ["\u23F0 ", r.fireAt.slice(11, 16), " \u00B7 ", _jsx("b", { children: r.title }), " \u2014 ", r.body] })), todays.length === 0 ? (_jsxs(Card, { children: [_jsx(Body, { children: "No hay comidas planificadas para hoy." }), _jsx(Button, { title: "Armar la semana con lo que tengo", onPress: planWeek })] })) : todays.map((meal) => {
                const r = data.recipes.get(meal.recipeId);
                if (!r)
                    return null;
                const done = meal.status === 'comida' || meal.status === 'cocinada';
                return (_jsxs(Card, { tone: done ? 'primary' : undefined, onPress: () => go(`receta/${r.id}`, { mealId: meal.id }), cls: "meal-row", children: [_jsx(DishImage, { recipe: r }), _jsxs("div", { class: "grow", children: [_jsxs(Body, { small: true, muted: true, children: [SLOT_LABEL[meal.slot], " \u00B7 ", data.reminderSettings.mealTimes[meal.slot], meal.leftoverOf ? ' · 🥡 sobras de anoche' : meal.forOffice ? ' · 🥡 vianda' : '', meal.extraPortions ? ' · cociná el doble' : ''] }), _jsx(Body, { bold: true, children: r.name }), _jsxs(Body, { small: true, muted: true, children: [r.totalMinutes, " min \u00B7 ", DIFFICULTY_LABEL[r.difficulty]] })] }), _jsx("span", { class: "big", children: done ? '✅' : '⚪️' })] }));
            }), _jsx(H2, { children: "Accesos r\u00E1pidos" }), _jsxs(Row, { wrap: true, children: [_jsx(Button, { small: true, kind: "secondary", title: "\uD83D\uDED2 Compras", onPress: () => go('compras') }), _jsx(Button, { small: true, kind: "secondary", title: "\uD83D\uDCAC \u00BFQu\u00E9 cocino?", onPress: () => go('asistente') }), _jsx(Button, { small: true, kind: "secondary", title: "\u2696\uFE0F Registrar peso", onPress: () => go('progreso') }), _jsx(Button, { small: true, kind: "secondary", title: "\uD83D\uDCD6 Recetario", onPress: () => go('recetas') })] })] }));
}
