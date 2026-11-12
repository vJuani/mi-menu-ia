import { useMemo, useState } from 'preact/hooks';
import { useApp, localToday } from '../state.tsx';
import { Body, Button, Card, Chip, Field, H2, Notice, Screen, Title, Toggle, go } from '../ui.tsx';
import { APP_NAME, APP_TAGLINE } from '../../../src/config/app.ts';
import { estimateTargets, ageInMonths, ageInYears } from '../../../src/domain/nutrition.ts';
import type { ActivityLevel, Goal, Member, Texture } from '../../../src/domain/types.ts';
import { seedDemo } from '../../../src/data/seed.ts';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.ts';
import { num } from '../util.ts';

const ACTIVITY: [ActivityLevel, string][] = [['sedentario', 'Sedentario'], ['ligero', 'Ligero'], ['moderado', 'Moderado'], ['alto', 'Alto'], ['muy_alto', 'Muy alto']];
const GOALS: [Goal, string][] = [['perder_grasa', 'Bajar grasa'], ['mantener', 'Mantener'], ['ganar_musculo', 'Ganar músculo']];

export function Onboarding() {
  const { data, commit } = useApp();
  const [step, setStep] = useState(0);
  const me = data.members.find((m) => m.isPrimary)!;
  const ro = data.members.find((m) => m.id === 'ro');
  const helena = data.members.find((m) => m.kind === 'bebe');
  const [weight, setWeight] = useState(String(me?.weightKg ?? ''));
  const [height, setHeight] = useState(String(me?.heightCm ?? ''));
  const [birth, setBirth] = useState(me?.birthDate ?? '');
  const [activity, setActivity] = useState<ActivityLevel>(me?.activity ?? 'moderado');
  const [training, setTraining] = useState(String(me?.trainingDaysPerWeek ?? 4));
  const [goal, setGoal] = useState<Goal>(me?.goal ?? 'perder_grasa');
  const [rejected, setRejected] = useState(me?.aversions.map((a) => a.tag).join(', ') ?? '');
  const [roRejected, setRoRejected] = useState(ro?.aversions.map((a) => a.tag).join(', ') ?? '');
  const [roEgg, setRoEgg] = useState(ro?.optionalExtras.includes('huevo') ?? true);
  const [started, setStarted] = useState(data.babyProfile?.startedComplementary ?? false);
  const [signs, setSigns] = useState(data.babyProfile?.readinessSigns ?? false);
  const [textures, setTextures] = useState<Texture[]>(data.babyProfile?.allowedTextures ?? ['pure', 'pisado']);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const validBirth = /^\d{4}-\d{2}-\d{2}$/.test(birth);
  const targets = useMemo(() => {
    const w = num(weight), h = num(height);
    if (!w || !h || !validBirth) return null;
    return estimateTargets({ sex: me.sex ?? 'hombre', weightKg: w, heightCm: h, age: ageInYears(birth), activity, goal });
  }, [weight, height, birth, activity, goal]);
  const tags = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  async function finish() {
    setBusy(true);
    await commit(async (repo) => {
      const updated: Member = {
        ...me, weightKg: num(weight), heightCm: num(height), birthDate: birth, activity, trainingDaysPerWeek: num(training) || 0, goal,
        aversions: tags(rejected).map((t) => ({ tag: t, level: 'excluir' as const })),
        targets: targets ? { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG } : undefined,
      };
      await repo.saveMember(updated);
      if (ro) await repo.saveMember({ ...ro, aversions: tags(roRejected).map((t) => ({ tag: t, level: 'evitar' as const })), optionalExtras: roEgg ? ['huevo'] : [] });
      if (helena) await repo.saveBabyProfile({ memberId: helena.id, startedComplementary: started, readinessSigns: signs, allowedTextures: textures });
      await repo.addWeight(localToday(), num(weight));
      if (demo) await seedDemo(repo, localToday());
      await repo.setSetting('onboarded', true);
    });
    setBusy(false);
    go('hoy', {}, true);
  }
  const nav = (backTo: number, next: () => void, disabled = false) => (
    <div class="grid2"><Button kind="secondary" title="Atrás" onPress={() => setStep(backTo)} /><Button title="Siguiente" disabled={disabled} onPress={next} /></div>
  );

  const steps = [
    <div class="stack welcome">
      <div class="logo">👨‍🍳</div>
      <Title sub={APP_TAGLINE}>{APP_NAME}</Title>
      {['Planificá tus comidas', 'Cociná paso a paso', 'Organizá tu inventario', 'Generá tu lista de compras', 'Adaptá para toda la familia'].map((t) => <Body>✓  {t}</Body>)}
      <Notice tone="primary">Todo se guarda en tu iPhone. No hace falta cuenta.</Notice>
      <Button title="Comenzar" onPress={() => setStep(1)} />
    </div>,
    <div class="stack">
      <Title sub="Datos editables en cualquier momento">Tus datos</Title>
      <div class="grid2">
        <Field label="Peso actual (kg)" inputMode="decimal" value={weight} onChange={setWeight} />
        <Field label="Altura (cm)" inputMode="numeric" value={height} onChange={setHeight} />
      </div>
      <Notice>Último peso conocido: 108 kg. Actualizalo con el de hoy.</Notice>
      <Field label="Fecha de nacimiento" type="date" value={birth} onChange={setBirth} />
      <Body small muted>Nivel de actividad diaria (sin contar el entrenamiento)</Body>
      <div class="row wrap">{ACTIVITY.map(([id, l]) => <Chip label={l} active={activity === id} onPress={() => setActivity(id)} />)}</div>
      <Field label="Días de entrenamiento de fuerza por semana" inputMode="numeric" value={training} onChange={setTraining} />
      <Body small muted>Objetivo</Body>
      <div class="row wrap">{GOALS.map(([id, l]) => <Chip label={l} active={goal === id} onPress={() => setGoal(id)} />)}</div>
      <Field label="Alimentos que no comés (separados por coma)" value={rejected} onChange={setRejected} />
      {!validBirth ? <Body small muted>Necesitamos la fecha de nacimiento para estimar tu gasto.</Body> : null}
      {nav(0, () => setStep(2), !targets)}
    </div>,
    <div class="stack">
      <Title sub="Estimación inicial: se ajusta con tu tendencia real">Tus objetivos</Title>
      {targets ? (
        <Card tone="primary">
          <div class="kpi">{targets.kcal} kcal/día</div>
          <Body>Proteína {targets.proteinG} g · Carbohidratos {targets.carbsG} g · Grasas {targets.fatG} g</Body>
          {targets.explanation.map((e) => <Body small muted>• {e}</Body>)}
        </Card>
      ) : null}
      <Notice>Es un punto de partida, no una prescripción. Si tenés alguna condición médica, consultalo con tu médico o nutricionista.</Notice>
      {nav(1, () => setStep(3))}
    </div>,
    <div class="stack">
      <Title sub="Sus metas son independientes de las tuyas">Rocío (Ro)</Title>
      <Field label="Prefiere evitar (separado por coma)" value={roRejected} onChange={setRoRejected} />
      <Toggle label="Agregar huevo solo a su versión" value={roEgg} onChange={setRoEgg} />
      <Body small muted>No se le aplica tu déficit. Podés cargarle objetivos propios desde Familia.</Body>
      {nav(2, () => setStep(4))}
    </div>,
    <div class="stack">
      <Title sub={helena?.birthDate ? `${ageInMonths(helena.birthDate)} meses` : undefined}>Helena</Title>
      <Notice tone="baby">La leche materna o fórmula sigue siendo su alimento principal. Esta app no reemplaza al pediatra: registrá sus indicaciones en el perfil de Helena.</Notice>
      <Toggle label="Ya comenzó la alimentación complementaria" value={started} onChange={setStarted} />
      <Toggle label="Muestra señales de preparación" hint="Se sienta con poco apoyo, sostiene la cabeza, se interesa por la comida, no la empuja con la lengua." value={signs} onChange={setSigns} />
      <Body small muted>Texturas que ya maneja</Body>
      <div class="row wrap">{(['pure', 'pisado', 'picado_fino', 'trozos_blandos'] as Texture[]).map((t) => <Chip tone="baby" label={TEXTURE_LABEL[t]} active={textures.includes(t)} onPress={() => setTextures((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} />)}</div>
      {!started || !signs ? <Notice>Mientras no confirmes ambas cosas, la app no le propondrá comidas.</Notice> : null}
      {nav(3, () => setStep(5))}
    </div>,
    <div class="stack">
      <Title>Último paso</Title>
      <H2>Datos de demostración</H2>
      <Toggle label="Cargar inventario y plan de ejemplo" hint="Se borran desde Configuración cuando quieras." value={demo} onChange={setDemo} />
      <Button title={busy ? 'Preparando…' : 'Empezar a usar la app'} disabled={busy} onPress={finish} />
      <Button kind="ghost" title="Atrás" onPress={() => setStep(4)} />
    </div>,
  ];
  return <Screen>{steps[step]}</Screen>;
}
