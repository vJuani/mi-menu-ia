import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, alertMsg } from '../ui.js';
import { adherence, averageIntake, dailyChangeMessage, trendSeries, weeklyAverages, weeklyRate } from '../../../src/domain/progress.js';
import { adaptiveAdjustment } from '../../../src/domain/nutrition.js';
import { addDays } from '../../../src/domain/planner.js';
import { num } from '../util.js';
function Chart({ series }) {
    if (series.length < 2)
        return null;
    const W = 320, H = 140, pad = 6;
    const min = Math.min(...series.map((s) => Math.min(s.kg, s.trend))) - 0.5;
    const max = Math.max(...series.map((s) => Math.max(s.kg, s.trend))) + 0.5;
    const x = (i) => pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
    const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.trend).toFixed(1)}`).join(' ');
    return (_jsxs("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Peso y tendencia", children: [_jsx("text", { x: W - 4, y: 12, "text-anchor": "end", class: "axis", children: max.toFixed(1) }), _jsx("text", { x: W - 4, y: H - 2, "text-anchor": "end", class: "axis", children: min.toFixed(1) }), series.map((s, i) => _jsx("circle", { cx: x(i), cy: y(s.kg), r: 3, class: "dot" })), _jsx("path", { d: line, class: "trend" })] }));
}
export function Progreso() {
    const { data, repo, commit, todayISO, version } = useApp();
    const me = data.members.find((m) => m.isPrimary);
    const [tab, setTab] = useState('peso');
    const [weights, setWeights] = useState([]);
    const [measures, setMeasures] = useState([]);
    const [logs, setLogs] = useState([]);
    const [training, setTraining] = useState([]);
    const [kg, setKg] = useState('');
    const [waist, setWaist] = useState('');
    const weekAgo = addDays(todayISO, -6);
    useEffect(() => {
        repo.weights().then(setWeights);
        repo.measurements().then(setMeasures);
        repo.consumption(weekAgo, todayISO).then(setLogs);
        repo.trainingDays(weekAgo, todayISO).then(setTraining);
    }, [version]);
    const series = useMemo(() => trendSeries(weights).slice(-60), [weights]);
    const rate = useMemo(() => weeklyRate(weights, 28, todayISO), [weights]);
    const adj = rate.kgPerWeek !== null && me.weightKg ? adaptiveAdjustment(rate.kgPerWeek, me.weightKg, rate.daysOfData) : null;
    const adh = adherence(data.meals, weekAgo, todayISO);
    const intake = averageIntake(logs, me.id, weekAgo, todayISO);
    const last = series.at(-1);
    async function addWeight() {
        const v = num(kg);
        if (!v || v < 30 || v > 300)
            return alertMsg('Peso inválido');
        const prev = weights.at(-1)?.kg;
        await commit(async (r) => { await r.addWeight(todayISO, v); await r.saveMember({ ...me, weightKg: v }); });
        setKg('');
        if (prev)
            alertMsg('Registrado', dailyChangeMessage(prev, v));
    }
    return (_jsxs(Screen, { children: [_jsx(Row, { children: ['peso', 'medidas', 'adherencia'].map((t) => _jsx(Chip, { label: t[0].toUpperCase() + t.slice(1), active: tab === t, onPress: () => setTab(t) })) }), tab === 'peso' && (_jsxs(_Fragment, { children: [_jsxs(Card, { children: [_jsx(Body, { small: true, muted: true, children: "Tendencia" }), _jsx("div", { class: "kpi", children: last ? `${last.trend.toFixed(1)} kg` : '—' }), rate.kgPerWeek !== null ? _jsxs(Body, { small: true, muted: true, children: [rate.kgPerWeek > 0 ? '+' : '', rate.kgPerWeek, " kg/semana (\u00FAltimas 4 semanas)"] }) : _jsx(Body, { small: true, muted: true, children: "Registr\u00E1 al menos 3 pesos para ver el ritmo." }), _jsx(Chart, { series: series }), _jsx(Body, { small: true, muted: true, children: "Puntos: pesajes \u00B7 L\u00EDnea: tendencia suavizada" })] }), _jsxs(Row, { children: [_jsx("div", { class: "grow", children: _jsx(Field, { placeholder: "Peso de hoy (kg)", inputMode: "decimal", value: kg, onChange: setKg, onEnter: addWeight }) }), _jsx(Button, { small: true, title: "Registrar", onPress: addWeight })] }), _jsx(Notice, { children: "Una variaci\u00F3n de un d\u00EDa es agua y digesti\u00F3n, no grasa. Mir\u00E1 la tendencia de 2\u20134 semanas." }), adj ? (_jsxs(Card, { tone: adj.deltaKcal === 0 ? 'primary' : 'warning', children: [_jsx(Body, { children: adj.reason }), adj.deltaKcal !== 0 && me.targets ? _jsx(Button, { small: true, kind: "secondary", title: `Ajustar objetivo a ${me.targets.kcal + adj.deltaKcal} kcal`, onPress: () => commit((r) => r.saveMember({ ...me, targets: { ...me.targets, kcal: me.targets.kcal + adj.deltaKcal, carbsG: Math.max(0, me.targets.carbsG + Math.round(adj.deltaKcal / 4)) } })) }) : null] })) : null, _jsx(H2, { children: "Promedios semanales" }), weeklyAverages(weights).slice(-8).reverse().map((w) => _jsxs(Body, { children: ["Semana del ", w.weekStart.slice(5).split('-').reverse().join('/'), ": ", w.avg, " kg (", w.n, " registros)"] }))] })), tab === 'medidas' && (_jsxs(_Fragment, { children: [_jsxs(Row, { children: [_jsx("div", { class: "grow", children: _jsx(Field, { placeholder: "Cintura (cm) \u2014 opcional", inputMode: "decimal", value: waist, onChange: setWaist }) }), _jsx(Button, { small: true, title: "Guardar", disabled: !waist, onPress: async () => { await commit((r) => r.addMeasurement({ date: todayISO, waistCm: num(waist) })); setWaist(''); } })] }), measures.length === 0 ? _jsx(Body, { muted: true, children: "Sin medidas registradas." }) : measures.slice().reverse().map((m) => _jsxs(Body, { children: [m.date, ": cintura ", m.waistCm ?? '—', " cm"] }))] })), tab === 'adherencia' && (_jsxs(_Fragment, { children: [_jsxs("div", { class: "grid2", children: [_jsxs(Card, { children: [_jsx(Body, { small: true, muted: true, children: "Plan de comidas (7 d\u00EDas)" }), _jsxs("div", { class: "kpi", children: [adh.done, "/", adh.planned] })] }), _jsxs(Card, { children: [_jsx(Body, { small: true, muted: true, children: "Entrenamientos" }), _jsxs("div", { class: "kpi", children: [training.filter((t) => t.trained).length, "/", me.trainingDaysPerWeek ?? '—'] })] })] }), _jsxs(Card, { children: [_jsxs(Body, { small: true, muted: true, children: ["Promedio registrado (d\u00EDas con registro: ", intake.daysLogged, ")"] }), _jsxs(Body, { children: [intake.kcal ?? '—', " kcal \u00B7 ", intake.proteinG ?? '—', " g prote\u00EDna"] }), me.targets ? _jsxs(Body, { small: true, muted: true, children: ["Objetivo: ", me.targets.kcal, " kcal \u00B7 ", me.targets.proteinG, " g prote\u00EDna"] }) : null, _jsx(Body, { small: true, muted: true, children: "Estimado a partir de \u201CYa com\u00ED\u201D. No hace falta registrar cada calor\u00EDa." })] }), _jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, title: "Entren\u00E9 hoy", onPress: () => commit((r) => r.setTraining(todayISO, true)) }), _jsx(Button, { small: true, kind: "secondary", title: "Hoy no entren\u00E9", onPress: () => commit((r) => r.setTraining(todayISO, false)) })] }), _jsx("div", { class: "week-dots", children: Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i)).map((d) => {
                            const t = training.find((x) => x.date === d);
                            return _jsx("div", { class: `wd ${t?.trained ? 'on' : t ? 'off' : ''}`, title: d });
                        }) })] }))] }));
}
