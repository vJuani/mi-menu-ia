import { normalize } from './textParser.js';
import { convert } from './units.js';
export const RECIPE_TAGS = [
    { id: 'desayuno', label: 'Desayuno' }, { id: 'merienda', label: 'Merienda' }, { id: 'principal', label: 'Almuerzo/cena' },
    { id: 'colacion', label: 'Colación' }, { id: 'vianda', label: 'Vianda' }, { id: 'rapida', label: 'Rápida' },
    { id: 'proteico', label: 'Proteica' }, { id: 'lote', label: 'Por lote' }, { id: 'economico', label: 'Económica' }, { id: 'liviana', label: 'Liviana' },
];
export function slugify(name) {
    return normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'receta';
}
export function uniqueId(base, taken) {
    const set = new Set(taken);
    if (!set.has(base))
        return base;
    let i = 2;
    while (set.has(`${base}_${i}`))
        i++;
    return `${base}_${i}`;
}
export function emptyDraft() {
    return { id: '', name: '', totalMinutes: 30, difficulty: 'facil', servings: 2, ingredients: [], steps: [], utensils: [], tags: ['principal'], babyTextures: [] };
}
/** Copia editable de una receta existente, con nuevo id y sin marca de demo. */
export function duplicateRecipe(r, takenIds) {
    const name = `${r.name} (copia)`;
    return {
        ...r, id: uniqueId(slugify(name), takenIds), name, isDemo: false, archived: false,
        ingredients: r.ingredients.map((i) => ({ ...i })), steps: r.steps.map((s) => ({ ...s })),
        utensils: [...r.utensils], tags: [...r.tags], babyTextures: r.babyTextures ? [...r.babyTextures] : undefined,
    };
}
/** Renumera pasos 1..n después de mover o borrar. */
export function renumberSteps(steps) {
    return steps.map((s, i) => ({ ...s, order: i + 1 }));
}
export function moveItem(xs, from, to) {
    if (to < 0 || to >= xs.length)
        return xs;
    const out = [...xs];
    const [it] = out.splice(from, 1);
    out.splice(to, 0, it);
    return out;
}
const SPLIT_TAGS = ['sal', 'azucar', 'alto_sodio', 'picante', 'alcohol', 'edulcorante'];
export function validateRecipeDraft(r, ingredients) {
    const out = [];
    const err = (field, message) => out.push({ level: 'error', field, message });
    const warn = (field, message) => out.push({ level: 'aviso', field, message });
    if (!r.name.trim())
        err('name', 'Poné un nombre.');
    if (!(r.servings > 0))
        err('servings', 'Las porciones deben ser mayores a cero.');
    if (!(r.totalMinutes > 0))
        err('totalMinutes', 'Indicá el tiempo total.');
    if (!r.tags.some((t) => ['desayuno', 'merienda', 'principal', 'colacion'].includes(t)))
        err('tags', 'Elegí al menos un momento del día (desayuno, merienda, almuerzo/cena o colación).');
    if (r.ingredients.length === 0)
        err('ingredients', 'Agregá al menos un ingrediente.');
    if (r.steps.filter((s) => s.text.trim()).length === 0)
        err('steps', 'Agregá al menos un paso.');
    const seen = new Set();
    r.ingredients.forEach((ri, i) => {
        const ing = ingredients.get(ri.ingredientId);
        const f = `ingredients.${i}`;
        if (!ing) {
            err(f, `Ingrediente desconocido (${ri.ingredientId}).`);
            return;
        }
        if (!(ri.qty > 0))
            err(f, `${ing.name}: la cantidad debe ser mayor a cero.`);
        if (convert(1, ri.unit, ing.defaultUnit, ing) === null)
            err(f, `${ing.name}: no se puede convertir ${ri.unit} a ${ing.defaultUnit}. Usá ${ing.defaultUnit === 'un' ? 'unidades' : ing.defaultUnit === 'ml' || ing.defaultUnit === 'l' ? 'ml o l' : 'g o kg'}${ing.gramsPerUnit ? ' o unidades' : ''}.`);
        if (seen.has(ri.ingredientId))
            warn(f, `${ing.name} aparece dos veces: conviene sumarlo en una sola línea.`);
        seen.add(ri.ingredientId);
        if (ri.optional && ri.separable)
            warn(f, `${ing.name}: "opcional" ya implica que se sirve aparte.`);
        if (ing.per100g && ing.nutritionBasis && ing.nutritionBasis !== ri.state)
            warn(f, `${ing.name}: la nutrición está cargada en ${ing.nutritionBasis}; con peso ${ri.state} no se cuenta en las calorías.`);
    });
    r.steps.forEach((s, i) => {
        if (!s.text.trim())
            err(`steps.${i}`, `El paso ${i + 1} está vacío.`);
        if (s.timerSec !== undefined && !(s.timerSec > 0))
            err(`steps.${i}`, `Paso ${i + 1}: el temporizador debe ser mayor a cero.`);
    });
    // Helena
    const wantsBaby = (r.babyTextures?.length ?? 0) > 0;
    if (wantsBaby) {
        const inBase = r.ingredients.filter((ri) => !ri.addedAfterBabySplit && !ri.optional && ingredients.get(ri.ingredientId)?.tags.some((t) => SPLIT_TAGS.includes(t)));
        for (const ri of inBase)
            warn('baby', `${ingredients.get(ri.ingredientId).name} está en la base: Helena no podrá compartirla. Marcalo como "después de separar a Helena" si se agrega al final.`);
        if (!r.steps.some((s) => s.babySplit))
            warn('baby', 'Marcá el paso en que se separa la porción de Helena.');
        const hard = r.ingredients.filter((ri) => !ri.addedAfterBabySplit && !ri.optional && ingredients.get(ri.ingredientId)?.tags.some((t) => ['miel', 'riesgo_atragantamiento', 'crudo_riesgo', 'alto_mercurio'].includes(t)));
        for (const ri of hard)
            warn('baby', `${ingredients.get(ri.ingredientId).name} no es apto para Helena: la receta quedará bloqueada para ella.`);
    }
    if (r.steps.some((s) => s.babySplit) && !wantsBaby)
        warn('baby', 'Hay un paso de separación para Helena pero no elegiste ninguna textura.');
    return out;
}
export function hasErrors(issues) {
    return issues.some((i) => i.level === 'error');
}
/** Limpia el borrador antes de guardar: pasos vacíos fuera, orden 1..n, utensilios sin espacios. */
export function finalizeDraft(r, takenIds) {
    const id = r.id || uniqueId(slugify(r.name), takenIds);
    return {
        ...r, id, name: r.name.trim(), isDemo: false,
        steps: renumberSteps(r.steps.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim(), tip: s.tip?.trim() || undefined }))),
        utensils: r.utensils.map((u) => u.trim()).filter(Boolean),
        storage: r.storage?.trim() || undefined,
        babyTextures: r.babyTextures?.length ? r.babyTextures : undefined,
    };
}
// ---------- Ingredientes propios ----------
export const ALLERGENS = ['huevo', 'leche', 'pescado', 'mariscos', 'mani', 'frutos_secos', 'soja', 'trigo', 'sesamo'];
/** Palabras clave → etiquetas. Es una ayuda: el usuario confirma en el formulario. */
const KEYWORDS = [
    [/\bmiel\b/, ['miel', 'azucar']],
    [/\b(sal|salad[oa]s?|caldo|cubito|embutid|jamon|salame|chorizo|salchich|panceta|fiambre|aceitunas?)/, ['alto_sodio']],
    [/\b(salchich|uvas?|pochoclo|palomitas|caramelo|chicle|nuez|nueces|almendras?|avellanas?|castanas?|pistachos?|mani\b|garrapinada)/, ['riesgo_atragantamiento']],
    [/\b(azucar|dulce de leche|mermelada|chocolate|galletit|gaseosa|jugo en polvo)/, ['azucar']],
    [/\b(edulcorante|stevia|sucralosa)/, ['edulcorante']],
    [/\b(picante|aji molido|chile|jalape)/, ['picante']],
    [/\b(vino|cerveza|licor|ron)\b/, ['alcohol']],
    [/\b(sushi|tartar|crud[oa]|ceviche)/, ['crudo_riesgo']],
    [/\b(pez espada|tiburon|atun rojo|blanquillo)/, ['alto_mercurio']],
    [/\bhuevos?\b|\bclaras?\b|\byemas?\b|mayonesa/, ['huevo', 'alergeno:huevo']],
    [/\b(leche|queso|yogur|manteca|crema|ricota)/, ['alergeno:leche']],
    [/\b(merluza|salmon|atun|pescado|abadejo|lenguado|trucha|sardina)/, ['alergeno:pescado']],
    [/\b(langostin|camaron|calamar|mejillon|mariscos?)/, ['alergeno:mariscos']],
    [/\bmani\b/, ['mani', 'alergeno:mani']],
    [/\b(nuez|nueces|almendra|avellana|castana|pistacho|caju)/, ['alergeno:frutos_secos']],
    [/\bsoja\b|\btofu\b/, ['alergeno:soja']],
    [/\b(harina|pan\b|fideo|pasta|masa|tapa de|rebozador|galleta)/, ['harina', 'alergeno:trigo']],
    [/\bsesamo\b/, ['alergeno:sesamo']],
    [/\barroz\b/, ['arroz']],
    [/\bpapas?\b/, ['papa']],
    [/\bavena\b/, ['avena']],
];
export function inferTags(name) {
    const n = normalize(name);
    const tags = new Set();
    for (const [re, ts] of KEYWORDS)
        if (re.test(n))
            ts.forEach((t) => tags.add(t));
    return [...tags];
}
export function flagsFromTags(tags) {
    return {
        sal: tags.includes('alto_sodio') || tags.includes('sal'),
        azucar: tags.includes('azucar'),
        miel: tags.includes('miel'),
        atragantamiento: tags.includes('riesgo_atragantamiento'),
        crudo: tags.includes('crudo_riesgo'),
        allergens: ALLERGENS.filter((a) => tags.includes(`alergeno:${a}`)),
    };
}
export function buildCustomIngredient(input, takenIds) {
    const name = input.name.trim();
    if (!name)
        throw new Error('El ingrediente necesita un nombre.');
    if (input.defaultUnit === 'un' && input.gramsPerUnit !== undefined && !(input.gramsPerUnit > 0))
        throw new Error('Los gramos por unidad deben ser mayores a cero.');
    const tags = new Set(inferTags(name).filter((t) => !['alto_sodio', 'azucar', 'miel', 'riesgo_atragantamiento', 'crudo_riesgo'].includes(t) && !t.startsWith('alergeno:')));
    const f = input.flags;
    if (f.sal)
        tags.add('alto_sodio');
    if (f.azucar)
        tags.add('azucar');
    if (f.miel) {
        tags.add('miel');
        tags.add('azucar');
    }
    if (f.atragantamiento)
        tags.add('riesgo_atragantamiento');
    if (f.crudo)
        tags.add('crudo_riesgo');
    for (const a of f.allergens)
        tags.add(`alergeno:${a}`);
    if (f.allergens.includes('huevo'))
        tags.add('huevo');
    if (f.allergens.includes('mani'))
        tags.add('mani');
    return {
        id: uniqueId(`custom_${slugify(name)}`, takenIds),
        name,
        category: input.category,
        defaultUnit: input.defaultUnit,
        gramsPerUnit: input.gramsPerUnit,
        per100g: input.per100g,
        nutritionBasis: input.per100g ? input.nutritionBasis ?? 'crudo' : undefined,
        tags: [...tags],
        aliases: input.aliases ?? [],
    };
}
export function newIngredientLine(ing) {
    return { ingredientId: ing.id, qty: ing.defaultUnit === 'un' ? 1 : 100, unit: ing.defaultUnit === 'kg' ? 'g' : ing.defaultUnit === 'l' ? 'ml' : ing.defaultUnit, state: ing.nutritionBasis ?? 'crudo', addedAfterBabySplit: ing.tags.includes('sal') || undefined };
}
export const TEXTURES = ['pure', 'pisado', 'picado_fino', 'trozos_blandos'];
