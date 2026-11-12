/**
 * Motor de seguridad para la alimentación complementaria (Helena).
 *
 * Reglas deterministas basadas en recomendaciones de OMS, AAP y SAP (Sociedad
 * Argentina de Pediatría). NO depende de IA: cualquier propuesta (manual o
 * generativa) debe pasar por `evaluateRecipeForBaby` antes de mostrarse como apta.
 * No reemplaza la indicación del pediatra: las notas del pediatra se muestran
 * siempre y la introducción de alimentos nuevos requiere confirmación del adulto.
 */
import type { BabyFeedingProfile, FoodIntroduction, Ingredient, Recipe, RecipeIngredient, Texture } from './types.ts';

export type BabyVerdict = 'apto' | 'apto_con_adaptacion' | 'requiere_confirmacion' | 'bloqueado';
export type IssueSeverity = 'bloqueo' | 'confirmacion' | 'adaptacion' | 'control';

export interface BabyIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  ingredientId?: string;
}

export interface BabyEvaluation {
  verdict: BabyVerdict;
  issues: BabyIssue[];
  /** Ingredientes que se agregan después de separar la porción del bebé. */
  excludedFromBabyPortion: string[];
  /** Ingredientes nunca ofrecidos: requieren confirmación explícita del adulto. */
  newFoods: string[];
  /** Controles a realizar antes de servir (siempre presentes). */
  checklist: string[];
  texture?: Texture;
}

/** Tags que bloquean un ingrediente para menores de 12 meses salvo que se agregue después de separar la porción. */
const SPLITTABLE_BLOCK_TAGS: Record<string, string> = {
  sal: 'No agregar sal a la porción del bebé.',
  azucar: 'No agregar azúcar a la porción del bebé.',
  alto_sodio: 'Alimento con mucho sodio (caldo en cubo, embutidos, quesos muy salados).',
  picante: 'Condimento picante.',
  alcohol: 'Contiene alcohol.',
  edulcorante: 'Edulcorantes no recomendados en bebés.',
};

/** Tags que bloquean siempre (no alcanza con separar la porción si el ingrediente es parte de la base). */
const HARD_BLOCK_TAGS: Record<string, string> = {
  miel: 'Miel prohibida antes de los 12 meses (riesgo de botulismo infantil).',
  riesgo_atragantamiento: 'Formato con riesgo de atragantamiento (frutos secos enteros, uvas enteras, pochoclo, salchichas en rodajas, vegetales crudos duros).',
  crudo_riesgo: 'Preparación cruda o poco cocida (huevo crudo, carne jugosa, pescado crudo).',
  alto_mercurio: 'Pescado con alto contenido de mercurio (pez espada, tiburón, atún rojo).',
  leche_vaca_bebida: 'La leche de vaca como bebida principal no se recomienda antes de los 12 meses.',
  ultraprocesado: 'Ultraprocesado no recomendado.',
};

const CHECKLIST_BASE = [
  'Verificar temperatura: tibia, nunca caliente.',
  'Confirmar cocción completa (carnes y pollo sin partes rosadas).',
  'Revisar espinas y huesos.',
  'Textura adecuada a su etapa: puré, pisado o trozos blandos que se aplasten entre los dedos.',
  'Ofrecer sentada, erguida y siempre con un adulto presente.',
  'Respetar sus señales de hambre y saciedad: no obligar a terminar.',
  'La leche materna o fórmula sigue siendo su alimento principal.',
];

export interface BabyContext {
  profile: BabyFeedingProfile;
  ageMonths: number;
  introductions: FoodIntroduction[];
  ingredients: Map<string, Ingredient>;
}

function ingredientAppliesToBaby(ri: RecipeIngredient, ing: Ingredient): boolean {
  // Los ingredientes que se agregan después de separar la porción no llegan al bebé.
  if (ri.addedAfterBabySplit) return false;
  // Los opcionales no se le ofrecen salvo confirmación.
  if (ri.optional) return false;
  return !!ing;
}

