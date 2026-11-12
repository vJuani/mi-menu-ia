import React, { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Title } from '../src/ui/components';
import { useAppData, localToday } from '../src/state/AppData';
import { APP_NAME, APP_TAGLINE } from '../src/config/app';
import { estimateTargets, ageInMonths, ageInYears } from '../src/domain/nutrition';
import type { ActivityLevel, Goal, Member, Texture } from '../src/domain/types';
import { ensurePermission } from '../src/services/notifications';
import { seedDemo } from '../src/data/seed';
import { usePalette } from '../src/ui/theme';

const ACTIVITY: { id: ActivityLevel; label: string }[] = [
  { id: 'sedentario', label: 'Sedentario' }, { id: 'ligero', label: 'Ligero' }, { id: 'moderado', label: 'Moderado' },
  { id: 'alto', label: 'Alto' }, { id: 'muy_alto', label: 'Muy alto' },
];
const GOALS: { id: Goal; label: string }[] = [
  { id: 'perder_grasa', label: 'Bajar grasa' }, { id: 'mantener', label: 'Mantener' }, { id: 'ganar_musculo', label: 'Ganar músculo' },
];

export default function Onboarding() {
  const { data, commit } = useAppData();
  const c = usePalette();
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
    const w = Number(weight.replace(',', '.')), h = Number(height.replace(',', '.'));
    if (!w || !h || !validBirth) return null;
    return estimateTargets({ sex: 'hombre', weightKg: w, heightCm: h, age: ageInYears(birth), activity, goal });
  }, [weight, height, birth, activity, goal, validBirth]);

  const tags = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  async function finish() {
    setBusy(true);
    await commit(async (repo) => {
      const updatedMe: Member = {
        ...me, weightKg: Number(weight.replace(',', '.')), heightCm: Number(height.replace(',', '.')), birthDate: birth, activity,
        trainingDaysPerWeek: Number(training) || 0, goal, aversions: tags(rejected).map((t) => ({ tag: t, level: 'excluir' as const })),
        targets: targets ? { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG } : undefined,
      };
      await repo.saveMember(updatedMe);
      if (ro) await repo.saveMember({ ...ro, aversions: tags(roRejected).map((t) => ({ tag: t, level: 'evitar' as const })), optionalExtras: roEgg ? ['huevo'] : [] });
      if (helena) await repo.saveBabyProfile({ memberId: helena.id, startedComplementary: started, readinessSigns: signs, allowedTextures: textures });
      if (weight) await repo.addWeight(localToday(), Number(weight.replace(',', '.')));
      if (demo) await seedDemo(repo, localToday());
      await repo.setSetting('onboarded', true);
    });
    await ensurePermission();
    await commit();
    setBusy(false);
    router.replace('/');
  }

  const steps = [
    <View key="0" style={{ gap: 16, paddingTop: 60 }}>
      <Text style={{ fontSize: 72, textAlign: 'center' }}>👨‍🍳</Text>
      <Title sub={APP_TAGLINE}>{APP_NAME}</Title>
      {['Planificá tus comidas', 'Cociná paso a paso', 'Organizá tu inventario', 'Generá tu lista de compras', 'Adaptá para toda la familia'].map((t) => <Body key={t}>✓  {t}</Body>)}
      <Notice tone="primary">Todo se guarda en tu iPhone. No hace falta cuenta ni conexión.</Notice>
      <Button title="Comenzar" onPress={() => setStep(1)} />
    </View>,

    <View key="1" style={{ gap: 12 }}>
      <Title sub="Datos editables en cualquier momento">Tus datos</Title>
      <Row gap={12}>
        <View style={{ flex: 1 }}><Field label="Peso actual (kg)" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} /></View>
        <View style={{ flex: 1 }}><Field label="Altura (cm)" keyboardType="number-pad" value={height} onChangeText={setHeight} /></View>
      </Row>
      <Notice>Último peso conocido: 108 kg. Actualizalo con el de hoy.</Notice>
      <Field label="Fecha de nacimiento (AAAA-MM-DD)" value={birth} onChangeText={setBirth} placeholder="1995-06-30" autoCapitalize="none" />
      <Body small muted>Nivel de actividad diaria (sin contar el entrenamiento intenso)</Body>
      <Row wrap>{ACTIVITY.map((a) => <Chip key={a.id} label={a.label} active={activity === a.id} onPress={() => setActivity(a.id)} />)}</Row>
      <Field label="Días de entrenamiento de fuerza por semana" keyboardType="number-pad" value={training} onChangeText={setTraining} />
      <Body small muted>Objetivo</Body>
      <Row wrap>{GOALS.map((g) => <Chip key={g.id} label={g.label} active={goal === g.id} onPress={() => setGoal(g.id)} />)}</Row>
      <Field label="Alimentos que no comés (separados por coma)" value={rejected} onChangeText={setRejected} />
      <Button title="Siguiente" disabled={!targets} onPress={() => setStep(2)} />
      {!validBirth ? <Body small muted>Necesitamos la fecha de nacimiento para estimar tu gasto.</Body> : null}
    </View>,

    <View key="2" style={{ gap: 12 }}>
      <Title sub="Estimación inicial: se ajusta con tu tendencia real">Tus objetivos</Title>
      {targets ? (
        <Card tone="primary">
          <Text style={{ fontSize: 36, fontWeight: '800', color: c.text }}>{targets.kcal} kcal/día</Text>
          <Body>Proteína {targets.proteinG} g · Carbohidratos {targets.carbsG} g · Grasas {targets.fatG} g</Body>
          {targets.explanation.map((e) => <Body key={e} small muted>• {e}</Body>)}
        </Card>
      ) : null}
      <Notice>Es un punto de partida, no una prescripción. Si tenés alguna condición médica, consultalo con tu médico o nutricionista.</Notice>
      <Row gap={12}><View style={{ flex: 1 }}><Button kind="secondary" title="Atrás" onPress={() => setStep(1)} /></View><View style={{ flex: 1 }}><Button title="Siguiente" onPress={() => setStep(3)} /></View></Row>
    </View>,

    <View key="3" style={{ gap: 12 }}>
      <Title sub="Sus metas son independientes de las tuyas">Rocío (Ro)</Title>
      <Field label="Prefiere evitar (separado por coma)" value={roRejected} onChangeText={setRoRejected} />
      <Row style={{ justifyContent: 'space-between' }}><Body>Agregar huevo solo a su versión</Body><Switch value={roEgg} onValueChange={setRoEgg} /></Row>
      <Body small muted>No se le aplica tu déficit. Podés cargarle objetivos propios desde Familia.</Body>
      <Row gap={12}><View style={{ flex: 1 }}><Button kind="secondary" title="Atrás" onPress={() => setStep(2)} /></View><View style={{ flex: 1 }}><Button title="Siguiente" onPress={() => setStep(4)} /></View></Row>
    </View>,

    <View key="4" style={{ gap: 12 }}>
      <Title sub={helena?.birthDate ? `${ageInMonths(helena.birthDate)} meses` : undefined}>Helena</Title>
      <Notice tone="baby">La leche materna o fórmula sigue siendo su alimento principal. Esta app no reemplaza al pediatra: registrá sus indicaciones en el perfil de Helena.</Notice>
      <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body>Ya comenzó la alimentación complementaria</Body></View><Switch value={started} onValueChange={setStarted} /></Row>
      <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body>Muestra señales de preparación</Body><Body small muted>Se sienta con poco apoyo, sostiene la cabeza, se interesa por la comida, no la empuja con la lengua.</Body></View><Switch value={signs} onValueChange={setSigns} /></Row>
      <Body small muted>Texturas que ya maneja</Body>
      <Row wrap>{(['pure', 'pisado', 'picado_fino', 'trozos_blandos'] as Texture[]).map((t) => (
        <Chip key={t} tone="baby" label={{ pure: 'Puré', pisado: 'Pisado', picado_fino: 'Picado fino', trozos_blandos: 'Trozos blandos', entero: 'Entero' }[t]} active={textures.includes(t)} onPress={() => setTextures((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} />
      ))}</Row>
      {!started || !signs ? <Notice>Mientras no confirmes ambas cosas, la app no le propondrá comidas.</Notice> : null}
      <Row gap={12}><View style={{ flex: 1 }}><Button kind="secondary" title="Atrás" onPress={() => setStep(3)} /></View><View style={{ flex: 1 }}><Button title="Siguiente" onPress={() => setStep(5)} /></View></Row>
    </View>,

    <View key="5" style={{ gap: 12 }}>
      <Title>Último paso</Title>
      <H2>Datos de demostración</H2>
      <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body>Cargar inventario y plan de ejemplo</Body><Body small muted>Se borran desde Configuración cuando quieras.</Body></View><Switch value={demo} onValueChange={setDemo} /></Row>
      <H2>Notificaciones</H2>
      <Body muted>Te vamos a pedir permiso para avisarte faltantes, cuándo descongelar y cuándo empezar a cocinar.</Body>
      <Button title="Empezar a usar la app" loading={busy} onPress={finish} />
    </View>,
  ];

  return <Screen>{steps[step]}</Screen>;
}
