import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, Notice, Row, Screen, Stepper } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { needsForMeal } from '../../src/domain/shopping';
import { formatQty } from '../../src/domain/units';
import { radius, space, usePalette } from '../../src/ui/theme';
import type { Unit } from '../../src/domain/types';

interface Progress { step: number; done: number[]; }

export default function CookMode() {
  useKeepAwake(); // pantalla activa mientras cocinás
  const { id, mealId, scale } = useLocalSearchParams<{ id: string; mealId?: string; scale?: string }>();
  const { data, repo, commit } = useAppData();
  const c = usePalette();
  const recipe = data.recipes.get(id);
  const meal = data.meals.find((m) => m.id === mealId);
  const key = `cook.progress.${mealId || id}`;
  const [p, setP] = useState<Progress>({ step: 0, done: [] });
  const [phase, setPhase] = useState<'pasos' | 'confirmar'>('pasos');

  useEffect(() => { repo.getSetting<Progress>(key, { step: 0, done: [] }).then(setP); }, [repo, key]);
  const save = (np: Progress) => { setP(np); repo.setSetting(key, np); };

  if (!recipe) return <Screen><Body>Receta no encontrada.</Body></Screen>;
  const s = recipe.steps[p.step];
  const pct = (p.done.length / recipe.steps.length) * 100;

  if (phase === 'confirmar') return <ConfirmUsage recipeId={recipe.id} mealId={meal?.id} scale={Number(scale) || 1} onDone={async (opId) => {
    await repo.setSetting(key, { step: 0, done: [] });
    Alert.alert('¡Listo!', 'Inventario actualizado con lo que confirmaste.', [
      { text: 'Deshacer', style: 'destructive', onPress: () => commit((r) => r.undo(opId)) },
      { text: 'OK', onPress: () => router.back() },
    ]);
  }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: space.lg, gap: space.md, flex: 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={{ fontSize: 22, color: c.text }}>✕</Text></Pressable>
          <Body bold>Modo cocina</Body>
          <Body small muted>Se guarda el avance</Body>
        </Row>
        <Body muted>Paso {p.step + 1} de {recipe.steps.length}</Body>
        <View style={{ height: 8, backgroundColor: c.border, borderRadius: radius.pill }}>
          <View style={{ width: `${pct}%`, height: 8, backgroundColor: c.primary, borderRadius: radius.pill }} />
        </View>

        <Card tone={s.babySplit ? 'baby' : undefined} style={{ flexGrow: 1 }}>
          <Text style={{ fontSize: 24, lineHeight: 32, color: c.text, fontWeight: '600' }}>{s.text}</Text>
          {s.tip ? <Notice tone={s.babySplit ? 'baby' : 'warning'}>💡 {s.tip}</Notice> : null}
          {s.babySplit ? <Notice tone="baby">Separá la porción de Helena ahora, antes de sal o condimentos.</Notice> : null}
          {s.timerSec ? <Timer seconds={s.timerSec} label={`${recipe.name}: paso ${s.order}`} key={`${p.step}`} /> : null}
          <Pressable onPress={() => save({ ...p, done: p.done.includes(p.step) ? p.done.filter((d) => d !== p.step) : [...p.done, p.step] })}>
            <Body bold>{p.done.includes(p.step) ? '☑️ Hecho' : '⬜️ Marcar como hecho'}</Body>
          </Pressable>
        </Card>

        <Row gap={space.md}>
          <View style={{ flex: 1 }}><Button kind="secondary" title="←" disabled={p.step === 0} onPress={() => save({ ...p, step: p.step - 1 })} /></View>
          <View style={{ flex: 3 }}>
            {p.step < recipe.steps.length - 1
              ? <Button title="Siguiente  ›" onPress={() => save({ step: p.step + 1, done: p.done.includes(p.step) ? p.done : [...p.done, p.step] })} />
              : <Button title="Terminé de cocinar" onPress={() => setPhase('confirmar')} />}
          </View>
        </Row>
      </View>
    </SafeAreaView>
  );
}

