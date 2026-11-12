import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Toggle, go, sheet } from '../ui.tsx';
import { targetsForMember, ageInMonths } from '../../../src/domain/nutrition.ts';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.ts';
import type { FoodIntroStatus, Member, Texture } from '../../../src/domain/types.ts';
import { APP_NAME } from '../../../src/config/app.ts';
import { num } from '../util.ts';

export function Mas() {
  const items: [string, string, string, string][] = [
    ['recetas', '📖', 'Recetario', 'Buscar, crear, editar y duplicar recetas'],
    ['compras', '🛒', 'Lista de compras', 'Faltantes de hoy y de la semana'],
    ['familia', '👨‍👩‍👧', 'Familia y restricciones', 'Perfiles, alimentos rechazados, objetivos'],
    ['helena', '👶', 'Helena', 'Etapa, texturas, alimentos introducidos, pediatra'],
    ['progreso', '📈', 'Progreso físico', 'Peso, medidas, adherencia'],
    ['ajustes', '⚙️', 'Configuración', 'Horarios, recordatorios en Calendario, respaldo'],
  ];
  return (
    <Screen>
      {items.map(([p, icon, t, s]) => <Card onPress={() => go(p)}><Body bold>{icon}  {t}</Body><Body small muted>{s}</Body></Card>)}
      <Body small muted>{APP_NAME} · tus datos se guardan solo en este iPhone</Body>
    </Screen>
  );
}

export function Familia() {
  const { data } = useApp();
  return (
    <Screen>
      {data.members.map((m) => (m.kind === 'bebe'
        ? <Card tone="baby" onPress={() => go('helena')}><Body bold>👶 {m.name}</Body><Body small muted>{m.birthDate ? `${ageInMonths(m.birthDate)} meses` : ''} · sin metas calóricas · ver perfil</Body></Card>
        : <MemberEditor key={m.id} member={m} />))}
    </Screen>
  );
}

function MemberEditor({ member }: { member: Member }) {
  const { commit } = useApp();
  const [aversions, setAversions] = useState(member.aversions);
  const [newTag, setNewTag] = useState('');
  const [extras, setExtras] = useState(member.optionalExtras.join(', '));
  const [allergies, setAllergies] = useState(member.allergies.join(', '));
  const [kcal, setKcal] = useState(member.targets ? String(member.targets.kcal) : '');
  const [prot, setProt] = useState(member.targets ? String(member.targets.proteinG) : '');
  const est = targetsForMember(member);
  const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const save = () => commit((r) => r.saveMember({
    ...member, aversions, optionalExtras: list(extras), allergies: list(allergies),
    targets: kcal && prot ? { kcal: num(kcal), proteinG: num(prot), carbsG: member.targets?.carbsG ?? est?.carbsG ?? 0, fatG: member.targets?.fatG ?? est?.fatG ?? 0 } : undefined,
  })).then(() => sheet('Guardado', undefined, [{ text: 'OK', style: 'cancel' }]));
  return (
    <Card tone={member.isPrimary ? 'primary' : 'ro'}>
      <Body bold>{member.shortName ?? member.name}</Body>
      <Body small muted>Tocá para cambiar: rojo = no lo come · naranja = prefiere evitar · otro toque lo quita</Body>
      <Row wrap>{aversions.map((a) => (
        <Chip tone={a.level === 'excluir' ? 'danger' : 'accent'} active label={`${a.tag} · ${a.level === 'excluir' ? 'no' : 'evitar'}`}
          onPress={() => setAversions((xs) => (a.level === 'evitar' ? xs.filter((x) => x.tag !== a.tag) : xs.map((x) => (x.tag === a.tag ? { ...x, level: 'evitar' as const } : x))))} />
      ))}</Row>
      <Row><div class="grow"><Field placeholder="Agregar alimento (ej. hígado)" value={newTag} onChange={setNewTag} /></div>
        <Button small title="＋" onPress={() => { const t = newTag.trim().toLowerCase(); if (t) setAversions((xs) => [...xs.filter((x) => x.tag !== t), { tag: t, level: 'excluir' }]); setNewTag(''); }} /></Row>
      <Field label="Alergias (se excluyen siempre)" value={allergies} onChange={setAllergies} />
      <Field label="Extras solo para su versión (ej. huevo)" value={extras} onChange={setExtras} />
      <div class="grid2">
        <Field label="Objetivo kcal" inputMode="numeric" value={kcal} onChange={setKcal} placeholder={est ? String(est.kcal) : 'opcional'} />
        <Field label="Proteína (g)" inputMode="numeric" value={prot} onChange={setProt} placeholder={est ? String(est.proteinG) : 'opcional'} />
      </div>
      {!member.isPrimary ? <Notice>Los objetivos de {member.shortName ?? member.name} son independientes de los tuyos y opcionales.</Notice> : null}
      <Button small title="Guardar" onPress={save} />
    </Card>
  );
}

