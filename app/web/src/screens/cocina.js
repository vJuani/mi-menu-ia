import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Notice, Row, Screen, Stepper, back, sheet } from '../ui.js';
import { needsForMeal } from '../../../src/domain/shopping.js';
import { formatQty } from '../../../src/domain/units.js';
/** Mantiene la pantalla encendida mientras se cocina (si el navegador lo permite). */
function useWakeLock() {
    useEffect(() => {
        let lock = null;
        const nav = navigator;
        const req = async () => { try {
            lock = (await nav.wakeLock?.request('screen')) ?? null;
        }
        catch { /* no soportado */ } };
        req();
        const vis = () => { if (document.visibilityState === 'visible')
            req(); };
        document.addEventListener('visibilitychange', vis);
        return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => undefined); };
    }, []);
}
function beep() {
    try {
        const Ctx = (window.AudioContext ?? window.webkitAudioContext);
        const ctx = new Ctx();
        for (let i = 0; i < 3; i++) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = 880;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.4);
            o.start(ctx.currentTime + i * 0.4);
            o.stop(ctx.currentTime + i * 0.4 + 0.25);
        }
        navigator.vibrate?.(500);
    }
    catch { /* sin audio */ }
}
export function Cocina({ id, mealId, scale }) {
    useWakeLock();
    const { data, repo, commit } = useApp();
    const recipe = data.recipes.get(id);
    const meal = data.meals.find((m) => m.id === mealId);
    const key = `cook.progress.${mealId || id}`;
    const [p, setP] = useState({ step: 0, done: [] });
    const [phase, setPhase] = useState('pasos');
    useEffect(() => { repo.getSetting(key, { step: 0, done: [] }).then(setP); }, [key]);
    const save = (np) => { setP(np); repo.setSetting(key, np); };
    if (!recipe)
        return _jsx(Screen, { children: _jsx(Body, { children: "Receta no encontrada." }) });
    if (phase === 'confirmar') {
        return _jsx(ConfirmUsage, { recipeId: recipe.id, mealId: meal?.id, scale: Number(scale) || 1, onDone: async (opId) => {
                await repo.setSetting(key, { step: 0, done: [] });
                sheet('¡Listo!', 'Inventario actualizado con lo que confirmaste.', [
                    { text: 'OK', onPress: () => back() },
                    { text: 'Deshacer', style: 'destructive', onPress: () => commit((r) => r.undo(opId)) },
                ]);
            } });
    }
    const s = recipe.steps[Math.min(p.step, recipe.steps.length - 1)];
    const pct = (p.done.length / recipe.steps.length) * 100;
    return (_jsxs(Screen, { children: [_jsxs(Body, { muted: true, children: [recipe.name, " \u00B7 Paso ", p.step + 1, " de ", recipe.steps.length, " \u00B7 el avance se guarda"] }), _jsx("div", { class: "progress", children: _jsx("div", { style: { width: `${pct}%` } }) }), _jsxs(Card, { tone: s.babySplit ? 'baby' : undefined, cls: "cook-card", children: [_jsx("p", { class: "cook-text", children: s.text }), s.tip ? _jsxs(Notice, { tone: s.babySplit ? 'baby' : 'warning', children: ["\uD83D\uDCA1 ", s.tip] }) : null, s.babySplit ? _jsx(Notice, { tone: "baby", children: "Separ\u00E1 la porci\u00F3n de Helena ahora, antes de sal o condimentos." }) : null, s.timerSec ? _jsx(Timer, { seconds: s.timerSec }, p.step) : null, _jsx("button", { class: "link bold", onClick: () => save({ ...p, done: p.done.includes(p.step) ? p.done.filter((d) => d !== p.step) : [...p.done, p.step] }), children: p.done.includes(p.step) ? '☑️ Hecho' : '⬜️ Marcar como hecho' })] }), _jsxs("div", { class: "grid-1-3", children: [_jsx(Button, { kind: "secondary", title: "\u2190", disabled: p.step === 0, onPress: () => save({ ...p, step: p.step - 1 }) }), p.step < recipe.steps.length - 1
                        ? _jsx(Button, { title: "Siguiente \u203A", onPress: () => save({ step: p.step + 1, done: p.done.includes(p.step) ? p.done : [...p.done, p.step] }) })
                        : _jsx(Button, { title: "Termin\u00E9 de cocinar", onPress: () => setPhase('confirmar') })] }), _jsx(Body, { small: true, muted: true, children: "Con la pantalla bloqueada el temporizador sigue contando, pero el aviso suena reci\u00E9n al volver a la app." })] }));
}
function Timer({ seconds }) {
    const [left, setLeft] = useState(seconds);
    const [running, setRunning] = useState(false);
    const endAt = useRef(0);
    const rang = useRef(false);
    useEffect(() => {
        if (!running)
            return;
        const t = setInterval(() => {
            const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
            setLeft(l);
            if (l === 0) {
                setRunning(false);
                if (!rang.current) {
                    rang.current = true;
                    beep();
                }
            }
        }, 500);
        return () => clearInterval(t);
    }, [running]);
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    return (_jsxs("div", { class: "timer", children: [_jsxs("div", { class: `timer-digits ${left === 0 ? 'done' : ''}`, children: [mm, ":", ss] }), _jsxs(Row, { children: [running
                        ? _jsx(Button, { small: true, kind: "secondary", title: "Pausar", onPress: () => setRunning(false) })
                        : _jsx(Button, { small: true, title: left === seconds ? 'Iniciar' : left === 0 ? 'Listo ✓' : 'Continuar', disabled: left === 0, onPress: () => { endAt.current = Date.now() + left * 1000; rang.current = false; setRunning(true); } }), _jsx(Button, { small: true, kind: "ghost", title: "Reiniciar", onPress: () => { setRunning(false); setLeft(seconds); } })] })] }));
}
function ConfirmUsage({ recipeId, mealId, scale, onDone }) {
    const { data, commit } = useApp();
    const recipe = data.recipes.get(recipeId);
    const meal = data.meals.find((m) => m.id === mealId);
    const initial = useMemo(() => {
        const m = meal ?? { id: 'tmp', date: '', slot: 'cena', recipeId, memberIds: data.members.map((x) => x.id), portionsByMember: {}, status: 'planificada', substitutions: {} };
        return needsForMeal(m, recipe, data.members, data.ingredients)
            .filter((n) => !data.ingredients.get(n.ingredientId)?.tags.includes('basico'))
            .map((n) => ({ ingredientId: n.ingredientId, qty: Math.round(n.qty * scale * 100) / 100, unit: n.unit }));
    }, []);
    const [usages, setUsages] = useState(initial);
    const [busy, setBusy] = useState(false);
    async function confirm() {
        setBusy(true);
        let res;
        await commit(async (r) => { res = await r.confirmCooked(meal?.id ?? null, usages.filter((u) => u.qty > 0), data.ingredients); });
        setBusy(false);
        if (res?.shortfalls.length)
            sheet('Atención', `No había suficiente stock registrado de: ${res.shortfalls.map((s) => data.ingredients.get(s.ingredientId)?.name).join(', ')}. Se descontó lo disponible.`, [{ text: 'OK', onPress: () => onDone(res.operationId) }]);
        else if (res)
            onDone(res.operationId);
    }
    return (_jsxs(Screen, { children: [_jsx("h1", { class: "h1-small", children: "\u00BFCu\u00E1nto usaste realmente?" }), _jsx(Body, { muted: true, children: "Solo se descuenta del inventario lo que confirmes ac\u00E1." }), usages.map((u, i) => (_jsx(Card, { children: _jsxs(Row, { between: true, children: [_jsxs("div", { class: "grow", children: [_jsx(Body, { bold: true, children: data.ingredients.get(u.ingredientId)?.name }), _jsxs(Body, { small: true, muted: true, children: ["Planificado: ", formatQty(initial[i].qty, u.unit)] })] }), _jsx(Stepper, { value: u.qty, step: u.unit === 'un' ? 0.5 : 10, onChange: (v) => setUsages((xs) => xs.map((x, j) => (j === i ? { ...x, qty: v } : x))), suffix: u.unit })] }) }))), _jsx(Button, { title: busy ? 'Guardando…' : 'Confirmar y descontar', disabled: busy, onPress: confirm }), _jsx(Button, { kind: "ghost", title: "Termin\u00E9 sin descontar nada", onPress: () => back() })] }));
}
