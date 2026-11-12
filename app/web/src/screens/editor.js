import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, DishImage, Field, H2, Notice, PhotoButton, Row, Screen, Stepper, Toggle, back, go, sheet } from '../ui.js';
import { ALLERGENS, buildCustomIngredient, duplicateRecipe, emptyDraft, finalizeDraft, flagsFromTags, hasErrors, inferTags, moveItem, newIngredientLine, RECIPE_TAGS, renumberSteps, TEXTURES, validateRecipeDraft, } from '../../../src/domain/recipeEditor.js';
import { buildFamilyVersions } from '../../../src/domain/adaptations.js';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.js';
import { matchIngredient, normalize } from '../../../src/domain/textParser.js';
import { num } from '../util.js';
const ALLERGEN_LABEL = { huevo: 'Huevo', leche: 'Leche', pescado: 'Pescado', mariscos: 'Mariscos', mani: 'Maní', frutos_secos: 'Frutos secos', soja: 'Soja', trigo: 'Trigo', sesamo: 'Sésamo' };
const CATEGORIES = [['verdura', 'Verdura'], ['fruta', 'Fruta'], ['carne', 'Carne'], ['pollo', 'Pollo'], ['pescado', 'Pescado'], ['huevo', 'Huevo'], ['lacteo', 'Lácteo'], ['cereal', 'Cereal'], ['legumbre', 'Legumbre'], ['panificado', 'Panificado'], ['grasa', 'Grasa'], ['condimento', 'Condimento'], ['otro', 'Otro']];
const FLAG_LABELS = [['sal', 'Contiene sal / mucho sodio'], ['azucar', 'Contiene azúcar'], ['miel', 'Es o contiene miel'], ['atragantamiento', 'Formato con riesgo de atragantamiento'], ['crudo', 'Se consume crudo (pescado, huevo, carne)']];
function unitsFor(ing) {
    if (ing.defaultUnit === 'ml' || ing.defaultUnit === 'l')
        return ['ml', 'l'];
    if (ing.defaultUnit === 'un')
        return ing.gramsPerUnit ? ['un', 'g', 'kg'] : ['un'];
    return ing.gramsPerUnit ? ['g', 'kg', 'un'] : ['g', 'kg'];
}
export function Editor({ id, dup }) {
    const { data, commit } = useApp();
    const [ingredients, setIngredients] = useState(data.ingredients);
    const [newIngs, setNewIngs] = useState([]);
    const [draft, setDraft] = useState(() => {
        if (dup && data.recipes.get(dup))
            return duplicateRecipe(data.recipes.get(dup), data.recipes.keys());
        if (id && data.recipes.get(id))
            return JSON.parse(JSON.stringify(data.recipes.get(id)));
        return emptyDraft();
    });
    const [dirty, setDirty] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(null);
    const [utensils, setUtensils] = useState(draft.utensils.join(', '));
    const update = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
    const setLine = (i, p) => update({ ingredients: draft.ingredients.map((l, j) => (j === i ? { ...l, ...p } : l)) });
    const setStep = (i, p) => update({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
    const full = { ...draft, utensils: utensils.split(',') };
    const issues = useMemo(() => validateRecipeDraft(full, ingredients), [draft, ingredients, utensils]);
    const preview = useMemo(() => (draft.ingredients.length ? buildFamilyVersions(draft, data.members, {}, ingredients, data.babyCtx ? { ...data.babyCtx, ingredients } : undefined) : null), [draft, ingredients]);
    const results = useMemo(() => {
        const n = normalize(search);
        return n.length < 2 ? [] : [...ingredients.values()].filter((i) => normalize(i.name).includes(n) || i.aliases.some((a) => normalize(a).includes(n))).slice(0, 8);
    }, [search, ingredients]);
    const isEdit = !!id && !dup;
    function addIngredient(ing) { update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] }); setSearch(''); }
    function startCreate() {
        const name = search.trim();
        const guess = matchIngredient(name, [...ingredients.values()]);
        if (guess && normalize(guess.name) === normalize(name))
            return addIngredient(guess);
        setCreating({ name, category: 'otro', unit: 'g', gpu: '', flags: flagsFromTags(inferTags(name)), kcal: '', p: '', hc: '', f: '' });
    }
    function confirmCreate() {
        if (!creating)
            return;
        const raw = [creating.kcal, creating.p, creating.hc, creating.f];
        const hasN = raw.every((x) => x.trim() !== '' && num(x) >= 0);
        try {
            const ing = buildCustomIngredient({
                name: creating.name, category: creating.category, defaultUnit: creating.unit, gramsPerUnit: creating.gpu ? num(creating.gpu) : undefined,
                per100g: hasN ? { kcal: num(raw[0]), proteinG: num(raw[1]), carbsG: num(raw[2]), fatG: num(raw[3]) } : undefined, nutritionBasis: 'crudo', flags: creating.flags,
            }, ingredients.keys());
            const m = new Map(ingredients);
            m.set(ing.id, ing);
            setIngredients(m);
            setNewIngs((x) => [...x, ing]);
            update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] });
            setCreating(null);
            setSearch('');
        }
        catch (e) {
            sheet('Revisá el ingrediente', e.message, [{ text: 'OK', style: 'cancel' }]);
        }
    }
    async function save() {
        if (hasErrors(issues))
            return;
        const taken = data.allRecipes.map((r) => r.id);
        const final = finalizeDraft(full, draft.id ? taken.filter((x) => x !== draft.id) : taken);
        await commit(async (repo) => {
            for (const ing of newIngs.filter((n) => final.ingredients.some((l) => l.ingredientId === n.id)))
                await repo.saveIngredient(ing, true);
            await repo.saveRecipe(final);
        });
        go(`receta/${final.id}`, {}, true);
    }
    function cancel() {
        if (!dirty)
            return back('recetas');
        sheet('¿Descartar cambios?', undefined, [{ text: 'Descartar', style: 'destructive', onPress: () => back('recetas') }, { text: 'Seguir editando', style: 'cancel' }]);
    }
    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'aviso');
    return (_jsxs(Screen, { children: [_jsxs(Row, { between: true, children: [_jsx("button", { class: "link", onClick: cancel, children: "Cancelar" }), _jsx("b", { children: isEdit ? 'Editar receta' : dup ? 'Duplicar receta' : 'Nueva receta' }), _jsx("span", {})] }), isEdit && draft.isDemo ? _jsx(Notice, { children: "Es una receta de demostraci\u00F3n: al guardar pasa a ser tuya y no se borra con los datos demo." }) : null, _jsxs("div", { class: "meal-row", children: [_jsx(DishImage, { recipe: draft, size: 80 }), _jsxs("div", { class: "stack grow", children: [_jsx(PhotoButton, { label: "\uD83D\uDCF7 Sacar foto", onPhoto: (d) => update({ imageUri: d }) }), _jsx(PhotoButton, { label: "Elegir de la galer\u00EDa", camera: false, onPhoto: (d) => update({ imageUri: d }) }), draft.imageUri ? _jsx("button", { class: "link small", onClick: () => update({ imageUri: undefined }), children: "Quitar foto" }) : null] })] }), _jsx(Field, { label: "Nombre", value: draft.name, onChange: (v) => update({ name: v }), placeholder: "Ej.: Pollo al lim\u00F3n con verduras" }), _jsxs(Row, { between: true, children: [_jsx(Body, { children: "Tiempo total" }), _jsx(Stepper, { value: draft.totalMinutes, step: 5, min: 5, onChange: (v) => update({ totalMinutes: v }), suffix: "min" })] }), _jsxs(Row, { between: true, children: [_jsx(Body, { children: "Rinde (porciones adultas)" }), _jsx(Stepper, { value: draft.servings, step: 1, min: 1, onChange: (v) => update({ servings: v }) })] }), _jsx(Row, { wrap: true, children: ['facil', 'media', 'dificil'].map((d) => _jsx(Chip, { label: { facil: 'Fácil', media: 'Media', dificil: 'Difícil' }[d], active: draft.difficulty === d, onPress: () => update({ difficulty: d }) })) }), _jsx(Body, { small: true, muted: true, children: "Momento y caracter\u00EDsticas" }), _jsx(Row, { wrap: true, children: RECIPE_TAGS.map((t) => _jsx(Chip, { label: t.label, active: draft.tags.includes(t.id), onPress: () => update({ tags: draft.tags.includes(t.id) ? draft.tags.filter((x) => x !== t.id) : [...draft.tags, t.id] }) })) }), _jsx(H2, { children: "Ingredientes" }), _jsxs(Body, { small: true, muted: true, children: ["Cantidades para la receta completa (", draft.servings, " porciones). Indic\u00E1 si el peso es crudo o cocido."] }), draft.ingredients.map((l, i) => {
                const ing = ingredients.get(l.ingredientId);
                if (!ing)
                    return null;
                return (_jsxs(Card, { children: [_jsxs(Row, { between: true, children: [_jsxs(Body, { bold: true, children: [ing.name, ing.id.startsWith('custom_') ? ' · propio' : ''] }), _jsx("button", { class: "link", onClick: () => update({ ingredients: draft.ingredients.filter((_, j) => j !== i) }), children: "\u2715" })] }), _jsxs(Row, { between: true, wrap: true, children: [_jsx(Row, { wrap: true, children: unitsFor(ing).map((u) => _jsx(Chip, { label: u, active: l.unit === u, onPress: () => setLine(i, { unit: u }) })) }), _jsx(Stepper, { value: l.qty, step: l.unit === 'un' ? 0.5 : l.unit === 'kg' || l.unit === 'l' ? 0.1 : 10, min: 0, onChange: (v) => setLine(i, { qty: v }) })] }), _jsxs(Row, { wrap: true, children: [_jsx(Chip, { label: "Crudo", active: l.state === 'crudo', onPress: () => setLine(i, { state: 'crudo' }) }), _jsx(Chip, { label: "Cocido", active: l.state === 'cocido', onPress: () => setLine(i, { state: 'cocido' }) }), _jsx(Chip, { label: "Opcional", active: !!l.optional, onPress: () => setLine(i, { optional: !l.optional || undefined }) }), _jsx(Chip, { label: "Se sirve aparte", active: !!l.separable, onPress: () => setLine(i, { separable: !l.separable || undefined }) }), _jsx(Chip, { tone: "baby", label: "Despu\u00E9s de separar a Helena", active: !!l.addedAfterBabySplit, onPress: () => setLine(i, { addedAfterBabySplit: !l.addedAfterBabySplit || undefined }) })] }), _jsx(Field, { placeholder: "Nota (opcional)", value: l.note ?? '', onChange: (v) => setLine(i, { note: v || undefined }) })] }));
            }), _jsx(Field, { placeholder: "Buscar ingrediente para agregar\u2026", value: search, onChange: setSearch }), search.trim().length >= 2 ? (_jsxs(Row, { wrap: true, children: [results.map((r) => _jsx(Chip, { label: `＋ ${r.name}`, onPress: () => addIngredient(r) })), _jsx(Chip, { tone: "accent", label: `Crear «${search.trim()}»`, onPress: startCreate })] })) : null, creating ? (_jsxs(Card, { tone: "accent", children: [_jsxs(Body, { bold: true, children: ["Nuevo ingrediente: ", creating.name] }), _jsx(Row, { wrap: true, children: CATEGORIES.map(([k, label]) => _jsx(Chip, { label: label, active: creating.category === k, onPress: () => setCreating({ ...creating, category: k }) })) }), _jsx(Body, { small: true, muted: true, children: "Unidad en que lo compr\u00E1s" }), _jsx(Row, { wrap: true, children: ['g', 'ml', 'un'].map((u) => _jsx(Chip, { label: u === 'un' ? 'unidades' : u, active: creating.unit === u, onPress: () => setCreating({ ...creating, unit: u }) })) }), creating.unit !== 'ml' ? _jsx(Field, { label: "Gramos por unidad (opcional)", inputMode: "decimal", value: creating.gpu, onChange: (v) => setCreating({ ...creating, gpu: v }) }) : null, _jsx(Body, { small: true, muted: true, children: "Nutrici\u00F3n cada 100 g en crudo (opcional)" }), _jsx("div", { class: "grid4", children: ['kcal', 'p', 'hc', 'f'].map((k) => _jsx(Field, { placeholder: { kcal: 'kcal', p: 'prot', hc: 'HC', f: 'grasa' }[k], inputMode: "decimal", value: creating[k], onChange: (v) => setCreating({ ...creating, [k]: v }) })) }), _jsx(Notice, { tone: "baby", children: "Marc\u00E1 lo que corresponda: se usa para proteger a Helena y respetar restricciones. Lo pre-marcamos seg\u00FAn el nombre; revisalo." }), FLAG_LABELS.map(([k, label]) => _jsx(Toggle, { label: label, value: creating.flags[k], onChange: (v) => setCreating({ ...creating, flags: { ...creating.flags, [k]: v } }) })), _jsx(Body, { small: true, muted: true, children: "Al\u00E9rgenos" }), _jsx(Row, { wrap: true, children: ALLERGENS.map((a) => _jsx(Chip, { tone: "danger", label: ALLERGEN_LABEL[a], active: creating.flags.allergens.includes(a), onPress: () => setCreating({ ...creating, flags: { ...creating.flags, allergens: creating.flags.allergens.includes(a) ? creating.flags.allergens.filter((x) => x !== a) : [...creating.flags.allergens, a] } }) })) }), _jsxs("div", { class: "grid2", children: [_jsx(Button, { small: true, kind: "secondary", title: "Cancelar", onPress: () => setCreating(null) }), _jsx(Button, { small: true, title: "Crear y agregar", onPress: confirmCreate })] })] })) : null, _jsx(H2, { children: "Pasos" }), draft.steps.map((s, i) => (_jsxs(Card, { tone: s.babySplit ? 'baby' : undefined, children: [_jsxs(Row, { between: true, children: [_jsxs(Body, { bold: true, children: ["Paso ", i + 1] }), _jsxs(Row, { gap: 16, children: [_jsx("button", { class: "link", onClick: () => update({ steps: renumberSteps(moveItem(draft.steps, i, i - 1)) }), children: "\u2191" }), _jsx("button", { class: "link", onClick: () => update({ steps: renumberSteps(moveItem(draft.steps, i, i + 1)) }), children: "\u2193" }), _jsx("button", { class: "link", onClick: () => update({ steps: renumberSteps(draft.steps.filter((_, j) => j !== i)) }), children: "\u2715" })] })] }), _jsx(Field, { multiline: true, value: s.text, onChange: (v) => setStep(i, { text: v }), placeholder: "Ej.: Cort\u00E1 250 g de calabaza en cubos de 2 cm." }), _jsx(Field, { label: "Temporizador (minutos, opcional)", inputMode: "decimal", value: s.timerSec ? String(+(s.timerSec / 60).toFixed(1)) : '', onChange: (v) => setStep(i, { timerSec: v.trim() ? Math.round(num(v) * 60) : undefined }) }), _jsx(Toggle, { label: "Ac\u00E1 se separa la porci\u00F3n de Helena", value: !!s.babySplit, onChange: (v) => setStep(i, { babySplit: v || undefined }) }), _jsx(Field, { placeholder: "Consejo (opcional)", value: s.tip ?? '', onChange: (v) => setStep(i, { tip: v || undefined }) })] }))), _jsx(Button, { small: true, kind: "secondary", title: "\uFF0B Agregar paso", onPress: () => update({ steps: [...draft.steps, { order: draft.steps.length + 1, text: '' }] }) }), _jsx(H2, { children: "Helena" }), _jsx(Body, { small: true, muted: true, children: "\u00BFC\u00F3mo puede adaptarse para ella? Si no eleg\u00EDs ninguna textura, la app le buscar\u00E1 una alternativa aparte." }), _jsx(Row, { wrap: true, children: TEXTURES.map((t) => _jsx(Chip, { tone: "baby", label: TEXTURE_LABEL[t], active: !!draft.babyTextures?.includes(t), onPress: () => update({ babyTextures: draft.babyTextures?.includes(t) ? draft.babyTextures.filter((x) => x !== t) : [...(draft.babyTextures ?? []), t] }) })) }), _jsx(H2, { children: "M\u00E1s datos" }), _jsx(Field, { label: "Utensilios (separados por coma)", value: utensils, onChange: (v) => { setUtensils(v); setDirty(true); } }), _jsx(Field, { label: "C\u00F3mo conservar las sobras", multiline: true, value: draft.storage ?? '', onChange: (v) => update({ storage: v }) }), _jsx(H2, { children: "Vista previa" }), preview ? preview.versions.map((v) => (_jsx(Body, { small: true, children: v.status === 'bebe'
                    ? `👶 ${v.memberName}: ${v.baby?.verdict === 'bloqueado' ? 'necesita alternativa aparte' : v.baby?.verdict === 'requiere_confirmacion' ? 'puede compartir con alimentos nuevos a confirmar' : 'puede compartir adaptada'}`
                    : `${v.memberName}: ${v.status === 'no_apta' ? '⚠️ no apta' : v.status === 'apta_con_cambios' ? 'con cambios' : 'apta'}${v.nutrition ? ` · ≈ ${v.nutrition.kcal} kcal, ${v.nutrition.proteinG} g prot por porción` : ''}${v.removed.length ? ` · sin ${v.removed.map((r) => r.name.toLowerCase()).join(', ')}` : ''}` }))) : _jsx(Body, { small: true, muted: true, children: "Agreg\u00E1 ingredientes para ver las versiones." }), errors.length ? _jsx(Notice, { tone: "danger", children: errors.map((e) => _jsxs("div", { children: ["\u2022 ", e.message] })) }) : null, warnings.length ? _jsx(Notice, { children: warnings.map((e) => _jsxs("div", { children: ["\u2022 ", e.message] })) }) : null, _jsx(Button, { title: isEdit ? 'Guardar cambios' : 'Guardar receta', disabled: hasErrors(issues), onPress: save })] }));
}
