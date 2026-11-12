import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, DishImage, H2, Notice, Row, Screen, Stepper, go, sheet, alertMsg } from '../ui.tsx';
import { buildFamilyVersions } from '../../../src/domain/adaptations.ts';
import type { MemberVersion } from '../../../src/domain/adaptations.ts';
import { proposeSafeBabyAlternative, TEXTURE_LABEL } from '../../../src/domain/babySafety.ts';
import { availableQty } from '../../../src/domain/inventory.ts';
import { baseUnitFor, computeShoppingList } from '../../../src/domain/shopping.ts';
import { findSubstitutes, applySubstitution } from '../../../src/domain/substitutions.ts';
import { convert, formatQty } from '../../../src/domain/units.ts';
import { DIFFICULTY_LABEL } from '../util.ts';

export function Receta({ id, mealId }: { id: string; mealId?: string }) {
  const { data, commit, todayISO, repo } = useApp();
  const recipe = data.recipes.get(id);
  const meal = data.meals.find((m) => m.id === mealId);
  const [tab, setTab] = useState<'receta' | 'ingredientes' | 'nutricion'>('receta');
  const [scale, setScale] = useState(1);
  const eaters = data.members.filter((m) => (meal ? meal.memberIds.includes(m.id) || m.kind === 'bebe' : true));
  const portions = meal?.portionsByMember ?? Object.fromEntries(data.members.map((m) => [m.id, 1]));
  const subs = meal?.substitutions ?? {};
  const family = useMemo(() => (recipe ? buildFamilyVersions(recipe, eaters, Object.fromEntries(Object.entries(portions).map(([k, v]) => [k, v * scale])), data.ingredients, data.babyCtx, subs) : null), [recipe, data, scale, mealId]);
  const missing = useMemo(() => (recipe && meal ? computeShoppingList([meal], data.recipes, data.members, data.ingredients, data.lots) : []), [recipe, meal, data]);

  if (!recipe || !family) return <Screen><Body>Receta no encontrada.</Body></Screen>;
  const baby = family.versions.find((v) => v.status === 'bebe');
  const adults = family.versions.filter((v) => v.status !== 'bebe');

  function noTengo(ingredientId: string) {
    if (!meal) return alertMsg('Planificá la comida primero para guardar reemplazos.');
    const ri = recipe!.ingredients.find((x) => (subs[x.ingredientId] ?? x.ingredientId) === ingredientId);
    const options = findSubstitutes(ingredientId, meal, data.members, data.ingredients, data.lots, data.babyCtx, { addedAfterBabySplit: ri?.addedAfterBabySplit });
    if (!options.length) return sheet('Sin reemplazo válido', 'No hay un reemplazo que respete las restricciones de todos.', [{ text: 'Cambiar comida', onPress: () => go(`cambiar/${meal.id}`) }]);
    sheet(`Reemplazar ${data.ingredients.get(ingredientId)?.name}`, 'Se actualizan receta, nutrición y compras.', options.slice(0, 4).map((o) => ({
      text: `${o.ingredient.name}${o.inStock > 0 ? ' ✓ en casa' : ''}${o.babyNeedsConfirmation ? ' (nuevo p/ Helena)' : ''}`,
      onPress: () => commit((r) => r.saveMeal(applySubstitution(meal, ingredientId, o.ingredient.id))),
    })));
  }

  function ateIt() {
    if (!meal) return;
    const mine = adults.find((v) => data.members.find((m) => m.id === v.memberId)?.isPrimary);
    sheet('¿Comiste esta comida?', 'Se registra con la porción planificada.', [
      { text: 'Sí, tal cual', onPress: () => commit(async (repo) => {
        await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, plannedMealId: meal.id, description: recipe!.name, kcal: mine?.nutrition?.kcal, proteinG: mine?.nutrition?.proteinG });
        await repo.setMealStatus(meal.id, 'comida');
      }) },
      { text: 'Comí otra cosa', onPress: () => commit(async (repo) => {
        await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, description: 'Otra comida (sin detalle)' });
        await repo.setMealStatus(meal.id, 'salteada');
      }) },
    ]);
  }

  function leftovers() {
    sheet('Guardar sobrantes', recipe!.storage ?? '¿Dónde lo guardás?', [
      { text: 'Heladera (1 porción)', onPress: () => commit((r) => r.addLeftover({ recipeId: recipe!.id, plannedMealId: meal?.id, description: recipe!.name, portions: 1, location: 'heladera' })) },
      { text: 'Freezer (1 porción)', onPress: () => commit((r) => r.addLeftover({ recipeId: recipe!.id, plannedMealId: meal?.id, description: recipe!.name, portions: 1, location: 'freezer' })) },
    ]);
  }

  function confirmNewFood(ingredientId: string) {
    const helena = data.members.find((m) => m.kind === 'bebe');
    if (!helena) return;
    sheet(`¿Introducir ${data.ingredients.get(ingredientId)?.name}?`, 'Ofrecelo solo, en pequeña cantidad, de día, y observá durante las horas siguientes. Si el pediatra indicó otra cosa, seguí su indicación.', [
      { text: 'Sí, lo voy a ofrecer', onPress: () => commit((r) => r.setIntroduction(helena.id, ingredientId, 'introducido', { date: todayISO })) },
      { text: 'Todavía no', style: 'cancel' },
    ]);
  }

  async function actions() {
    sheet(recipe!.name, undefined, [
      { text: 'Editar', onPress: () => go('editar', { id: recipe!.id }) },
      { text: 'Duplicar y modificar', onPress: () => go('editar', { dup: recipe!.id }) },
      recipe!.archived
        ? { text: 'Restaurar', onPress: () => commit((r) => r.setRecipeArchived(recipe!.id, false)) }
        : { text: 'Archivar', style: 'destructive', onPress: async () => {
            const n = await repo.upcomingMealsWithRecipe(recipe!.id, todayISO);
            const doIt = () => commit((r) => r.setRecipeArchived(recipe!.id, true));
            if (!n) return doIt();
            sheet('Está en el plan', `Hay ${n} comida(s) futuras con esta receta. Se mantienen; cambialas desde el plan si querés.`, [{ text: 'Archivar igual', style: 'destructive', onPress: doIt }]);
          } },
    ]);
  }

  const alt = baby?.baby?.verdict === 'bloqueado' && data.babyCtx ? proposeSafeBabyAlternative(recipe, data.recipeList, data.babyCtx) : null;

  return (
    <Screen>
      <Row between><span /><button class="link bold" onClick={actions}>Editar ⋯</button></Row>
      {recipe.archived ? <Notice>Receta archivada: no se propone en el plan.</Notice> : null}
      <div class="meal-row">
        <DishImage recipe={recipe} size={88} />
        <div class="grow">
          <h1 class="h1-small">{recipe.name}</h1>
          <Body small muted>⏱ {recipe.totalMinutes} min · {DIFFICULTY_LABEL[recipe.difficulty]} · {family.versions.length} versiones</Body>
        </div>
      </div>
      {missing.length ? <Notice>Faltan: {missing.map((l) => `${l.name} (${formatQty(l.toBuy, l.unit)})`).join(', ')}</Notice> : meal ? <Notice tone="primary">Tenés todos los ingredientes.</Notice> : null}
      <div class="segmented">
        {(['receta', 'ingredientes', 'nutricion'] as const).map((t) => <Chip label={{ receta: 'Receta', ingredientes: 'Ingredientes', nutricion: 'Nutrición' }[t]} active={tab === t} onPress={() => setTab(t)} />)}
      </div>

      {tab === 'receta' && (
        <>
          <Body muted>Una receta base para todos, con adaptaciones para cada uno.</Body>
          {adults.map((v) => <VersionCard v={v} tone={data.members.find((m) => m.id === v.memberId)?.isPrimary ? 'primary' : 'ro'} />)}
          {baby ? (
            <Card tone="baby">
              <Body bold>Para {baby.memberName}</Body>
              {baby.baby!.verdict === 'bloqueado' ? (
                <>
                  <Body>⛔ Necesita una alternativa independiente.</Body>
                  {baby.baby!.issues.filter((i) => i.severity === 'bloqueo').map((i) => <Body small>• {i.message}</Body>)}
                  {alt ? <Button small kind="secondary" title={`Ver alternativa: ${alt.recipe.name}`} onPress={() => go(`receta/${alt.recipe.id}`)} /> : null}
                </>
              ) : (
                <>
                  {baby.baby!.texture ? <Body small>Textura: {TEXTURE_LABEL[baby.baby!.texture]}</Body> : null}
                  {baby.lines.length ? <Body small>Puede comer: {baby.lines.map((l) => l.name.toLowerCase()).join(', ')}</Body> : null}
                  {baby.removed.length ? <Body small>Sin: {baby.removed.map((r) => r.name.toLowerCase()).join(', ')} (separar su porción antes)</Body> : null}
                  {baby.baby!.newFoods.map((f) => (
                    <Row between><Body small>🆕 {data.ingredients.get(f)?.name}: nuevo para ella</Body><Button small kind="ghost" title="Confirmar" onPress={() => confirmNewFood(f)} /></Row>
                  ))}
                  <Body small muted>Porción según su apetito. Antes de servir:</Body>
                  {baby.baby!.checklist.slice(0, 4).map((c) => <Body small muted>✓ {c}</Body>)}
                </>
              )}
            </Card>
          ) : null}
          <H2>Pasos</H2>
          {recipe.steps.map((s) => (
            <Card tone={s.babySplit ? 'baby' : undefined}>
              <Body><b>{s.order}. </b>{s.text}</Body>
              {s.tip ? <Body small muted>💡 {s.tip}</Body> : null}
            </Card>
          ))}
          {recipe.utensils.length ? <Body small muted>Utensilios: {recipe.utensils.join(', ')}</Body> : null}
          {recipe.storage ? <Body small muted>Conservación: {recipe.storage}</Body> : null}
        </>
      )}

      {tab === 'ingredientes' && (
        <>
          <Row between><Body>Escalar receta</Body><Stepper value={scale} step={0.5} min={0.5} onChange={setScale} suffix="×" /></Row>
          {recipe.ingredients.map((ri) => {
            const ingId = subs[ri.ingredientId] ?? ri.ingredientId;
            const ing = data.ingredients.get(ingId);
            if (!ing) return null;
            const unit = baseUnitFor(ing);
            const have = availableQty(ingId, data.lots, unit, ing);
            const need = convert(ri.qty * scale, ri.unit, unit, ing) ?? ri.qty * scale;
            return (
              <Card>
                <Row between>
                  <div class="grow">
                    <Body bold>{ing.name}{subs[ri.ingredientId] ? ' (reemplazo)' : ''}</Body>
                    <Body small muted>{formatQty(ri.qty * scale, ri.unit)} · peso {ri.state}{ri.optional ? ' · opcional' : ''}{ri.separable ? ' · se puede servir aparte' : ''}{ri.addedAfterBabySplit ? ' · después de separar a Helena' : ''}</Body>
                    {ri.note ? <Body small muted>{ri.note}</Body> : null}
                  </div>
                  <div class="right-col">
                    <Body small>{have >= need ? '✓ en casa' : have > 0 ? `tenés ${formatQty(have, unit)}` : 'falta'}</Body>
                    {meal && !ing.tags.includes('basico') ? <button class="link small" onClick={() => noTengo(ingId)}>No tengo</button> : null}
                  </div>
                </Row>
              </Card>
            );
          })}
        </>
      )}

      {tab === 'nutricion' && (
        <>
          <Notice>Estimaciones con tablas de referencia, por porción. Los pesos se indican en crudo o cocido según cada ingrediente.</Notice>
          {adults.map((v) => <Card><Body bold>{v.memberName}</Body><Body>≈ {v.nutrition?.kcal} kcal · {v.nutrition?.proteinG} g proteína · {v.nutrition?.carbsG} g HC · {v.nutrition?.fatG} g grasa</Body></Card>)}
          <Body small muted>Para Helena no se calculan calorías ni metas.</Body>
        </>
      )}

      <Button title="Empezar a cocinar" icon="👨‍🍳" onPress={() => go(`cocina/${recipe.id}`, { mealId: meal?.id, scale: String(scale) })} />
      {meal ? (
        <div class="grid2">
          <Button small kind="secondary" title="Cambiar comida" onPress={() => go(`cambiar/${meal.id}`)} />
          <Button small kind="secondary" title="Ya comí" onPress={ateIt} />
        </div>
      ) : null}
      <Button small kind="ghost" title="Guardar sobrantes" onPress={leftovers} />
    </Screen>
  );
}

function VersionCard({ v, tone }: { v: MemberVersion; tone: 'primary' | 'ro' }) {
  return (
    <Card tone={tone}>
      <Body bold>Para {v.memberName}{v.status === 'no_apta' ? ' — no apta' : ''}</Body>
      {v.lines.map((l) => <Body small>{l.extra ? '➕ ' : '• '}{formatQty(l.qty, l.unit)} de {l.name.toLowerCase()} ({l.state})</Body>)}
      {v.removed.length ? <Body small muted>Sin: {v.removed.map((r) => `${r.name.toLowerCase()} (${r.reason.toLowerCase()})`).join(', ')}</Body> : null}
      {v.notes.map((n) => <Body small muted>{n}</Body>)}
      {v.nutrition ? <Body small muted>≈ {v.nutrition.kcal} kcal · {v.nutrition.proteinG} g prot · {v.nutrition.carbsG} g HC · {v.nutrition.fatG} g grasa</Body> : null}
    </Card>
  );
}
