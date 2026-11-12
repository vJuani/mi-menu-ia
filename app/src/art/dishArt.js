function seeded(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => n.toFixed(1);
// ---------- Piezas ----------
const scatter = (z, rnd, n, piece) => {
    let s = '';
    const count = Math.max(5, Math.round(n * Math.min(2.2, (z.r / 50) ** 1.3)));
    for (let i = 0; i < count; i++) {
        const ang = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * z.r * 0.82;
        s += piece(z.x + Math.cos(ang) * d, z.y + Math.sin(ang) * d, rnd() * 180, i);
    }
    return s;
};
const chickenStrips = (z, rnd) => {
    let s = '';
    const n = 5;
    for (let i = 0; i < n; i++) {
        const y = z.y - z.r * 0.6 + (i * z.r * 1.2) / (n - 1);
        const x = z.x + (rnd() - 0.5) * 12;
        const w = z.r * 1.5, h = z.r * 0.28;
        s += `<g transform="rotate(${f(-25 + rnd() * 10)} ${f(x)} ${f(y)})"><rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="#E6B26A"/><rect x="${f(x - w / 2 + 3)}" y="${f(y - h / 2 + 2)}" width="${f(w - 6)}" height="${f(h * 0.45)}" rx="${f(h / 4)}" fill="#F3CE8E" opacity=".7"/>`;
        for (let k = -2; k <= 2; k++)
            s += `<line x1="${f(x + k * w / 6)}" y1="${f(y - h / 2 + 2)}" x2="${f(x + k * w / 6 + 6)}" y2="${f(y + h / 2 - 2)}" stroke="#9C5B22" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`;
        s += '</g>';
    }
    return s;
};
const beefSlices = (z, rnd) => scatter(z, rnd, 8, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><rect x="${f(x - 20)}" y="${f(y - 8)}" width="40" height="16" rx="7" fill="#7A3E26"/><rect x="${f(x - 15)}" y="${f(y - 4)}" width="30" height="7" rx="3" fill="#A65A3C"/></g>`);
const patties = (z, rnd) => {
    let s = '';
    for (const dx of [-0.35, 0.35]) {
        const x = z.x + dx * z.r * 1.3, y = z.y + (rnd() - 0.5) * 10, r = z.r * 0.55;
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#6B3420"/><circle cx="${f(x - 3)}" cy="${f(y - 3)}" r="${f(r * 0.85)}" fill="#7E432A"/>`;
        for (let i = 0; i < 9; i++) {
            const a = rnd() * 6.28, d = rnd() * r * 0.7;
            s += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="2.2" fill="#E07B39"/>`;
        }
    }
    return s;
};
const mince = (z, rnd) => scatter(z, rnd, 34, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + rnd() * 3)}" fill="#6E3B24"/>`);
const fishFillet = (z, rnd) => {
    const w = z.r * 1.8, h = z.r * 0.95;
    let s = `<g transform="rotate(${f(-12 + rnd() * 8)} ${f(z.x)} ${f(z.y)})"><ellipse cx="${f(z.x)}" cy="${f(z.y)}" rx="${f(w / 2)}" ry="${f(h / 2)}" fill="#F7EBD8"/><ellipse cx="${f(z.x - 4)}" cy="${f(z.y - 4)}" rx="${f(w / 2 - 6)}" ry="${f(h / 2 - 6)}" fill="#FFF7EA"/>`;
    for (let i = -3; i <= 3; i++)
        s += `<path d="M${f(z.x + i * w / 9)} ${f(z.y - h / 2 + 6)} q 6 ${f(h / 2)} 0 ${f(h - 12)}" stroke="#E9D6B8" stroke-width="2" fill="none"/>`;
    return s + '</g>';
};
const tunaFlakes = (z, rnd) => scatter(z, rnd, 18, (x, y, a) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="5" transform="rotate(${f(a)} ${f(x)} ${f(y)})" fill="#D99A86"/>`);
const egg = (z) => `<path d="M${f(z.x - z.r * 0.8)} ${f(z.y)} q ${f(z.r * 0.2)} ${f(-z.r * 0.9)} ${f(z.r * 0.9)} ${f(-z.r * 0.7)} q ${f(z.r * 0.8)} ${f(z.r * 0.1)} ${f(z.r * 0.7)} ${f(z.r * 0.8)} q ${f(-z.r * 0.3)} ${f(z.r * 0.7)} ${f(-z.r * 0.9)} ${f(z.r * 0.5)} q ${f(-z.r * 0.6)} ${f(-z.r * 0.1)} ${f(-z.r * 0.7)} ${f(-z.r * 0.6)}z" fill="#FFFDF7"/><circle cx="${f(z.x + 2)}" cy="${f(z.y - 2)}" r="${f(z.r * 0.32)}" fill="#F7B21B"/><circle cx="${f(z.x - 3)}" cy="${f(z.y - 6)}" r="${f(z.r * 0.09)}" fill="#FFE08A"/>`;
const cubes = (c1, c2) => (z, rnd) => scatter(z, rnd, 15, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><rect x="${f(x - 9)}" y="${f(y - 9)}" width="18" height="18" rx="4" fill="${c1}"/><rect x="${f(x - 6)}" y="${f(y - 7)}" width="9" height="6" rx="2" fill="${c2}" opacity=".8"/></g>`);
const halfMoons = (outer, inner) => (z, rnd) => scatter(z, rnd, 15, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x - 11)} ${f(y)} a11 11 0 0 1 22 0z" fill="${outer}"/><path d="M${f(x - 8)} ${f(y)} a8 8 0 0 1 16 0z" fill="${inner}"/><circle cx="${f(x - 3)}" cy="${f(y - 3)}" r="1.2" fill="${outer}" opacity=".5"/><circle cx="${f(x + 3)}" cy="${f(y - 3)}" r="1.2" fill="${outer}" opacity=".5"/></g>`);
const florets = (z, rnd) => scatter(z, rnd, 8, (x, y, a) => {
    let s = `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><rect x="${f(x - 3)}" y="${f(y)}" width="6" height="14" rx="3" fill="#8DBF6A"/>`;
    for (const [dx, dy] of [[-7, -2], [0, -7], [7, -2], [-3, 3], [4, 3], [0, -1]])
        s += `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="6" fill="${rnd() > 0.5 ? '#2F7D32' : '#3E9142'}"/>`;
    return s + '</g>';
});
const sticks = (c, c2) => (z, rnd) => scatter(z, rnd, 13, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><rect x="${f(x - 16)}" y="${f(y - 3.5)}" width="32" height="7" rx="3.5" fill="${c}"/><rect x="${f(x - 13)}" y="${f(y - 2.5)}" width="20" height="2.5" rx="1" fill="${c2}" opacity=".6"/></g>`);
const rings = (z, rnd) => scatter(z, rnd, 9, (x, y, a) => `<path d="M${f(x - 12)} ${f(y)} a12 9 0 0 1 24 0" transform="rotate(${f(a)} ${f(x)} ${f(y)})" stroke="#CDA6C9" stroke-width="3.5" fill="none" stroke-linecap="round"/>`);
const tomatoWedges = (z, rnd) => scatter(z, rnd, 8, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x - 14)} ${f(y)} a14 14 0 0 1 28 0z" fill="#D9372B"/><path d="M${f(x - 10)} ${f(y)} a10 10 0 0 1 20 0z" fill="#F0614F"/><circle cx="${f(x - 4)}" cy="${f(y - 4)}" r="1.6" fill="#FFE3A3"/><circle cx="${f(x + 4)}" cy="${f(y - 4)}" r="1.6" fill="#FFE3A3"/></g>`);
const leaves = (c1, c2, n = 10) => (z, rnd) => scatter(z, rnd, n, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x - 18)} ${f(y)} q 18 -16 36 0 q -18 16 -36 0z" fill="${rnd() > 0.5 ? c1 : c2}"/><path d="M${f(x - 15)} ${f(y)} h30" stroke="#ffffff" stroke-width="1.2" opacity=".5"/></g>`);
const potatoWedges = (z, rnd) => scatter(z, rnd, 9, (x, y, a) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x - 18)} ${f(y + 6)} q 18 -26 36 0z" fill="#D9A441"/><path d="M${f(x - 13)} ${f(y + 5)} q 13 -16 26 0z" fill="#F6D57A"/></g>`);
const grainMound = (c, dot) => (z, rnd) => {
    let s = `<ellipse cx="${f(z.x)}" cy="${f(z.y)}" rx="${f(z.r * 0.95)}" ry="${f(z.r * 0.8)}" fill="${c}"/>`;
    for (let i = 0; i < 40; i++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * z.r * 0.8;
        const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d * 0.85;
        s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="3.4" ry="1.6" transform="rotate(${f(rnd() * 180)} ${f(x)} ${f(y)})" fill="${dot}"/>`;
    }
    return s;
};
const lentils = (z, rnd) => scatter(z, rnd, 46, (x, y, a) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="4" ry="3" transform="rotate(${f(a)} ${f(x)} ${f(y)})" fill="${rnd() > 0.5 ? '#7A5230' : '#8E6239'}"/>`);
const puree = (c, c2) => (z) => `<ellipse cx="${f(z.x)}" cy="${f(z.y)}" rx="${f(z.r)}" ry="${f(z.r * 0.85)}" fill="${c}"/><path d="M${f(z.x - z.r * 0.6)} ${f(z.y)} q ${f(z.r * 0.3)} ${f(-z.r * 0.5)} ${f(z.r * 0.6)} ${f(-z.r * 0.1)} t ${f(z.r * 0.6)} ${f(z.r * 0.1)}" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${f(z.x - z.r * 0.4)} ${f(z.y + z.r * 0.3)} q ${f(z.r * 0.4)} ${f(-z.r * 0.3)} ${f(z.r * 0.8)} 0" stroke="${c2}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
const bananaSlices = (z, rnd) => scatter(z, rnd, 10, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="#FBE7A1"/><circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#FFF3C7"/><circle cx="${f(x)}" cy="${f(y)}" r="2" fill="#C9A74A"/>`);
const strawberries = (z, rnd) => scatter(z, rnd, 8, (x, y, a) => {
    let s = `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x)} ${f(y + 13)} q -14 -8 -10 -18 q 10 -6 20 0 q 4 10 -10 18z" fill="#E0303B"/><path d="M${f(x - 7)} ${f(y - 6)} l 7 -4 l 7 4 l -7 2z" fill="#3E9142"/>`;
    for (let i = 0; i < 5; i++)
        s += `<circle cx="${f(x - 5 + rnd() * 10)}" cy="${f(y - 2 + rnd() * 10)}" r="0.9" fill="#FFE08A"/>`;
    return s + '</g>';
});
const avocado = (z) => `<ellipse cx="${f(z.x)}" cy="${f(z.y)}" rx="${f(z.r * 0.8)}" ry="${f(z.r * 0.6)}" fill="#6E9A3A"/><ellipse cx="${f(z.x)}" cy="${f(z.y)}" rx="${f(z.r * 0.68)}" ry="${f(z.r * 0.5)}" fill="#C8DD84"/><circle cx="${f(z.x + 4)}" cy="${f(z.y)}" r="${f(z.r * 0.2)}" fill="#8B5A2B"/>`;
const blobs = (c, c2) => (z, rnd) => scatter(z, rnd, 4, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(11 + rnd() * 6)}" fill="${c}"/><circle cx="${f(x - 3)}" cy="${f(y - 3)}" r="5" fill="${c2}"/>`);
const toast = (z, rnd) => scatter({ ...z, r: z.r * 0.4 }, rnd, 2, (x, y, a) => `<g transform="rotate(${f(a / 4 - 20)} ${f(x)} ${f(y)})"><rect x="${f(x - 26)}" y="${f(y - 22)}" width="52" height="44" rx="12" fill="#B9793E"/><rect x="${f(x - 21)}" y="${f(y - 17)}" width="42" height="34" rx="9" fill="#E3B67A"/></g>`);
const nutsBits = (z, rnd) => scatter(z, rnd, 9, (x, y, a) => `<path d="M${f(x - 6)} ${f(y)} q 6 -9 12 0 q -6 9 -12 0z" transform="rotate(${f(a)} ${f(x)} ${f(y)})" fill="#9A6A3A"/>`);
const generic = (c) => (z, rnd) => scatter(z, rnd, 9, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(6 + rnd() * 5)}" fill="${c}"/>`);
const BY_ID = {
    pollo: chickenStrips, pollo_cocido: chickenStrips, cerdo: beefSlices, nalga: beefSlices, carne_picada: mince,
    merluza: fishFillet, atun_lata: tunaFlakes, huevo: egg,
    calabaza: cubes('#F08A24', '#FFB866'), batata: cubes('#E5772C', '#F9A35F'),
    zapallito: halfMoons('#3F7D2C', '#D7E8A6'), berenjena: halfMoons('#4B2C5E', '#EADFC4'), brocoli: florets,
    zanahoria: sticks('#F07A1A', '#FFB060'), morron: sticks('#D7322B', '#FF7A6E'), cebolla: rings,
    tomate: tomatoWedges, lechuga: leaves('#9CCB5B', '#B6DB78'), espinaca: leaves('#2F6B2A', '#3F7D32', 9),
    papa: potatoWedges, arroz_integral: grainMound('#E9DCC0', '#C9B48E'), quinoa: grainMound('#EADBB0', '#C7A86A'),
    lentejas_cocidas: lentils, banana: bananaSlices, frutillas: strawberries, palta: avocado, manzana: cubes('#F4E3B5', '#C8352F'),
    ricota: blobs('#FFFDF5', '#F1EADA'), queso_untable: blobs('#FFF8E6', '#F2E6C8'), queso_fresco: blobs('#FFF2C2', '#F5DF97'),
    pan_integral: toast, nueces: nutsBits, tapa_tarta: toast,
};
const BY_CATEGORY = {
    carne: '#7A3E26', pollo: '#E6B26A', pescado: '#F3E4CC', huevo: '#F7B21B', lacteo: '#FFF8E6', verdura: '#6BAA4A',
    fruta: '#E85A4F', cereal: '#E9DCC0', legumbre: '#8E6239', panificado: '#D9A45E', grasa: '#C9B458', otro: '#C7A27C',
};
const HIDDEN = new Set(['sal', 'pimienta', 'aceite_oliva', 'salsa_soja', 'pimenton', 'miel', 'crema']);
const ROLE = { pollo: 0, carne: 0, pescado: 0, huevo: 0, legumbre: 1, cereal: 2, panificado: 2, verdura: 3, fruta: 4, lacteo: 5, grasa: 6, otro: 6, condimento: 7 };
function drawerFor(ing) {
    return BY_ID[ing.id] ?? (ing.category === 'carne' ? beefSlices : ing.category === 'pollo' ? chickenStrips : ing.category === 'pescado' ? fishFillet : generic(BY_CATEGORY[ing.category] ?? '#C7A27C'));
}
function visibleItems(r, ings) {
    const seen = new Set();
    return r.ingredients
        .filter((ri) => !ri.optional && !HIDDEN.has(ri.ingredientId))
        .map((ri) => ings.get(ri.ingredientId))
        .filter((i) => !!i && !i.tags.includes('basico') && i.category !== 'condimento' && !seen.has(i.id) && !!seen.add(i.id))
        .sort((a, b) => (ROLE[a.category] ?? 9) - (ROLE[b.category] ?? 9));
}
const W = 400, H = 300;
const backdrop = (id) => `<defs><radialGradient id="bg${id}" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#F6EBDC"/><stop offset="1" stop-color="#E4D2BB"/></radialGradient><radialGradient id="pl${id}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEEAE3"/></radialGradient><filter id="sh${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#6B4E2E" flood-opacity=".28"/></filter></defs><rect width="${W}" height="${H}" fill="url(#bg${id})"/><g opacity=".18" stroke="#B48A5E" stroke-width="2">${[40, 95, 150, 205, 260].map((y) => `<path d="M0 ${y} Q 200 ${y + 10} 400 ${y - 4}" fill="none"/>`).join('')}</g>`;
const plate = (id) => `<ellipse cx="200" cy="152" rx="150" ry="132" fill="url(#pl${id})" filter="url(#sh${id})"/><ellipse cx="200" cy="152" rx="122" ry="106" fill="none" stroke="#E2DCD2" stroke-width="2"/>`;
const bowl = (id, fill) => `<ellipse cx="200" cy="155" rx="140" ry="125" fill="#FFFFFF" filter="url(#sh${id})"/><ellipse cx="200" cy="155" rx="124" ry="110" fill="#EDE6DA"/><ellipse cx="200" cy="158" rx="114" ry="100" fill="${fill}"/>`;
const herbs = (rnd, cx, cy, r) => { let s = ''; for (let i = 0; i < 18; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r;
    s += `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r="1.6" fill="#4C7A2B"/>`;
} return s; };
const pepper = (rnd, cx, cy, r) => { let s = ''; for (let i = 0; i < 14; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r;
    s += `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r="1.1" fill="#2B2B2B" opacity=".7"/>`;
} return s; };
const lemon = (x, y) => `<g transform="rotate(-20 ${x} ${y})"><path d="M${x - 22} ${y} a22 22 0 0 1 44 0z" fill="#F4D03F"/><path d="M${x - 18} ${y} a18 18 0 0 1 36 0z" fill="#FBEA8C"/>${[-60, -30, 0, 30, 60].map((a) => `<line x1="${x}" y1="${y}" x2="${f(x + Math.sin((a * Math.PI) / 180) * 16)}" y2="${f(y - Math.cos((a * Math.PI) / 180) * 16)}" stroke="#F4D03F" stroke-width="1.5"/>`).join('')}</g>`;
export function dishSvg(recipe, ingredients) {
    const rnd = seeded(recipe.id + recipe.name);
    const id = Math.floor(rnd() * 1e6).toString(36);
    const items = visibleItems(recipe, ingredients);
    const has = (x) => recipe.ingredients.some((ri) => ri.ingredientId === x);
    const n = recipe.name.toLowerCase();
    let body = '';
    if (n.includes('sándwich') || n.includes('sandwich')) {
        body = `${plate(id)}<g transform="rotate(-8 200 150)"><path d="M110 200 L200 80 L290 200 Z" fill="#B9793E"/><path d="M122 196 L200 94 L278 196 Z" fill="#E3B67A"/><path d="M118 200 Q200 214 282 200 L282 212 Q200 226 118 212Z" fill="#9CCB5B"/><path d="M114 206 Q200 222 286 206 L286 214 Q200 232 114 214Z" fill="#E6B26A"/><path d="M116 214 Q200 230 284 214 L284 222 Q200 238 116 222Z" fill="#D9372B"/></g>`;
    }
    else if (n.includes('tortilla')) {
        body = `${plate(id)}<circle cx="200" cy="150" r="95" fill="#E7B54A"/><circle cx="200" cy="150" r="88" fill="#F2CC66"/>${scatter({ x: 200, y: 150, r: 85 }, rnd, 20, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + rnd() * 3)}" fill="${rnd() > 0.5 ? '#3F7D32' : '#7CB65A'}"/>`)}<path d="M200 150 L295 150 A95 95 0 0 1 267 217 Z" fill="none" stroke="#FFFFFF" stroke-width="5"/>`;
    }
    else if (n.includes('tostada')) {
        body = `${plate(id)}<g transform="rotate(-12 150 150)"><rect x="90" y="95" width="115" height="105" rx="24" fill="#B9793E"/><rect x="100" y="105" width="95" height="85" rx="18" fill="#E3B67A"/><path d="M106 120 q40 -14 82 0 v55 q-40 14 -82 0z" fill="#FFFDF5"/>${avocado({ x: 147, y: 150, r: 34 }, rnd)}</g><g transform="rotate(10 255 150)"><rect x="200" y="100" width="115" height="105" rx="24" fill="#B9793E"/><rect x="210" y="110" width="95" height="85" rx="18" fill="#E3B67A"/><path d="M216 125 q40 -14 82 0 v55 q-40 14 -82 0z" fill="#C8DD84"/>${has('tomate') ? tomatoWedges({ x: 257, y: 152, r: 22 }, rnd) : ''}</g>`;
    }
    else if (has('yogur_griego') || has('yogur_natural') || /guiso|sopa|lentejas|bowl/.test(n)) {
        const isYogur = has('yogur_griego') || has('yogur_natural');
        const rest = items.filter((i) => i.category !== 'lacteo' && i.id !== 'lentejas_cocidas');
        body = bowl(id, isYogur ? '#FBF8F2' : '#B8673A');
        if (!isYogur)
            body += lentils({ x: 200, y: 158, r: 95 }, rnd);
        const k = Math.max(rest.length, 1);
        rest.forEach((ing, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / k;
            const z = { x: 200 + Math.cos(a) * (k > 1 ? 52 : 0), y: 158 + Math.sin(a) * (k > 1 ? 46 : 0), r: k > 1 ? 46 : 70 };
            body += drawerFor(ing)(z, rnd);
        });
        if (!isYogur)
            body += herbs(rnd, 200, 158, 80);
        if (has('nueces'))
            body += nutsBits({ x: 200, y: 158, r: 70 }, rnd);
    }
    else {
        body = plate(id);
        const main = items.slice(0, 5);
        const LAYOUTS = [
            [],
            [{ x: 200, y: 152, r: 82 }],
            [{ x: 150, y: 152, r: 64 }, { x: 258, y: 152, r: 58 }],
            [{ x: 148, y: 152, r: 62 }, { x: 258, y: 108, r: 46 }, { x: 258, y: 200, r: 46 }],
            [{ x: 145, y: 152, r: 60 }, { x: 245, y: 95, r: 38 }, { x: 278, y: 155, r: 38 }, { x: 240, y: 212, r: 38 }],
            [{ x: 140, y: 150, r: 56 }, { x: 222, y: 85, r: 33 }, { x: 278, y: 125, r: 33 }, { x: 276, y: 190, r: 33 }, { x: 215, y: 220, r: 33 }],
        ];
        const zones = LAYOUTS[main.length] ?? [];
        const burger = n.includes('hamburguesa');
        const pure = n.includes('puré') || n.includes('pure');
        main.forEach((ing, i) => {
            const d = burger && ing.id === 'carne_picada' ? patties
                : pure && (ing.id === 'calabaza' || ing.id === 'batata') ? puree('#F3A03A', '#F8C278')
                    : pure && ing.id === 'papa' ? puree('#F3DE9B', '#FFF0C4') : drawerFor(ing);
            body += d(zones[i], rnd);
        });
        if (has('oregano'))
            body += herbs(rnd, 200, 152, 95);
        if (has('pimienta'))
            body += pepper(rnd, 175, 150, 60);
        if (has('limon'))
            body += lemon(290, 225);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${recipe.name.replace(/"/g, '')}">${backdrop(id)}${body}</svg>`;
}
export function dishDataUri(recipe, ingredients) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dishSvg(recipe, ingredients))}`;
}
