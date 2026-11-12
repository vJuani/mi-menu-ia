import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Body, Button, Card, Chip, DishImage, H2, Notice, Row, Screen, Stepper } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { buildFamilyVersions } from '../../src/domain/adaptations';
import type { MemberVersion } from '../../src/domain/adaptations';
import { proposeSafeBabyAlternative, TEXTURE_LABEL } from '../../src/domain/babySafety';
import { availableQty } from '../../src/domain/inventory';
import { baseUnitFor, computeShoppingList } from '../../src/domain/shopping';
import { findSubstitutes, applySubstitution } from '../../src/domain/substitutions';
import { convert, formatQty } from '../../src/domain/units';
import { DIFFICULTY_LABEL, SLOT_LABEL } from '../../src/ui/labels';
import { space } from '../../src/ui/theme';

export default function RecipeScreen() {
  const { id, mealId } = useLocalSearchParams<{ id: string; mealId?: string }>();
  const { data, commit, todayISO, repo } = useAppData();
  const recipe = data.recipes.get(id);
  const meal = data.meals.find((m) => m.id === mealId);
  const [tab, setTab] = useState<'receta' | 'ingredientes' | 'nutricion'>('receta');
  const [scale, setScale] = useState(1);
  const eaters = useMemo(() => data.members.filter((m) => (meal ? meal.memberIds.includes(m.id) || m.kind === 'bebe' : true)), [data.members, meal]);
  const portions = meal?.portionsByMember ?? Object.fromEntries(data.members.map((m) => [m.id, 1]));
  const subs = meal?.substitutions ?? {};

  const family = useMemo(() => recipe ? buildFamilyVersions(recipe, eaters, Object.fromEntries(Object.entries(portions).map(([k, v]) => [k, v * scale])), data.ingredients, data.babyCtx, subs) : null, [recipe, eaters, portions, scale, data, subs]);
  const missing = useMemo(() => (recipe && meal ? computeShoppingList([meal], data.recipes, data.members, data.ingredients, data.lots) : []), [recipe, meal, data]);

  if (!recipe || !family) return <Screen><Body>Receta no encontrada.</Body></Screen>;
  const baby = family.versions.find((v) => v.status === 'bebe');
  const adults = family.versions.filter((v) => v.status !== 'bebe');

  function recipeActions() {
    Alert.alert(recipe!.name, undefined, [
      { text: 'Editar', onPress: () => router.push({ pathname: '/receta/editar', params: { id: recipe!.id } }) },
      { text: 'Duplicar y modificar', onPress: () => router.push({ pathname: '/receta/editar', params: { dup: recipe!.id } }) },
      recipe!.archived
        ? { text: 'Restaurar', onPress: () => commit((r) => r.setRecipeArchived(recipe!.id, false)) }
        : { text: 'Archivar', style: 'destructive' as const, onPress: async () => {
            const n = await repo.upcomingMealsWithRecipe(recipe!.id, todayISO);
            const go = () => commit((r) => r.setRecipeArchived(recipe!.id, true));
            if (!n) return go();
            Alert.alert('Está en el plan', `Hay ${n} comida(s) futuras con esta receta. Se mantienen; cambialas desde el plan si querés.`, [{ text: 'Archivar igual', style: 'destructive' as const, onPress: go }, { text: 'Cancelar', style: 'cancel' as const }]);
          } },
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  async function onNoTengo(ingredientId: string) {
    if (!meal) return Alert.alert('Planificá la comida primero para guardar reemplazos.');
    const ri = recipe!.ingredients.find((x) => (subs[x.ingredientId] ?? x.ingredientId) === ingredientId);
    const options = findSubstitutes(ingredientId, meal, data.members, data.ingredients, data.lots, data.babyCtx, { addedAfterBabySplit: ri?.addedAfterBabySplit });
    if (!options.length) {
      return Alert.alert('Sin reemplazo válido', 'No hay un reemplazo que respete las restricciones de todos. Podés cambiar la comida.', [
        { text: 'Cambiar comida', onPress: () => router.push({ pathname: '/cambiar/[mealId]', params: { mealId: meal.id } }) }, { text: 'Cerrar', style: 'cancel' },
      ]);
    }
    Alert.alert(`Reemplazar ${data.ingredients.get(ingredientId)?.name}`, 'Se actualizan receta, nutrición, compras y recordatorios.', [
      ...options.slice(0, 4).map((o) => ({
        text: `${o.ingredient.name}${o.inStock > 0 ? ' ✓' : ''}${o.babyNeedsConfirmation ? ' (nuevo p/ Helena)' : ''}`,
        onPress: () => commit((repo) => repo.saveMeal(applySubstitution(meal, ingredientId, o.ingredient.id))),
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  function ateIt() {
    if (!meal) return;
    const mine = adults.find((v) => data.members.find((m) => m.id === v.memberId)?.isPrimary);
    Alert.alert('¿Comiste esta comida?', 'Se registra con la porción planificada. Podés ajustarla después.', [
      { text: 'Sí, tal cual', onPress: () => commit(async (repo) => {
        await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, plannedMealId: meal.id, description: recipe!.name, kcal: mine?.nutrition?.kcal, proteinG: mine?.nutrition?.proteinG });
        await repo.setMealStatus(meal.id, 'comida');
      }) },
      { text: 'Comí otra cosa', onPress: () => commit(async (repo) => {
        await repo.logConsumption({ memberId: mine?.memberId ?? 'yo', date: meal.date, slot: meal.slot, description: 'Otra comida (sin detalle)' });
        await repo.setMealStatus(meal.id, 'salteada');
      }) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function saveLeftovers() {
    Alert.alert('Guardar sobrantes', '¿Dónde lo guardás?', [
      { text: 'Heladera (1 porción)', onPress: () => commit((repo) => repo.addLeftover({ recipeId: recipe!.id, plannedMealId: meal?.id, description: recipe!.name, portions: 1, location: 'heladera' })) },
      { text: 'Freezer (1 porción)', onPress: () => commit((repo) => repo.addLeftover({ recipeId: recipe!.id, plannedMealId: meal?.id, description: recipe!.name, portions: 1, location: 'freezer' })) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
    if (recipe!.storage) Alert.alert('Conservación', recipe!.storage);
  }

  function confirmNewFood(ingredientId: string) {
    const helena = data.members.find((m) => m.kind === 'bebe');
    if (!helena) return;
    const name = data.ingredients.get(ingredientId)?.name;
    Alert.alert(`¿Introducir ${name}?`, 'Ofrecelo solo, en pequeña cantidad, de día, y observá durante las horas siguientes. Si el pediatra indicó otra cosa, seguí su indicación.', [
      { text: 'Sí, lo voy a ofrecer', onPress: () => commit((repo) => repo.setIntroduction(helena.id, ingredientId, 'introducido', { date: todayISO })) },
      { text: 'Todavía no', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: meal ? SLOT_LABEL[meal.slot] : 'Receta', headerRight: () => <Pressable onPress={recipeActions} hitSlop={10}><Body bold>Editar</Body></Pressable> }} />
      {recipe.archived ? <Notice>Receta archivada: no se propone en el plan.</Notice> : null}
      <Row gap={space.md}>
        <DishImage recipe={recipe} size={88} />
        <View style={{ flex: 1, gap: 4 }}>
          <Body bold style={{ fontSize: 22 }}>{recipe.name}</Body>
          <Body small muted>⏱ {recipe.totalMinutes} min · {DIFFICULTY_LABEL[recipe.difficulty]} · {family.versions.length} versiones</Body>
        </View>
      </Row>

      {missing.length ? (
        <Notice>Faltan: {missing.map((l) => `${l.name} (${formatQty(l.toBuy, l.unit)})`).join(', ')}</Notice>
      ) : meal ? <Notice tone="primary">Tenés todos los ingredientes.</Notice> : null}

      <Row gap={space.sm}>
        {(['receta', 'ingredientes', 'nutricion'] as const).map((t) => <Chip key={t} label={{ receta: 'Receta', ingredientes: 'Ingredientes', nutricion: 'Nutrición' }[t]} active={tab === t} onPress={() => setTab(t)} />)}
      </Row>

      {tab === 'receta' && (
        <>
          <Body muted>Una receta base para todos, con adaptaciones para cada uno.</Body>
          {adults.map((v) => <VersionCard key={v.memberId} v={v} tone={data.members.find((m) => m.id === v.memberId)?.isPrimary ? 'primary' : 'ro'} />)}
          {baby ? (
            <Card tone="baby">
              <Body bold>Para {baby.memberName}</Body>
              {baby.baby!.verdict === 'bloqueado' ? (
                <>
                  <Body>⛔ Necesita una alternativa independiente.</Body>
                  {baby.baby!.issues.filter((i) => i.severity === 'bloqueo').map((i) => <Body key={i.code + (i.ingredientId ?? '')} small>• {i.message}</Body>)}
                  {data.babyCtx ? (() => {
                    const alt = proposeSafeBabyAlternative(recipe, data.recipeList, data.babyCtx);
                    return alt ? <Button small kind="secondary" title={`Ver alternativa: ${alt.recipe.name}`} onPress={() => router.push({ pathname: '/receta/[id]', params: { id: alt.recipe.id } })} /> : null;
                  })() : null}
                </>
              ) : (
                <>
                  <Body small>{baby.baby!.texture ? `Textura: ${TEXTURE_LABEL[baby.baby!.texture]}` : ''}</Body>
                  {baby.lines.length ? <Body small>Puede comer: {baby.lines.map((l) => l.name.toLowerCase()).join(', ')}</Body> : null}
                  {baby.removed.length ? <Body small>Sin: {baby.removed.map((r) => r.name.toLowerCase()).join(', ')} (separar su porción antes)</Body> : null}
                  {baby.baby!.newFoods.map((f) => (
                    <Row key={f} style={{ justifyContent: 'space-between' }}>
                      <Body small>🆕 {data.ingredients.get(f)?.name}: nuevo para ella</Body>
                      <Button small kind="ghost" title="Confirmar" onPress={() => confirmNewFood(f)} />
                    </Row>
                  ))}
                  <Body small muted>Porción según su apetito. Antes de servir:</Body>
                  {baby.baby!.checklist.slice(0, 4).map((c) => <Body key={c} small muted>✓ {c}</Body>)}
                </>
              )}
            </Card>
          ) : null}

          <H2>Pasos</H2>
          {recipe.steps.map((s) => (
            <Card key={s.order} tone={s.babySplit ? 'baby' : undefined}>
              <Body><Body bold>{s.order}. </Body>{s.text}</Body>
              {s.tip ? <Body small muted>💡 {s.tip}</Body> : null}
            </Card>
          ))}
          {recipe.utensils.length ? <Body small muted>Utensilios: {recipe.utensils.join(', ')}</Body> : null}
          {recipe.storage ? <Body small muted>Conservación: {recipe.storage}</Body> : null}
        </>
      )}

      {tab === 'ingredientes' && (
        <>
          <Row style={{ justifyContent: 'space-between' }}><Body>Escalar receta</Body><Stepper value={scale} step={0.5} min={0.5} onChange={setScale} suffix="×" /></Row>
          {recipe.ingredients.map((ri, idx) => {
            const ingId = subs[ri.ingredientId] ?? ri.ingredientId;
            const ing = data.ingredients.get(ingId);
            if (!ing) return null;
            const unit = baseUnitFor(ing);
            const have = availableQty(ingId, data.lots, unit, ing);
            const need = convert(ri.qty * scale, ri.unit, unit, ing) ?? ri.qty * scale;
            return (
              <Card key={idx}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Body bold>{ing.name}{subs[ri.ingredientId] ? ' (reemplazo)' : ''}</Body>
                    <Body small muted>{formatQty(ri.qty * scale, ri.unit)} · peso {ri.state}{ri.optional ? ' · opcional' : ''}{ri.separable ? ' · se puede servir aparte' : ''}{ri.addedAfterBabySplit ? ' · después de separar a Helena' : ''}</Body>
                    {ri.note ? <Body small muted>{ri.note}</Body> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Body small>{have >= need ? '✓ en casa' : have > 0 ? `tenés ${formatQty(have, unit)}` : 'falta'}</Body>
                    {meal && !ing.tags.includes('basico') ? <Pressable onPress={() => onNoTengo(ingId)}><Body small style={{ textDecorationLine: 'underline' }}>No tengo</Body></Pressable> : null}
                  </View>
                </Row>
              </Card>
            );
          })}
        </>
      )}

      {tab === 'nutricion' && (
        <>
          <Notice>Estimaciones a partir de tablas de referencia, por porción. Los pesos se indican en crudo o cocido según cada ingrediente.</Notice>
          {adults.map((v) => (
            <Card key={v.memberId}>
              <Body bold>{v.memberName}</Body>
              <Body>≈ {v.nutrition?.kcal} kcal · {v.nutrition?.proteinG} g proteína · {v.nutrition?.carbsG} g HC · {v.nutrition?.fatG} g grasa</Body>
            </Card>
          ))}
          <Body small muted>Para Helena no se calculan calorías ni metas.</Body>
        </>
      )}

      <Button title="Empezar a cocinar" icon="👨‍🍳" onPress={() => router.push({ pathname: '/cocina/[id]', params: { id: recipe.id, mealId: meal?.id ?? '', scale: String(scale) } })} />
      {meal ? (
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Button small kind="secondary" title="Cambiar comida" onPress={() => router.push({ pathname: '/cambiar/[mealId]', params: { mealId: meal.id } })} /></View>
          <View style={{ flex: 1 }}><Button small kind="secondary" title="Ya comí" onPress={ateIt} /></View>
        </Row>
      ) : null}
      <Button small kind="ghost" title="Guardar sobrantes" onPress={saveLeftovers} />
    </Screen>
  );
}

function VersionCard({ v, tone }: { v: MemberVersion; tone: 'primary' | 'ro' }) {
  return (
    <Card tone={tone}>
      <Body bold>Para {v.memberName}{v.status === 'no_apta' ? ' — no apta' : ''}</Body>
      {v.lines.map((l) => <Body key={l.ingredientId} small>{l.extra ? '➕ ' : '• '}{formatQty(l.qty, l.unit)} de {l.name.toLowerCase()} ({l.state})</Body>)}
      {v.removed.length ? <Body small muted>Sin: {v.removed.map((r) => `${r.name.toLowerCase()} (${r.reason.toLowerCase()})`).join(', ')}</Body> : null}
      {v.notes.map((n) => <Body key={n} small muted>{n}</Body>)}
      {v.nutrition ? <Body small muted>≈ {v.nutrition.kcal} kcal · {v.nutrition.proteinG} g prot · {v.nutrition.carbsG} g HC · {v.nutrition.fatG} g grasa</Body> : null}
    </Card>
  );
}

