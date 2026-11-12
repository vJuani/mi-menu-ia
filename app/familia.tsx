import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Field, Notice, Row, Screen } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import { targetsForMember, ageInMonths } from '../src/domain/nutrition';
import type { Member } from '../src/domain/types';

export default function Familia() {
  const { data } = useAppData();
  return (
    <Screen>
      {data.members.map((m) => (m.kind === 'bebe'
        ? <Card key={m.id} tone="baby" onPress={() => router.push('/helena')}><Body bold>👶 {m.name}</Body><Body small muted>{m.birthDate ? `${ageInMonths(m.birthDate)} meses` : ''} · sin metas calóricas · ver perfil</Body></Card>
        : <MemberEditor key={m.id} member={m} />))}
    </Screen>
  );
}

function MemberEditor({ member }: { member: Member }) {
  const { commit } = useAppData();
  const [aversions, setAversions] = useState(member.aversions);
  const [newTag, setNewTag] = useState('');
  const [extras, setExtras] = useState(member.optionalExtras.join(', '));
  const [allergies, setAllergies] = useState(member.allergies.join(', '));
  const [kcal, setKcal] = useState(member.targets ? String(member.targets.kcal) : '');
  const [prot, setProt] = useState(member.targets ? String(member.targets.proteinG) : '');
  const [weight, setWeight] = useState(member.weightKg ? String(member.weightKg) : '');
  const est = targetsForMember(member);

  const save = () => commit((r) => r.saveMember({
    ...member, aversions,
    optionalExtras: extras.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    allergies: allergies.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    weightKg: weight ? Number(weight.replace(',', '.')) : member.weightKg,
    targets: kcal && prot ? { kcal: Number(kcal), proteinG: Number(prot), carbsG: member.targets?.carbsG ?? 0, fatG: member.targets?.fatG ?? 0 } : undefined,
  }));

  return (
    <Card tone={member.isPrimary ? 'primary' : 'ro'}>
      <Body bold>{member.shortName ?? member.name}</Body>
      <Body small muted>Toque para alternar: rojo = no lo come · amarillo = prefiere evitar</Body>
      <Row wrap>
        {aversions.map((a) => (
          <Chip key={a.tag} tone={a.level === 'excluir' ? 'danger' : 'accent'} label={`${a.tag} · ${a.level === 'excluir' ? 'no' : 'evitar'}  ✕`}
            onPress={() => setAversions((xs) => (a.level === 'evitar' ? xs.filter((x) => x.tag !== a.tag) : xs.map((x) => (x.tag === a.tag ? { ...x, level: 'evitar' } : x))))} />
        ))}
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field placeholder="Agregar alimento (ej. hígado)" value={newTag} onChangeText={setNewTag} /></View>
        <Button small title="＋" onPress={() => { if (newTag.trim()) setAversions((xs) => [...xs.filter((x) => x.tag !== newTag.trim().toLowerCase()), { tag: newTag.trim().toLowerCase(), level: 'excluir' }]); setNewTag(''); }} />
      </Row>
      <Field label="Alergias (se excluyen siempre)" value={allergies} onChangeText={setAllergies} />
      <Field label="Extras solo para su versión (ej. huevo)" value={extras} onChangeText={setExtras} />
      {member.isPrimary ? <Field label="Peso actual (kg)" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} /> : null}
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field label="Objetivo kcal" keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder={est ? String(est.kcal) : 'opcional'} /></View>
        <View style={{ flex: 1 }}><Field label="Proteína (g)" keyboardType="number-pad" value={prot} onChangeText={setProt} placeholder={est ? String(est.proteinG) : 'opcional'} /></View>
      </Row>
      {!member.isPrimary ? <Notice>Los objetivos de {member.shortName ?? member.name} son independientes de los tuyos y opcionales.</Notice> : null}
      <Button small title="Guardar" onPress={save} />
    </Card>
  );
}
