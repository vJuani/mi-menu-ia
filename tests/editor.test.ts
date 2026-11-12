import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomIngredient, duplicateRecipe, emptyDraft, finalizeDraft, flagsFromTags, hasErrors, inferTags,
  moveItem, renumberSteps, slugify, uniqueId, validateRecipeDraft,
} from '../src/domain/recipeEditor.ts';
import { evaluateRecipeForBaby } from '../src/domain/babySafety.ts';
import { buildAdultVersion } from '../src/domain/adaptations.ts';
import type { Recipe } from '../src/domain/types.ts';
import { openNodeDb } from './nodeDriver.ts';
import { migrate, MIGRATIONS } from '../src/data/migrations.ts';
import { Repo } from '../src/data/repo.ts';
import { seedBase, seedDemo } from '../src/data/seed.ts';
import { babyCtx, ingredients, recipes, TOLERATED, yo } from './helpers.ts';

const base = (): Recipe => ({
  ...emptyDraft(), name: 'Pollo al limón', servings: 2, totalMinutes: 30, tags: ['principal'], babyTextures: ['picado_fino'],
  ingredients: [
    { ingredientId: 'pollo', qty: 400, unit: 'g', state: 'crudo' },
    { ingredientId: 'sal', qty: 2, unit: 'g', state: 'crudo', addedAfterBabySplit: true },
  ],
  steps: [{ order: 1, text: 'Cocinar el pollo' }, { order: 2, text: 'Separar porción de Helena', babySplit: true }, { order: 3, text: 'Salar' }],
});

describe('Editor de recetas: validación', () => {
  it('un borrador correcto no tiene errores ni avisos', () => {
    assert.deepEqual(validateRecipeDraft(base(), ingredients), []);
  });

  it('detecta campos obligatorios', () => {
    const issues = validateRecipeDraft({ ...emptyDraft(), tags: [] }, ingredients);
    const fields = issues.filter((i) => i.level === 'error').map((i) => i.field);
    for (const f of ['name', 'tags', 'ingredients', 'steps']) assert.ok(fields.includes(f), f);
    assert.ok(hasErrors(issues));
  });

  it('rechaza cantidades en cero y unidades no convertibles', () => {
    const r = base();
    r.ingredients.push({ ingredientId: 'zapallito', qty: 0, unit: 'un', state: 'crudo' });
    r.ingredients.push({ ingredientId: 'aceite_oliva', qty: 10, unit: 'g', state: 'crudo' }); // ml → g sin densidad
    const errs = validateRecipeDraft(r, ingredients).filter((i) => i.level === 'error').map((i) => i.message);
    assert.ok(errs.some((m) => m.includes('Zapallito') && m.includes('mayor a cero')));
    assert.ok(errs.some((m) => m.includes('Aceite') && m.includes('convertir')));
  });

  it('avisa si la sal está en la base y Helena tiene texturas elegidas', () => {
    const r = base();
    r.ingredients[1] = { ...r.ingredients[1], addedAfterBabySplit: false };
    const warns = validateRecipeDraft(r, ingredients).filter((i) => i.field === 'baby');
    assert.ok(warns.some((w) => w.message.includes('Sal')));
    // y el motor de seguridad efectivamente la bloquea
    assert.equal(evaluateRecipeForBaby(r, babyCtx({ ...TOLERATED, sal: 'tolerado' })).verdict, 'bloqueado');
  });

  it('avisa si falta el paso de separación', () => {
    const r = base();
    r.steps = r.steps.map((s) => ({ ...s, babySplit: undefined }));
    assert.ok(validateRecipeDraft(r, ingredients).some((i) => i.message.includes('paso en que se separa')));
  });

  it('finalizar: id único, pasos vacíos fuera y renumerados, deja de ser demo', () => {
    const r = base();
    r.steps.splice(1, 0, { order: 99, text: '   ' });
    const f = finalizeDraft({ ...r, isDemo: true }, ['pollo_al_limon']);
    assert.equal(f.id, 'pollo_al_limon_2');
    assert.deepEqual(f.steps.map((s) => s.order), [1, 2, 3]);
    assert.equal(f.isDemo, false);
  });

  it('mover y renumerar pasos', () => {
    const moved = renumberSteps(moveItem(base().steps, 2, 0));
    assert.deepEqual(moved.map((s) => [s.order, s.text]), [[1, 'Salar'], [2, 'Cocinar el pollo'], [3, 'Separar porción de Helena']]);
    assert.equal(moveItem([1, 2], 0, -1).length, 2);
  });

  it('duplicar crea una copia independiente', () => {
    const orig = recipes.get('pollo_calabaza_zapallitos')!;
    const copy = duplicateRecipe(orig, recipes.keys());
    copy.ingredients[0].qty = 1;
    assert.notEqual(orig.ingredients[0].qty, 1);
    assert.equal(copy.isDemo, false);
    assert.notEqual(copy.id, orig.id);
  });

  it('slug sin acentos', () => {
    assert.equal(slugify('Ñoquis de calabaza ¡caseros!'), 'noquis_de_calabaza_caseros');
    assert.equal(uniqueId('a', ['a', 'a_2']), 'a_3');
  });
});

