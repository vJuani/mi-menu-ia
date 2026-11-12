// Tipos de dominio compartidos. Sin dependencias de React ni de la base.

export type Id = string;
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type MealSlot = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'colacion';
export const MEAL_SLOTS: MealSlot[] = ['desayuno', 'almuerzo', 'merienda', 'cena', 'colacion'];

export type MemberKind = 'adulto' | 'bebe';
export type Sex = 'hombre' | 'mujer';
export type ActivityLevel = 'sedentario' | 'ligero' | 'moderado' | 'alto' | 'muy_alto';
export type Goal = 'perder_grasa' | 'mantener' | 'ganar_musculo' | 'sin_meta';

/** Nivel de rechazo de un alimento. 'excluir' = nunca en su plato; 'evitar' = preferir sin. */
export type AversionLevel = 'excluir' | 'evitar';

export interface Aversion {
  /** Etiqueta del ingrediente o tag ("huevo", "avena", "harina", "papa", "arroz"). */
  tag: string;
  level: AversionLevel;
}

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Member {
  id: Id;
  name: string;
  shortName?: string;
  kind: MemberKind;
  sex?: Sex;
  birthDate?: string; // ISO yyyy-mm-dd
  heightCm?: number;
  weightKg?: number;
  activity?: ActivityLevel;
  trainingDaysPerWeek?: number;
  goal: Goal;
  aversions: Aversion[];
  /** Ingredientes que acepta como agregado opcional solo en su versión (p.ej. Ro: huevo). */
  optionalExtras: string[];
  allergies: string[];
  targets?: NutritionTargets; // configurables, nunca heredados de otro integrante
  isPrimary: boolean;
}

/** Información de etapa alimentaria del bebé. */
export interface BabyFeedingProfile {
  memberId: Id;
  startedComplementary: boolean; // confirmado por el adulto
  readinessSigns: boolean; // se sienta con apoyo, control de cabeza, interés, sin reflejo de extrusión
  pediatricianNotes: string[];
  /** Texturas habilitadas por el adulto/pediatra. */
  allowedTextures: Texture[];
}

export type Texture = 'pure' | 'pisado' | 'trozos_blandos' | 'picado_fino' | 'entero';

export type FoodIntroStatus = 'pendiente' | 'introducido' | 'tolerado' | 'reaccion';

export interface FoodIntroduction {
  id: Id;
  memberId: Id;
  ingredientId: Id;
  status: FoodIntroStatus;
  firstOfferedAt?: string;
  notes?: string;
  reaction?: string;
}

export type IngredientCategory =
  | 'carne' | 'pollo' | 'pescado' | 'huevo' | 'lacteo' | 'verdura' | 'fruta'
  | 'cereal' | 'legumbre' | 'grasa' | 'condimento' | 'panificado' | 'otro';

export interface Ingredient {
  id: Id;
  name: string;
  category: IngredientCategory;
  defaultUnit: Unit;
  /** gramos por unidad, para convertir "2 zapallitos" ↔ gramos. */
  gramsPerUnit?: number;
  /** Nutrición cada 100 g en el estado indicado en `nutritionBasis`. */
  per100g?: NutritionTargets;
  nutritionBasis?: 'crudo' | 'cocido';
  /** Tags usados por restricciones y reglas: "huevo", "harina", "arroz", "papa", "miel", "sal", "alergeno:huevo", "riesgo_atragantamiento" ... */
  tags: string[];
  aliases: string[];
}

export interface RecipeIngredient {
  ingredientId: Id;
  /** Cantidad para la receta base completa (servings). */
  qty: number;
  unit: Unit;
  state: 'crudo' | 'cocido';
  optional?: boolean;
  /** Se puede omitir u ofrecer aparte en un plato individual (guarnición, topping). */
  separable?: boolean;
  /** Si se agrega después de separar la porción del bebé (sal, picante, crema...). */
  addedAfterBabySplit?: boolean;
  note?: string;
}

export interface RecipeStep {
  order: number;
  text: string;
  timerSec?: number;
  /** Marca el paso donde se separa la porción de Helena. */
  babySplit?: boolean;
  tip?: string;
}

export interface Recipe {
  id: Id;
  name: string;
  imageUri?: string;
  totalMinutes: number;
  difficulty: 'facil' | 'media' | 'dificil';
  servings: number; // porciones adultas base
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  utensils: string[];
  storage?: string;
  tags: string[]; // "vianda", "lote", "rapida"
  /** Texturas posibles para la porción de bebé si la receta es apta. */
  babyTextures?: Texture[];
  isDemo?: boolean;
  /** Archivada: no se propone, pero se conserva para el historial. */
  archived?: boolean;
}

export type InventoryLocation = 'heladera' | 'freezer' | 'alacena';
export type LotState = 'cerrado' | 'abierto' | 'congelado' | 'preparado' | 'descongelando';

export interface InventoryLot {
  id: Id;
  ingredientId: Id;
  qty: number; // en unidad base del ingrediente (g, ml o un)
  unit: Unit;
  location: InventoryLocation;
  state: LotState;
  purchasedAt?: string;
  expiresAt?: string; // solo si el usuario lo cargó
  photoUri?: string;
}

export type MovementKind = 'compra' | 'consumo' | 'ajuste' | 'merma' | 'sobrante' | 'deshacer';

export interface StockMovement {
  id: Id;
  lotId: Id;
  ingredientId: Id;
  delta: number; // + entra, - sale (unidad del lote)
  kind: MovementKind;
  createdAt: string;
  /** Agrupa movimientos de una misma operación para poder deshacerla en bloque. */
  operationId: Id;
  revertedBy?: Id;
  note?: string;
}

export interface PlannedMeal {
  id: Id;
  date: string; // yyyy-mm-dd
  slot: MealSlot;
  recipeId: Id;
  /** Integrantes que comen esta comida. */
  memberIds: Id[];
  portionsByMember: Record<Id, number>; // multiplicador sobre 1 porción adulta
  forOffice?: boolean;
  status: 'planificada' | 'cocinada' | 'comida' | 'salteada';
  /** Sustituciones aplicadas: ingrediente original -> reemplazo */
  substitutions: Record<Id, Id>;
}

export interface Reminder {
  /** Clave determinística; evita duplicados. */
  key: string;
  title: string;
  body: string;
  fireAt: string; // ISO local
  kind: 'faltantes' | 'descongelar' | 'vianda' | 'empezar_cocina' | 'stock_bajo' | 'peso';
  refId?: Id;
}

export interface WeightEntry { id: Id; date: string; kg: number; }
export interface MeasurementEntry { id: Id; date: string; waistCm?: number; hipCm?: number; chestCm?: number; armCm?: number; }

export interface ConsumptionLog {
  id: Id;
  memberId: Id;
  date: string;
  slot: MealSlot;
  plannedMealId?: Id;
  description: string;
  kcal?: number;
  proteinG?: number;
}
