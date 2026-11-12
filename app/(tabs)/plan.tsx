import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, DishImage, Row, Screen } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { addDays, generateWeek } from '../../src/domain/planner';
import { SLOT_LABEL, dayLabel } from '../../src/ui/labels';
import { space, usePalette } from '../../src/ui/theme';
import type { MealSlot } from '../../src/domain/types';

const SLOTS: MealSlot[] = ['desayuno', 'almuerzo', 'merienda', 'cena'];

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export default function Plan() {
  const { data, todayISO, commit } = useAppData();
  const c = usePalette();
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
    Alert.alert('Plan actualizado', `${fresh.length} comidas agregadas. El inventario no se modifica hasta que cocines.`);
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => shift(-1)} hitSlop={12}><Text style={{ fontSize: 24, color: c.primary }}>‹</Text></Pressable>
        <Body bold>{view === 'semana' ? `${dayLabel(start, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(start, 6), { day: 'numeric', month: 'short' })}` : dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
        <Pressable onPress={() => shift(1)} hitSlop={12}><Text style={{ fontSize: 24, color: c.primary }}>›</Text></Pressable>
      </Row>
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Button small kind={view === 'semana' ? 'primary' : 'secondary'} title="Semana" onPress={() => setView('semana')} /></View>
        <View style={{ flex: 1 }}><Button small kind={view === 'dia' ? 'primary' : 'secondary'} title="Día" onPress={() => setView('dia')} /></View>
      </Row>

      {days.map((date) => (
        <Card key={date} tone={date === todayISO ? 'primary' : undefined}>
          <Pressable onPress={() => { setDay(date); setView('dia'); }}><Body bold>{dayLabel(date, { weekday: 'long', day: 'numeric' })}</Body></Pressable>
          {SLOTS.map((slot) => {
            const meal = data.meals.find((m) => m.date === date && m.slot === slot);
            const r = meal ? data.recipes.get(meal.recipeId) : undefined;
            if (!meal || !r) {
              return (
                <Pressable key={slot} onPress={() => router.push({ pathname: '/cambiar/[mealId]', params: { mealId: 'nuevo', date, slot } })}>
                  <Row><Body small muted>{SLOT_LABEL[slot]}</Body><Body small muted>＋ agregar</Body></Row>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={slot}
                onPress={() => router.push({ pathname: '/receta/[id]', params: { id: r.id, mealId: meal.id } })}
                onLongPress={() => Alert.alert(r.name, SLOT_LABEL[slot], [
                  { text: meal.forOffice ? 'Quitar vianda' : 'Marcar como vianda', onPress: () => commit((repo) => repo.saveMeal({ ...meal, forOffice: !meal.forOffice })) },
                  { text: 'Cambiar', onPress: () => router.push({ pathname: '/cambiar/[mealId]', params: { mealId: meal.id } }) },
                  { text: 'Eliminar', style: 'destructive', onPress: () => commit((repo) => repo.deleteMeal(meal.id)) },
                  { text: 'Cancelar', style: 'cancel' },
                ])}
              >
                <Row gap={space.md}>
                  <DishImage recipe={r} size={40} />
                  <View style={{ flex: 1 }}>
                    <Body small muted>{SLOT_LABEL[slot]}{meal.forOffice ? ' · 🥡' : ''}{meal.status !== 'planificada' ? ` · ${meal.status}` : ''}</Body>
                    <Body>{r.name}</Body>
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      ))}
      <Button title="Completar huecos con lo que tengo" onPress={fillEmpty} />
      <Body small muted>Mantené presionada una comida para marcarla como vianda, cambiarla o eliminarla.</Body>
    </Screen>
  );
}