export function preconditionIssues(ctx: BabyContext): BabyIssue[] {
  const issues: BabyIssue[] = [];
  if (ctx.ageMonths < 4) {
    issues.push({ severity: 'bloqueo', code: 'edad', message: 'Antes de los 4 meses no se inicia la alimentación complementaria.' });
  } else if (ctx.ageMonths < 6 && !ctx.profile.pediatricianNotes.some((n) => /inicio|comenzar|empezar/i.test(n))) {
    issues.push({ severity: 'bloqueo', code: 'edad', message: 'Antes de los 6 meses solo con indicación expresa del pediatra (registrala en su perfil).' });
  }
  if (!ctx.profile.startedComplementary) {
    issues.push({ severity: 'bloqueo', code: 'inicio_no_confirmado', message: 'Confirmá en su perfil que ya comenzó la alimentación complementaria.' });
  }
  if (!ctx.profile.readinessSigns) {
    issues.push({ severity: 'bloqueo', code: 'senales', message: 'Confirmá las señales de preparación: se sienta con poco apoyo, sostiene la cabeza, muestra interés y no empuja la comida con la lengua.' });
  }
  return issues;
}

export function evaluateRecipeForBaby(recipe: Recipe, ctx: BabyContext, substitutions: Record<string, string> = {}): BabyEvaluation {
  const issues: BabyIssue[] = [...preconditionIssues(ctx)];
  const excluded: string[] = [];
  const newFoods: string[] = [];
  const under12 = ctx.ageMonths < 12;
  const introById = new Map(ctx.introductions.map((f) => [f.ingredientId, f]));

  for (const original of recipe.ingredients) {
    const ri: RecipeIngredient = substitutions[original.ingredientId]
      ? { ...original, ingredientId: substitutions[original.ingredientId] }
      : original;
    const ing = ctx.ingredients.get(ri.ingredientId);
    if (!ing) {
      issues.push({ severity: 'bloqueo', code: 'desconocido', message: `Ingrediente desconocido (${ri.ingredientId}): no se puede evaluar.`, ingredientId: ri.ingredientId });
      continue;
    }

    // Tags bloqueantes que se resuelven separando la porción antes de agregar.
    for (const tag of ing.tags) {
      if (under12 && SPLITTABLE_BLOCK_TAGS[tag]) {
        if (ri.addedAfterBabySplit || ri.optional) {
          excluded.push(ing.id);
        } else {
          issues.push({ severity: 'bloqueo', code: tag, message: `${ing.name}: ${SPLITTABLE_BLOCK_TAGS[tag]} Está en la base de la receta.`, ingredientId: ing.id });
        }
      }
    }

    if (!ingredientAppliesToBaby(ri, ing)) {
      if (!excluded.includes(ing.id)) excluded.push(ing.id);
      continue;
    }

    for (const tag of ing.tags) {
      const msg = HARD_BLOCK_TAGS[tag];
      if (!msg) continue;
      if (tag === 'miel' || tag === 'leche_vaca_bebida') {
        if (under12) issues.push({ severity: 'bloqueo', code: tag, message: `${ing.name}: ${msg}`, ingredientId: ing.id });
      } else {
        issues.push({ severity: 'bloqueo', code: tag, message: `${ing.name}: ${msg}`, ingredientId: ing.id });
      }
    }

    // Reacciones previas y alimentos nuevos.
    const intro = introById.get(ing.id);
    if (intro?.status === 'reaccion') {
      issues.push({ severity: 'bloqueo', code: 'reaccion_previa', message: `${ing.name}: tuvo una reacción registrada. Consultá con el pediatra antes de volver a ofrecerlo.`, ingredientId: ing.id });
    } else if (!intro || intro.status === 'pendiente') {
      newFoods.push(ing.id);
      const isAllergen = ing.tags.some((t) => t.startsWith('alergeno:'));
      issues.push({
        severity: 'confirmacion',
        code: isAllergen ? 'alergeno_nuevo' : 'alimento_nuevo',
        message: isAllergen
          ? `${ing.name} es un alérgeno que todavía no probó: introducilo solo, en pequeña cantidad, de día y siguiendo la indicación del pediatra.`
          : `${ing.name} es un alimento nuevo para ella: confirmá antes de incluirlo.`,
        ingredientId: ing.id,
      });
    }

    // Controles específicos por categoría.
    if (ing.category === 'pescado') issues.push({ severity: 'control', code: 'espinas', message: `${ing.name}: revisar cuidadosamente espinas.`, ingredientId: ing.id });
    if (ing.category === 'carne' || ing.category === 'pollo') issues.push({ severity: 'control', code: 'coccion', message: `${ing.name}: cocción completa y picado muy fino o desmenuzado.`, ingredientId: ing.id });
  }

  // Textura
  const allowed = ctx.profile.allowedTextures;
  const texture = (recipe.babyTextures ?? []).find((t) => allowed.includes(t));
  if (!recipe.babyTextures || recipe.babyTextures.length === 0) {
    issues.push({ severity: 'bloqueo', code: 'sin_textura', message: 'La receta no tiene una forma segura de adaptar la textura para ella.' });
  } else if (!texture) {
    issues.push({ severity: 'bloqueo', code: 'textura', message: 'Las texturas posibles de esta receta no están habilitadas para su etapa actual.' });
  } else {
    issues.push({ severity: 'adaptacion', code: 'textura', message: `Adaptar textura: ${TEXTURE_LABEL[texture]}.` });
  }

  if (excluded.length) {
    issues.push({ severity: 'adaptacion', code: 'separar', message: 'Separar su porción antes de agregar sal, condimentos u otros ingredientes no aptos.' });
  }

  const verdict: BabyVerdict = issues.some((i) => i.severity === 'bloqueo')
    ? 'bloqueado'
    : issues.some((i) => i.severity === 'confirmacion')
      ? 'requiere_confirmacion'
      : issues.some((i) => i.severity === 'adaptacion')
        ? 'apto_con_adaptacion'
        : 'apto';

  return {
    verdict,
    issues,
    excludedFromBabyPortion: [...new Set(excluded)],
    newFoods: [...new Set(newFoods)],
    checklist: [...CHECKLIST_BASE, ...ctx.profile.pediatricianNotes.map((n) => `Indicación del pediatra: ${n}`)],
    texture,
  };
}

