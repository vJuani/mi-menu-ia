/**
 * Las 12 pruebas obligatorias del documento de requisitos (sección 14).
 * La 10 (persistencia) está en persistencia.test.ts porque usa SQLite real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildAdultVersion, buildFamilyVersions } from '../src/domain/adaptations.ts';
import { evaluateRecipeForBaby, proposeSafeBabyAlternative } from '../src/domain/babySafety.ts';
import { availableQty, consumeConfirmed, undoOperation, verifyLedger, addPurchaseLot } from '../src/domain/inventory.ts';
import { buildReminders, DEFAULT_REMINDER_SETTINGS, reconcile, reminderHash } from '../src/domain/reminders.ts';
import type { ScheduledRecord } from '../src/domain/reminders.ts';
import { computeShoppingList, missingSentence } from '../src/domain/shopping.ts';
import { findSubstitutes, applySubstitution } from '../src/domain/substitutions.ts';
import { generateWeek, suggestRecipes } from '../src/domain/planner.ts';
import { reply } from '../src/domain/assistant.ts';
import type { InventoryLot, StockMovement } from '../src/domain/types.ts';
import { babyCtx, helena, ingredients, lot, meal, members, recipes, ro, TOLERATED, yo } from './helpers.ts';

const R = (id: string) => recipes.get(id)!;

describe('1. Planificar no descuenta inventario', () => {
  it('generar la semana y calcular compras deja los lotes intactos', () => {
    const lots = [lot('pollo', 1000, 'g'), lot('calabaza', 2, 'un'), lot('zapallito', 4, 'un')];
    const snapshot = JSON.stringify(lots);
    const week = generateWeek('2026-11-16', [...recipes.values()], [yo, ro], lots, ingredients);
    assert.ok(week.length > 0);
    computeShoppingList(week, recipes, members, ingredients, lots);
    assert.equal(JSON.stringify(lots), snapshot);
    assert.equal(availableQty('pollo', lots, 'g'), 1000);
  });
});

describe('2. Confirmar cocción descuenta solo lo confirmado', () => {
  it('descuenta la cantidad real usada, en orden de consumo, y se puede deshacer', () => {
    const a = lot('pollo', 300, 'g', { state: 'abierto' });
    const b = lot('pollo', 1000, 'g', { state: 'congelado', location: 'freezer' });
    const c = lot('zapallito', 4, 'un');
    const lots = [a, b, c];
    const seed: StockMovement[] = lots.map((l) => ({ id: 'm_' + l.id, lotId: l.id, ingredientId: l.ingredientId, delta: l.qty, kind: 'compra', createdAt: '', operationId: 'seed' }));

    // La receta pedía 500 g de pollo, pero el usuario confirma que usó 480 g y 2 zapallitos.
    const res = consumeConfirmed(lots, [{ ingredientId: 'pollo', qty: 480, unit: 'g' }, { ingredientId: 'zapallito', qty: 2, unit: 'un' }], ingredients, 'op1');
    assert.equal(res.shortfalls.length, 0);
    assert.equal(res.lots.find((l) => l.id === a.id)!.qty, 0, 'primero el lote abierto');
    assert.equal(res.lots.find((l) => l.id === b.id)!.qty, 820);
    assert.equal(res.lots.find((l) => l.id === c.id)!.qty, 2);
    const ledger = [...seed, ...res.movements];
    assert.deepEqual(verifyLedger(res.lots, ledger), []);

    const undo = undoOperation(res.lots, ledger, 'op1');
    assert.equal(availableQty('pollo', undo.lots, 'g'), 1300);
    assert.equal(availableQty('zapallito', undo.lots, 'un'), 4);
    assert.deepEqual(verifyLedger(undo.lots, [...ledger, ...undo.reversals]), []);
  });

  it('convierte unidades (kg ↔ g, un ↔ g) y nunca deja stock negativo', () => {
    const lots = [lot('pollo', 0.5, 'kg'), lot('calabaza', 1, 'un')];
    const res = consumeConfirmed(lots, [{ ingredientId: 'pollo', qty: 700, unit: 'g' }, { ingredientId: 'calabaza', qty: 600, unit: 'g' }], ingredients, 'op');
    assert.equal(res.lots[0].qty, 0);
    assert.deepEqual(res.shortfalls, [{ ingredientId: 'pollo', missing: 200, unit: 'g' }]);
    assert.equal(res.lots[1].qty, 0.5); // 1 calabaza = 1200 g → quedan 600 g = 0,5 un
  });
});

describe('3. Eliminar una comida ajusta los recordatorios', () => {
  it('cancela los recordatorios de la comida eliminada', () => {
    const now = new Date('2026-11-12T10:00:00');
    const lots: InventoryLot[] = [lot('pollo', 1000, 'g', { state: 'congelado', location: 'freezer' })];
    const m = meal('pollo_calabaza_zapallitos', '2026-11-14', 'cena');
    const input = { now, recipes, members, ingredients, lots, settings: DEFAULT_REMINDER_SETTINGS };
    const first = buildReminders({ ...input, meals: [m] });
    const keys = first.map((r) => r.key);
    assert.ok(keys.includes(`empezar:${m.id}`));
    assert.ok(keys.includes(`descongelar:${m.id}:pollo`));
    assert.ok(keys.includes('faltantes:2026-11-14'));
    const scheduled: ScheduledRecord[] = first.map((r, i) => ({ key: r.key, osId: `os${i}`, hash: reminderHash(r) }));

    const after = buildReminders({ ...input, meals: [] });
    const diff = reconcile(after, scheduled);
    const cancelled = diff.toCancel.map((s) => s.key);
    for (const k of keys.filter((k) => !k.startsWith('peso:'))) assert.ok(cancelled.includes(k), `debe cancelar ${k}`);
    assert.equal(diff.toSchedule.length, 0);
  });
});

describe('4. "No tengo" busca variantes válidas', () => {
  it('ofrece reemplazos del mismo grupo, priorizando lo que hay en casa', () => {
    const lots = [lot('brocoli', 1, 'un')];
    const subs = findSubstitutes('zapallito', { memberIds: ['yo', 'ro'] }, members, ingredients, lots);
    const ids = subs.map((s) => s.ingredient.id);
    assert.equal(ids[0], 'brocoli', 'primero lo que está en casa');
    assert.ok(ids.includes('berenjena'));
    assert.ok(!ids.includes('huevo'));
  });

  it('nunca propone algo que un adulto excluye', () => {
    // Si existiera un reemplazo con huevo en el mismo grupo, debe filtrarse.
    const fakeIngs = new Map(ingredients);
    fakeIngs.set('omelette', { id: 'omelette', name: 'Omelette', category: 'huevo', defaultUnit: 'un', tags: ['huevo', 'grupo:proteina_magra'], aliases: [] });
    const subs = findSubstitutes('pollo', { memberIds: ['yo', 'ro'] }, members, fakeIngs, []);
    assert.ok(!subs.some((s) => s.ingredient.id === 'omelette'));
    assert.ok(subs.some((s) => s.ingredient.id === 'nalga'));
  });

  it('si Helena comparte, se marcan alimentos nuevos y se bloquean los inseguros', () => {
    const ctx = babyCtx({ ...TOLERATED });
    const subs = findSubstitutes('pollo', { memberIds: ['yo', 'ro', 'helena'] }, members, ingredients, [], ctx);
    const nalga = subs.find((s) => s.ingredient.id === 'nalga')!;
    assert.equal(nalga.babyNeedsConfirmation, true);
    const fakeIngs = new Map(ingredients);
    fakeIngs.set('salchicha', { id: 'salchicha', name: 'Salchicha', category: 'carne', defaultUnit: 'un', tags: ['grupo:proteina_magra', 'riesgo_atragantamiento', 'alto_sodio'], aliases: [] });
    const subs2 = findSubstitutes('pollo', { memberIds: ['yo', 'helena'] }, members, fakeIngs, [], { ...ctx, ingredients: fakeIngs });
    assert.ok(!subs2.some((s) => s.ingredient.id === 'salchicha'));
  });

  it('aplicar la sustitución actualiza receta, nutrición y lista de compras', () => {
    const m = meal('pollo_calabaza_zapallitos', '2026-11-14', 'cena');
    const before = computeShoppingList([m], recipes, members, ingredients, []);
    const m2 = applySubstitution(m, 'zapallito', 'brocoli');
    const after = computeShoppingList([m2], recipes, members, ingredients, []);
    assert.ok(before.some((l) => l.ingredientId === 'zapallito'));
    assert.ok(!after.some((l) => l.ingredientId === 'zapallito'));
    assert.ok(after.some((l) => l.ingredientId === 'brocoli'));
    const v1 = buildAdultVersion(R('pollo_calabaza_zapallitos'), yo, 1, ingredients, m.substitutions);
    const v2 = buildAdultVersion(R('pollo_calabaza_zapallitos'), yo, 1, ingredients, m2.substitutions);
    assert.notEqual(v1.nutrition!.kcal, v2.nutrition!.kcal);
  });
});

describe('5. Receta con huevo: se excluye de mi plato', () => {
  it('huevo opcional no aparece en mi versión', () => {
    const v = buildAdultVersion(R('salteado_pollo_verduras'), yo, 1, ingredients);
    assert.ok(!v.lines.some((l) => l.ingredientId === 'huevo'));
    assert.notEqual(v.status, 'no_apta');
  });
  it('si el huevo es la base, la receta no es apta para mí y el planificador no la propone para todos', () => {
    assert.equal(buildAdultVersion(R('tortilla_verduras'), yo, 1, ingredients).status, 'no_apta');
    const s = suggestRecipes([...recipes.values()], [yo, ro], [], ingredients, { slot: 'cena' });
    assert.ok(!s.some((x) => x.recipe.id === 'tortilla_verduras'));
  });
  it('avena y mantequilla de maní también quedan excluidas', () => {
    const v = buildAdultVersion({ ...R('yogur_proteico_fruta'), ingredients: [...R('yogur_proteico_fruta').ingredients, { ingredientId: 'avena', qty: 40, unit: 'g', state: 'crudo', separable: true }, { ingredientId: 'mani', qty: 15, unit: 'g', state: 'crudo', separable: true }] }, yo, 1, ingredients);
    assert.ok(!v.lines.some((l) => l.ingredientId === 'avena' || l.ingredientId === 'mani'));
  });
});

describe('6. Ro desea huevo: solo en su versión', () => {
  it('el huevo opcional se suma únicamente a Ro', () => {
    const plan = buildFamilyVersions(R('salteado_pollo_verduras'), [yo, ro], { yo: 1.3, ro: 1 }, ingredients);
    const vRo = plan.versions.find((v) => v.memberId === 'ro')!;
    const vYo = plan.versions.find((v) => v.memberId === 'yo')!;
    assert.ok(vRo.lines.some((l) => l.ingredientId === 'huevo' && l.extra));
    assert.ok(!vYo.lines.some((l) => l.ingredientId === 'huevo'));
    // Ro prefiere evitar arroz: se quita de su plato (es separable), a mí se me mantiene.
    assert.ok(!vRo.lines.some((l) => l.ingredientId === 'arroz_integral'));
    assert.ok(vYo.lines.some((l) => l.ingredientId === 'arroz_integral'));
    // Porciones por persona: 450 g / 2 porciones × 1,3
    assert.equal(Math.round(vYo.lines.find((l) => l.ingredientId === 'pollo')!.qty), 293);
  });
  it('las compras incluyen el huevo solo por la porción de Ro', () => {
    const list = computeShoppingList([meal('salteado_pollo_verduras', '2026-11-14', 'cena')], recipes, members, ingredients, []);
    assert.equal(list.find((l) => l.ingredientId === 'huevo')!.toBuy, 1); // 2 huevos / 2 porciones × 1 persona
  });
});

describe('7. Receta adulta inadecuada para Helena: bloqueo + alternativa segura', () => {
  it('ensalada con atún (sodio, sin textura) se bloquea y se propone otra apta', () => {
    const ctx = babyCtx({ ...TOLERATED });
    const ev = evaluateRecipeForBaby(R('ensalada_atun'), ctx);
    assert.equal(ev.verdict, 'bloqueado');
    const alt = proposeSafeBabyAlternative(R('ensalada_atun'), [...recipes.values()], ctx);
    assert.ok(alt);
    assert.ok(['apto', 'apto_con_adaptacion'].includes(alt!.evaluation.verdict));
    assert.equal(alt!.evaluation.newFoods.length, 0);
    const plan = buildFamilyVersions(R('ensalada_atun'), [yo, ro, helena], {}, ingredients, ctx);
    assert.equal(plan.babyNeedsSeparateMeal, true);
  });
  it('miel bloqueada antes de los 12 meses aunque sea "solo un poquito"', () => {
    const ctx = babyCtx({ ...TOLERATED, miel: 'tolerado' });
    const r = { ...R('yogur_proteico_fruta'), ingredients: [{ ingredientId: 'banana', qty: 1, unit: 'un' as const, state: 'crudo' as const }, { ingredientId: 'miel', qty: 5, unit: 'g' as const, state: 'crudo' as const }] };
    const ev = evaluateRecipeForBaby(r, ctx);
    assert.equal(ev.verdict, 'bloqueado');
    assert.ok(ev.issues.some((i) => i.code === 'miel'));
  });
  it('sal en la base bloquea; sal agregada después de separar la porción es apta', () => {
    const ctx = babyCtx({ ...TOLERATED });
    const ok = evaluateRecipeForBaby(R('pollo_calabaza_zapallitos'), ctx);
    assert.equal(ok.verdict, 'apto_con_adaptacion');
    assert.ok(ok.excludedFromBabyPortion.includes('sal'));
    const salted = { ...R('pollo_calabaza_zapallitos'), ingredients: R('pollo_calabaza_zapallitos').ingredients.map((i) => i.ingredientId === 'sal' ? { ...i, addedAfterBabySplit: false } : i) };
    assert.equal(evaluateRecipeForBaby(salted, ctx).verdict, 'bloqueado');
  });
  it('sin confirmar inicio de alimentación complementaria todo queda bloqueado', () => {
    const ev = evaluateRecipeForBaby(R('pollo_calabaza_zapallitos'), babyCtx({ ...TOLERATED }, { startedComplementary: false }));
    assert.equal(ev.verdict, 'bloqueado');
  });
  it('una reacción registrada bloquea ese alimento', () => {
    const ev = evaluateRecipeForBaby(R('pollo_calabaza_zapallitos'), babyCtx({ ...TOLERATED, zapallito: 'reaccion' }));
    assert.equal(ev.verdict, 'bloqueado');
  });
});

describe('8. Alimento nuevo para Helena requiere confirmación', () => {
  it('merluza no introducida → requiere confirmación (nunca automático)', () => {
    const { merluza: _m, ...withoutFish } = TOLERATED;
    const ev = evaluateRecipeForBaby(R('merluza_pure_calabaza'), babyCtx(withoutFish));
    assert.equal(ev.verdict, 'requiere_confirmacion');
    assert.deepEqual(ev.newFoods, ['merluza']);
    assert.ok(ev.issues.some((i) => i.code === 'alergeno_nuevo'));
    // y su versión de plato no incluye el alimento nuevo hasta confirmarlo
    const plan = buildFamilyVersions(R('merluza_pure_calabaza'), [helena], {}, ingredients, babyCtx(withoutFish));
    assert.ok(!plan.versions[0].lines.some((l) => l.ingredientId === 'merluza'));
  });
});

describe('9. Modificar una compra recalcula cantidades', () => {
  it('si compro menos de lo sugerido, la lista muestra el resto', () => {
    const lots: InventoryLot[] = [lot('pollo', 200, 'g'), lot('calabaza', 1, 'un'), lot('zapallito', 4, 'un')];
    const m = meal('pollo_calabaza_zapallitos', '2026-11-12', 'cena');
    const list = computeShoppingList([m], recipes, members, ingredients, lots);
    const pollo = list.find((l) => l.ingredientId === 'pollo')!;
    assert.equal(pollo.toBuy, 300);
    assert.equal(missingSentence(list, 'cocinar esta noche'), 'Para cocinar esta noche te faltan 300 g de pollo (pechuga).');

    // Compré 200 g en vez de 300 g
    const { lot: bought } = addPurchaseLot({ ingredientId: 'pollo', qty: 200, unit: 'g', location: 'heladera', state: 'cerrado' }, 'compra1');
    const list2 = computeShoppingList([m], recipes, members, ingredients, [...lots, bought]);
    assert.equal(list2.find((l) => l.ingredientId === 'pollo')!.toBuy, 100);
  });

  it('consolida ingredientes repetidos de toda la semana, asignando stock en orden', () => {
    const lots = [lot('pollo', 500, 'g')];
    const meals = [meal('pollo_calabaza_zapallitos', '2026-11-13', 'cena'), meal('salteado_pollo_verduras', '2026-11-15', 'almuerzo')];
    const list = computeShoppingList(meals, recipes, members, ingredients, lots);
    const pollo = list.find((l) => l.ingredientId === 'pollo')!;
    assert.equal(pollo.needed, 950);
    assert.equal(pollo.toBuy, 450);
    assert.equal(pollo.mealIds.length, 2);
  });
});

describe('11. Sin internet: las funciones locales siguen funcionando', () => {
  it('el dominio no hace llamadas de red', () => {
    for (const f of readdirSync(new URL('../src/domain', import.meta.url))) {
      const src = readFileSync(new URL(`../src/domain/${f}`, import.meta.url), 'utf8');
      assert.ok(!/\bfetch\(|XMLHttpRequest|axios/.test(src), `${f} no debe usar red`);
    }
  });
  it('el asistente local responde sin conexión', () => {
    const ctx = { todayISO: '2026-11-12', members, recipes: [...recipes.values()], ingredients, lots: [lot('pollo', 1000, 'g'), lot('zapallito', 4, 'un')], meals: [], babyCtx: babyCtx({ ...TOLERATED }) };
    const r1 = reply('¿Qué puedo cocinar hoy?', ctx);
    assert.equal(r1.intent, 'que_cocino');
    assert.ok(r1.suggestions.length > 0);
    assert.ok(!r1.requiresOnline);
    const r2 = reply('Tengo 20 minutos para cocinar', ctx);
    assert.ok(r2.suggestions.every((s) => s.recipe.totalMinutes <= 20));
    const r3 = reply('Compré un kilo de carne y seis yogures', ctx);
    assert.equal(r3.intent, 'compre');
    const act = r3.actions[0];
    assert.equal(act.type, 'agregar_inventario');
    if (act.type === 'agregar_inventario') {
      assert.deepEqual(act.items.map((i) => [i.ingredientId, i.qty, i.unit]), [['nalga', 1, 'kg'], ['yogur_natural', 6, 'un']]);
    }
  });
});

describe('12. Notificaciones: programar, actualizar, cancelar, sin duplicados', () => {
  it('ciclo completo con un planificador falso del sistema', () => {
    const now = new Date('2026-11-12T10:00:00');
    let scheduled: ScheduledRecord[] = [];
    let osCounter = 0;
    const sync = (meals: ReturnType<typeof meal>[], lots: InventoryLot[]) => {
      const desired = buildReminders({ now, meals, recipes, members, ingredients, lots, settings: DEFAULT_REMINDER_SETTINGS });
      const d = reconcile(desired, scheduled);
      scheduled = [...d.unchanged, ...d.toSchedule.map((r) => ({ key: r.key, osId: `os${++osCounter}`, hash: reminderHash(r) }))];
      return d;
    };
    const m = meal('pollo_calabaza_zapallitos', '2026-11-13', 'cena');
    const d1 = sync([m], []);
    assert.ok(d1.toSchedule.length > 0);
    const faltantes = d1.toSchedule.find((r) => r.key === 'faltantes:2026-11-13')!;
    assert.match(faltantes.body, /Te faltan 3 ingredientes/);

    // Sin cambios: no se reprograma ni se duplica.
    const d2 = sync([m], []);
    assert.equal(d2.toSchedule.length, 0);
    assert.equal(d2.toCancel.length, 0);
    assert.equal(new Set(scheduled.map((s) => s.key)).size, scheduled.length);

    // Compro el pollo: el aviso de faltantes se actualiza (cancelar + reprogramar con nuevo texto).
    const d3 = sync([m], [lot('pollo', 500, 'g')]);
    assert.ok(d3.toCancel.some((s) => s.key === 'faltantes:2026-11-13'));
    assert.match(d3.toSchedule.find((r) => r.key === 'faltantes:2026-11-13')!.body, /Te faltan 2 ingredientes/);

    // Se compra todo: el aviso desaparece.
    const d4 = sync([m], [lot('pollo', 500, 'g'), lot('calabaza', 1, 'un'), lot('zapallito', 2, 'un')]);
    assert.ok(d4.toCancel.some((s) => s.key === 'faltantes:2026-11-13'));
    assert.ok(!scheduled.some((s) => s.key === 'faltantes:2026-11-13'));
  });

  it('no programa avisos en el pasado ni para comidas ya cocinadas', () => {
    const now = new Date('2026-11-13T20:45:00');
    const rs = buildReminders({ now, meals: [meal('pollo_calabaza_zapallitos', '2026-11-13', 'cena'), meal('merluza_pure_calabaza', '2026-11-14', 'cena', ['yo', 'ro'], { status: 'cocinada' })], recipes, members, ingredients, lots: [], settings: DEFAULT_REMINDER_SETTINGS });
    assert.ok(rs.every((r) => r.fireAt > '2026-11-13T20:45:00'));
    assert.ok(!rs.some((r) => r.refId?.includes('merluza')));
  });

  it('avisa descongelar en heladera con la anticipación configurada', () => {
    const now = new Date('2026-11-12T10:00:00');
    const rs = buildReminders({ now, meals: [meal('pollo_calabaza_zapallitos', '2026-11-14', 'cena')], recipes, members, ingredients, lots: [lot('pollo', 1000, 'g', { state: 'congelado' })], settings: DEFAULT_REMINDER_SETTINGS });
    const thaw = rs.find((r) => r.kind === 'descongelar')!;
    assert.equal(thaw.fireAt, '2026-11-13T21:00:00');
  });
});
