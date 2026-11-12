import type { Ingredient, Unit } from './types.ts';

/** Redondeo de cantidades para mostrar y para comparar sin errores de coma flotante. */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Normaliza a la unidad base: g, ml o un. */
export function toBase(qty: number, unit: Unit): { qty: number; unit: Unit } {
  switch (unit) {
    case 'kg': return { qty: qty * 1000, unit: 'g' };
    case 'l': return { qty: qty * 1000, unit: 'ml' };
    default: return { qty, unit };
  }
}

/**
 * Convierte una cantidad a la unidad pedida usando gramsPerUnit si hace falta (un <-> g).
 * Devuelve null si la conversión no es posible: nunca se inventan equivalencias.
 */
export function convert(qty: number, from: Unit, to: Unit, ing?: Pick<Ingredient, 'gramsPerUnit'>): number | null {
  const a = toBase(qty, from);
  const target = toBase(1, to).unit;
  const factorTo = to === 'kg' || to === 'l' ? 1000 : 1;
  let baseQty: number | null = null;
  if (a.unit === target) baseQty = a.qty;
  else if (a.unit === 'un' && target === 'g' && ing?.gramsPerUnit) baseQty = a.qty * ing.gramsPerUnit;
  else if (a.unit === 'g' && target === 'un' && ing?.gramsPerUnit) baseQty = a.qty / ing.gramsPerUnit;
  else if ((a.unit === 'ml' && target === 'g') || (a.unit === 'g' && target === 'ml')) baseQty = null; // sin densidad conocida
  if (baseQty === null) return null;
  return baseQty / factorTo;
}

export function formatQty(qty: number, unit: Unit): string {
  if (unit === 'g' && qty >= 1000) return `${round(qty / 1000, 2)} kg`;
  if (unit === 'ml' && qty >= 1000) return `${round(qty / 1000, 2)} l`;
  if (unit === 'un') return `${round(qty, 1)} un.`;
  return `${round(qty, 0)} ${unit}`;
}
