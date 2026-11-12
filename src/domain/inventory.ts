/**
 * Inventario basado en lotes + movimientos (libro mayor).
 * - Planificar NO descuenta nada.
 * - Solo se descuenta lo confirmado como usado al cocinar.
 * - Cada operación tiene un operationId para poder deshacerla completa.
 * - Las cantidades nunca quedan negativas; los faltantes se informan.
 */
import type { Ingredient, InventoryLot, StockMovement, Unit } from './types.ts';
import { convert, round } from './units.ts';

export interface Usage { ingredientId: string; qty: number; unit: Unit; }

export interface ConsumeResult {
  movements: StockMovement[];
  lots: InventoryLot[];
  shortfalls: { ingredientId: string; missing: number; unit: Unit }[];
  unconvertible: string[];
}

let counter = 0;
export function newId(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Cantidad disponible de un ingrediente expresada en `unit`. Lotes no convertibles se ignoran. */
export function availableQty(ingredientId: string, lots: InventoryLot[], unit: Unit, ing?: Ingredient): number {
  let total = 0;
  for (const l of lots) {
    if (l.ingredientId !== ingredientId || l.qty <= 0) continue;
    const q = convert(l.qty, l.unit, unit, ing);
    if (q !== null) total += q;
  }
  return round(total, 3);
}

/** Orden de consumo: abiertos primero, luego por vencimiento, luego por fecha de compra; congelados al final. */
export function consumptionOrder(lots: InventoryLot[]): InventoryLot[] {
  const rank = (l: InventoryLot) => (l.state === 'abierto' ? 0 : l.state === 'congelado' ? 2 : 1);
  return [...lots].sort((a, b) =>
    rank(a) - rank(b) ||
    (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') ||
    (a.purchasedAt ?? '9999').localeCompare(b.purchasedAt ?? '9999'));
}

export function consumeConfirmed(
  lots: InventoryLot[],
  usages: Usage[],
  ingredients: Map<string, Ingredient>,
  operationId: string,
  now = new Date().toISOString(),
): ConsumeResult {
  const out = lots.map((l) => ({ ...l }));
  const movements: StockMovement[] = [];
  const shortfalls: ConsumeResult['shortfalls'] = [];
  const unconvertible: string[] = [];

  for (const u of usages) {
    if (u.qty <= 0) continue;
    const ing = ingredients.get(u.ingredientId);
    let remaining = u.qty; // en u.unit
    const candidates = consumptionOrder(out.filter((l) => l.ingredientId === u.ingredientId && l.qty > 0));
    for (const lot of candidates) {
      if (remaining <= 1e-9) break;
      const lotAvailInUsageUnit = convert(lot.qty, lot.unit, u.unit, ing);
      if (lotAvailInUsageUnit === null) { unconvertible.push(lot.id); continue; }
      const take = Math.min(remaining, lotAvailInUsageUnit);
      const takeInLotUnit = convert(take, u.unit, lot.unit, ing)!;
      lot.qty = round(lot.qty - takeInLotUnit, 3);
      if (lot.qty < 1e-6) lot.qty = 0;
      remaining = round(remaining - take, 6);
      movements.push({
        id: newId('mov'), lotId: lot.id, ingredientId: u.ingredientId, delta: -round(takeInLotUnit, 3),
        kind: 'consumo', createdAt: now, operationId,
      });
    }
    if (remaining > 1e-6) shortfalls.push({ ingredientId: u.ingredientId, missing: round(remaining, 2), unit: u.unit });
  }
  return { movements, lots: out, shortfalls, unconvertible };
}

/** Crea los movimientos inversos de una operación (deshacer). No borra el historial. */
export function undoOperation(
  lots: InventoryLot[],
  movements: StockMovement[],
  operationId: string,
  now = new Date().toISOString(),
): { lots: InventoryLot[]; reversals: StockMovement[]; marked: StockMovement[] } {
  const targets = movements.filter((m) => m.operationId === operationId && !m.revertedBy && m.kind !== 'deshacer');
  const undoOp = newId('undo');
  const out = lots.map((l) => ({ ...l }));
  const reversals: StockMovement[] = [];
  const marked: StockMovement[] = [];
  for (const m of targets) {
    const lot = out.find((l) => l.id === m.lotId);
    if (!lot) continue;
    lot.qty = round(lot.qty - m.delta, 3);
    if (lot.qty < 0) lot.qty = 0;
    const rev: StockMovement = { id: newId('mov'), lotId: m.lotId, ingredientId: m.ingredientId, delta: -m.delta, kind: 'deshacer', createdAt: now, operationId: undoOp, note: `Deshace ${m.id}` };
    reversals.push(rev);
    marked.push({ ...m, revertedBy: rev.id });
  }
  return { lots: out, reversals, marked };
}

/** Corrige manualmente la cantidad de un lote dejando registro. */
export function adjustLot(lot: InventoryLot, newQty: number, operationId: string, now = new Date().toISOString()): { lot: InventoryLot; movement: StockMovement } {
  if (newQty < 0) throw new Error('La cantidad no puede ser negativa');
  const delta = round(newQty - lot.qty, 3);
  return {
    lot: { ...lot, qty: round(newQty, 3) },
    movement: { id: newId('mov'), lotId: lot.id, ingredientId: lot.ingredientId, delta, kind: 'ajuste', createdAt: now, operationId },
  };
}

export function addPurchaseLot(
  input: Omit<InventoryLot, 'id'>,
  operationId: string,
  now = new Date().toISOString(),
): { lot: InventoryLot; movement: StockMovement } {
  if (input.qty <= 0) throw new Error('La cantidad comprada debe ser mayor a cero');
  const lot: InventoryLot = { ...input, id: newId('lot') };
  return { lot, movement: { id: newId('mov'), lotId: lot.id, ingredientId: lot.ingredientId, delta: lot.qty, kind: 'compra', createdAt: now, operationId } };
}

/** Verifica integridad: la cantidad de cada lote debe coincidir con la suma de sus movimientos. */
export function verifyLedger(lots: InventoryLot[], movements: StockMovement[]): string[] {
  const errors: string[] = [];
  for (const l of lots) {
    const sum = round(movements.filter((m) => m.lotId === l.id).reduce((s, m) => s + m.delta, 0), 3);
    if (Math.abs(sum - l.qty) > 0.001) errors.push(`Lote ${l.id}: stock ${l.qty} ≠ movimientos ${sum}`);
  }
  return errors;
}

export function lowStock(lots: InventoryLot[], ingredientId: string, thresholdUnits: number, unit: Unit, ing?: Ingredient): boolean {
  return availableQty(ingredientId, lots, unit, ing) <= thresholdUnits;
}
