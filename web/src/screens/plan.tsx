import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, DishImage, Row, Screen, alertMsg, go, sheet, back } from '../ui.tsx';
import { addDays, generateWeek, suggestRecipes } from '../../../src/domain/planner.ts';
import { evaluateRecipeForBaby } from '../../../src/domain/babySafety.ts';
import { newId } from '../../../src/domain/inventory.ts';
import type { MealSlot, PlannedMeal } from '../../../src/domain/types.ts';
import { SLOT_LABEL, dayLabel } from '../util.ts';

const SLOTS: MealSlot[] = ['desayuno', 'almuerzo', 'merienda', 'cena'];
function mondayOf(iso: string): string { const d = new Date(iso + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); }

export function Plan() {
  const { data, todayISO, commit } = useApp();
  const [start, setStart] = useState(mondayOf(todayISO));
  const [view, setView] = useState<'semana' | 'dia'>('semana');
  const [day, setDay] = useState(todayISO);
  const days = view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [day];
  const shift = (n: number) => (view === 'semana' ? setStart(addDays(start, 7 * n)) : setDay(addDays(day, n)));

  async function fillEmpty() {
    const adults = data.members.filter((m) => m.kind === 'adulto');
    const proposal = generateWeek(start, data.recipeList, adults, data.lots, data.ingredients, SLOTS);
    const taken = new Set(data.meals.map((m) => `${m.date}|${m.slot}`));
    const fresh = proposal.filter((m) => !taken.has(`${m.date}|${m.slot}`) && m.date >= todayISO);
    await commit(async (repo) => { for (const m of fresh) await repo.saveMeal(m); });
    alertMsg('Plan actualizado', `${fresh.length} comidas agregadas. El inventario no se modifica hasta que cocines.`);
  }

  function mealMenu(meal: PlannedMeal, name: string) {
    sheet(name, SLOT_LABEL[meal.slot], [
      { text: 'Ver receta', onPress: () => go(`receta/${meal.recipeId}`, { mealId: meal.id }) },
      { text: meal.forOffice ? 'Quitar vianda' : 'Marcar como vianda', onPress: () => commit((r) => r.saveMeal({ ...meal, forOffice: !meal.forOffice || undefined })) },
      { text: 'Cambiar comida', onPress: () => go(`cambiar/${meal.id}`) },
      { text: 'Eliminar', style: 'destructive', onPress: () => commit((r) => r.deleteMeal(meal.id)) },
    ]);
  }

  return (
    <Screen>
      <Row between>
        <button class="link big" onClick={() => shift(-1)}>‹</button>
        <Body bold>{view === 'semana' ? `${dayLabel(start, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(start, 6), { day: 'numeric', month: 'short' })}` : dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
        <button class="link big" onClick={() => shift(1)}>›</button>
      </Row>
      <div class="grid2">
        <Button small kind={view === 'semana' ? 'primary' : 'secondary'} title="Semana" onPress={() => setView('semana')} />
        <Button small kind={view === 'dia' ? 'primary' : 'secondary'} title="Día" onPress={() => setView('dia')} />
      </div>
      {days.map((date) => (
        <Card tone={date === todayISO ? 'primary' : undefined}>
          <button class="link bold" onClick={() => { setDay(date); setView('dia'); }}>{dayLabel(date, { weekday: 'long', day: 'numeric' })}</button>
          {SLOTS.map((slot) => {
            const meal = data.meals.find((m) => m.date === date && m.slot === slot);
            const r = meal ? data.recipes.get(meal.recipeId) : undefined;
            if (!meal || !r) return <div class="plan-slot empty" onClick={() => go('cambiar/nuevo', { date, slot })}><span class="muted small">{SLOT_LABEL[slot]}</span><span class="muted small">＋ agregar</span></div>;
            return (
              <div class="plan-slot" onClick={() => mealMenu(meal, r.name)}>
                <DishImage recipe={r} size={40} />
                <div class="grow">
                  <Body small muted>{SLOT_LABEL[slot]}{meal.forOffice ? ' · 🥡' : ''}{meal.status !== 'planificada' ? ` · ${meal.status}` : ''}</Body>
                  <Body>{r.name}</Body>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
      <Button title="Completar huecos con lo que tengo" onPress={fillEmpty} />
    </Screen>
  );
}

export function Cambiar({ mealId, date, slot }: { mealId: string; date?: string; slot?: MealSlot }) {
  const { data, commit } = useApp();
  const meal = data.meals.find((m) => m.id === mealId);
  const targetSlot = (meal?.slot ?? slot ?? 'cena') as MealSlot;
  const [maxMin, setMaxMin] = useState<number | undefined>();
  const [office, setOffice] = useState(!!meal?.forOffice);
  const adults = data.members.filter((m) => m.kind === 'adulto' && (!meal || meal.memberIds.includes(m.id)));
  const recent = data.meals.slice(-8).map((m) => m.recipeId);
  const list = useMemo(() => suggestRecipes(data.recipeList, adults, data.lots, data.ingredients, { slot: targetSlot, maxMinutes: maxMin, forOffice: office, recentRecipeIds: recent }), [data, targetSlot, maxMin, office]);

  async function pick(recipeId: string) {
    const next: PlannedMeal = meal
      ? { ...meal, recipeId, substitutions: {}, forOffice: office || undefined }
      : { id: newId('meal'), date: date!, slot: targetSlot, recipeId, memberIds: data.members.filter((m) => m.kind === 'adulto').map((m) => m.id), portionsByMember: Object.fromEntries(data.members.map((m) => [m.id, 1])), status: 'planificada', substitutions: {}, forOffice: office || undefined };
    await commit((repo) => repo.saveMeal(next));
    back('plan');
  }

  return (
    <Screen>
      <Body muted>{SLOT_LABEL[targetSlot]}{date ? ` · ${dayLabel(date, { weekday: 'long', day: 'numeric' })}` : ''} · ordenado por lo que tenés en casa</Body>
      <Row wrap>
        <Chip label="≤ 20 min" active={maxMin === 20} onPress={() => setMaxMin(maxMin === 20 ? undefined : 20)} />
        <Chip label="≤ 30 min" active={maxMin === 30} onPress={() => setMaxMin(maxMin === 30 ? undefined : 30)} />
        <Chip label="🥡 Vianda" active={office} onPress={() => setOffice(!office)} />
      </Row>
      {list.length === 0 ? <Body muted>No hay recetas que cumplan los filtros y sirvan para todos.</Body> : null}
      {list.map((s) => {
        const baby = data.babyCtx ? evaluateRecipeForBaby(s.recipe, data.babyCtx) : null;
        return (
          <Card onPress={() => pick(s.recipe.id)} tone={s.recipe.id === meal?.recipeId ? 'primary' : undefined} cls="meal-row">
            <DishImage recipe={s.recipe} size={52} />
            <div class="grow">
              <Body bold>{s.recipe.name}</Body>
              <Body small muted>{s.recipe.totalMinutes} min · {Math.round(s.coverage * 100)} % en casa{s.missing.length ? ` · faltan ${s.missing.length}` : ''}</Body>
              {baby ? <Body small muted>Helena: {baby.verdict === 'bloqueado' ? 'necesita alternativa' : baby.verdict === 'requiere_confirmacion' ? 'con alimentos nuevos' : 'puede compartir adaptada'}</Body> : null}
            </div>
          </Card>
        );
      })}
    </Screen>
  );
}
