import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, Field, H2, Notice, PhotoButton, Row, Screen, Stepper, alertMsg } from '../ui.tsx';
import { parseInventoryText } from '../../../src/domain/textParser.ts';
import type { ParsedItem } from '../../../src/domain/textParser.ts';
import { formatQty } from '../../../src/domain/units.ts';
import type { InventoryLocation, InventoryLot, LotState, Unit } from '../../../src/domain/types.ts';
import { LOCATION_LABEL, STATE_LABEL } from '../util.ts';

const LOCS: InventoryLocation[] = ['heladera', 'freezer', 'alacena'];
type Draft = ParsedItem & { location: InventoryLocation; photo?: string };

export function Inventario() {
  const { data, commit, repo, version } = useApp();
  const [loc, setLoc] = useState<InventoryLocation>('heladera');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Draft[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [frequent, setFrequent] = useState<{ ingredientId: string; lastQty?: number; lastUnit?: Unit }[]>([]);
  const [ops, setOps] = useState<{ operationId: string; kind: string; createdAt: string; reverted: boolean; items: number }[]>([]);
  const [leftovers, setLeftovers] = useState<{ id: string; description: string; portions: number; location: string; storedAt: string }[]>([]);
  useEffect(() => { repo.frequentProducts().then(setFrequent); repo.recentOperations(8).then(setOps); repo.leftovers().then(setLeftovers); }, [version]);
  const lots = useMemo(() => data.lots.filter((l) => l.location === loc), [data.lots, loc]);

  const guessLoc = (id?: string): InventoryLocation => {
    const cat = data.ingredients.get(id ?? '')?.category ?? '';
    return ['verdura', 'lacteo', 'carne', 'pollo', 'pescado', 'huevo'].includes(cat) ? 'heladera' : 'alacena';
  };
  function parse() {
    setParsed(parseInventoryText(text, data.ingredientList).map((p) => ({ ...p, location: guessLoc(p.ingredientId) })));
  }
  async function confirmParsed() {
    const valid = parsed.filter((p) => p.ingredientId && p.qty && p.qty > 0 && p.unit);
    const skipped = parsed.length - valid.length;
    await commit(async (r) => {
      for (const p of valid) await r.addLot({ ingredientId: p.ingredientId!, qty: p.qty!, unit: p.unit!, location: p.location, state: p.location === 'freezer' ? 'congelado' : 'cerrado', purchasedAt: new Date().toISOString().slice(0, 10), photoUri: p.photo });
    });
    setParsed([]); setText('');
    if (skipped) alertMsg('Revisá', `${skipped} ítem(s) sin producto reconocido o sin cantidad no se cargaron. No inventamos cantidades.`);
  }
  const patch = (i: number, p: Partial<Draft>) => setParsed((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <Screen>
      <div class="grid3">{LOCS.map((l) => <Button small kind={loc === l ? 'primary' : 'secondary'} title={LOCATION_LABEL[l]} onPress={() => setLoc(l)} />)}</div>
      {lots.length === 0 ? <Body muted>No hay nada cargado en {LOCATION_LABEL[loc].toLowerCase()}.</Body> : null}
      {lots.map((l) => <LotCard key={l.id} lot={l} expanded={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)} />)}

      <H2>Agregar</H2>
      <Field multiline placeholder='Ej.: "Tengo un kilo de pollo, cuatro zapallitos y dos calabazas"' value={text} onChange={setText} />
      <Button small title="Interpretar" disabled={!text.trim()} onPress={parse} />
      {parsed.length ? (
        <Card>
          <Body bold>Confirmá antes de guardar</Body>
          {parsed.map((p, i) => {
            const ing = data.ingredients.get(p.ingredientId ?? '');
            return (
              <div class="parsed">
                <Body>{ing ? ing.name : `❓ "${p.name}" (no reconocido)`}</Body>
                {ing ? (
                  <>
                    <Row between>
                      {p.qty === null ? <Body small muted>Indicá la cantidad</Body> : <span />}
                      <Stepper value={p.qty ?? 0} step={p.unit === 'kg' || p.unit === 'l' ? 0.25 : p.unit === 'un' ? 1 : 50} onChange={(v) => patch(i, { qty: v, unit: p.unit ?? ing.defaultUnit })} suffix={p.unit ?? ing.defaultUnit} />
                    </Row>
                    <Row wrap>{LOCS.map((l) => <Chip label={LOCATION_LABEL[l]} active={p.location === l} onPress={() => patch(i, { location: l })} />)}
                      <PhotoButton label={p.photo ? '📷 ✓' : '📷 Foto'} onPhoto={(ph) => patch(i, { photo: ph })} /></Row>
                  </>
                ) : null}
              </div>
            );
          })}
          <Button title="Guardar en inventario" onPress={confirmParsed} />
        </Card>
      ) : null}

      {frequent.length ? (
        <>
          <Body small muted>Productos frecuentes</Body>
          <Row wrap>{frequent.map((f) => {
            const ing = data.ingredients.get(f.ingredientId);
            if (!ing) return null;
            return <Chip label={`＋ ${ing.name}${f.lastQty ? ` (${formatQty(f.lastQty, f.lastUnit ?? ing.defaultUnit)})` : ''}`} onPress={() => setParsed((xs) => [...xs, { raw: ing.name, name: ing.name, ingredientId: ing.id, qty: f.lastQty ?? null, unit: f.lastUnit ?? ing.defaultUnit, confidence: 'alta', location: loc }])} />;
          })}</Row>
        </>
      ) : null}
      <Body small muted>Escaneo de códigos de barras: no disponible en la versión web del iPhone. Usá el texto o los frecuentes.</Body>

      {leftovers.length ? (
        <>
          <H2>Sobrantes</H2>
          {leftovers.map((l) => (
            <Card><Row between><div class="grow"><Body>{l.description}</Body><Body small muted>{l.portions} porción · {l.location} · guardado {l.storedAt.slice(0, 10)}</Body></div>
              <Button small kind="ghost" title="Lo comí" onPress={() => commit((r) => r.consumeLeftover(l.id))} /></Row></Card>
          ))}
        </>
      ) : null}

      {ops.length ? (
        <>
          <H2>Últimos movimientos</H2>
          {ops.map((o) => (
            <Row between><Body small muted>{o.kind} · {o.items} ítem(s) · {o.createdAt.slice(0, 16).replace('T', ' ')}</Body>
              {o.reverted ? <Body small muted>deshecho</Body> : <button class="link small" onClick={() => commit((r) => r.undo(o.operationId))}>Deshacer</button>}</Row>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function LotCard({ lot, expanded, onToggle }: { lot: InventoryLot; expanded: boolean; onToggle: () => void }) {
  const { data, commit } = useApp();
  const ing = data.ingredients.get(lot.ingredientId);
  const [qty, setQty] = useState(lot.qty);
  const [exp, setExp] = useState(lot.expiresAt ?? '');
  const step = lot.unit === 'un' ? 1 : lot.unit === 'kg' || lot.unit === 'l' ? 0.1 : 50;
  const states: LotState[] = ['cerrado', 'abierto', 'congelado', 'descongelando', 'preparado'];
  return (
    <Card onPress={onToggle}>
      <Row between>
        {lot.photoUri ? <img class="dish" src={lot.photoUri} style={{ width: '40px', height: '40px' }} /> : null}
        <div class="grow"><Body bold>{ing?.name ?? lot.ingredientId}</Body><Body small muted>{STATE_LABEL[lot.state]}{lot.expiresAt ? ` · vence ${lot.expiresAt}` : ''}</Body></div>
        <Body bold>{formatQty(lot.qty, lot.unit)}</Body>
      </Row>
      {expanded ? (
        <div class="stack" onClick={(e) => e.stopPropagation()}>
          <Row between><Body small>Cantidad real</Body><Stepper value={qty} step={step} onChange={setQty} suffix={lot.unit} /></Row>
          <Row wrap>{states.map((s) => <Chip label={STATE_LABEL[s]} active={lot.state === s} onPress={() => commit((r) => r.updateLotMeta(lot.id, { state: s, location: s === 'congelado' ? 'freezer' : s === 'descongelando' ? 'heladera' : lot.location }))} />)}</Row>
          <Field label="Vencimiento (opcional)" type="date" value={exp} onChange={setExp} />
          <Notice>Solo se guarda el vencimiento que cargues: la app no inventa fechas.</Notice>
          <div class="grid2">
            <Button small title="Guardar" onPress={() => commit(async (r) => {
              if (qty !== lot.qty) await r.adjustLotQty(lot.id, qty);
              if ((exp || undefined) !== lot.expiresAt) await r.updateLotMeta(lot.id, { expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : undefined });
            })} />
            <Button small kind="danger" title="Se terminó" onPress={() => commit((r) => r.adjustLotQty(lot.id, 0))} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
