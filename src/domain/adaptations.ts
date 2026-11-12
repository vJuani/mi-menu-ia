/**
 * "Cocinar una vez para los tres": a partir de una receta base genera la
 * versión de cada integrante respetando restricciones, extras opcionales y porciones.
 */
import type { Ingredient, Member, NutritionTargets, Recipe, RecipeIngredient } from './types.ts';
import { convert } from './units.ts';
import type { BabyContext, BabyEvaluation } from './babySafety.ts';
import { evaluateRecipeForBaby } from './babySafety.ts';

export interface PlateLine {
  ingredientId: string;
  name: string;
  qty: number;
  unit: RecipeIngredient['unit'];
  state: 'crudo' | 'cocido';
  extra?: boolean; // agregado solo para esta persona
}

export interface MemberVersion {
  memberId: string;
  memberName: string;
  status: 'apta' | 'apta_con_cambios' | 'no_apta' | 'bebe';
  lines: PlateLine[];
  removed: { ingredientId: string; name: string; reason: string }[];
  added: { ingredientId: string; name: string }[];
  notes: string[];
  nutrition?: NutritionTargets; // solo adultos, estimada
  baby?: BabyEvaluation;
}

export function matchesTag(ing: Ingredient, tag: string): boolean {
  const t = tag.toLowerCase();
  return ing.id === t || ing.name.toLowerCase() === t || ing.tags.includes(t) || ing.aliases.some((a) => a.toLowerCase() === t);
}

/** ¿El integrante rechaza este ingrediente? Devuelve el nivel o null. */
export function aversionFor(member: Member, ing: Ingredient): 'excluir' | 'evitar' | null {
  let level: 'excluir' | 'evitar' | null = null;
  for (const a of member.aversions) {
    if (matchesTag(ing, a.tag)) {
      if (a.level === 'excluir') return 'excluir';
      level = 'evitar';
    }
  }
  if (member.allergies.some((al) => matchesTag(ing, al) || ing.tags.includes(`alergeno:${al}`))) return 'excluir';
  return level;
}

export function scaleQty(ri: RecipeIngredient, servings: number, portion: number): number {
  return (ri.qty / servings) * portion;
}

export function estimateNutrition(lines: PlateLine[], ingredients: Map<string, Ingredient>): NutritionTargets {
  const total = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const l of lines) {
    const ing = ingredients.get(l.ingredientId);
    if (!ing?.per100g) continue;
    // Solo usamos la tabla si coincide el estado (crudo/cocido) declarado.
    if (ing.nutritionBasis && ing.nutritionBasis !== l.state) continue;
    const grams = convert(l.qty, l.unit, 'g', ing);
    if (grams === null) continue;
    const f = grams / 100;
    total.kcal += ing.per100g.kcal * f;
    total.proteinG += ing.per100g.proteinG * f;
    total.carbsG += ing.per100g.carbsG * f;
    total.fatG += ing.per100g.fatG * f;
  }
  return {
    kcal: Math.round(total.kcal),
    proteinG: Math.round(total.proteinG),
    carbsG: Math.round(total.carbsG),
    fatG: Math.round(total.fatG),
  };
}

