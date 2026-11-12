import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, DishHero, Notice, Row, Screen, Stepper, back, sheet } from '../ui.tsx';
import { needsForMeal } from '../../../src/domain/shopping.ts';
import { formatQty } from '../../../src/domain/units.ts';
import type { Unit } from '../../../src/domain/types.ts';

interface Progress { step: number; done: number[]; }

/** Mantiene la pantalla encendida mientras se cocina (si el navegador lo permite). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    const req = async () => { try { lock = (await nav.wakeLock?.request('screen')) ?? null; } catch { /* no soportado */ } };
    req();
    const vis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => undefined); };
  }, []);
}

function beep() {
  try {
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.4);
      o.start(ctx.currentTime + i * 0.4); o.stop(ctx.currentTime + i * 0.4 + 0.25);
    }
    navigator.vibrate?.(500);
  } catch { /* sin audio */ }
}

export function Cocina({ id, mealId, scale }: { id: string; mealId?: string; scale?: string }) {
  useWakeLock();
  const { data, repo, commit } = useApp();
  const recipe = data.recipes.get(id);
  const meal = data.meals.find((m) => m.id === mealId);
  const key = `cook.progress.${mealId || id}`;
  const [p, setP] = useState<Progress>({ step: 0, done: [] });
  const [phase, setPhase] = useState<'pasos' | 'confirmar'>('pasos');
  useEffect(() => { repo.getSetting<Progress>(key, { step: 0, done: [] }).then(setP); }, [key]);
  const save = (np: Progress) => { setP(np); repo.setSetting(key, np); };

  if (!recipe) return <Screen><Body>Receta no encontrada.</Body></Screen>;
  if (phase === 'confirmar') {
    return <ConfirmUsage recipeId={recipe.id} mealId={meal?.id} scale={Number(scale) || 1} onDone={async (opId) => {
      await repo.setSetting(key, { step: 0, done: [] });
      sheet('¡Listo!', 'Inventario actualizado con lo que confirmaste.', [
        { text: 'OK', onPress: () => back() },
        { text: 'Deshacer', style: 'destructive', onPress: () => commit((r) => r.undo(opId)) },
      ]);
    }} />;
  }
  const s = recipe.steps[Math.min(p.step, recipe.steps.length - 1)];
  const pct = (p.done.length / recipe.steps.length) * 100;

  return (
    <Screen>
      <Body muted>{recipe.name} · Paso {p.step + 1} de {recipe.steps.length} · el avance se guarda</Body>
      <div class="progress"><div style={{ width: `${pct}%` }} /></div>
      <Card tone={s.babySplit ? 'baby' : undefined} cls="cook-card">
        <p class="cook-text">{s.text}</p>
        {s.tip ? <Notice tone={s.babySplit ? 'baby' : 'warning'}>💡 {s.tip}</Notice> : null}
        {s.babySplit ? <Notice tone="baby">Separá la porción de Helena ahora, antes de sal o condimentos.</Notice> : null}
        {s.timerSec ? <Timer key={p.step} seconds={s.timerSec} /> : null}
        {p.step === recipe.steps.length - 1 ? <DishHero recipe={recipe} caption="Así tiene que quedar" /> : null}
        {p.step === recipe.steps.length - 1 && meal?.extraPortions ? <Notice tone="primary">🥡 Antes de servir, separá la porción del almuerzo de mañana en un táper. Dejala entibiar y llevala a la heladera dentro de las 2 horas.</Notice> : null}
        <button class="link bold" onClick={() => save({ ...p, done: p.done.includes(p.step) ? p.done.filter((d) => d !== p.step) : [...p.done, p.step] })}>{p.done.includes(p.step) ? '☑️ Hecho' : '⬜️ Marcar como hecho'}</button>
      </Card>
      <div class="grid-1-3">
        <Button kind="secondary" title="←" disabled={p.step === 0} onPress={() => save({ ...p, step: p.step - 1 })} />
        {p.step < recipe.steps.length - 1
          ? <Button title="Siguiente ›" onPress={() => save({ step: p.step + 1, done: p.done.includes(p.step) ? p.done : [...p.done, p.step] })} />
          : <Button title="Terminé de cocinar" onPress={() => setPhase('confirmar')} />}
      </div>
      <Body small muted>Con la pantalla bloqueada el temporizador sigue contando, pero el aviso suena recién al volver a la app.</Body>
    </Screen>
  );
}

