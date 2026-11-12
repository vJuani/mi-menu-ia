import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useRef, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Chip, Row, go } from '../ui.js';
import { reply } from '../../../src/domain/assistant.js';
import { applySubstitution } from '../../../src/domain/substitutions.js';
const QUICK = ['¿Qué puedo cocinar hoy?', 'Tengo 20 minutos para cocinar', 'Mañana llevo almuerzo a la oficina', 'Quiero una merienda más proteica', '¿Helena puede comer algo de esto?', 'Quiero gastar menos esta semana'];
export function Asistente() {
    const { data, todayISO, commit } = useApp();
    const [msgs, setMsgs] = useState([{ from: 'ia', text: 'Conozco tu plan, tu inventario y las restricciones de la familia. Funciono sin conexión. Nunca cambio nada sin que lo confirmes.' }]);
    const [text, setText] = useState('');
    const end = useRef(null);
    const ctx = { todayISO, members: data.members, recipes: data.recipeList, ingredients: data.ingredients, lots: data.lots, meals: data.meals, babyCtx: data.babyCtx };
    function send(q) {
        if (!q.trim())
            return;
        setText('');
        const r = reply(q, ctx);
        setMsgs((m) => [...m, { from: 'yo', text: q }, { from: 'ia', text: r.text, reply: r }]);
        setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    async function run(a, idx) {
        await commit(async (repo) => {
            if (a.type === 'agregar_inventario') {
                for (const it of a.items)
                    if (it.ingredientId && it.qty && it.unit)
                        await repo.addLot({ ingredientId: it.ingredientId, qty: it.qty, unit: it.unit, location: 'heladera', state: 'cerrado', purchasedAt: todayISO });
            }
            else if (a.type === 'sustituir') {
                const m = data.meals.find((x) => x.id === a.mealId);
                if (m)
                    await repo.saveMeal(applySubstitution(m, a.fromId, a.toId));
            }
            else if (a.type === 'marcar_vianda') {
                const m = data.meals.find((x) => x.id === a.mealId);
                if (m)
                    await repo.saveMeal({ ...m, forOffice: true });
            }
            else if (a.type === 'registrar_entrenamiento') {
                await repo.setTraining(a.date, a.trained);
            }
        });
        setMsgs((xs) => xs.map((m, i) => (i === idx ? { ...m, done: true } : m)));
    }
    const label = (a) => a.type === 'agregar_inventario' ? 'Cargar al inventario' : a.type === 'sustituir' ? a.label : a.type === 'marcar_vianda' ? 'Marcar vianda' : a.type === 'registrar_entrenamiento' ? 'Registrar día sin entrenar' : 'Planificar';
    return (_jsxs(_Fragment, { children: [_jsxs("main", { class: "screen chat", children: [msgs.map((m, i) => (_jsxs("div", { class: `bubble ${m.from}`, children: [_jsx("p", { class: "pre", children: m.text }), m.reply?.suggestions.map((s) => _jsx(Button, { small: true, kind: "ghost", title: `${s.recipe.name} · ${s.recipe.totalMinutes} min`, onPress: () => go(`receta/${s.recipe.id}`) })), !m.done && m.reply?.actions.map((a) => _jsx(Button, { small: true, title: label(a), onPress: () => run(a, i) })), m.done ? _jsx(Body, { small: true, muted: true, children: "\u2713 Hecho" }) : null] }))), _jsx(Row, { wrap: true, children: QUICK.map((q) => _jsx(Chip, { label: q, onPress: () => send(q) })) }), _jsx("div", { ref: end })] }), _jsxs("form", { class: "composer", onSubmit: (e) => { e.preventDefault(); send(text); }, children: [_jsx("input", { value: text, onInput: (e) => setText(e.target.value), placeholder: "Escrib\u00ED tu consulta\u2026 (pod\u00E9s dictar con el micr\u00F3fono del teclado)", enterKeyHint: "send" }), _jsx("button", { class: "btn btn-primary btn-small", type: "submit", children: "Enviar" })] })] }));
}
