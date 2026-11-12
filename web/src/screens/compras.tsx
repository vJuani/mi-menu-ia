import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, H2, Notice, Row, Screen, Stepper, sheet } from '../ui.tsx';
import { computeShoppingList, missingSentence } from '../../../src/domain/shopping.ts';
import type { ShoppingItem } from '../../../src/domain/shopping.ts';
import { findSubstitutes, applySubstitution } from '../../../src/domain/substitutions.ts';
import { formatQty } from '../../../src/domain/units.ts';
import type { InventoryLocation } from '../../../src/domain/types.ts';
import { LOCATION_LABEL } from '../util.ts';

export function Compras() {
  const { data, repo, commit, todayISO, version } = useApp();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [tab, setTab] = useState<'hoy' | 'semana' | 'comprados'>('hoy');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { repo.shoppingItems().then(setItems); }, [version]);
  const today = useMemo(() => computeShoppingList(data.meals.filter((m) => m.date === todayISO), data.recipes, data.members, data.ingredients, data.lots), [data, todayISO]);
  const todayIds = new Set(today.map((l) => l.ingredientId));
  const pending = items.filter((i) => i.status === 'pendiente');
  const shown = tab === 'hoy' ? pending.filter((i) => todayIds.has(i.ingredientId)) : tab === 'semana' ? pending : items.filter((i) => i.status !== 'pendiente');

  async function notFound(item: ShoppingItem) {
    await commit((r) => r.markNotFound(item.id));
    const affected = data.meals.filter((m) => m.status === 'planificada' && m.date >= todayISO && data.recipes.get(m.recipeId)?.ingredients.some((ri) => (m.substitutions[ri.ingredientId] ?? ri.ingredientId) === item.ingredientId));
    if (!affected.length) return;
    const opts = findSubstitutes(item.ingredientId, affected[0], data.members, data.ingredients, data.lots, data.babyCtx);
    if (!opts.length) return sheet('Sin reemplazo', 'No hay un reemplazo que respete las restricciones de todos. Cambiá esas comidas desde el plan.', [{ text: 'OK', style: 'cancel' }]);
    sheet(`Reemplazar en ${affected.length} comida(s)`, 'Se actualizan recetas y compras.', opts.slice(0, 3).map((o) => ({
      text: `${o.ingredient.name}${o.inStock > 0 ? ' (en casa)' : ''}${o.babyNeedsConfirmation ? ' · nuevo p/ Helena' : ''}`,
      onPress: () => commit(async (r) => { for (const m of affected) await r.saveMeal(applySubstitution(m, item.ingredientId, o.ingredient.id)); }),
    })));
  }

  return (
    <Screen>
      {today.length ? <Notice>{missingSentence(today, 'cocinar hoy')}</Notice> : <Notice tone="primary">Tenés todo para hoy.</Notice>}
      <Row wrap>
        <Chip label={`Para hoy (${pending.filter((i) => todayIds.has(i.ingredientId)).length})`} active={tab === 'hoy'} onPress={() => setTab('hoy')} />
        <Chip label={`Semana (${pending.length})`} active={tab === 'semana'} onPress={() => setTab('semana')} />
        <Chip label="Comprados" active={tab === 'comprados'} onPress={() => setTab('comprados')} />
      </Row>
      {shown.length === 0 ? <Body muted>Nada por acá.</Body> : null}
      {shown.map((it) => <ItemCard key={it.id} item={it} expanded={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} onNotFound={() => notFound(it)} />)}
      {tab === 'comprados' && shown.length ? <Button kind="ghost" title="Limpiar comprados" onPress={() => commit((r) => r.clearShoppingDone())} /> : null}
      <H2>¿Cómo funciona?</H2>
      <Body small muted>La lista se arma con las comidas de los próximos 7 días menos lo que ya tenés. Al marcar comprado, cargás la cantidad real y se suma al inventario. Planificar no descuenta nada.</Body>
    </Screen>
  );
}

function ItemCard({ item, expanded, onToggle, onNotFound }: { item: ShoppingItem; expanded: boolean; onToggle: () => void; onNotFound: () => void }) {
  const { data, commit } = useApp();
  const ing = data.ingredients.get(item.ingredientId);
  const [qty, setQty] = useState(item.suggestedQty);
  const [loc, setLoc] = useState<InventoryLocation>(['carne', 'pollo', 'pescado', 'lacteo', 'verdura', 'huevo'].includes(ing?.category ?? '') ? 'heladera' : 'alacena');
  const done = item.status !== 'pendiente';
  return (
    <Card onPress={done ? undefined : onToggle} tone={item.status === 'no_conseguido' ? 'warning' : done ? 'primary' : undefined}>
      <Row between>
        <Body bold>{done ? (item.status === 'comprado' ? '☑️ ' : '✖️ ') : '⬜️ '}{ing?.name}</Body>
        <Body>{item.status === 'comprado' ? formatQty(item.boughtQty ?? 0, item.unit) : formatQty(item.suggestedQty, item.unit)}</Body>
      </Row>
      {item.status === 'no_conseguido' ? <Body small muted>No lo conseguiste</Body> : null}
      {expanded && !done ? (
        <div class="stack" onClick={(e) => e.stopPropagation()}>
          <Row between><Body small>Compré</Body><Stepper value={qty} step={item.unit === 'un' ? 1 : 50} onChange={setQty} suffix={item.unit} /></Row>
          <Row wrap>{(['heladera', 'freezer', 'alacena'] as InventoryLocation[]).map((l) => <Chip label={LOCATION_LABEL[l]} active={loc === l} onPress={() => setLoc(l)} />)}</Row>
          <div class="grid2">
            <Button small title="Comprado" disabled={qty <= 0} onPress={() => commit((r) => r.markBought(item.id, qty, item.unit, loc, loc === 'freezer' ? 'congelado' : 'cerrado'))} />
            <Button small kind="secondary" title="No lo conseguí" onPress={onNotFound} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
