import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, H2, Notice, Row, Screen, Stepper, sheet } from '../ui.js';
import { computeShoppingList, missingSentence } from '../../../src/domain/shopping.js';
import { findSubstitutes, applySubstitution } from '../../../src/domain/substitutions.js';
import { formatQty } from '../../../src/domain/units.js';
import { LOCATION_LABEL } from '../util.js';
export function Compras() {
    const { data, repo, commit, todayISO, version } = useApp();
    const [items, setItems] = useState([]);
    const [tab, setTab] = useState('hoy');
    const [open, setOpen] = useState(null);
    useEffect(() => { repo.shoppingItems().then(setItems); }, [version]);
    const today = useMemo(() => computeShoppingList(data.meals.filter((m) => m.date === todayISO), data.recipes, data.members, data.ingredients, data.lots), [data, todayISO]);
    const todayIds = new Set(today.map((l) => l.ingredientId));
    const pending = items.filter((i) => i.status === 'pendiente');
    const shown = tab === 'hoy' ? pending.filter((i) => todayIds.has(i.ingredientId)) : tab === 'semana' ? pending : items.filter((i) => i.status !== 'pendiente');
    async function notFound(item) {
        await commit((r) => r.markNotFound(item.id));
        const affected = data.meals.filter((m) => m.status === 'planificada' && m.date >= todayISO && data.recipes.get(m.recipeId)?.ingredients.some((ri) => (m.substitutions[ri.ingredientId] ?? ri.ingredientId) === item.ingredientId));
        if (!affected.length)
            return;
        const opts = findSubstitutes(item.ingredientId, affected[0], data.members, data.ingredients, data.lots, data.babyCtx);
        if (!opts.length)
            return sheet('Sin reemplazo', 'No hay un reemplazo que respete las restricciones de todos. Cambiá esas comidas desde el plan.', [{ text: 'OK', style: 'cancel' }]);
        sheet(`Reemplazar en ${affected.length} comida(s)`, 'Se actualizan recetas y compras.', opts.slice(0, 3).map((o) => ({
            text: `${o.ingredient.name}${o.inStock > 0 ? ' (en casa)' : ''}${o.babyNeedsConfirmation ? ' · nuevo p/ Helena' : ''}`,
            onPress: () => commit(async (r) => { for (const m of affected)
                await r.saveMeal(applySubstitution(m, item.ingredientId, o.ingredient.id)); }),
        })));
    }
    return (_jsxs(Screen, { children: [today.length ? _jsx(Notice, { children: missingSentence(today, 'cocinar hoy') }) : _jsx(Notice, { tone: "primary", children: "Ten\u00E9s todo para hoy." }), _jsxs(Row, { wrap: true, children: [_jsx(Chip, { label: `Para hoy (${pending.filter((i) => todayIds.has(i.ingredientId)).length})`, active: tab === 'hoy', onPress: () => setTab('hoy') }), _jsx(Chip, { label: `Semana (${pending.length})`, active: tab === 'semana', onPress: () => setTab('semana') }), _jsx(Chip, { label: "Comprados", active: tab === 'comprados', onPress: () => setTab('comprados') })] }), shown.length === 0 ? _jsx(Body, { muted: true, children: "Nada por ac\u00E1." }) : null, shown.map((it) => _jsx(ItemCard, { item: it, expanded: open === it.id, onToggle: () => setOpen(open === it.id ? null : it.id), onNotFound: () => notFound(it) }, it.id)), tab === 'comprados' && shown.length ? _jsx(Button, { kind: "ghost", title: "Limpiar comprados", onPress: () => commit((r) => r.clearShoppingDone()) }) : null, _jsx(H2, { children: "\u00BFC\u00F3mo funciona?" }), _jsx(Body, { small: true, muted: true, children: "La lista se arma con las comidas de los pr\u00F3ximos 7 d\u00EDas menos lo que ya ten\u00E9s. Al marcar comprado, carg\u00E1s la cantidad real y se suma al inventario. Planificar no descuenta nada." })] }));
}
function ItemCard({ item, expanded, onToggle, onNotFound }) {
    const { data, commit } = useApp();
    const ing = data.ingredients.get(item.ingredientId);
    const [qty, setQty] = useState(item.suggestedQty);
    const [loc, setLoc] = useState(['carne', 'pollo', 'pescado', 'lacteo', 'verdura', 'huevo'].includes(ing?.category ?? '') ? 'heladera' : 'alacena');
    const done = item.status !== 'pendiente';
    return (_jsxs(Card, { onPress: done ? undefined : onToggle, tone: item.status === 'no_conseguido' ? 'warning' : done ? 'primary' : undefined, children: [_jsxs(Row, { between: true, children: [_jsxs(Body, { bold: true, children: [done ? (item.status === 'comprado' ? '☑️ ' : '✖️ ') : '⬜️ ', ing?.name] }), _jsx(Body, { children: item.status === 'comprado' ? formatQty(item.boughtQty ?? 0, item.unit) : formatQty(item.suggestedQty, item.unit) })] }), item.status === 'no_conseguido' ? _jsx(Body, { small: true, muted: true, children: "No lo conseguiste" }) : null, expanded && !done ? (_jsxs("div", { class: "stack", onClick: (e) => e.stopPropagation(), children: [_jsxs(Row, { between: true, children: [_jsx(Body, { small: true, children: "Compr\u00E9" }), _jsx(Stepper, { value: qty, step: item.unit === 'un' ? 1 : 50, onChange: setQty, suffix: item.unit })] }), _jsx(Row, { wrap: true, children: ['heladera', 'freezer', 'alacena'].map((l) => _jsx(Chip, { label: LOCATION_LABEL[l], active: loc === l, onPress: () => setLoc(l) })) }), _jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, title: "Comprado", disabled: qty <= 0, onPress: () => commit((r) => r.markBought(item.id, qty, item.unit, loc, loc === 'freezer' ? 'congelado' : 'cerrado')) }), _jsx(Button, { small: true, kind: "secondary", title: "No lo consegu\u00ED", onPress: onNotFound })] })] })) : null] }));
}
