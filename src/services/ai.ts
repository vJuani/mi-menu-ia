/**
 * IA online opcional. Solo habla con TU backend (server/), que guarda la clave
 * del proveedor. La respuesta se valida contra las reglas locales antes de mostrarse:
 * la IA no puede anular restricciones ni la seguridad de Helena.
 */
import { AI_PROXY_URL } from '../config/app';
import type { AssistantContext } from '../domain/assistant';
import { validateGeneratedProposal } from '../domain/assistant';

export const aiAvailable = (): boolean => AI_PROXY_URL.length > 0;

export interface OnlineAnswer {
  text: string;
  proposal?: { memberId: string; ingredientNames: string[] }[];
  blocked?: string[];
}

export async function askOnline(question: string, ctx: AssistantContext, signal?: AbortSignal): Promise<OnlineAnswer> {
  if (!aiAvailable()) throw new Error('La IA online no está configurada.');
  // Contexto mínimo: perfiles y restricciones, nombres de recetas e inventario. Sin datos de salud del bebé más allá de lo necesario.
  const payload = {
    question,
    members: ctx.members.map((m) => ({ id: m.id, name: m.shortName ?? m.name, kind: m.kind, aversions: m.aversions, optionalExtras: m.optionalExtras })),
    babyAgeMonths: ctx.babyCtx?.ageMonths,
    inventory: ctx.lots.map((l) => ({ ingredient: ctx.ingredients.get(l.ingredientId)?.name, qty: l.qty, unit: l.unit })),
    recipes: ctx.recipes.map((r) => r.name),
  };
  const res = await fetch(`${AI_PROXY_URL}/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  });
  if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
  const data = (await res.json()) as OnlineAnswer;
  if (data.proposal?.length) {
    const v = validateGeneratedProposal(data.proposal, ctx);
    if (!v.ok) return { text: `${data.text}\n\n⚠️ Corregido por las reglas de seguridad:\n${v.problems.map((p) => '• ' + p).join('\n')}`, blocked: v.problems };
  }
  return data;
}
