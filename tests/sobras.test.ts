import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planLeftoverLunches, DEFAULT_LEFTOVER_CONFIG, leftoverMealId, extraPortionsNote } from '../src/domain/leftovers.ts';
import { computeShoppingList, needsForMeal } from '../src/domain/shopping.ts';
import { buildReminders, DEFAULT_REMINDER_SETTINGS } from '../src/domain/reminders.ts';
import { dishSvg } from '../src/art/dishArt.ts';
import type { PlannedMeal } from '../src/domain/types.ts';
import { openNodeDb } from './nodeDriver.ts';
import { migrate } from '../src/data/migrations.ts';
import { Repo } from '../src/data/repo.ts';
import { seedBase } from '../src/data/seed.ts';
import { ingredients, meal, members, recipes } from './helpers.ts';

const cfg = { ...DEFAULT_LEFTOVER_CONFIG };
const apply = (meals: PlannedMeal[], c = cfg, today = '2026-11-12') => {
  const { upserts, deletes } = planLeftoverLunches(meals, c, today);
  const map = new Map(meals.map((m) => [m.id, m]));
  for (const d of deletes) map.delete(d);
  for (const u of upserts) map.set(u.id, u);
  return { meals: [...map.values()], upserts, deletes };
};

describe('Almuerzo = cena del día anterior', () => {
  it('la cena suma mi porción y mi almuerzo de mañana queda vinculado', () => {
    const dinner = meal('pollo_calabaza_zapallitos', '2026-11-12', 'cena', ['yo', 'ro'], { portionsByMember: { yo: 1.3, ro: 1 } });
    const lunch = meal('ensalada_atun', '2026-11-13', 'almuerzo', ['yo', 'ro']);
    const { meals } = apply([dinner, lunch]);
    const d = meals.find((m) => m.id === dinner.id)!;
    assert.deepEqual(d.extraPortions, { yo: 1.3 });
    const left = meals.find((m) => m.id === leftoverMealId(dinner.id))!;
    assert.equal(left.date, '2026-11-13');
    assert.equal(left.recipeId, 'pollo_calabaza_zapallitos');
    assert.deepEqual(left.memberIds, ['yo']);
    assert.equal(left.forOffice, true); // viernes
    // Ro sigue con su almuerzo
    assert.deepEqual(meals.find((m) => m.id === lunch.id)!.memberIds, ['ro']);
  });

  it('las compras cuentan el doble en la cena y nada en las sobras', () => {
    const dinner = meal('pollo_calabaza_zapallitos', '2026-11-12', 'cena', ['yo'], { portionsByMember: { yo: 1 } });
    const { meals } = apply([dinner]);
    const pollo = computeShoppingList(meals, recipes, members, ingredients, []).find((l) => l.ingredientId === 'pollo')!;
    assert.equal(pollo.toBuy, 500); // 250 g por porción × (1 hoy + 1 mañana)
    const left = meals.find((m) => m.leftoverOf)!;
    assert.deepEqual(needsForMeal(left, recipes.get(left.recipeId)!, members, ingredients), []);
  });

  it('es idempotente: aplicar dos veces no cambia nada', () => {
    const { meals } = apply([meal('merluza_pure_calabaza', '2026-11-12', 'cena')]);
    const again = planLeftoverLunches(meals, cfg, '2026-11-12');
    assert.deepEqual(again, { upserts: [], deletes: [] });
  });

  it('cambiar la cena actualiza el almuerzo; borrarla lo borra', () => {
    const dinner = meal('merluza_pure_calabaza', '2026-11-12', 'cena');
    let { meals } = apply([dinner]);
    meals = meals.map((m) => (m.id === dinner.id ? { ...m, recipeId: 'carne_salteada_vegetales' } : m));
    ({ meals } = apply(meals));
    assert.equal(meals.find((m) => m.leftoverOf)!.recipeId, 'carne_salteada_vegetales');
    const r = apply(meals.filter((m) => m.id !== dinner.id));
    assert.deepEqual(r.deletes, [leftoverMealId(dinner.id)]);
  });

  it('respeta días elegidos y la opción desactivada', () => {
    const dinner = meal('merluza_pure_calabaza', '2026-11-14', 'cena'); // sábado → almuerzo del domingo
    const r1 = apply([dinner], { ...cfg, weekdays: [1, 2, 3, 4, 5] });
    assert.equal(r1.upserts.length, 0);
    const on = apply([dinner]).meals;
    const off = apply(on, { ...cfg, enabled: false });
    assert.ok(off.deletes.includes(leftoverMealId(dinner.id)));
    assert.equal(off.meals.find((m) => m.id === dinner.id)!.extraPortions, undefined);
    assert.equal(on.find((m) => m.leftoverOf)!.forOffice, undefined, 'domingo no es vianda');
  });

  it('no toca comidas ya cocinadas', () => {
    const dinner = meal('merluza_pure_calabaza', '2026-11-12', 'cena', ['yo', 'ro'], { status: 'cocinada' });
    const r = apply([dinner]);
    assert.ok(!r.upserts.some((m) => m.id === dinner.id));
    assert.ok(r.upserts.some((m) => m.leftoverOf === dinner.id), 'igual se agenda el almuerzo de sobras');
  });

  it('recordatorios: guardar el táper la noche anterior, sin "empezar a cocinar" para las sobras', () => {
    const { meals } = apply([meal('pollo_calabaza_zapallitos', '2026-11-12', 'cena')]);
    const rs = buildReminders({ now: new Date('2026-11-12T08:00:00'), meals, recipes, members, ingredients, lots: [], settings: DEFAULT_REMINDER_SETTINGS });
    const left = meals.find((m) => m.leftoverOf)!;
    assert.ok(rs.some((r) => r.key === `vianda:${left.id}` && r.title.includes('almuerzo') && r.fireAt === '2026-11-12T21:30:00'));
    assert.ok(!rs.some((r) => r.key === `empezar:${left.id}`));
    assert.match(rs.find((r) => r.key.startsWith('empezar:'))!.body, /doble/);
    assert.match(extraPortionsNote(meals.find((m) => m.slot === 'cena')!, new Map([['yo', 'Vos']]))!, /1 porción más para Vos/);
  });

  it('se guarda en SQLite (migración 4)', async () => {
    const db = openNodeDb(); await migrate(db); const repo = new Repo(db); await seedBase(repo);
    const { upserts } = apply([meal('merluza_pure_calabaza', '2026-11-12', 'cena')]);
    for (const m of upserts) await repo.saveMeal(m);
    const saved = await repo.meals();
    assert.deepEqual(saved.find((m) => m.slot === 'cena')!.extraPortions, { yo: 1 });
    assert.equal(saved.find((m) => m.slot === 'almuerzo')!.leftoverOf, upserts.find((m) => m.slot === 'cena')!.id);
  });
});

describe('Ilustraciones de platos', () => {
  it('cada receta genera un SVG válido, determinístico y distinto', () => {
    const svgs = [...recipes.values()].map((r) => dishSvg(r, ingredients));
    for (const s of svgs) { assert.match(s, /^<svg [^>]*viewBox="0 0 400 300"/); assert.ok(s.endsWith('</svg>')); assert.ok(!s.includes('NaN')); }
    assert.equal(new Set(svgs).size, svgs.length);
    const r = recipes.get('pollo_calabaza_zapallitos')!;
    assert.equal(dishSvg(r, ingredients), dishSvg(r, ingredients));
  });
  it('funciona con recetas propias e ingredientes desconocidos', () => {
    const s = dishSvg({ id: 'x', name: 'Mi plato', totalMinutes: 10, difficulty: 'facil', servings: 1, tags: [], utensils: [], steps: [], ingredients: [{ ingredientId: 'no_existe', qty: 1, unit: 'g', state: 'crudo' }] }, ingredients);
    assert.ok(s.includes('</svg>') && !s.includes('NaN'));
  });
});
