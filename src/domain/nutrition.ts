import type { ActivityLevel, Goal, Member, NutritionTargets, Sex } from './types.ts';

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  alto: 1.725,
  muy_alto: 1.9,
};

export function ageInYears(birthISO: string, today: Date = new Date()): number {
  const b = new Date(birthISO + 'T00:00:00');
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

/** Edad en meses cumplidos (para el bebé). */
export function ageInMonths(birthISO: string, today: Date = new Date()): number {
  const b = new Date(birthISO + 'T00:00:00');
  let months = (today.getFullYear() - b.getFullYear()) * 12 + (today.getMonth() - b.getMonth());
  if (today.getDate() < b.getDate()) months--;
  return Math.max(0, months);
}

/** Mifflin-St Jeor (1990): tasa metabólica en reposo, kcal/día. */
export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'hombre' ? base + 5 : base - 161;
}

/**
 * Peso de referencia para proteína/grasa en personas con exceso de peso:
 * se usa el peso equivalente a IMC 25 cuando el peso actual lo supera,
 * para no sobreestimar proteínas.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  const bmi25 = 25 * (heightCm / 100) ** 2;
  return Math.min(weightKg, bmi25);
}

export interface TargetInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}

export interface TargetResult extends NutritionTargets {
  bmr: number;
  tdee: number;
  deficitKcal: number;
  explanation: string[];
}

/**
 * Estimación inicial prudente:
 * - Déficit moderado: 20 % del gasto, máximo 750 kcal, nunca por debajo de la tasa basal.
 * - Proteína 2,0 g/kg de peso de referencia (rango aceptado 1,6–2,2 g/kg con entrenamiento de fuerza).
 * - Grasa 0,8 g/kg de referencia; carbohidratos = resto.
 */
export function estimateTargets(i: TargetInput): TargetResult {
  const bmr = mifflinStJeor(i.sex, i.weightKg, i.heightCm, i.age);
  const tdee = bmr * ACTIVITY_FACTOR[i.activity];
  let kcal = tdee;
  let deficit = 0;
  if (i.goal === 'perder_grasa') {
    deficit = Math.min(tdee * 0.2, 750);
    kcal = Math.max(tdee - deficit, bmr, i.sex === 'hombre' ? 1500 : 1200);
    deficit = tdee - kcal;
  } else if (i.goal === 'ganar_musculo') {
    kcal = tdee + 250;
  }
  const ref = referenceWeight(i.weightKg, i.heightCm);
  const proteinG = Math.round(ref * 2.0);
  const fatG = Math.round(ref * 0.8);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    deficitKcal: Math.round(deficit),
    proteinG, fatG, carbsG,
    explanation: [
      `Tasa basal (Mifflin-St Jeor): ${Math.round(bmr)} kcal`,
      `Gasto estimado con actividad: ${Math.round(tdee)} kcal`,
      i.goal === 'perder_grasa' ? `Déficit moderado: ${Math.round(deficit)} kcal/día` : 'Sin déficit',
      `Proteína: 2 g por kg de peso de referencia (${Math.round(ref)} kg)`,
      'Es una estimación inicial: se ajusta según la tendencia real de peso, no por un día aislado.',
    ],
  };
}

export function targetsForMember(m: Member, today = new Date()): TargetResult | null {
  if (m.kind === 'bebe') return null; // nunca metas calóricas ni déficit para el bebé
  if (!m.sex || !m.weightKg || !m.heightCm || !m.activity || !m.birthDate) return null;
  return estimateTargets({
    sex: m.sex, weightKg: m.weightKg, heightCm: m.heightCm,
    age: ageInYears(m.birthDate, today), activity: m.activity, goal: m.goal,
  });
}

/**
 * Ajuste según datos reales: compara el cambio semanal de la tendencia con
 * el esperado (0,5–1 % del peso por semana). Devuelve kcal a sumar/restar.
 * Requiere al menos 14 días de datos para no reaccionar a variaciones de agua.
 */
export function adaptiveAdjustment(trendKgPerWeek: number, weightKg: number, daysOfData: number): { deltaKcal: number; reason: string } {
  if (daysOfData < 14) return { deltaKcal: 0, reason: 'Faltan datos: se necesitan al menos 2 semanas de registros.' };
  const lossPct = (-trendKgPerWeek / weightKg) * 100;
  if (lossPct > 1.0) return { deltaKcal: +150, reason: 'Bajás más de 1 % por semana: conviene comer un poco más para cuidar el músculo.' };
  if (lossPct < 0.25) return { deltaKcal: -150, reason: 'La tendencia está casi estable: se sugiere un ajuste leve.' };
  return { deltaKcal: 0, reason: 'El ritmo está dentro de lo esperado.' };
}