function Timer({ seconds, label }: { seconds: number; label: string }) {
  const c = usePalette();
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number | null>(null);
  const notifId = useRef<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round(((endAt.current ?? Date.now()) - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) { setRunning(false); }
    }, 500);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => () => { if (notifId.current) Notifications.cancelScheduledNotificationAsync(notifId.current); }, []);

  async function start() {
    endAt.current = Date.now() + left * 1000;
    setRunning(true);
    // aviso del sistema por si la app pasa a segundo plano
    notifId.current = await Notifications.scheduleNotificationAsync({
      content: { title: '⏰ Temporizador', body: label },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, left) },
    }).catch(() => null);
  }
  async function pause() {
    setRunning(false);
    if (notifId.current) await Notifications.cancelScheduledNotificationAsync(notifId.current);
    notifId.current = null;
  }
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <Text style={{ fontSize: 48, fontVariant: ['tabular-nums'], fontWeight: '800', color: left === 0 ? c.primary : c.text }}>{mm}:{ss}</Text>
      <Row gap={space.sm}>
        {running ? <Button small kind="secondary" title="Pausar" onPress={pause} /> : <Button small title={left === seconds ? 'Iniciar' : left === 0 ? 'Listo ✓' : 'Continuar'} disabled={left === 0} onPress={start} />}
        <Button small kind="ghost" title="Reiniciar" onPress={async () => { await pause(); setLeft(seconds); }} />
      </Row>
    </View>
  );
}

function ConfirmUsage({ recipeId, mealId, scale, onDone }: { recipeId: string; mealId?: string; scale: number; onDone: (op: string) => void }) {
  const { data, commit, repo } = useAppData();
  const recipe = data.recipes.get(recipeId)!;
  const meal = data.meals.find((m) => m.id === mealId);
  const initial = useMemo(() => {
    const m = meal ?? { id: 'tmp', date: '', slot: 'cena' as const, recipeId, memberIds: data.members.map((x) => x.id), portionsByMember: {}, status: 'planificada' as const, substitutions: {} };
    return needsForMeal(m, recipe, data.members, data.ingredients)
      .filter((n) => !data.ingredients.get(n.ingredientId)?.tags.includes('basico'))
      .map((n) => ({ ingredientId: n.ingredientId, qty: Math.round(n.qty * scale), unit: n.unit as Unit }));
  }, [meal, recipe, data, scale, recipeId]);
  const [usages, setUsages] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    let res: Awaited<ReturnType<typeof repo.confirmCooked>> | undefined;
    await commit(async (r) => { res = await r.confirmCooked(meal?.id ?? null, usages.filter((u) => u.qty > 0), data.ingredients); });
    setBusy(false);
    if (res?.shortfalls.length) Alert.alert('Atención', `No había suficiente stock registrado de: ${res.shortfalls.map((s) => data.ingredients.get(s.ingredientId)?.name).join(', ')}. Se descontó lo disponible.`);
    if (res) onDone(res.operationId);
  }

  return (
    <Screen>
      <Body bold style={{ fontSize: 22 }}>¿Cuánto usaste realmente?</Body>
      <Body muted>Solo se descuenta del inventario lo que confirmes acá. Ajustá si usaste más o menos.</Body>
      {usages.map((u, i) => {
        const ing = data.ingredients.get(u.ingredientId)!;
        const step = u.unit === 'un' ? 0.5 : 10;
        return (
          <Card key={u.ingredientId}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><Body bold>{ing.name}</Body><Body small muted>Planificado: {formatQty(initial[i].qty, u.unit)}</Body></View>
              <Stepper value={u.qty} step={step} onChange={(v) => setUsages((xs) => xs.map((x, j) => (j === i ? { ...x, qty: v } : x)))} suffix={u.unit} />
            </Row>
          </Card>
        );
      })}
      <Button title="Confirmar y descontar" loading={busy} onPress={confirm} />
      <Button kind="ghost" title="Terminé sin descontar nada" onPress={() => router.back()} />
      <Body small muted>Cantidades en gramos, mililitros o unidades, tal como figuran en el inventario.</Body>
    </Screen>
  );
}