function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number>(0);
  const rang = useRef(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) { setRunning(false); if (!rang.current) { rang.current = true; beep(); } }
    }, 500);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div class="timer">
      <div class={`timer-digits ${left === 0 ? 'done' : ''}`}>{mm}:{ss}</div>
      <Row>
        {running
          ? <Button small kind="secondary" title="Pausar" onPress={() => setRunning(false)} />
          : <Button small title={left === seconds ? 'Iniciar' : left === 0 ? 'Listo ✓' : 'Continuar'} disabled={left === 0} onPress={() => { endAt.current = Date.now() + left * 1000; rang.current = false; setRunning(true); }} />}
        <Button small kind="ghost" title="Reiniciar" onPress={() => { setRunning(false); setLeft(seconds); }} />
      </Row>
    </div>
  );
}

function ConfirmUsage({ recipeId, mealId, scale, onDone }: { recipeId: string; mealId?: string; scale: number; onDone: (op: string) => void }) {
  const { data, commit } = useApp();
  const recipe = data.recipes.get(recipeId)!;
  const meal = data.meals.find((m) => m.id === mealId);
  const initial = useMemo(() => {
    const m = meal ?? { id: 'tmp', date: '', slot: 'cena' as const, recipeId, memberIds: data.members.map((x) => x.id), portionsByMember: {}, status: 'planificada' as const, substitutions: {} };
    return needsForMeal(m, recipe, data.members, data.ingredients)
      .filter((n) => !data.ingredients.get(n.ingredientId)?.tags.includes('basico'))
      .map((n) => ({ ingredientId: n.ingredientId, qty: Math.round(n.qty * scale * 100) / 100, unit: n.unit as Unit }));
  }, []);
  const [usages, setUsages] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    let res: { operationId: string; shortfalls: { ingredientId: string }[] } | undefined;
    await commit(async (r) => {
      res = await r.confirmCooked(meal?.id ?? null, usages.filter((u) => u.qty > 0), data.ingredients);
      const extra = Object.values(meal?.extraPortions ?? {}).reduce((a, b) => a + b, 0);
      if (meal && extra > 0) await r.addLeftover({ recipeId: recipe.id, plannedMealId: meal.id, description: `${recipe.name} — almuerzo de mañana`, portions: Math.round(extra * 10) / 10, location: 'heladera' });
    });
    setBusy(false);
    if (res?.shortfalls.length) sheet('Atención', `No había suficiente stock registrado de: ${res.shortfalls.map((s) => data.ingredients.get(s.ingredientId)?.name).join(', ')}. Se descontó lo disponible.`, [{ text: 'OK', onPress: () => onDone(res!.operationId) }]);
    else if (res) onDone(res.operationId);
  }

  return (
    <Screen>
      <h1 class="h1-small">¿Cuánto usaste realmente?</h1>
      <Body muted>Solo se descuenta del inventario lo que confirmes acá.</Body>
      {usages.map((u, i) => (
        <Card>
          <Row between>
            <div class="grow"><Body bold>{data.ingredients.get(u.ingredientId)?.name}</Body><Body small muted>Planificado: {formatQty(initial[i].qty, u.unit)}</Body></div>
            <Stepper value={u.qty} step={u.unit === 'un' ? 0.5 : 10} onChange={(v) => setUsages((xs) => xs.map((x, j) => (j === i ? { ...x, qty: v } : x)))} suffix={u.unit} />
          </Row>
        </Card>
      ))}
      <Button title={busy ? 'Guardando…' : 'Confirmar y descontar'} disabled={busy} onPress={confirm} />
      <Button kind="ghost" title="Terminé sin descontar nada" onPress={() => back()} />
    </Screen>
  );
}
