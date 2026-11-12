const NUM_WORDS = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
    nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, medio: 0.5, media: 0.5,
    'un cuarto': 0.25, 'un par': 2, 'una docena': 12, 'media docena': 6, 'kilo y medio': 1.5,
};
const UNIT_WORDS = [
    [/^(kilos?|kg|kgs)\b/, 'kg', 1],
    [/^(gramos?|grs?|g)\b/, 'g', 1],
    [/^(litros?|lts?|l)\b/, 'l', 1],
    [/^(mililitros?|ml|cc)\b/, 'ml', 1],
    [/^(unidades?|u|un)\b/, 'un', 1],
    [/^(docenas?)\b/, 'un', 12],
];
export function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function singular(w) {
    if (w.endsWith('ces'))
        return w.slice(0, -3) + 'z';
    if (w.endsWith('nes') || w.endsWith('res') || w.endsWith('les'))
        return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss'))
        return w.slice(0, -1);
    return w;
}
function singularPhrase(p) { return p.split(' ').map(singular).join(' '); }
const LEAD = /^(tengo|hay|compre|compramos|quedan?|queda|me quedan?|agregar|sumar|traje)\s+/;
export function splitItems(text) {
    return normalize(text)
        .replace(/\b(?:un )?(kilo|litro) y medio\b/g, (_m, u) => `1.5 ${u}`)
        .replace(LEAD, '')
        .split(/,|;|\s+y\s+|\s+e\s+|\n/)
        .map((s) => s.replace(LEAD, '').trim())
        .filter(Boolean);
}
export function matchIngredient(name, ingredients) {
    const target = singularPhrase(normalize(name));
    let best;
    for (const ing of ingredients) {
        for (const cand of [ing.name, ...ing.aliases]) {
            const c = singularPhrase(normalize(cand));
            if (target === c || target.includes(c) || (c.includes(target) && target.length >= 4)) {
                const len = target === c ? 1000 : c.length;
                if (!best || len > best.len)
                    best = { ing, len };
            }
        }
    }
    return best?.ing;
}
export function parseItem(chunk, ingredients) {
    let rest = chunk.trim();
    let qty = null;
    let unit = null;
    // "kilo y medio de ..."
    const phrases = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length);
    const numMatch = rest.match(/^(\d+(?:[.,]\d+)?)\s*/);
    if (numMatch) {
        qty = Number(numMatch[1].replace(',', '.'));
        rest = rest.slice(numMatch[0].length);
    }
    else {
        for (const p of phrases) {
            if (rest === p || rest.startsWith(p + ' ')) {
                qty = NUM_WORDS[p];
                rest = rest.slice(p.length).trim();
                if (p === 'una docena' || p === 'media docena')
                    unit = 'un';
                break;
            }
        }
    }
    if (/^kilo y medio\b/.test(rest)) {
        qty = (qty ?? 1) * 1.5;
        unit = 'kg';
        rest = rest.replace(/^kilo y medio\s*/, '');
    }
    for (const [re, u, mult] of UNIT_WORDS) {
        const m = rest.match(re);
        if (m && (qty !== null || u !== 'un')) {
            unit = u;
            qty = (qty ?? 1) * mult;
            rest = rest.slice(m[0].length).trim();
            if (/^y medio\b/.test(rest)) {
                qty += 0.5 * mult;
                rest = rest.replace(/^y medio\s*/, '');
            }
            break;
        }
    }
    rest = rest.replace(/^(de|del|de la|de los|de las)\s+/, '').trim();
    const ing = matchIngredient(rest, ingredients);
    if (qty !== null && unit === null)
        unit = 'un';
    return {
        raw: chunk,
        name: ing?.name ?? rest,
        qty,
        unit,
        ingredientId: ing?.id,
        confidence: ing && qty !== null ? 'alta' : 'baja',
    };
}
export function parseInventoryText(text, ingredients) {
    return splitItems(text).map((c) => parseItem(c, ingredients)).filter((p) => p.name.length > 0);
}
