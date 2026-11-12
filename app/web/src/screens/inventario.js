import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, Field, H2, Notice, PhotoButton, Row, Screen, Stepper, alertMsg } from '../ui.js';
import { parseInventoryText } from '../../../src/domain/textParser.js';
import { formatQty } from '../../../src/domain/units.js';
import { LOCATION_LABEL, STATE_LABEL } from '../util.js';
const LOCS = ['heladera', 'freezer', 'alacena'];
export function Inventario() {
    const { data, commit, repo, version } = useApp();
    const [loc, setLoc] = useState('heladera');
    const [text, setText] = useState('');
    const [parsed, setParsed] = useState([]);
    const [open, setOpen] = useState(null);
    const [frequent, setFrequent] = useState([]);
    const [ops, setOps] = useState([]);
    const [leftovers, setLeftovers] = useState([]);
    useEffect(() => { repo.frequentProducts().then(setFrequent); repo.recentOperations(8).then(setOps); repo.leftovers().then(setLeftovers); }, [version]);
    const lots = useMemo(() => data.lots.filter((l) => l.location === loc), [data.lots, loc]);
    const guessLoc = (id) => {
        const cat = data.ingredients.get(id ?? '')?.category ?? '';
        return ['verdura', 'lacteo', 'carne', 'pollo', 'pescado', 'huevo'].includes(cat) ? 'heladera' : 'alacena';
    };
    function parse() {
        setParsed(parseInventoryText(text, data.ingredientList).map((p) => ({ ...p, location: guessLoc(p.ingredientId) })));
    }
    async function confirmParsed() {
        const valid = parsed.filter((p) => p.ingredientId && p.qty && p.qty > 0 && p.unit);
        const skipped = parsed.length - valid.length;
        await commit(async (r) => {
            for (const p of valid)
                await r.addLot({ ingredientId: p.ingredientId, qty: p.qty, unit: p.unit, location: p.location, state: p.location === 'freezer' ? 'congelado' : 'cerrado', purchasedAt: new Date().toISOString().slice(0, 10), photoUri: p.photo });
        });
        setParsed([]);
        setText('');
        if (skipped)
            alertMsg('Revisá', `${skipped} ítem(s) sin producto reconocido o sin cantidad no se cargaron. No inventamos cantidades.`);
    }
    const patch = (i, p) => setParsed((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
    return (_jsxs(Screen, { children: [_jsx("div", { class: "grid3", children: LOCS.map((l) => _jsx(Button, { small: true, kind: loc === l ? 'primary' : 'secondary', title: LOCATION_LABEL[l], onPress: () => setLoc(l) })) }), lots.length === 0 ? _jsxs(Body, { muted: true, children: ["No hay nada cargado en ", LOCATION_LABEL[loc].toLowerCase(), "."] }) : null, lots.map((l) => _jsx(LotCard, { lot: l, expanded: open === l.id, onToggle: () => setOpen(open === l.id ? null : l.id) }, l.id)), _jsx(H2, { children: "Agregar" }), _jsx(Field, { multiline: true, placeholder: 'Ej.: "Tengo un kilo de pollo, cuatro zapallitos y dos calabazas"', value: text, onChange: setText }), _jsx(Button, { small: true, title: "Interpretar", disabled: !text.trim(), onPress: parse }), parsed.length ? (_jsxs(Card, { children: [_jsx(Body, { bold: true, children: "Confirm\u00E1 antes de guardar" }), parsed.map((p, i) => {
                        const ing = data.ingredients.get(p.ingredientId ?? '');
                        return (_jsxs("div", { class: "parsed", children: [_jsx(Body, { children: ing ? ing.name : `❓ "${p.name}" (no reconocido)` }), ing ? (_jsxs(_Fragment, { children: [_jsxs(Row, { between: true, children: [p.qty === null ? _jsx(Body, { small: true, muted: true, children: "Indic\u00E1 la cantidad" }) : _jsx("span", {}), _jsx(Stepper, { value: p.qty ?? 0, step: p.unit === 'kg' || p.unit === 'l' ? 0.25 : p.unit === 'un' ? 1 : 50, onChange: (v) => patch(i, { qty: v, unit: p.unit ?? ing.defaultUnit }), suffix: p.unit ?? ing.defaultUnit })] }), _jsxs(Row, { wrap: true, children: [LOCS.map((l) => _jsx(Chip, { label: LOCATION_LABEL[l], active: p.location === l, onPress: () => patch(i, { location: l }) })), _jsx(PhotoButton, { label: p.photo ? '📷 ✓' : '📷 Foto', onPhoto: (ph) => patch(i, { photo: ph }) })] })] })) : null] }));
                    }), _jsx(Button, { title: "Guardar en inventario", onPress: confirmParsed })] })) : null, frequent.length ? (_jsxs(_Fragment, { children: [_jsx(Body, { small: true, muted: true, children: "Productos frecuentes" }), _jsx(Row, { wrap: true, children: frequent.map((f) => {
                            const ing = data.ingredients.get(f.ingredientId);
                            if (!ing)
                                return null;
                            return _jsx(Chip, { label: `＋ ${ing.name}${f.lastQty ? ` (${formatQty(f.lastQty, f.lastUnit ?? ing.defaultUnit)})` : ''}`, onPress: () => setParsed((xs) => [...xs, { raw: ing.name, name: ing.name, ingredientId: ing.id, qty: f.lastQty ?? null, unit: f.lastUnit ?? ing.defaultUnit, confidence: 'alta', location: loc }]) });
                        }) })] })) : null, _jsx(Body, { small: true, muted: true, children: "Escaneo de c\u00F3digos de barras: no disponible en la versi\u00F3n web del iPhone. Us\u00E1 el texto o los frecuentes." }), leftovers.length ? (_jsxs(_Fragment, { children: [_jsx(H2, { children: "Sobrantes" }), leftovers.map((l) => (_jsx(Card, { children: _jsxs(Row, { between: true, children: [_jsxs("div", { class: "grow", children: [_jsx(Body, { children: l.description }), _jsxs(Body, { small: true, muted: true, children: [l.portions, " porci\u00F3n \u00B7 ", l.location, " \u00B7 guardado ", l.storedAt.slice(0, 10)] })] }), _jsx(Button, { small: true, kind: "ghost", title: "Lo com\u00ED", onPress: () => commit((r) => r.consumeLeftover(l.id)) })] }) })))] })) : null, ops.length ? (_jsxs(_Fragment, { children: [_jsx(H2, { children: "\u00DAltimos movimientos" }), ops.map((o) => (_jsxs(Row, { between: true, children: [_jsxs(Body, { small: true, muted: true, children: [o.kind, " \u00B7 ", o.items, " \u00EDtem(s) \u00B7 ", o.createdAt.slice(0, 16).replace('T', ' ')] }), o.reverted ? _jsx(Body, { small: true, muted: true, children: "deshecho" }) : _jsx("button", { class: "link small", onClick: () => commit((r) => r.undo(o.operationId)), children: "Deshacer" })] })))] })) : null] }));
}
function LotCard({ lot, expanded, onToggle }) {
    const { data, commit } = useApp();
    const ing = data.ingredients.get(lot.ingredientId);
    const [qty, setQty] = useState(lot.qty);
    const [exp, setExp] = useState(lot.expiresAt ?? '');
    const step = lot.unit === 'un' ? 1 : lot.unit === 'kg' || lot.unit === 'l' ? 0.1 : 50;
    const states = ['cerrado', 'abierto', 'congelado', 'descongelando', 'preparado'];
    return (_jsxs(Card, { onPress: onToggle, children: [_jsxs(Row, { between: true, children: [lot.photoUri ? _jsx("img", { class: "dish", src: lot.photoUri, style: { width: '40px', height: '40px' } }) : null, _jsxs("div", { class: "grow", children: [_jsx(Body, { bold: true, children: ing?.name ?? lot.ingredientId }), _jsxs(Body, { small: true, muted: true, children: [STATE_LABEL[lot.state], lot.expiresAt ? ` · vence ${lot.expiresAt}` : ''] })] }), _jsx(Body, { bold: true, children: formatQty(lot.qty, lot.unit) })] }), expanded ? (_jsxs("div", { class: "stack", onClick: (e) => e.stopPropagation(), children: [_jsxs(Row, { between: true, children: [_jsx(Body, { small: true, children: "Cantidad real" }), _jsx(Stepper, { value: qty, step: step, onChange: setQty, suffix: lot.unit })] }), _jsx(Row, { wrap: true, children: states.map((s) => _jsx(Chip, { label: STATE_LABEL[s], active: lot.state === s, onPress: () => commit((r) => r.updateLotMeta(lot.id, { state: s, location: s === 'congelado' ? 'freezer' : s === 'descongelando' ? 'heladera' : lot.location })) })) }), _jsx(Field, { label: "Vencimiento (opcional)", type: "date", value: exp, onChange: setExp }), _jsx(Notice, { children: "Solo se guarda el vencimiento que cargues: la app no inventa fechas." }), _jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, title: "Guardar", onPress: () => commit(async (r) => {
                                    if (qty !== lot.qty)
                                        await r.adjustLotQty(lot.id, qty);
                                    if ((exp || undefined) !== lot.expiresAt)
                                        await r.updateLotMeta(lot.id, { expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : undefined });
                                }) }), _jsx(Button, { small: true, kind: "danger", title: "Se termin\u00F3", onPress: () => commit((r) => r.adjustLotQty(lot.id, 0)) })] })] })) : null] }));
}
