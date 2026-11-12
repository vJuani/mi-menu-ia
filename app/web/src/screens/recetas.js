import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, DishImage, Field, Row, Screen, go } from '../ui.js';
import { RECIPE_TAGS } from '../../../src/domain/recipeEditor.js';
import { normalize } from '../../../src/domain/textParser.js';
import { evaluateRecipeForBaby } from '../../../src/domain/babySafety.js';
import { recipeFitsMember } from '../../../src/domain/adaptations.js';
import { inventoryCoverage } from '../../../src/domain/planner.js';
import { DIFFICULTY_LABEL } from '../util.js';
export function Recetas() {
    const { data } = useApp();
    const [q, setQ] = useState('');
    const [tag, setTag] = useState(null);
    const [archived, setArchived] = useState(false);
    const me = data.members.find((m) => m.isPrimary);
    const list = useMemo(() => {
        const nq = normalize(q);
        return data.allRecipes
            .filter((r) => !!r.archived === archived)
            .filter((r) => !tag || r.tags.includes(tag))
            .filter((r) => !nq || normalize(r.name).includes(nq) || r.ingredients.some((i) => normalize(data.ingredients.get(i.ingredientId)?.name ?? '').includes(nq)))
            .map((r) => ({ r, coverage: inventoryCoverage(r, data.lots, data.ingredients).coverage }))
            .sort((a, b) => b.coverage - a.coverage || a.r.name.localeCompare(b.r.name));
    }, [data, q, tag, archived]);
    return (_jsxs(Screen, { children: [_jsx(Button, { title: "Nueva receta", icon: "\uFF0B", onPress: () => go('editar') }), _jsx(Field, { placeholder: "Buscar por nombre o ingrediente", value: q, onChange: setQ, type: "search" }), _jsxs(Row, { wrap: true, children: [RECIPE_TAGS.map((t) => _jsx(Chip, { label: t.label, active: tag === t.id, onPress: () => setTag(tag === t.id ? null : t.id) })), _jsx(Chip, { label: archived ? 'Ver activas' : 'Ver archivadas', tone: "accent", onPress: () => setArchived(!archived) })] }), list.length === 0 ? _jsx(Body, { muted: true, children: "No hay recetas con esos filtros." }) : null, list.map(({ r, coverage }) => {
                const baby = data.babyCtx ? evaluateRecipeForBaby(r, data.babyCtx).verdict : null;
                const fitsMe = me ? recipeFitsMember(r, me, data.ingredients) : true;
                return (_jsxs(Card, { onPress: () => go(`receta/${r.id}`), cls: "meal-row", children: [_jsx(DishImage, { recipe: r, size: 56 }), _jsxs("div", { class: "grow", children: [_jsx(Body, { bold: true, children: r.name }), _jsxs(Body, { small: true, muted: true, children: [r.totalMinutes, " min \u00B7 ", DIFFICULTY_LABEL[r.difficulty], " \u00B7 ", Math.round(coverage * 100), " % en casa", r.isDemo ? ' · demo' : ''] }), _jsxs(Body, { small: true, muted: true, children: [fitsMe ? '' : '⚠️ no apta para vos · ', baby === null ? '' : baby === 'bloqueado' ? 'Helena: alternativa aparte' : baby === 'requiere_confirmacion' ? 'Helena: con alimentos nuevos' : 'Helena: puede compartir'] })] })] }));
            })] }));
}