export function buildAdultVersion(
  recipe: Recipe,
  member: Member,
  portion: number,
  ingredients: Map<string, Ingredient>,
  substitutions: Record<string, string> = {},
): MemberVersion {
  const v: MemberVersion = { memberId: member.id, memberName: member.shortName ?? member.name, status: 'apta', lines: [], removed: [], added: [], notes: [] };
  for (const orig of recipe.ingredients) {
    const sub = substitutions[orig.ingredientId];
    const ri = sub ? { ...orig, ingredientId: sub } : orig;
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) continue;
    const av = aversionFor(member, ing);
    const isExtra = !!ri.optional && member.optionalExtras.some((t) => matchesTag(ing, t));
    if (ri.optional && !isExtra) continue; // opcionales: solo para quien los pide
    if (av) {
      if (ri.optional || ri.separable) {
        v.removed.push({ ingredientId: ing.id, name: ing.name, reason: av === 'excluir' ? 'No lo come' : 'Prefiere evitarlo' });
        continue;
      }
      if (av === 'excluir') {
        v.status = 'no_apta';
        v.removed.push({ ingredientId: ing.id, name: ing.name, reason: 'No lo come y es parte de la base' });
        continue;
      }
      // 'evitar' en un ingrediente no separable: se acepta pero se avisa.
      v.notes.push(`Contiene ${ing.name}, que prefiere evitar.`);
      if (v.status === 'apta') v.status = 'apta_con_cambios';
    }
    v.lines.push({ ingredientId: ing.id, name: ing.name, qty: scaleQty(ri, recipe.servings, portion), unit: ri.unit, state: ri.state, extra: isExtra || undefined });
    if (isExtra) v.added.push({ ingredientId: ing.id, name: ing.name });
  }
  if (v.status === 'apta' && (v.removed.length || v.added.length)) v.status = 'apta_con_cambios';
  if (v.removed.length && v.status !== 'no_apta') {
    v.notes.push('Compensá con más verdura o proteína de la base si querés mantener el volumen.');
  }
  v.nutrition = estimateNutrition(v.lines, ingredients);
  return v;
}

export interface FamilyPlan {
  base: Recipe;
  versions: MemberVersion[];
  /** Si el bebé no puede compartir, se indica explícitamente. */
  babyNeedsSeparateMeal: boolean;
}

export function buildFamilyVersions(
  recipe: Recipe,
  members: Member[],
  portions: Record<string, number>,
  ingredients: Map<string, Ingredient>,
  babyCtx?: BabyContext,
  substitutions: Record<string, string> = {},
): FamilyPlan {
  const versions: MemberVersion[] = [];
  let babyNeedsSeparateMeal = false;
  for (const m of members) {
    if (m.kind === 'bebe') {
      if (!babyCtx) continue;
      const ev = evaluateRecipeForBaby(recipe, babyCtx, substitutions);
      const ok = ev.verdict === 'apto' || ev.verdict === 'apto_con_adaptacion';
      if (!ok) babyNeedsSeparateMeal = ev.verdict === 'bloqueado';
      versions.push({
        memberId: m.id,
        memberName: m.shortName ?? m.name,
        status: 'bebe',
        lines: ok || ev.verdict === 'requiere_confirmacion'
          ? recipe.ingredients
              .filter((ri) => !ri.optional && !ri.addedAfterBabySplit && !ev.newFoods.includes(substitutions[ri.ingredientId] ?? ri.ingredientId))
              .map((ri) => {
                const id = substitutions[ri.ingredientId] ?? ri.ingredientId;
                return { ingredientId: id, name: ingredients.get(id)?.name ?? id, qty: 0, unit: ri.unit, state: 'cocido' as const };
              })
          : [],
        removed: ev.excludedFromBabyPortion.map((id) => ({ ingredientId: id, name: ingredients.get(id)?.name ?? id, reason: 'Se agrega después de separar su porción' })),
        added: [],
        notes: [
          'Porción según su apetito: sin cantidades rígidas.',
          ...ev.issues.filter((i) => i.severity !== 'control').map((i) => i.message),
        ],
        baby: ev,
      });
      continue;
    }
    versions.push(buildAdultVersion(recipe, m, portions[m.id] ?? 1, ingredients, substitutions));
  }
  return { base: recipe, versions, babyNeedsSeparateMeal };
}

/** ¿Puede este adulto comer la receta (aunque sea con cambios)? Usado por el planificador. */
export function recipeFitsMember(recipe: Recipe, member: Member, ingredients: Map<string, Ingredient>): boolean {
  return buildAdultVersion(recipe, member, 1, ingredients).status !== 'no_apta';
}