const STATUS_LABEL: Record<FoodIntroStatus, string> = { pendiente: 'Pendiente', introducido: 'Introducido', tolerado: 'Tolerado', reaccion: 'Reacción' };

export function Helena() {
  const { data, commit, todayISO } = useApp();
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
      const txt = window.prompt(`Describí qué pasó con ${name}. Ante dificultad para respirar, hinchazón de cara o labios, o vómitos repetidos, llamá a emergencias (107 o 911).`) ?? undefined;
      commit((r) => r.setIntroduction(baby!.id, ingredientId, 'reaccion', { reaction: txt || undefined, date: todayISO }));
      return;
    }
    sheet(`${name}: ${STATUS_LABEL[status]}`, status === 'introducido' ? 'Confirmás que se lo vas a ofrecer o ya se lo ofreciste.' : '¿Confirmás?', [
      { text: 'Confirmar', onPress: () => commit((r) => r.setIntroduction(baby!.id, ingredientId, status, { date: todayISO })) },
    ]);
  }

  return (
    <Screen>
      <h1 class="h1-small">{baby.name} · {months} meses</h1>
      <Notice tone="baby">La leche materna o fórmula sigue siendo esencial. Sin sal, sin azúcar, sin miel antes del año. No se aplican metas ni porciones rígidas. Esta app no reemplaza al pediatra.</Notice>
      <Card>
        <Toggle label="Comenzó la alimentación complementaria" value={p.startedComplementary} onChange={(v) => setProfile({ startedComplementary: v })} />
        <Toggle label="Señales de preparación confirmadas" hint="Se sienta con poco apoyo, sostiene la cabeza, se interesa por la comida, no la empuja con la lengua." value={p.readinessSigns} onChange={(v) => setProfile({ readinessSigns: v })} />
        <Body small muted>Texturas habilitadas</Body>
        <Row wrap>{(['pure', 'pisado', 'picado_fino', 'trozos_blandos'] as Texture[]).map((t) => <Chip tone="baby" label={TEXTURE_LABEL[t]} active={p.allowedTextures.includes(t)} onPress={() => setProfile({ allowedTextures: p.allowedTextures.includes(t) ? p.allowedTextures.filter((x) => x !== t) : [...p.allowedTextures, t] })} />)}</Row>
      </Card>
      <H2>Indicaciones del pediatra</H2>
      {p.pediatricianNotes.length === 0 ? <Body muted>Sin indicaciones registradas.</Body> : p.pediatricianNotes.map((n) => <Body>• {n}</Body>)}
      <Row><div class="grow"><Field placeholder="Ej.: introducir huevo cocido a partir de…" value={note} onChange={setNote} /></div>
        <Button small title="Agregar" disabled={!note.trim()} onPress={() => { commit((r) => r.addPediatricNote(baby.id, note.trim(), todayISO)); setNote(''); }} /></Row>
      <H2>Alimentos</H2>
      <Field placeholder="Buscar alimento" value={search} onChange={setSearch} type="search" />
      {candidates.slice(0, 40).map((i) => {
        const st = intros.get(i.id)?.status ?? 'pendiente';
        const blocked = i.tags.includes('miel') || i.tags.includes('riesgo_atragantamiento');
        return (
          <Card tone={st === 'reaccion' ? 'danger' : st === 'tolerado' ? 'primary' : undefined}>
            <Row between><Body bold>{i.name}</Body><Body small muted>{STATUS_LABEL[st]}</Body></Row>
            {blocked ? <Body small muted>No apto en este formato / edad.</Body> : (
              <Row wrap>{(['introducido', 'tolerado', 'reaccion'] as FoodIntroStatus[]).filter((s) => s !== st).map((s) => <Chip label={STATUS_LABEL[s]} tone={s === 'reaccion' ? 'danger' : 'baby'} onPress={() => changeStatus(i.id, s)} />)}</Row>
            )}
            {intros.get(i.id)?.reaction ? <Body small>Reacción: {intros.get(i.id)!.reaction}</Body> : null}
          </Card>
        );
      })}
      {candidates.length > 40 ? <Body small muted>Usá el buscador para ver más alimentos.</Body> : null}
    </Screen>
  );
}
