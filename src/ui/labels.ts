import type { InventoryLocation, LotState, MealSlot } from '../domain/types';

export const SLOT_LABEL: Record<MealSlot, string> = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena', colacion: 'Colación' };
export const SLOTS_ORDER: MealSlot[] = ['desayuno', 'colacion', 'almuerzo', 'merienda', 'cena'];
export const LOCATION_LABEL: Record<InventoryLocation, string> = { heladera: 'Heladera', freezer: 'Freezer', alacena: 'Alacena' };
export const STATE_LABEL: Record<LotState, string> = { cerrado: 'Cerrado', abierto: 'Abierto', congelado: 'Congelado', preparado: 'Preparado', descongelando: 'Descongelando' };
export const DIFFICULTY_LABEL = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' } as const;

export function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }): string {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