export const TEXTURE_LABEL: Record<Texture, string> = {
  pure: 'puré liso',
  pisado: 'pisado con tenedor',
  trozos_blandos: 'trozos blandos que se aplasten entre los dedos',
  picado_fino: 'picado muy fino o desmenuzado',
  entero: 'formato habitual',
};

/**
 * Busca una alternativa segura para el bebé cuando la receta adulta está bloqueada.
 * Solo devuelve recetas 'apto' o 'apto_con_adaptacion' (nunca con alimentos nuevos sin confirmar),
 * priorizando las que comparten más ingredientes con la receta original.
 */
export function proposeSafeBabyAlternative(blocked: Recipe, catalog: Recipe[], ctx: BabyContext): { recipe: Recipe; evaluation: BabyEvaluation } | null {
  const base = new Set(blocked.ingredients.map((i) => i.ingredientId));
  const candidates = catalog
    .filter((r) => r.id !== blocked.id)
    .map((r) => ({ recipe: r, evaluation: evaluateRecipeForBaby(r, ctx) }))
    .filter((c) => c.evaluation.verdict === 'apto' || c.evaluation.verdict === 'apto_con_adaptacion')
    .map((c) => ({ ...c, shared: c.recipe.ingredients.filter((i) => base.has(i.ingredientId)).length }))
    .sort((a, b) => b.shared - a.shared || a.recipe.totalMinutes - b.recipe.totalMinutes);
  return candidates[0] ? { recipe: candidates[0].recipe, evaluation: candidates[0].evaluation } : null;
}

/** Valida un único ingrediente (para sustituciones y propuestas del asistente). */
export function isIngredientSafeForBaby(ing: Ingredient, ctx: BabyContext, opts: { addedAfterSplit?: boolean } = {}): { ok: boolean; reason?: string; needsConfirmation?: boolean } {
  const under12 = ctx.ageMonths < 12;
  if (!opts.addedAfterSplit) {
    for (const t of ing.tags) {
      if (under12 && SPLITTABLE_BLOCK_TAGS[t]) return { ok: false, reason: SPLITTABLE_BLOCK_TAGS[t] };
      if (HARD_BLOCK_TAGS[t] && (under12 || (t !== 'miel' && t !== 'leche_vaca_bebida'))) return { ok: false, reason: HARD_BLOCK_TAGS[t] };
    }
  }
  const intro = ctx.introductions.find((f) => f.ingredientId === ing.id);
  if (intro?.status === 'reaccion') return { ok: false, reason: 'Reacción registrada.' };
  if (!intro || intro.status === 'pendiente') return { ok: true, needsConfirmation: true };
  return { ok: true };
}
