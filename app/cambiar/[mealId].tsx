import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Card, Chip, DishImage, Row, Screen } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { suggestRecipes } from '../../src/domain/planner';
import { evaluateRecipeForBaby } from '../../src/domain/babySafety';
import { newId } from '../../src/domain/inventory';
import { SLOT_LABEL } from '../../src/ui/labels';
import { space } from '../../src/ui/theme';
import type { MealSlot, PlannedMeal } from '../../src/domain/types';

export default function ChangeMeal() {
  const { mealId, date, slot } = useLocalSearchParams<{ mealId: string; date?: string; slot?: MealSlot }>();
  const { data, commit } = useAppData();
  const meal = data.meals.find((m) => m.id === mealId);
  const targetSlot = (meal?.slot ?? slot ?? 'cena') as MealSlot;
  const [maxMin, setMaxMin] = useState<number | undefined>();
  const [office, setOffice] = useState(!!meal?.forOffice);
  const adults = data.members.filter((m) => m.kind === 'adulto' && (!meal || meal.memberIds.includes(m.id)));
  const recent = data.meals.filter((m) => m.status !== 'salteada').slice(-8).map((m) => m.recipeId);
  const list = useMemo(() => suggestRecipes(data.recipeList, adults, data.lots, data.ingredients, { slot: targetSlot, maxMinutes: maxMin, forOffice: office, recentRecipeIds: recent }), [data, adults, targetSlot, maxMin, office, recent]);

  async function pick(recipeId: string) {
    const next: PlannedMeal = meal
      ? { ...meal, recipeId, substitutions: {}, forOffice: office || undefined }
      : { id: newId('meal'), date: date!, slot: targetSlot, recipeId, memberIds: data.members.filter((m) => m.kind === 'adulto').map((m) => m.id), portionsByMember: Object.fromEntries(data.members.map((m) => [m.id, 1])), status: 'planificada', substitutions: {}, forOffice: office || undefined };
    await commit((repo) => repo.saveMeal(next));
    router.back();
  }

  return (
    <Screen>
      <Body muted>{SLOT_LABEL[targetSlot]} · ordenado por lo que tenés en casa</Body>
      <Row wrap>
        <Chip label="≤ 20 min" active={maxMin === 20} onPress={() => setMaxMin(maxMin === 20 ? undefined : 20)} />
        <Chip label="≤ 30 min" active={maxMin === 30} onPress={() => setMaxMin(maxMin === 30 ? undefined : 30)} />
        <Chip label="🥡 Vianda" active={office} onPress={() => setOffice(!office)} />
      </Row>
      {list.length === 0 ? <Body muted>No hay recetas que cumplan los filtros y sirvan para todos.</Body> : null}
      {list.map((s) => {
        const baby = data.babyCtx ? evaluateRecipeForBaby(s.recipe, data.babyCtx) : null;
        return (
          <Card key={s.recipe.id} onPress={() => pick(s.recipe.id)} tone={s.recipe.id === meal?.recipeId ? 'primary' : undefined}>
            <Row gap={space.md}>
              <DishImage recipe={s.recipe} size={52} />
              <View style={{ flex: 1 }}>
                <Body bold>{s.recipe.name}</Body>
                <Body small muted>{s.recipe.totalMinutes} min · {Math.round(s.coverage * 100)} % en casa{s.missing.length ? ` · faltan ${s.missing.length}` : ''}</Body>
                {baby ? <Body small muted>Helena: {baby.verdict === 'bloqueado' ? 'necesita alternativa' : baby.verdict === 'requiere_confirmacion' ? 'con alimentos nuevos' : 'puede compartir adaptada'}</Body> : null}
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
