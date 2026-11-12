import { DEMO_MEMBERS, DEMO_RECIPES, INGREDIENTS } from './catalog.js';
import { addDays } from '../domain/planner.js';
export async function seedBase(repo) {
    const done = await repo.getSetting('seed.base', false);
    if (done)
        return;
    for (const i of INGREDIENTS)
        await repo.saveIngredient(i);
    for (const m of DEMO_MEMBERS)
        await repo.saveMember(m);
    // Helena: el inicio de alimentación complementaria y las señales NO se asumen.
    await repo.saveBabyProfile({ memberId: 'helena', startedComplementary: false, readinessSigns: false, allowedTextures: ['pure', 'pisado'] });
    for (const r of DEMO_RECIPES)
        await repo.saveRecipe(r);
    await repo.setSetting('seed.base', true);
}
/** Inventario y plan de ejemplo (borrables). Fechas relativas a `todayISO`. */
export async function seedDemo(repo, todayISO) {
    const lots = [
        ['pollo', 1200, 'g', 'freezer', 'congelado'],
        ['calabaza', 1, 'un', 'alacena', 'cerrado'],
        ['zapallito', 4, 'un', 'heladera', 'cerrado'],
        ['yogur_griego', 4, 'un', 'heladera', 'cerrado'],
        ['carne_picada', 500, 'g', 'freezer', 'congelado'],
        ['zanahoria', 5, 'un', 'heladera', 'cerrado'],
        ['cebolla', 3, 'un', 'alacena', 'cerrado'],
        ['banana', 4, 'un', 'alacena', 'cerrado'],
        ['aceite_oliva', 500, 'ml', 'alacena', 'abierto'],
        ['lentejas_cocidas', 400, 'g', 'heladera', 'abierto'],
    ];
    for (const [ingredientId, qty, unit, location, state] of lots) {
        await repo.addLot({ ingredientId, qty, unit, location, state }, { isDemo: true });
    }
    const plan = [
        [0, 'desayuno', 'yogur_proteico_fruta'], [0, 'almuerzo', 'pollo_calabaza_zapallitos'], [0, 'merienda', 'sandwich_pollo'], [0, 'cena', 'hamburguesas_verduras'],
        [1, 'desayuno', 'tostadas_ricota_palta'], [1, 'almuerzo', 'ensalada_atun'], [1, 'cena', 'merluza_pure_calabaza'],
        [2, 'almuerzo', 'lentejas_guisadas'], [2, 'cena', 'salteado_pollo_verduras'],
        [3, 'almuerzo', 'carne_salteada_vegetales'], [3, 'cena', 'pollo_calabaza_zapallitos'],
    ];
    for (const [d, slot, recipeId] of plan) {
        const meal = {
            id: `demo_${d}_${slot}`, date: addDays(todayISO, d), slot, recipeId, memberIds: ['yo', 'ro'],
            portionsByMember: { yo: 1.3, ro: 1 }, forOffice: recipeId === 'ensalada_atun' || undefined, status: 'planificada', substitutions: {},
        };
        await repo.saveMeal(meal, true);
    }
}
