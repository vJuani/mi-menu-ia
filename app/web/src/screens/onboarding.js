import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp, localToday } from '../state.js';
import { Body, Button, Card, Chip, Field, H2, Notice, Screen, Title, Toggle, go } from '../ui.js';
import { APP_NAME, APP_TAGLINE } from '../../../src/config/app.js';
import { estimateTargets, ageInMonths, ageInYears } from '../../../src/domain/nutrition.js';
import { seedDemo } from '../../../src/data/seed.js';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.js';
import { num } from '../util.js';
const ACTIVITY = [['sedentario', 'Sedentario'], ['ligero', 'Ligero'], ['moderado', 'Moderado'], ['alto', 'Alto'], ['muy_alto', 'Muy alto']];
const GOALS = [['perder_grasa', 'Bajar grasa'], ['mantener', 'Mantener'], ['ganar_musculo', 'Ganar músculo']];
export function Onboarding() {
    const { data, commit } = useApp();
    const [step, setStep] = useState(0);
    const me = data.members.find((m) => m.isPrimary);
    const ro = data.members.find((m) => m.id === 'ro');
    const helena = data.members.find((m) => m.kind === 'bebe');
    const [weight, setWeight] = useState(String(me?.weightKg ?? ''));
    const [height, setHeight] = useState(String(me?.heightCm ?? ''));
    const [birth, setBirth] = useState(me?.birthDate ?? '');
    const [activity, setActivity] = useState(me?.activity ?? 'moderado');
    const [training, setTraining] = useState(String(me?.trainingDaysPerWeek ?? 4));
    const [goal, setGoal] = useState(me?.goal ?? 'perder_grasa');
    const [rejected, setRejected] = useState(me?.aversions.map((a) => a.tag).join(', ') ?? '');
    const [roRejected, setRoRejected] = useState(ro?.aversions.map((a) => a.tag).join(', ') ?? '');
    const [roEgg, setRoEgg] = useState(ro?.optionalExtras.includes('huevo') ?? true);
    const [started, setStarted] = useState(data.babyProfile?.startedComplementary ?? false);
    const [signs, setSigns] = useState(data.babyProfile?.readinessSigns ?? false);
    const [textures, setTextures] = useState(data.babyProfile?.allowedTextures ?? ['pure', 'pisado']);
    const [demo, setDemo] = useState(true);
    const [busy, setBusy] = useState(false);
    const validBirth = /^\d{4}-\d{2}-\d{2}$/.test(birth);
    const targets = useMemo(() => {
        const w = num(weight), h = num(height);
        if (!w || !h || !validBirth)
            return null;
        return estimateTargets({ sex: me.sex ?? 'hombre', weightKg: w, heightCm: h, age: ageInYears(birth), activity, goal });
    }, [weight, height, birth, activity, goal]);
    const tags = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    async function finish() {
        setBusy(true);
        await commit(async (repo) => {
            const updated = {
                ...me, weightKg: num(weight), heightCm: num(height), birthDate: birth, activity, trainingDaysPerWeek: num(training) || 0, goal,
                aversions: tags(rejected).map((t) => ({ tag: t, level: 'excluir' })),
                targets: targets ? { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG } : undefined,
            };
            await repo.saveMember(updated);
            if (ro)
                await repo.saveMember({ ...ro, aversions: tags(roRejected).map((t) => ({ tag: t, level: 'evitar' })), optionalExtras: roEgg ? ['huevo'] : [] });
            if (helena)
                await repo.saveBabyProfile({ memberId: helena.id, startedComplementary: started, readinessSigns: signs, allowedTextures: textures });
            await repo.addWeight(localToday(), num(weight));
            if (demo)
                await seedDemo(repo, localToday());
            await repo.setSetting('onboarded', true);
        });
        setBusy(false);
        go('hoy', {}, true);
    }
    const nav = (backTo, next, disabled = false) => (_jsxs("div", { class: "grid2", children: [_jsx(Button, { kind: "secondary", title: "Atr\u00E1s", onPress: () => setStep(backTo) }), _jsx(Button, { title: "Siguiente", disabled: disabled, onPress: next })] }));
    const steps = [
        _jsxs("div", { class: "stack welcome", children: [_jsx("div", { class: "logo", children: "\uD83D\uDC68\u200D\uD83C\uDF73" }), _jsx(Title, { sub: APP_TAGLINE, children: APP_NAME }), ['Planificá tus comidas', 'Cociná paso a paso', 'Organizá tu inventario', 'Generá tu lista de compras', 'Adaptá para toda la familia'].map((t) => _jsxs(Body, { children: ["\u2713  ", t] })), _jsx(Notice, { tone: "primary", children: "Todo se guarda en tu iPhone. No hace falta cuenta." }), _jsx(Button, { title: "Comenzar", onPress: () => setStep(1) })] }),
        _jsxs("div", { class: "stack", children: [_jsx(Title, { sub: "Datos editables en cualquier momento", children: "Tus datos" }), _jsxs("div", { class: "grid2", children: [_jsx(Field, { label: "Peso actual (kg)", inputMode: "decimal", value: weight, onChange: setWeight }), _jsx(Field, { label: "Altura (cm)", inputMode: "numeric", value: height, onChange: setHeight })] }), _jsx(Notice, { children: "\u00DAltimo peso conocido: 108 kg. Actualizalo con el de hoy." }), _jsx(Field, { label: "Fecha de nacimiento", type: "date", value: birth, onChange: setBirth }), _jsx(Body, { small: true, muted: true, children: "Nivel de actividad diaria (sin contar el entrenamiento)" }), _jsx("div", { class: "row wrap", children: ACTIVITY.map(([id, l]) => _jsx(Chip, { label: l, active: activity === id, onPress: () => setActivity(id) })) }), _jsx(Field, { label: "D\u00EDas de entrenamiento de fuerza por semana", inputMode: "numeric", value: training, onChange: setTraining }), _jsx(Body, { small: true, muted: true, children: "Objetivo" }), _jsx("div", { class: "row wrap", children: GOALS.map(([id, l]) => _jsx(Chip, { label: l, active: goal === id, onPress: () => setGoal(id) })) }), _jsx(Field, { label: "Alimentos que no com\u00E9s (separados por coma)", value: rejected, onChange: setRejected }), !validBirth ? _jsx(Body, { small: true, muted: true, children: "Necesitamos la fecha de nacimiento para estimar tu gasto." }) : null, nav(0, () => setStep(2), !targets)] }),
        _jsxs("div", { class: "stack", children: [_jsx(Title, { sub: "Estimaci\u00F3n inicial: se ajusta con tu tendencia real", children: "Tus objetivos" }), targets ? (_jsxs(Card, { tone: "primary", children: [_jsxs("div", { class: "kpi", children: [targets.kcal, " kcal/d\u00EDa"] }), _jsxs(Body, { children: ["Prote\u00EDna ", targets.proteinG, " g \u00B7 Carbohidratos ", targets.carbsG, " g \u00B7 Grasas ", targets.fatG, " g"] }), targets.explanation.map((e) => _jsxs(Body, { small: true, muted: true, children: ["\u2022 ", e] }))] })) : null, _jsx(Notice, { children: "Es un punto de partida, no una prescripci\u00F3n. Si ten\u00E9s alguna condici\u00F3n m\u00E9dica, consultalo con tu m\u00E9dico o nutricionista." }), nav(1, () => setStep(3))] }),
        _jsxs("div", { class: "stack", children: [_jsx(Title, { sub: "Sus metas son independientes de las tuyas", children: "Roc\u00EDo (Ro)" }), _jsx(Field, { label: "Prefiere evitar (separado por coma)", value: roRejected, onChange: setRoRejected }), _jsx(Toggle, { label: "Agregar huevo solo a su versi\u00F3n", value: roEgg, onChange: setRoEgg }), _jsx(Body, { small: true, muted: true, children: "No se le aplica tu d\u00E9ficit. Pod\u00E9s cargarle objetivos propios desde Familia." }), nav(2, () => setStep(4))] }),
        _jsxs("div", { class: "stack", children: [_jsx(Title, { sub: helena?.birthDate ? `${ageInMonths(helena.birthDate)} meses` : undefined, children: "Helena" }), _jsx(Notice, { tone: "baby", children: "La leche materna o f\u00F3rmula sigue siendo su alimento principal. Esta app no reemplaza al pediatra: registr\u00E1 sus indicaciones en el perfil de Helena." }), _jsx(Toggle, { label: "Ya comenz\u00F3 la alimentaci\u00F3n complementaria", value: started, onChange: setStarted }), _jsx(Toggle, { label: "Muestra se\u00F1ales de preparaci\u00F3n", hint: "Se sienta con poco apoyo, sostiene la cabeza, se interesa por la comida, no la empuja con la lengua.", value: signs, onChange: setSigns }), _jsx(Body, { small: true, muted: true, children: "Texturas que ya maneja" }), _jsx("div", { class: "row wrap", children: ['pure', 'pisado', 'picado_fino', 'trozos_blandos'].map((t) => _jsx(Chip, { tone: "baby", label: TEXTURE_LABEL[t], active: textures.includes(t), onPress: () => setTextures((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t])) })) }), !started || !signs ? _jsx(Notice, { children: "Mientras no confirmes ambas cosas, la app no le propondr\u00E1 comidas." }) : null, nav(3, () => setStep(5))] }),
        _jsxs("div", { class: "stack", children: [_jsx(Title, { children: "\u00DAltimo paso" }), _jsx(H2, { children: "Datos de demostraci\u00F3n" }), _jsx(Toggle, { label: "Cargar inventario y plan de ejemplo", hint: "Se borran desde Configuraci\u00F3n cuando quieras.", value: demo, onChange: setDemo }), _jsx(Button, { title: busy ? 'Preparando…' : 'Empezar a usar la app', disabled: busy, onPress: finish }), _jsx(Button, { kind: "ghost", title: "Atr\u00E1s", onPress: () => setStep(4) })] }),
    ];
    return _jsx(Screen, { children: steps[step] });
}
