import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Stepper } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { parseInventoryText } from '../../src/domain/textParser';
import type { ParsedItem } from '../../src/domain/textParser';
import { formatQty } from '../../src/domain/units';
import { LOCATION_LABEL, STATE_LABEL } from '../../src/ui/labels';
import { space } from '../../src/ui/theme';
import type { InventoryLocation, InventoryLot, LotState, Unit } from '../../src/domain/types';

const LOCS: InventoryLocation[] = ['heladera', 'freezer', 'alacena'];

export default function Inventario() {
  const { data, commit, repo } = useAppData();
  const [loc, setLoc] = useState<InventoryLocation>('heladera');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<(ParsedItem & { location: InventoryLocation })[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [frequent, setFrequent] = useState<{ ingredientId: string; lastQty?: number; lastUnit?: Unit }[]>([]);
  const [ops, setOps] = useState<Awaited<ReturnType<typeof repo.recentOperations>>>([]);
  const [leftovers, setLeftovers] = useState<Awaited<ReturnType<typeof repo.leftovers>>>([]);

  useEffect(() => {
    repo.frequentProducts().then(setFrequent);
    repo.recentOperations(8).then(setOps);
    repo.leftovers().then(setLeftovers);
  }, [repo, data]);

  const lots = useMemo(() => data.lots.filter((l) => l.location === loc), [data.lots, loc]);

  function parse() {
    const items = parseInventoryText(text, data.ingredientList).map((p) => ({
      ...p,
      location: (data.ingredients.get(p.ingredientId ?? '')?.category === 'verdura' || ['lacteo', 'carne', 'pollo', 'pescado'].includes(data.ingredients.get(p.ingredientId ?? '')?.category ?? '') ? 'heladera' : 'alacena') as InventoryLocation,
    }));
    setParsed(items);
  }

  async function confirmParsed() {
    const valid = parsed.filter((p) => p.ingredientId && p.qty && p.qty > 0 && p.unit);
    const skipped = parsed.length - valid.length;
    await commit(async (r) => {
      for (const p of valid) {
        const isFrozen = p.location === 'freezer';
        await r.addLot({ ingredientId: p.ingredientId!, qty: p.qty!, unit: p.unit!, location: p.location, state: isFrozen ? 'congelado' : 'cerrado', purchasedAt: new Date().toISOString().slice(0, 10) });
      }
    });
    setParsed([]); setText('');
    if (skipped) Alert.alert('Revisá', `${skipped} ítem(s) sin producto reconocido o sin cantidad no se cargaron. No inventamos cantidades.`);
  }

  return (
    <Screen>
      <Row gap={space.sm}>{LOCS.map((l) => <View key={l} style={{ flex: 1 }}><Button small kind={loc === l ? 'primary' : 'secondary'} title={LOCATION_LABEL[l]} onPress={() => setLoc(l)} /></View>)}</Row>

      {lots.length === 0 ? <Body muted>No hay nada cargado en {LOCATION_LABEL[loc].toLowerCase()}.</Body> : null}
      {lots.map((l) => <LotCard key={l.id} lot={l} expanded={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)} />)}

      <H2>Agregar</H2>
      <Field placeholder='Ej.: "Tengo un kilo de pollo, cuatro zapallitos y dos calabazas"' value={text} onChangeText={setText} multiline onSubmitEditing={parse} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Button small title="Interpretar" disabled={!text.trim()} onPress={parse} /></View>
        <View style={{ flex: 1 }}><Button small kind="secondary" title="📷 Cámara / código" onPress={() => router.push('/escanear')} /></View>
      </Row>
      {parsed.length ? (
        <Card>
          <Body bold>Confirmá antes de guardar</Body>
          {parsed.map((p, i) => (
            <View key={i} style={{ gap: 6, paddingVertical: 6 }}>
              <Body>{p.ingredientId ? p.name : `❓ "${p.name}" (no reconocido)`}</Body>
              {p.ingredientId ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  {p.qty === null ? <Body small muted>Indicá la cantidad</Body> : null}
                  <Stepper value={p.qty ?? 0} step={p.unit === 'kg' || p.unit === 'l' ? 0.25 : p.unit === 'un' ? 1 : 50} onChange={(v) => setParsed((xs) => xs.map((x, j) => (j === i ? { ...x, qty: v, unit: x.unit ?? data.ingredients.get(x.ingredientId!)!.defaultUnit } : x)))} suffix={p.unit ?? data.ingredients.get(p.ingredientId)!.defaultUnit} />
                </Row>
              ) : null}
              {p.ingredientId ? <Row wrap>{LOCS.map((l) => <Chip key={l} label={LOCATION_LABEL[l]} active={p.location === l} onPress={() => setParsed((xs) => xs.map((x, j) => (j === i ? { ...x, location: l } : x)))} />)}</Row> : null}
            </View>
          ))}
          <Button title="Guardar en inventario" onPress={confirmParsed} />
        </Card>
      ) : null}

      {frequent.length ? (
        <>
          <Body small muted>Productos frecuentes</Body>
          <Row wrap>{frequent.map((f) => {
            const ing = data.ingredients.get(f.ingredientId);
            if (!ing) return null;
            return <Chip key={f.ingredientId} label={`＋ ${ing.name}${f.lastQty ? ` (${formatQty(f.lastQty, f.lastUnit ?? ing.defaultUnit)})` : ''}`} onPress={() => setParsed((xs) => [...xs, { raw: ing.name, name: ing.name, ingredientId: ing.id, qty: f.lastQty ?? null, unit: f.lastUnit ?? ing.defaultUnit, confidence: 'alta', location: loc }])} />;
          })}</Row>
        </>
      ) : null}

      {leftovers.length ? (
        <>
          <H2>Sobrantes</H2>
          {leftovers.map((l) => (
            <Card key={l.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><Body>{l.description}</Body><Body small muted>{l.portions} porción · {l.location} · guardado {l.storedAt.slice(0, 10)}</Body></View>
                <Button small kind="ghost" title="Lo comí" onPress={() => commit((r) => r.consumeLeftover(l.id))} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {ops.length ? (
        <>
          <H2>Últimos movimientos</H2>
          {ops.map((o) => (
            <Row key={o.operationId} style={{ justifyContent: 'space-between' }}>
              <Body small muted>{o.kind} · {o.items} ítem(s) · {o.createdAt.slice(0, 16).replace('T', ' ')}</Body>
              {o.reverted ? <Body small muted>deshecho</Body> : <Pressable onPress={() => commit((r) => r.undo(o.operationId))}><Body small style={{ textDecorationLine: 'underline' }}>Deshacer</Body></Pressable>}
            </Row>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function LotCard({ lot, expanded, onToggle }: { lot: InventoryLot; expanded: boolean; onToggle: () => void }) {
  const { data, commit } = useAppData();
  const ing = data.ingredients.get(lot.ingredientId);
  const [qty, setQty] = useState(lot.qty);
  const [exp, setExp] = useState(lot.expiresAt ?? '');
  const step = lot.unit === 'un' ? 1 : lot.unit === 'kg' || lot.unit === 'l' ? 0.1 : 50;
  const states: LotState[] = ['cerrado', 'abierto', 'congelado', 'descongelando', 'preparado'];
  return (
    <Card onPress={onToggle}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Body bold>{ing?.name ?? lot.ingredientId}</Body>
          <Body small muted>{STATE_LABEL[lot.state]}{lot.expiresAt ? ` · vence ${lot.expiresAt}` : ''}</Body>
        </View>
        <Body bold>{formatQty(lot.qty, lot.unit)}</Body>
      </Row>
      {expanded ? (
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}><Body small>Cantidad real</Body><Stepper value={qty} step={step} onChange={setQty} suffix={lot.unit} /></Row>
          <Row wrap>{states.map((s) => <Chip key={s} label={STATE_LABEL[s]} active={lot.state === s} onPress={() => commit((r) => r.updateLotMeta(lot.id, { state: s, location: s === 'congelado' ? 'freezer' : s === 'descongelando' ? 'heladera' : lot.location }))} />)}</Row>
          <Field label="Vencimiento (opcional, AAAA-MM-DD)" value={exp} onChangeText={setExp} autoCapitalize="none" />
          <Notice>Solo se guarda el vencimiento que escribas: la app no inventa fechas.</Notice>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Button small title="Guardar" onPress={() => commit(async (r) => {
              if (qty !== lot.qty) await r.adjustLotQty(lot.id, qty);
              if ((exp || undefined) !== lot.expiresAt) await r.updateLotMeta(lot.id, { expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : undefined });
            })} /></View>
            <View style={{ flex: 1 }}><Button small kind="danger" title="Se terminó" onPress={() => commit((r) => r.adjustLotQty(lot.id, 0))} /></View>
          </Row>
        </View>
      ) : null}
    </Card>
  );
}
