import { useMemo } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, DishImage, H2, Notice, Row, Screen, go } from '../ui.tsx';
import { computeShoppingList, missingSentence } from '../../../src/domain/shopping.ts';
import { generateWeek } from '../../../src/domain/planner.ts';
import { buildReminders } from '../../../src/domain/reminders.ts';
import { DIFFICULTY_LABEL, SLOT_LABEL, SLOTS_ORDER } from '../util.ts';

export function Hoy() {
  const { data, todayISO, commit } = useApp();
  const me = data.members.find((m) => m.isPrimary);
  const todays = data.meals.filter((m) => m.date === todayISO).sort((a, b) => SLOTS_ORDER.indexOf(a.slot) - SLOTS_ORDER.indexOf(b.slot));
  const missing = useMemo(() => computeShoppingList(todays, data.recipes, data.members, data.ingredients, data.lots), [data, todayISO]);
  // En la web no hay avisos con la app cerrada: se muestran acá los de las próximas 24 h.
  const soon = useMemo(() => {
    const now = new Date();
    const limit = new Date(now.getTime() + 24 * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const lim = `${limit.getFullYear()}-${p(limit.getMonth() + 1)}-${p(limit.getDate())}T${p(limit.getHours())}:${p(limit.getMinutes())}:00`;
    return buildReminders({ now, meals: data.meals, recipes: data.recipes, members: data.members, ingredients: data.ingredients, lots: data.lots, settings: data.reminderSettings, lastWeighInISO: data.lastWeighIn })
      .filter((r) => r.fireAt <= lim && r.kind !== 'faltantes');
  }, [data]);
  const dateLabel = new Date(todayISO + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  async function planWeek() {
    const adults = data.members.filter((m) => m.kind === 'adulto');
    const week = generateWeek(todayISO, data.recipeList, adults, data.lots, data.ingredients);
    await commit(async (repo) => { for (const m of week) await repo.saveMeal(m); });
  }

  return (
    <Screen>
      <div class="hello">
        <h1>Hola 👋<br />¿Qué comemos hoy?</h1>
        <Body muted>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</Body>
      </div>
      <div class="grid2">
        <Card tone="primary" onPress={() => go('progreso')}>
          <Body small muted>Tu objetivo</Body>
          <Body bold>{me?.goal === 'perder_grasa' ? 'Bajar grasa' : me?.goal === 'ganar_musculo' ? 'Ganar músculo' : 'Mantener'}</Body>
          {me?.targets ? <Body small muted>{me.targets.kcal} kcal · {me.targets.proteinG} g prot.</Body> : null}
        </Card>
        <Card tone="accent" onPress={() => go('compras')}>
          <Body small muted>Inventario</Body>
          <Body bold>{missing.length ? `${missing.length} faltante${missing.length > 1 ? 's' : ''}` : 'Tenés todo'}</Body>
          <Body small muted>Para hoy</Body>
        </Card>
      </div>
      {missing.length ? <Notice>{missingSentence(missing, 'hoy')}</Notice> : null}
      {soon.map((r) => <Notice tone="primary">⏰ {r.fireAt.slice(11, 16)} · <b>{r.title}</b> — {r.body}</Notice>)}

      {todays.length === 0 ? (
        <Card>
          <Body>No hay comidas planificadas para hoy.</Body>
          <Button title="Armar la semana con lo que tengo" onPress={planWeek} />
        </Card>
      ) : todays.map((meal) => {
        const r = data.recipes.get(meal.recipeId);
        if (!r) return null;
        const done = meal.status === 'comida' || meal.status === 'cocinada';
        return (
          <Card tone={done ? 'primary' : undefined} onPress={() => go(`receta/${r.id}`, { mealId: meal.id })} cls="meal-row">
            <DishImage recipe={r} />
            <div class="grow">
              <Body small muted>{SLOT_LABEL[meal.slot]} · {data.reminderSettings.mealTimes[meal.slot]}{meal.forOffice ? ' · 🥡 vianda' : ''}</Body>
              <Body bold>{r.name}</Body>
              <Body small muted>{r.totalMinutes} min · {DIFFICULTY_LABEL[r.difficulty]}</Body>
            </div>
            <span class="big">{done ? '✅' : '⚪️'}</span>
          </Card>
        );
      })}

      <H2>Accesos rápidos</H2>
      <Row wrap>
        <Button small kind="secondary" title="🛒 Compras" onPress={() => go('compras')} />
        <Button small kind="secondary" title="💬 ¿Qué cocino?" onPress={() => go('asistente')} />
        <Button small kind="secondary" title="⚖️ Registrar peso" onPress={() => go('progreso')} />
        <Button small kind="secondary" title="📖 Recetario" onPress={() => go('recetas')} />
      </Row>
    </Screen>
  );
}
