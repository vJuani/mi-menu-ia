import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import { adherence, averageIntake, dailyChangeMessage, trendSeries, weeklyAverages, weeklyRate } from '../src/domain/progress';
import { adaptiveAdjustment } from '../src/domain/nutrition';
import { addDays } from '../src/domain/planner';
import { radius, space, usePalette } from '../src/ui/theme';
import type { ConsumptionLog, MeasurementEntry, WeightEntry } from '../src/domain/types';

export default function Progreso() {
  const { data, repo, commit, todayISO } = useAppData();
  const c = usePalette();
  const me = data.members.find((m) => m.isPrimary)!;
  const [tab, setTab] = useState<'peso' | 'medidas' | 'adherencia'>('peso');
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measures, setMeasures] = useState<MeasurementEntry[]>([]);
  const [logs, setLogs] = useState<ConsumptionLog[]>([]);
  const [training, setTraining] = useState<{ date: string; trained: boolean }[]>([]);
  const [kg, setKg] = useState('');
  const [waist, setWaist] = useState('');

  const weekAgo = addDays(todayISO, -6);
  useEffect(() => {
    repo.weights().then(setWeights);
    repo.measurements().then(setMeasures);
    repo.consumption(weekAgo, todayISO).then(setLogs);
    repo.trainingDays(weekAgo, todayISO).then(setTraining);
  }, [repo, data, weekAgo, todayISO]);

  const series = useMemo(() => trendSeries(weights).slice(-60), [weights]);
  const rate = useMemo(() => weeklyRate(weights, 28, todayISO), [weights, todayISO]);
  const adj = rate.kgPerWeek !== null && me.weightKg ? adaptiveAdjustment(rate.kgPerWeek, me.weightKg, rate.daysOfData) : null;
  const adh = adherence(data.meals, weekAgo, todayISO);
  const intake = averageIntake(logs, me.id, weekAgo, todayISO);
  const last = series.at(-1);

  async function addWeight() {
    const v = Number(kg.replace(',', '.'));
    if (!v || v < 30 || v > 300) return Alert.alert('Peso inválido');
    const prev = weights.at(-1)?.kg;
    await commit(async (r) => { await r.addWeight(todayISO, v); await r.saveMember({ ...me, weightKg: v }); });
    setKg('');
    if (prev) Alert.alert('Registrado', dailyChangeMessage(prev, v));
  }

  const min = Math.min(...series.map((s) => s.kg)) - 0.5;
  const max = Math.max(...series.map((s) => s.kg)) + 0.5;
  const H = 140;

  return (
    <Screen>
      <Row gap={space.sm}>{(['peso', 'medidas', 'adherencia'] as const).map((t) => <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} active={tab === t} onPress={() => setTab(t)} />)}</Row>

      {tab === 'peso' && (
        <>
          <Card>
            <Body small muted>Tendencia</Body>
            <Text style={{ fontSize: 34, fontWeight: '800', color: c.text }}>{last ? `${last.trend.toFixed(1)} kg` : '—'}</Text>
            {rate.kgPerWeek !== null ? <Body small muted>{rate.kgPerWeek > 0 ? '+' : ''}{rate.kgPerWeek} kg/semana (últimas 4 semanas)</Body> : <Body small muted>Registrá al menos 3 pesos para ver el ritmo.</Body>}
            {series.length > 1 ? (
              <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 8 }} accessibilityLabel="Gráfico de peso y tendencia">
                {series.map((s) => (
                  <View key={s.date} style={{ flex: 1, height: H, justifyContent: 'flex-end' }}>
                    <View style={{ position: 'absolute', bottom: ((s.trend - min) / (max - min)) * H - 2, left: 0, right: 0, height: 4, backgroundColor: c.primary, borderRadius: 2 }} />
                    <View style={{ position: 'absolute', bottom: ((s.kg - min) / (max - min)) * H - 3, alignSelf: 'center', width: 6, height: 6, borderRadius: 3, backgroundColor: c.muted }} />
                  </View>
                ))}
              </View>
            ) : null}
            <Body small muted>Puntos: pesajes diarios · Línea: tendencia suavizada</Body>
          </Card>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field placeholder="Peso de hoy (kg)" keyboardType="decimal-pad" value={kg} onChangeText={setKg} /></View>
            <Button small title="Registrar" onPress={addWeight} />
          </Row>
          <Notice>Una variación de un día es agua y digestión, no grasa. Mirá la tendencia de 2–4 semanas.</Notice>
          {adj ? (
            <Card tone={adj.deltaKcal === 0 ? 'primary' : 'warning'}>
              <Body>{adj.reason}</Body>
              {adj.deltaKcal !== 0 && me.targets ? <Button small kind="secondary" title={`Ajustar objetivo a ${me.targets.kcal + adj.deltaKcal} kcal`} onPress={() => commit((r) => r.saveMember({ ...me, targets: { ...me.targets!, kcal: me.targets!.kcal + adj.deltaKcal, carbsG: Math.max(0, me.targets!.carbsG + Math.round(adj.deltaKcal / 4)) } }))} /> : null}
            </Card>
          ) : null}
          <H2>Promedios semanales</H2>
          {weeklyAverages(weights).slice(-8).reverse().map((w) => <Body key={w.weekStart}>Semana del {w.weekStart.slice(5).split('-').reverse().join('/')}: {w.avg} kg ({w.n} registros)</Body>)}
        </>
      )}

      {tab === 'medidas' && (
        <>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field placeholder="Cintura (cm) — opcional" keyboardType="decimal-pad" value={waist} onChangeText={setWaist} /></View>
            <Button small title="Guardar" disabled={!waist} onPress={async () => { await commit((r) => r.addMeasurement({ date: todayISO, waistCm: Number(waist.replace(',', '.')) })); setWaist(''); }} />
          </Row>
          {measures.length === 0 ? <Body muted>Sin medidas registradas.</Body> : measures.slice().reverse().map((m) => <Body key={m.id}>{m.date}: cintura {m.waistCm ?? '—'} cm</Body>)}
        </>
      )}

      {tab === 'adherencia' && (
        <>
          <Row gap={space.md}>
            <Card style={{ flex: 1 }}><Body small muted>Plan de comidas (7 días)</Body><Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>{adh.done}/{adh.planned}</Text></Card>
            <Card style={{ flex: 1 }}><Body small muted>Entrenamientos</Body><Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>{training.filter((t) => t.trained).length}/{me.trainingDaysPerWeek ?? '—'}</Text></Card>
          </Row>
          <Card>
            <Body small muted>Promedio registrado (días con registro: {intake.daysLogged})</Body>
            <Body>{intake.kcal ?? '—'} kcal · {intake.proteinG ?? '—'} g proteína</Body>
            {me.targets ? <Body small muted>Objetivo: {me.targets.kcal} kcal · {me.targets.proteinG} g proteína</Body> : null}
            <Body small muted>Estimado a partir de “Ya comí”. No hace falta registrar cada caloría.</Body>
          </Card>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Button small title="Entrené hoy" onPress={() => commit((r) => r.setTraining(todayISO, true))} /></View>
            <View style={{ flex: 1 }}><Button small kind="secondary" title="Hoy no entrené" onPress={() => commit((r) => r.setTraining(todayISO, false))} /></View>
          </Row>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i)).map((d) => {
              const t = training.find((x) => x.date === d);
              return <View key={d} style={{ flex: 1, height: 28, borderRadius: radius.sm, backgroundColor: t?.trained ? c.primary : t ? c.border : c.card, borderWidth: 1, borderColor: c.border }} />;
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
