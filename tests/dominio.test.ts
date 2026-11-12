import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTargets, ageInMonths, adaptiveAdjustment, targetsForMember } from '../src/domain/nutrition.ts';
import { parseInventoryText } from '../src/domain/textParser.ts';
import { trendSeries, weeklyRate, dailyChangeMessage } from '../src/domain/progress.ts';
import { validateGeneratedProposal } from '../src/domain/assistant.ts';
import { convert } from '../src/domain/units.ts';
import { INGREDIENTS } from '../src/data/catalog.ts';
import { babyCtx, helena, ingredients, members, recipes, TOLERATED } from './helpers.ts';

describe('Nutrición', () => {
  it('déficit moderado y proteína suficiente para el perfil principal', () => {
    const t = estimateTargets({ sex: 'hombre', weightKg: 108, heightCm: 184, age: 30, activity: 'moderado', goal: 'perder_grasa' });
    assert.equal(t.bmr, 2085);
    assert.ok(t.deficitKcal <= 750 && t.deficitKcal > 0);
    assert.ok(t.kcal >= t.bmr);
    assert.ok(t.proteinG >= 160 && t.proteinG <= 180); // 2 g/kg de peso de referencia (≈85 kg)
    assert.ok(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal) <= 10);
  });
  it('nunca hay metas ni déficit para el bebé', () => {
    assert.equal(targetsForMember(helena), null);
  });
  it('edad de Helena calculada automáticamente', () => {
    assert.equal(ageInMonths('2026-04-20', new Date('2026-11-12T12:00:00')), 6);
    assert.equal(ageInMonths('2026-04-20', new Date('2027-04-20T12:00:00')), 12);
  });
  it('ajuste adaptativo requiere 2 semanas de datos', () => {
    assert.equal(adaptiveAdjustment(-2, 108, 7).deltaKcal, 0);
    assert.equal(adaptiveAdjustment(-1.5, 108, 21).deltaKcal, 150);
    assert.equal(adaptiveAdjustment(0, 108, 21).deltaKcal, -150);
  });
});

describe('Parser de texto libre', () => {
  it('"Tengo un kilo de pollo, cuatro zapallitos y dos calabazas"', () => {
    const r = parseInventoryText('Tengo un kilo de pollo, cuatro zapallitos y dos calabazas', INGREDIENTS);
    assert.deepEqual(r.map((x) => [x.ingredientId, x.qty, x.unit]), [['pollo', 1, 'kg'], ['zapallito', 4, 'un'], ['calabaza', 2, 'un']]);
  });
  it('medio kilo, gramos y kilo y medio', () => {
    const r = parseInventoryText('medio kilo de carne picada, 300 g de merluza y kilo y medio de pollo', INGREDIENTS);
    assert.deepEqual(r.map((x) => [x.ingredientId, x.qty, x.unit]), [['carne_picada', 0.5, 'kg'], ['merluza', 300, 'g'], ['pollo', 1.5, 'kg']]);
  });
  it('no inventa cantidades', () => {
    const r = parseInventoryText('tengo brócoli y algo raro', INGREDIENTS);
    assert.equal(r[0].ingredientId, 'brocoli');
    assert.equal(r[0].qty, null);
    assert.equal(r[1].ingredientId, undefined);
    assert.equal(r[1].confidence, 'baja');
  });
});

describe('Progreso', () => {
  it('la tendencia suaviza variaciones diarias', () => {
    const e = [108, 109.2, 107.6, 108.4, 107.9].map((kg, i) => ({ id: String(i), date: `2026-11-0${i + 1}`, kg }));
    const s = trendSeries(e);
    const swings = s.map((x) => x.trend);
    assert.ok(Math.max(...swings) - Math.min(...swings) < 0.5);
    assert.match(dailyChangeMessage(107.6, 108.4), /tendencia/);
  });
  it('ritmo semanal por regresión', () => {
    const e = Array.from({ length: 22 }, (_, i) => ({ id: String(i), date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), kg: 108 - i * (0.7 / 7) }));
    const r = weeklyRate(e);
    assert.equal(r.kgPerWeek, -0.7);
  });
});

describe('Unidades', () => {
  it('no inventa conversiones sin densidad', () => {
    assert.equal(convert(100, 'ml', 'g'), null);
    assert.equal(convert(2, 'un', 'g', ingredients.get('zapallito')), 400);
    assert.equal(convert(1.5, 'kg', 'g'), 1500);
  });
});

describe('Validación de respuestas generativas', () => {
  it('una propuesta de IA no puede saltear las reglas de Helena ni las restricciones', () => {
    const ctx = { todayISO: '2026-11-12', members, recipes: [...recipes.values()], ingredients, lots: [], meals: [], babyCtx: babyCtx({ ...TOLERATED }) };
    const bad = validateGeneratedProposal([
      { memberId: 'helena', ingredientNames: ['miel', 'nueces', 'calabaza'] },
      { memberId: 'yo', ingredientNames: ['huevo', 'pollo'] },
    ], ctx);
    assert.equal(bad.ok, false);
    assert.ok(bad.problems.some((p) => p.includes('Miel')));
    assert.ok(bad.problems.some((p) => /atragantamiento/.test(p)));
    assert.ok(bad.problems.some((p) => p.includes('no come Huevo')));
    const good = validateGeneratedProposal([{ memberId: 'helena', ingredientNames: ['calabaza', 'pollo'] }, { memberId: 'ro', ingredientNames: ['huevo'] }], ctx);
    assert.deepEqual(good.problems, []);
  });
});
