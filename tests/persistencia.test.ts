/**
 * Prueba obligatoria 10 (persistencia tras cerrar y reabrir) y pruebas de
 * integración del repositorio sobre SQLite real con las mismas migraciones.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDb } from './nodeDriver.ts';
import { migrate, SCHEMA_VERSION } from '../src/data/migrations.ts';
import { Repo } from '../src/data/repo.ts';
import { seedBase, seedDemo } from '../src/data/seed.ts';
import { exportBackup, importBackup } from '../src/data/backup.ts';
import { verifyLedger, availableQty } from '../src/domain/inventory.ts';
import { computeShoppingList } from '../src/domain/shopping.ts';

async function fresh(path = ':memory:') {
  const db = openNodeDb(path);
  await migrate(db);
  const repo = new Repo(db);
  await seedBase(repo);
  return { db, repo };
}

describe('10. Cerrar y reabrir: los datos persisten', () => {
  it('perfiles, inventario, plan, pesos y movimientos sobreviven al reinicio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mimenu-'));
    const file = join(dir, 'test.db');
    try {
      const a = await fresh(file);
      await seedDemo(a.repo, '2026-11-12');
      await a.repo.addWeight('2026-11-12', 107.4);
      await a.repo.setIntroduction('helena', 'calabaza', 'tolerado', { date: '2026-10-25' });
      const lotsBefore = await a.repo.lots();
      await a.db.close();

      const b = openNodeDb(file);
      const m = await migrate(b);
      assert.equal(m.from, SCHEMA_VERSION, 'no re-ejecuta migraciones');
      const repo = new Repo(b);
      await seedBase(repo); // idempotente
      assert.equal((await repo.members()).length, 3);
      assert.deepEqual((await repo.members()).find((x) => x.id === 'yo')!.aversions.map((x) => x.tag).sort(), ['avena', 'huevo', 'mani']);
      assert.equal((await repo.lots()).length, lotsBefore.length);
      assert.equal((await repo.meals()).length, 11);
      assert.deepEqual(await repo.weights(), [{ id: (await repo.weights())[0].id, date: '2026-11-12', kg: 107.4 }]);
      assert.equal((await repo.introductions('helena'))[0].status, 'tolerado');
      assert.equal((await repo.recipes()).length, 11);
      const baby = await repo.babyProfile('helena');
      assert.equal(baby!.startedComplementary, false, 'no se asume el inicio de alimentación complementaria');
      await b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Repositorio: integridad de cantidades', () => {
  it('planificar no crea movimientos; cocinar descuenta en una transacción y se puede deshacer', async () => {
    const { repo } = await fresh();
    await repo.addLot({ ingredientId: 'pollo', qty: 600, unit: 'g', location: 'heladera', state: 'cerrado' });
    const movsBefore = (await repo.movements()).length;
    await repo.saveMeal({ id: 'm1', date: '2026-11-12', slot: 'cena', recipeId: 'pollo_calabaza_zapallitos', memberIds: ['yo', 'ro'], portionsByMember: {}, status: 'planificada', substitutions: {} });
    assert.equal((await repo.movements()).length, movsBefore);

    const ings = new Map((await repo.ingredients()).map((i) => [i.id, i]));
    const { operationId } = await repo.confirmCooked('m1', [{ ingredientId: 'pollo', qty: 450, unit: 'g' }], ings);
    assert.equal(availableQty('pollo', await repo.lots(), 'g'), 150);
    assert.equal((await repo.meals())[0].status, 'cocinada');
    assert.deepEqual(verifyLedger(await repo.allLots(), await repo.movements()), []);

    await repo.undo(operationId);
    assert.equal(availableQty('pollo', await repo.lots(), 'g'), 600);
    assert.equal((await repo.meals())[0].status, 'planificada');
    assert.deepEqual(verifyLedger(await repo.allLots(), await repo.movements()), []);
  });

  it('la base rechaza cantidades negativas', async () => {
    const { repo, db } = await fresh();
    const lot = await repo.addLot({ ingredientId: 'pollo', qty: 100, unit: 'g', location: 'heladera', state: 'cerrado' });
    await assert.rejects(db.run('UPDATE inventory_lots SET qty = -5 WHERE id = ?', [lot.id]));
    await assert.rejects(repo.adjustLotQty(lot.id, -1));
  });

  it('marcar comprado con cantidad real actualiza inventario y lista', async () => {
    const { repo } = await fresh();
    const [ings, recs, mem] = await Promise.all([repo.ingredients(), repo.recipes(), repo.members()]);
    const ingMap = new Map(ings.map((i) => [i.id, i]));
    const recMap = new Map(recs.map((r) => [r.id, r]));
    const meal = { id: 'm1', date: '2026-11-12', slot: 'cena' as const, recipeId: 'pollo_calabaza_zapallitos', memberIds: ['yo', 'ro'], portionsByMember: {}, status: 'planificada' as const, substitutions: {} };
    await repo.saveMeal(meal);
    await repo.syncShoppingList(computeShoppingList([meal], recMap, mem, ingMap, await repo.lots()));
    const item = (await repo.shoppingItems()).find((i) => i.ingredientId === 'pollo')!;
    assert.equal(item.suggestedQty, 500);
    await repo.markBought(item.id, 350, 'g', 'heladera');
    const after = computeShoppingList([meal], recMap, mem, ingMap, await repo.lots());
    assert.equal(after.find((l) => l.ingredientId === 'pollo')!.toBuy, 150);
    await repo.syncShoppingList(after);
    const items = await repo.shoppingItems();
    assert.equal(items.filter((i) => i.ingredientId === 'pollo' && i.status === 'pendiente')[0].suggestedQty, 150);
    assert.equal(items.filter((i) => i.status === 'comprado').length, 1);
  });

  it('respaldo: exportar e importar restaura todo', async () => {
    const a = await fresh();
    await seedDemo(a.repo, '2026-11-12');
    await a.repo.addWeight('2026-11-10', 108);
    const backup = JSON.parse(JSON.stringify(await exportBackup(a.db)));
    const b = await fresh();
    await importBackup(b.db, backup);
    assert.equal((await b.repo.lots()).length, (await a.repo.lots()).length);
    assert.equal((await b.repo.meals()).length, 11);
    assert.equal((await b.repo.weights())[0].kg, 108);
    await assert.rejects(importBackup(b.db, { app: 'otra' }));
  });

  it('borrar datos de demostración deja perfiles y catálogo', async () => {
    const { repo } = await fresh();
    await seedDemo(repo, '2026-11-12');
    await repo.addLot({ ingredientId: 'pollo', qty: 300, unit: 'g', location: 'heladera', state: 'cerrado' });
    await repo.clearDemoData();
    assert.equal((await repo.lots()).length, 1);
    assert.equal((await repo.meals()).length, 0);
    assert.equal((await repo.recipes()).length, 0);
    assert.equal((await repo.members()).length, 3);
    assert.ok((await repo.ingredients()).length > 30);
  });
});
