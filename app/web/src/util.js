export const SLOT_LABEL = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena', colacion: 'Colación' };
export const SLOTS_ORDER = ['desayuno', 'colacion', 'almuerzo', 'merienda', 'cena'];
export const LOCATION_LABEL = { heladera: 'Heladera', freezer: 'Freezer', alacena: 'Alacena' };
export const STATE_LABEL = { cerrado: 'Cerrado', abierto: 'Abierto', congelado: 'Congelado', preparado: 'Preparado', descongelando: 'Descongelando' };
export const DIFFICULTY_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
export function dayLabel(iso, opts = { weekday: 'short', day: 'numeric' }) {
    const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', opts);
    return s.charAt(0).toUpperCase() + s.slice(1);
}
export function dishEmojiFor(tags, name) {
    const n = name.toLowerCase();
    if (n.includes('merluza') || n.includes('atún') || n.includes('pescado'))
        return '🐟';
    if (n.includes('hamburguesa'))
        return '🍔';
    if (n.includes('yogur'))
        return '🥣';
    if (n.includes('sándwich'))
        return '🥪';
    if (n.includes('tostada'))
        return '🥑';
    if (n.includes('lenteja'))
        return '🍲';
    if (n.includes('tortilla'))
        return '🍳';
    if (n.includes('ensalada'))
        return '🥗';
    if (n.includes('carne'))
        return '🥩';
    if (n.includes('pollo'))
        return '🍗';
    return tags.includes('desayuno') ? '☕' : '🍽️';
}
export const num = (s) => Number(s.replace(',', '.'));
