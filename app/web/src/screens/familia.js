import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Toggle, go, sheet } from '../ui.js';
import { targetsForMember, ageInMonths } from '../../../src/domain/nutrition.js';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.js';
import { APP_NAME } from '../../../src/config/app.js';
import { num } from '../util.js';
export function Mas() {
    const items = [
        ['recetas', '📖', 'Recetario', 'Buscar, crear, editar y duplicar recetas'],
        ['compras', '🛒', 'Lista de compras', 'Faltantes de hoy y de la semana'],
        ['familia', '👨‍👩‍👧', 'Familia y restricciones', 'Perfiles, alimentos rechazados, objetivos'],
        ['helena', '👶', 'Helena', 'Etapa, texturas, alimentos introducidos, pediatra'],
        ['progreso', '📈', 'Progreso físico', 'Peso, medidas, adherencia'],
        ['ajustes', '⚙️', 'Configuración', 'Horarios, recordatorios en Calendario, respaldo'],
    ];
    return (_jsxs(Screen, { children: [items.map(([p, icon, t, s]) => _jsxs(Card, { onPress: () => go(p), children: [_jsxs(Body, { bold: true, children: [icon, "  ", t] }), _jsx(Body, { small: true, muted: true, children: s })] })), _jsxs(Body, { small: true, muted: true, children: [APP_NAME, " \u00B7 tus datos se guardan solo en este iPhone"] })] }));
}
export function Familia() {
    const { data } = useApp();
    return (_jsx(Screen, { children: data.members.map((m) => (m.kind === 'bebe'
            ? _jsxs(Card, { tone: "baby", onPress: () => go('helena'), children: [_jsxs(Body, { bold: true, children: ["\uD83D\uDC76 ", m.name] }), _jsxs(Body, { small: true, muted: true, children: [m.birthDate ? `${ageInMonths(m.birthDate)} meses` : '', " \u00B7 sin metas cal\u00F3ricas \u00B7 ver perfil"] })] })
            : _jsx(MemberEditor, { member: m }, m.id))) }));
}
function MemberEditor({ member }) {
    const { commit } = useApp();
    const [aversions, setAversions] = useState(member.aversions);
    const [newTag, setNewTag] = useState('');
    const [extras, setExtras] = useState(member.optionalExtras.join(', '));
    const [allergies, setAllergies] = useState(member.allergies.join(', '));
    const [kcal, setKcal] = useState(member.targets ? String(member.targets.kcal) : '');
    const [prot, setProt] = useState(member.targets ? String(member.targets.proteinG) : '');
    const est = targetsForMember(member);
    const list = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const save = () => commit((r) => r.saveMember({
        ...member, aversions, optionalExtras: list(extras), allergies: list(allergies),
        targets: kcal && prot ? { kcal: num(kcal), proteinG: num(prot), carbsG: member.targets?.carbsG ?? est?.carbsG ?? 0, fatG: member.targets?.fatG ?? est?.fatG ?? 0 } : undefined,
    })).then(() => sheet('Guardado', undefined, [{ text: 'OK', style: 'cancel' }]));
    return (_jsxs(Card, { tone: member.isPrimary ? 'primary' : 'ro', children: [_jsx(Body, { bold: true, children: member.shortName ?? member.name }), _jsx(Body, { small: true, muted: true, children: "Toc\u00E1 para cambiar: rojo = no lo come \u00B7 naranja = prefiere evitar \u00B7 otro toque lo quita" }), _jsx(Row, { wrap: true, children: aversions.map((a) => (_jsx(Chip, { tone: a.level === 'excluir' ? 'danger' : 'accent', active: true, label: `${a.tag} · ${a.level === 'excluir' ? 'no' : 'evitar'}`, onPress: () => setAversions((xs) => (a.level === 'evitar' ? xs.filter((x) => x.tag !== a.tag) : xs.map((x) => (x.tag === a.tag ? { ...x, level: 'evitar' } : x)))) }))) }), _jsxs(Row, { children: [_jsx("div", { class: "grow", children: _jsx(Field, { placeholder: "Agregar alimento (ej. h\u00EDgado)", value: newTag, onChange: setNewTag }) }), _jsx(Button, { small: true, title: "\uFF0B", onPress: () => { const t = newTag.trim().toLowerCase(); if (t)
                            setAversions((xs) => [...xs.filter((x) => x.tag !== t), { tag: t, level: 'excluir' }]); setNewTag(''); } })] }), _jsx(Field, { label: "Alergias (se excluyen siempre)", value: allergies, onChange: setAllergies }), _jsx(Field, { label: "Extras solo para su versi\u00F3n (ej. huevo)", value: extras, onChange: setExtras }), _jsxs("div", { class: "grid2", children: [_jsx(Field, { label: "Objetivo kcal", inputMode: "numeric", value: kcal, onChange: setKcal, placeholder: est ? String(est.kcal) : 'opcional' }), _jsx(Field, { label: "Prote\u00EDna (g)", inputMode: "numeric", value: prot, onChange: setProt, placeholder: est ? String(est.proteinG) : 'opcional' })] }), !member.isPrimary ? _jsxs(Notice, { children: ["Los objetivos de ", member.shortName ?? member.name, " son independientes de los tuyos y opcionales."] }) : null, _jsx(Button, { small: true, title: "Guardar", onPress: save })] }));
}
const STATUS_LABEL = { pendiente: 'Pendiente', introducido: 'Introducido', tolerado: 'Tolerado', reaccion: 'Reacción' };
export function Helena() {
    const { data, commit, todayISO } = useApp();
    const baby = data.members.find((m) => m.kind === 'bebe');
    const p = data.babyProfile;
    const [note, setNote] = useState('');
    const [search, setSearch] = useState('');
    const intros = useMemo(() => new Map(data.introductions.map((i) => [i.ingredientId, i])), [data.introductions]);
    if (!baby || !p)
        return _jsx(Screen, { children: _jsx(Body, { children: "Sin perfil de beb\u00E9." }) });
    const months = baby.birthDate ? ageInMonths(baby.birthDate) : 0;
    const setProfile = (patch) => commit((r) => r.saveBabyProfile({ ...p, ...patch }));
    const candidates = data.ingredientList.filter((i) => !i.tags.includes('basico') && (!search || i.name.toLowerCase().includes(search.toLowerCase())));
    function changeStatus(ingredientId, status) {
        const name = data.ingredients.get(ingredientId)?.name;
        if (status === 'reaccion') {
            const txt = window.prompt(`Describí qué pasó con ${name}. Ante dificultad para respirar, hinchazón de cara o labios, o vómitos repetidos, llamá a emergencias (107 o 911).`) ?? undefined;
            commit((r) => r.setIntroduction(baby.id, ingredientId, 'reaccion', { reaction: txt || undefined, date: todayISO }));
            return;
        }
        sheet(`${name}: ${STATUS_LABEL[status]}`, status === 'introducido' ? 'Confirmás que se lo vas a ofrecer o ya se lo ofreciste.' : '¿Confirmás?', [
            { text: 'Confirmar', onPress: () => commit((r) => r.setIntroduction(baby.id, ingredientId, status, { date: todayISO })) },
        ]);
    }
    return (_jsxs(Screen, { children: [_jsxs("h1", { class: "h1-small", children: [baby.name, " \u00B7 ", months, " meses"] }), _jsx(Notice, { tone: "baby", children: "La leche materna o f\u00F3rmula sigue siendo esencial. Sin sal, sin az\u00FAcar, sin miel antes del a\u00F1o. No se aplican metas ni porciones r\u00EDgidas. Esta app no reemplaza al pediatra." }), _jsxs(Card, { children: [_jsx(Toggle, { label: "Comenz\u00F3 la alimentaci\u00F3n complementaria", value: p.startedComplementary, onChange: (v) => setProfile({ startedComplementary: v }) }), _jsx(Toggle, { label: "Se\u00F1ales de preparaci\u00F3n confirmadas", hint: "Se sienta con poco apoyo, sostiene la cabeza, se interesa por la comida, no la empuja con la lengua.", value: p.readinessSigns, onChange: (v) => setProfile({ readinessSigns: v }) }), _jsx(Body, { small: true, muted: true, children: "Texturas habilitadas" }), _jsx(Row, { wrap: true, children: ['pure', 'pisado', 'picado_fino', 'trozos_blandos'].map((t) => _jsx(Chip, { tone: "baby", label: TEXTURE_LABEL[t], active: p.allowedTextures.includes(t), onPress: () => setProfile({ allowedTextures: p.allowedTextures.includes(t) ? p.allowedTextures.filter((x) => x !== t) : [...p.allowedTextures, t] }) })) })] }), _jsx(H2, { children: "Indicaciones del pediatra" }), p.pediatricianNotes.length === 0 ? _jsx(Body, { muted: true, children: "Sin indicaciones registradas." }) : p.pediatricianNotes.map((n) => _jsxs(Body, { children: ["\u2022 ", n] })), _jsxs(Row, { children: [_jsx("div", { class: "grow", children: _jsx(Field, { placeholder: "Ej.: introducir huevo cocido a partir de\u2026", value: note, onChange: setNote }) }), _jsx(Button, { small: true, title: "Agregar", disabled: !note.trim(), onPress: () => { commit((r) => r.addPediatricNote(baby.id, note.trim(), todayISO)); setNote(''); } })] }), _jsx(H2, { children: "Alimentos" }), _jsx(Field, { placeholder: "Buscar alimento", value: search, onChange: setSearch, type: "search" }), candidates.slice(0, 40).map((i) => {
                const st = intros.get(i.id)?.status ?? 'pendiente';
                const blocked = i.tags.includes('miel') || i.tags.includes('riesgo_atragantamiento');
                return (_jsxs(Card, { tone: st === 'reaccion' ? 'danger' : st === 'tolerado' ? 'primary' : undefined, children: [_jsxs(Row, { between: true, children: [_jsx(Body, { bold: true, children: i.name }), _jsx(Body, { small: true, muted: true, children: STATUS_LABEL[st] })] }), blocked ? _jsx(Body, { small: true, muted: true, children: "No apto en este formato / edad." }) : (_jsx(Row, { wrap: true, children: ['introducido', 'tolerado', 'reaccion'].filter((s) => s !== st).map((s) => _jsx(Chip, { label: STATUS_LABEL[s], tone: s === 'reaccion' ? 'danger' : 'baby', onPress: () => changeStatus(i.id, s) })) })), intros.get(i.id)?.reaction ? _jsxs(Body, { small: true, children: ["Reacci\u00F3n: ", intros.get(i.id).reaction] }) : null] }));
            }), candidates.length > 40 ? _jsx(Body, { small: true, muted: true, children: "Us\u00E1 el buscador para ver m\u00E1s alimentos." }) : null] }));
}