describe('Ingredientes propios: etiquetas de seguridad', () => {
  it('infiere etiquetas desde el nombre', () => {
    assert.ok(inferTags('Miel de caña').includes('miel'));
    assert.ok(inferTags('Salchichas de Viena').includes('riesgo_atragantamiento'));
    assert.ok(inferTags('Salchichas de Viena').includes('alto_sodio'));
    assert.ok(inferTags('Huevo de codorniz').includes('alergeno:huevo'));
    assert.ok(inferTags('Fideos de arroz').includes('arroz'));
    assert.deepEqual(inferTags('Calabacín'), []);
  });

  it('un ingrediente propio con miel queda bloqueado para Helena', () => {
    const tags = inferTags('Miel orgánica');
    const ing = buildCustomIngredient({ name: 'Miel orgánica', category: 'otro', defaultUnit: 'g', flags: flagsFromTags(tags) }, ingredients.keys());
    assert.ok(ing.id.startsWith('custom_'));
    const ings = new Map(ingredients); ings.set(ing.id, ing);
    const r: Recipe = { ...base(), ingredients: [{ ingredientId: 'pollo', qty: 200, unit: 'g', state: 'crudo' }, { ingredientId: ing.id, qty: 5, unit: 'g', state: 'crudo' }] };
    const ev = evaluateRecipeForBaby(r, { ...babyCtx({ ...TOLERATED, [ing.id]: 'tolerado' }), ingredients: ings });
    assert.equal(ev.verdict, 'bloqueado');
  });

  it('las casillas del formulario mandan sobre la inferencia', () => {
    const ing = buildCustomIngredient({ name: 'Queso de cabra', category: 'lacteo', defaultUnit: 'g', flags: { sal: true, azucar: false, miel: false, atragantamiento: false, crudo: false, allergens: ['leche'] } }, []);
    assert.ok(ing.tags.includes('alto_sodio'));
    assert.ok(ing.tags.includes('alergeno:leche'));
    const sinMarcar = buildCustomIngredient({ name: 'Queso de cabra', category: 'lacteo', defaultUnit: 'g', flags: { sal: false, azucar: false, miel: false, atragantamiento: false, crudo: false, allergens: [] } }, []);
    assert.ok(!sinMarcar.tags.includes('alergeno:leche'));
  });

  it('un ingrediente propio con huevo se excluye de mi plato', () => {
    const ing = buildCustomIngredient({ name: 'Huevos de campo', category: 'huevo', defaultUnit: 'un', gramsPerUnit: 55, flags: flagsFromTags(inferTags('Huevos de campo')) }, []);
    const ings = new Map(ingredients); ings.set(ing.id, ing);
    const r: Recipe = { ...base(), ingredients: [...base().ingredients, { ingredientId: ing.id, qty: 2, unit: 'un', state: 'crudo', separable: true }] };
    const v = buildAdultVersion(r, yo, 1, ings);
    assert.ok(!v.lines.some((l) => l.ingredientId === ing.id));
  });

  it('valida nombre y gramos por unidad', () => {
    assert.throws(() => buildCustomIngredient({ name: ' ', category: 'otro', defaultUnit: 'g', flags: flagsFromTags([]) }, []));
    assert.throws(() => buildCustomIngredient({ name: 'X', category: 'otro', defaultUnit: 'un', gramsPerUnit: 0, flags: flagsFromTags([]) }, []));
  });
});

describe('Recetas propias en SQLite', () => {
  it('guardar, editar una demo (deja de ser demo), archivar y sobrevivir al borrado de demo', async () => {
    const db = openNodeDb();
    await migrate(db);
    const repo = new Repo(db);
    await seedBase(repo);
    await seedDemo(repo, '2026-11-12');

    const ing = buildCustomIngredient({ name: 'Zapallo cabutiá', category: 'verdura', defaultUnit: 'un', gramsPerUnit: 1500, flags: flagsFromTags([]) }, (await repo.ingredients()).map((i) => i.id));
    await repo.saveIngredient(ing, true);
    const mine = finalizeDraft({ ...base(), ingredients: [...base().ingredients, { ingredientId: ing.id, qty: 0.5, unit: 'un', state: 'crudo' }] }, (await repo.recipes()).map((r) => r.id));
    await repo.saveRecipe(mine);

    const demo = (await repo.recipes()).find((r) => r.id === 'merluza_pure_calabaza')!;
    await repo.saveRecipe(finalizeDraft({ ...demo, totalMinutes: 25 }, []));

    assert.equal(await repo.upcomingMealsWithRecipe('pollo_calabaza_zapallitos', '2026-11-12'), 2);
    await repo.setRecipeArchived('pollo_calabaza_zapallitos', true);

    await repo.clearDemoData();
    const after = await repo.recipes();
    const ids = after.map((r) => r.id);
    assert.ok(ids.includes('pollo_al_limon'));
    assert.ok(ids.includes('merluza_pure_calabaza'), 'la receta demo editada pasa a ser tuya');
    assert.equal(after.find((r) => r.id === 'merluza_pure_calabaza')!.totalMinutes, 25);
    assert.deepEqual(await repo.customIngredientIds(), [ing.id]);
    const saved = after.find((r) => r.id === 'pollo_al_limon')!;
    assert.deepEqual(saved.steps.map((s) => s.babySplit ?? false), [false, true, false]);
    assert.equal(saved.ingredients[1].addedAfterBabySplit, true);
  });

  it('migración 2 → 3 sobre una base existente conserva los datos', async () => {
    const db = openNodeDb();
    await db.exec('PRAGMA foreign_keys = ON;');
    for (const m of MIGRATIONS.filter((x) => x.version <= 2)) { await db.exec(m.sql); await db.exec(`PRAGMA user_version = ${m.version}`); }
    await db.run("INSERT INTO ingredients(id,name,category,default_unit) VALUES('pollo','Pollo','pollo','g')");
    await db.run("INSERT INTO recipes(id,name,total_minutes,difficulty,servings) VALUES('r1','Vieja',10,'facil',2)");
    const res = await migrate(db);
    assert.deepEqual(res, { from: 2, to: 3 });
    const r = (await new Repo(db).recipes())[0];
    assert.equal(r.name, 'Vieja');
    assert.equal(r.archived, undefined);
  });
});
