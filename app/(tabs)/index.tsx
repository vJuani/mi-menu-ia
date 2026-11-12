import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, DishImage, H2, Notice, Row, Screen } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { computeShoppingList, missingSentence } from '../../src/domain/shopping';
import { generateWeek } from '../../src/domain/planner';
import { usePalette, space } from '../../src/ui/theme';
import type { MealSlot } from '../../src/domain/types';
import { LOCALE } from '../../src/config/app';
import { SLOT_LABEL, DIFFICULTY_LABEL } from '../../src/ui/labels';


export default function Hoy() {
  const { data, todayISO, commit } = useAppData();
  const c = usePalette();
  const me = data.members.find((m) => m.isPrimary);
  const todays = data.meals.filter((m) => m.date === todayISO).sort((a, b) => order(a.slot) - order(b.slot));
  const missing = useMemo(
    () => computeShoppingList(todays, data.recipes, data.members, data.ingredients, data.lots),
    [todays, data],
  );
  const dateLabel = new Date(todayISO + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

  async function planWeek() {
    const adults = data.members.filter((m) => m.kind === 'adulto');
    const week = generateWeek(todayISO, data.recipeList, adults, data.lots, data.ingredients);
    await commit(async (repo) => { for (const m of week) await repo.saveMeal(m); });
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen>
        <View>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>Hola 👋</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>¿Qué comemos hoy?</Text>
          <Body muted>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</Body>
        </View>

        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Card tone="primary" onPress={() => router.push('/progreso')}>
              <Body small muted>Tu objetivo</Body>
              <Body bold>{me?.goal === 'perder_grasa' ? 'Bajar grasa' : me?.goal === 'ganar_musculo' ? 'Ganar músculo' : 'Mantener'}</Body>
              {me?.targets ? <Body small muted>{me.targets.kcal} kcal · {me.targets.proteinG} g prot.</Body> : null}
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card tone="accent" onPress={() => router.push('/compras')}>
              <Body small muted>Inventario</Body>
              <Body bold>{missing.length ? `${missing.length} faltante${missing.length > 1 ? 's' : ''}` : 'Tenés todo'}</Body>
              <Body small muted>Para hoy</Body>
            </Card>
          </View>
        </Row>

        {missing.length ? <Notice>{missingSentence(missing, 'hoy')}</Notice> : null}

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
            <Pressable key={meal.id} onPress={() => router.push({ pathname: '/receta/[id]', params: { id: r.id, mealId: meal.id } })}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} tone={done ? 'primary' : undefined}>
                <DishImage recipe={r} />
                <View style={{ flex: 1 }}>
                  <Body small muted>{SLOT_LABEL[meal.slot]} · {data.reminderSettings.mealTimes[meal.slot]}{meal.forOffice ? ' · 🥡 vianda' : ''}</Body>
                  <Body bold>{r.name}</Body>
                  <Body small muted>{r.totalMinutes} min · {DIFFICULTY_LABEL[r.difficulty]}</Body>
                </View>
                <Text style={{ fontSize: 24 }}>{done ? '✅' : '⚪️'}</Text>
              </Card>
            </Pressable>
          );
        })}

        <H2>Accesos rápidos</H2>
        <Row gap={space.sm} wrap>
          <Button small kind="secondary" title="🛒 Compras" onPress={() => router.push('/compras')} />
          <Button small kind="secondary" title="💬 ¿Qué cocino?" onPress={() => router.push('/asistente')} />
          <Button small kind="secondary" title="⚖️ Registrar peso" onPress={() => router.push('/progreso')} />
        </Row>
      </Screen>
    </SafeAreaView>
  );
}

function order(s: MealSlot): number { return ['desayuno', 'colacion', 'almuerzo', 'merienda', 'cena'].indexOf(s); }
