import React, { useMemo, useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import { ageInMonths } from '../src/domain/nutrition';
import { TEXTURE_LABEL } from '../src/domain/babySafety';
import type { FoodIntroStatus, Texture } from '../src/domain/types';

const STATUS_LABEL: Record<FoodIntroStatus, string> = { pendiente: 'Pendiente', introducido: 'Introducido', tolerado: 'Tolerado', reaccion: 'Reacción' };

export default function Helena() {
  const { data, commit, todayISO } = useAppData();
  const baby = data.members.find((m) => m.kind === 'bebe');
  const p = data.babyProfile;
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const intros = useMemo(() => new Map(data.introductions.map((i) => [i.ingredientId, i])), [data.introductions]);
  if (!baby || !p) return <Screen><Body>Sin perfil de bebé.</Body></Screen>;
  const months = baby.birthDate ? ageInMonths(baby.birthDate) : 0;

  const setProfile = (patch: Partial<typeof p>) => commit((r) => r.saveBabyProfile({ ...p, ...patch }));
  const candidates = data.ingredientList.filter((i) => !i.tags.includes('basico') && (!search || i.name.toLowerCase().includes(search.toLowerCase())));

  function changeStatus(ingredientId: string, status: FoodIntroStatus) {
    const name = data.ingredients.get(ingredientId)?.name;
    if (status === 'reaccion') {
      const save = (txt?: string) => commit((r) => r.setIntroduction(baby!.id, ingredientId, 'reaccion', { reaction: txt, date: todayISO }));
      const msg = `Describí qué pasó con ${name}. Ante dificultad para respirar, hinchazón de cara o labios, o vómitos repetidos, llamá a emergencias (107 o 911).`;
      if (Platform.OS === 'ios') Alert.prompt('Registrar reacción', msg, (txt) => save(txt));
      else Alert.alert('Registrar reacción', msg, [{ text: 'Registrar', onPress: () => save() }, { text: 'Cancelar', style: 'cancel' }]);
      return;
    }
    Alert.alert(`${name}: ${STATUS_LABEL[status]}`, status === 'introducido' ? 'Confirmás que se lo vas a ofrecer / ya se lo ofreciste.' : '¿Confirmás?', [
      { text: 'Confirmar', onPress: () => commit((r) => r.setIntroduction(baby!.id, ingredientId, status, { date: todayISO })) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <Body bold style={{ fontSize: 22 }}>{baby.name} · {months} meses</Body>
      <Notice tone="baby">La leche materna o fórmula sigue siendo esencial. Sin sal, sin azúcar, sin miel antes del año. No se aplican metas ni porciones rígidas. Esta app no reemplaza al pediatra.</Notice>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body>Comenzó la alimentación complementaria</Body></View><Switch value={p.startedComplementary} onValueChange={(v) => setProfile({ startedComplementary: v })} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body>Señales de preparación confirmadas</Body></View><Switch value={p.readinessSigns} onValueChange={(v) => setProfile({ readinessSigns: v })} /></Row>
        <Body small muted>Texturas habilitadas</Body>
        <Row wrap>{(['pure', 'pisado', 'picado_fino', 'trozos_blandos'] as Texture[]).map((t) => (
          <Chip key={t} tone="baby" label={TEXTURE_LABEL[t]} active={p.allowedTextures.includes(t)} onPress={() => setProfile({ allowedTextures: p.allowedTextures.includes(t) ? p.allowedTextures.filter((x) => x !== t) : [...p.allowedTextures, t] })} />
        ))}</Row>
      </Card>

      <H2>Indicaciones del pediatra</H2>
      {p.pediatricianNotes.length === 0 ? <Body muted>Sin indicaciones registradas.</Body> : p.pediatricianNotes.map((n, i) => <Body key={i}>• {n}</Body>)}
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field placeholder="Ej.: introducir huevo cocido a partir de…" value={note} onChangeText={setNote} /></View>
        <Button small title="Agregar" disabled={!note.trim()} onPress={() => { commit((r) => r.addPediatricNote(baby.id, note.trim(), todayISO)); setNote(''); }} />
      </Row>

      <H2>Alimentos</H2>
      <Field placeholder="Buscar alimento" value={search} onChangeText={setSearch} />
      {candidates.slice(0, 40).map((i) => {
        const st = intros.get(i.id)?.status ?? 'pendiente';
        const blocked = i.tags.includes('miel') || i.tags.includes('riesgo_atragantamiento');
        return (
          <Card key={i.id} tone={st === 'reaccion' ? 'danger' : st === 'tolerado' ? 'primary' : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{i.name}</Body>
              <Body small muted>{STATUS_LABEL[st]}</Body>
            </Row>
            {blocked ? <Body small muted>No apto en este formato / edad.</Body> : (
              <Row wrap>
                {(['introducido', 'tolerado', 'reaccion'] as FoodIntroStatus[]).filter((s) => s !== st).map((s) => <Chip key={s} label={STATUS_LABEL[s]} tone={s === 'reaccion' ? 'danger' : 'baby'} onPress={() => changeStatus(i.id, s)} />)}
              </Row>
            )}
            {intros.get(i.id)?.reaction ? <Body small>Reacción: {intros.get(i.id)!.reaction}</Body> : null}
          </Card>
        );
      })}
      {candidates.length > 40 ? <Body small muted>Usá el buscador para ver más alimentos.</Body> : null}
    </Screen>
  );
}
