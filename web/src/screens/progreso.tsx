import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, alertMsg } from '../ui.tsx';
import { adherence, averageIntake, dailyChangeMessage, trendSeries, weeklyAverages, weeklyRate } from '../../../src/domain/progress.ts';
import { adaptiveAdjustment } from '../../../src/domain/nutrition.ts';
import { addDays } from '../../../src/domain/planner.ts';
import type { ConsumptionLog, MeasurementEntry, WeightEntry } from '../../../src/domain/types.ts';
import { num } from '../util.ts';

function Chart({ series }: { series: { date: string; kg: number; trend: number }[] }) {
  if (series.length < 2) return null;
  const W = 320, H = 140, pad = 6;
  const min = Math.min(...series.map((s) => Math.min(s.kg, s.trend))) - 0.5;
  const max = Math.max(...series.map((s) => Math.max(s.kg, s.trend))) + 0.5;
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.trend).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" role="img" aria-label="Peso y tendencia">
      <text x={W - 4} y={12} text-anchor="end" class="axis">{max.toFixed(1)}</text>
      <text x={W - 4} y={H - 2} text-anchor="end" class="axis">{min.toFixed(1)}</text>
      {series.map((s, i) => <circle cx={x(i)} cy={y(s.kg)} r={3} class="dot" />)}
      <path d={line} class="trend" />
    </svg>
  );
}

export function Progreso() {
  const { data, repo, commit, todayISO, version } = useApp();
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
    repo.weights().then(setWeights); repo.measurements().then(setMeasures);
    repo.consumption(weekAgo, todayISO).then(setLogs); repo.trainingDays(weekAgo, todayISO).then(setTraining);
  }, [version]);
  const series = useMemo(() => trendSeries(weights).slice(-60), [weights]);
  const rate = useMemo(() => weeklyRate(weights, 28, todayISO), [weights]);
  const adj = rate.kgPerWeek !== null && me.weightKg ? adaptiveAdjustment(rate.kgPerWeek, me.weightKg, rate.daysOfData) : null;
  const adh = adherence(data.meals, weekAgo, todayISO);
  const intake = averageIntake(logs, me.id, weekAgo, todayISO);
  const last = series.at(-1);

  async function addWeight() {
    const v = num(kg);
    if (!v || v < 30 || v > 300) return alertMsg('Peso inválido');
    const prev = weights.at(-1)?.kg;
    await commit(async (r) => { await r.addWeight(todayISO, v); await r.saveMember({ ...me, weightKg: v }); });
    setKg('');
    if (prev) alertMsg('Registrado', dailyChangeMessage(prev, v));
  }

  return (
    <Screen>
      <Row>{(['peso', 'medidas', 'adherencia'] as const).map((t) => <Chip label={t[0].toUpperCase() + t.slice(1)} active={tab === t} onPress={() => setTab(t)} />)}</Row>
      {tab === 'peso' && (
        <>
          <Card>
            <Body small muted>Tendencia</Body>
            <div class="kpi">{last ? `${last.trend.toFixed(1)} kg` : '—'}</div>
            {rate.kgPerWeek !== null ? <Body small muted>{rate.kgPerWeek > 0 ? '+' : ''}{rate.kgPerWeek} kg/semana (últimas 4 semanas)</Body> : <Body small muted>Registrá al menos 3 pesos para ver el ritmo.</Body>}
            <Chart series={series} />
            <Body small muted>Puntos: pesajes · Línea: tendencia suavizada</Body>
          </Card>
          <Row><div class="grow"><Field placeholder="Peso de hoy (kg)" inputMode="decimal" value={kg} onChange={setKg} onEnter={addWeight} /></div><Button small title="Registrar" onPress={addWeight} /></Row>
          <Notice>Una variación de un día es agua y digestión, no grasa. Mirá la tendencia de 2–4 semanas.</Notice>
          {adj ? (
            <Card tone={adj.deltaKcal === 0 ? 'primary' : 'warning'}>
              <Body>{adj.reason}</Body>
              {adj.deltaKcal !== 0 && me.targets ? <Button small kind="secondary" title={`Ajustar objetivo a ${me.targets.kcal + adj.deltaKcal} kcal`} onPress={() => commit((r) => r.saveMember({ ...me, targets: { ...me.targets!, kcal: me.targets!.kcal + adj.deltaKcal, carbsG: Math.max(0, me.targets!.carbsG + Math.round(adj.deltaKcal / 4)) } }))} /> : null}
            </Card>
          ) : null}
          <H2>Promedios semanales</H2>
          {weeklyAverages(weights).slice(-8).reverse().map((w) => <Body>Semana del {w.weekStart.slice(5).split('-').reverse().join('/')}: {w.avg} kg ({w.n} registros)</Body>)}
        </>
      )}
      {tab === 'medidas' && (
        <>
          <Row><div class="grow"><Field placeholder="Cintura (cm) — opcional" inputMode="decimal" value={waist} onChange={setWaist} /></div>
            <Button small title="Guardar" disabled={!waist} onPress={async () => { await commit((r) => r.addMeasurement({ date: todayISO, waistCm: num(waist) })); setWaist(''); }} /></Row>
          {measures.length === 0 ? <Body muted>Sin medidas registradas.</Body> : measures.slice().reverse().map((m) => <Body>{m.date}: cintura {m.waistCm ?? '—'} cm</Body>)}
        </>
      )}
      {tab === 'adherencia' && (
        <>
          <div class="grid2">
            <Card><Body small muted>Plan de comidas (7 días)</Body><div class="kpi">{adh.done}/{adh.planned}</div></Card>
            <Card><Body small muted>Entrenamientos</Body><div class="kpi">{training.filter((t) => t.trained).length}/{me.trainingDaysPerWeek ?? '—'}</div></Card>
          </div>
          <Card>
            <Body small muted>Promedio registrado (días con registro: {intake.daysLogged})</Body>
            <Body>{intake.kcal ?? '—'} kcal · {intake.proteinG ?? '—'} g proteína</Body>
            {me.targets ? <Body small muted>Objetivo: {me.targets.kcal} kcal · {me.targets.proteinG} g proteína</Body> : null}
            <Body small muted>Estimado a partir de “Ya comí”. No hace falta registrar cada caloría.</Body>
          </Card>
          <div class="grid2">
            <Button small title="Entrené hoy" onPress={() => commit((r) => r.setTraining(todayISO, true))} />
            <Button small kind="secondary" title="Hoy no entrené" onPress={() => commit((r) => r.setTraining(todayISO, false))} />
          </div>
          <div class="week-dots">{Array.from({ length: 7 }, (_, i) => addDays(weekAgo, i)).map((d) => {
            const t = training.find((x) => x.date === d);
            return <div class={`wd ${t?.trained ? 'on' : t ? 'off' : ''}`} title={d} />;
          })}</div>
        </>
      )}
    </Screen>
  );
}
