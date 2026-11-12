import { render } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { openWebDb } from './driver.ts';
import { migrate } from '../../src/data/migrations.ts';
import { Repo } from '../../src/data/repo.ts';
import { seedBase } from '../../src/data/seed.ts';
import { AppCtx, loadSnapshot, localToday, syncShopping } from './state.tsx';
import type { Ctx, Snapshot } from './state.tsx';
import { Header, SheetHost, TabBar, useRoute, go } from './ui.tsx';
import { Hoy } from './screens/hoy.tsx';
import { Plan, Cambiar } from './screens/plan.tsx';
import { Receta } from './screens/receta.tsx';
import { Cocina } from './screens/cocina.tsx';
import { Inventario } from './screens/inventario.tsx';
import { Compras } from './screens/compras.tsx';
import { Asistente } from './screens/asistente.tsx';
import { Recetas } from './screens/recetas.tsx';
import { Editor } from './screens/editor.tsx';
import { Mas, Familia, Helena } from './screens/familia.tsx';
import { Progreso } from './screens/progreso.tsx';
import { Ajustes } from './screens/ajustes.tsx';
import { Onboarding } from './screens/onboarding.tsx';
import type { MealSlot } from '../../src/domain/types.ts';

const TABS = ['hoy', 'plan', 'inventario', 'asistente', 'mas'];
const TITLES: Record<string, string> = {
  plan: 'Plan semanal', inventario: 'Inventario', asistente: 'Asistente', mas: 'Más', receta: 'Receta', cocina: 'Modo cocina',
  cambiar: 'Cambiar comida', compras: 'Lista de compras', recetas: 'Recetario', editar: 'Receta', familia: 'Familia y restricciones',
  helena: 'Helena', progreso: 'Progreso', ajustes: 'Configuración',
};

function App({ repo, initial }: { repo: Repo; initial: Snapshot }) {
  const [data, setData] = useState(initial);
  const [version, setVersion] = useState(0);
  const [todayISO, setToday] = useState(localToday());
  const route = useRoute();

  const commit = useCallback(async (fn?: (r: Repo) => Promise<unknown>) => {
    if (fn) await fn(repo);
    let snap = await loadSnapshot(repo);
    await syncShopping(repo, snap);
    snap = await loadSnapshot(repo);
    setData(snap);
    setVersion((v) => v + 1);
  }, [repo]);

  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') { setToday(localToday()); commit(); } };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [commit]);

  const ctx: Ctx = { repo, data, todayISO, commit, version };
  const [page, arg] = route.path;
  const p = route.params;

  if (!data.onboarded) return <AppCtx.Provider value={ctx}><Onboarding /><SheetHost /></AppCtx.Provider>;

  let content;
  switch (page) {
    case 'plan': content = <Plan />; break;
    case 'inventario': content = <Inventario />; break;
    case 'asistente': content = <Asistente />; break;
    case 'mas': content = <Mas />; break;
    case 'receta': content = <Receta key={`${arg}-${p.mealId}`} id={arg} mealId={p.mealId} />; break;
    case 'cocina': content = <Cocina key={arg} id={arg} mealId={p.mealId} scale={p.scale} />; break;
    case 'cambiar': content = <Cambiar mealId={arg} date={p.date} slot={p.slot as MealSlot | undefined} />; break;
    case 'compras': content = <Compras />; break;
    case 'recetas': content = <Recetas />; break;
    case 'editar': content = <Editor key={`${p.id}-${p.dup}`} id={p.id} dup={p.dup} />; break;
    case 'familia': content = <Familia />; break;
    case 'helena': content = <Helena />; break;
    case 'progreso': content = <Progreso />; break;
    case 'ajustes': content = <Ajustes />; break;
    default: content = <Hoy />;
  }
  const isTab = TABS.includes(page ?? 'hoy') || !page;
  return (
    <AppCtx.Provider value={ctx}>
      {page && page !== 'hoy' && page !== 'editar' ? <Header title={TITLES[page] ?? ''} backTo={!isTab} /> : null}
      {content}
      {isTab ? <TabBar active={page ?? 'hoy'} /> : null}
      <SheetHost />
    </AppCtx.Provider>
  );
}

async function boot() {
  const root = document.getElementById('app')!;
  try {
    const db = await openWebDb();
    await migrate(db);
    const repo = new Repo(db);
    await seedBase(repo);
    let snap = await loadSnapshot(repo);
    await syncShopping(repo, snap);
    snap = await loadSnapshot(repo);
    root.innerHTML = '';
    render(<App repo={repo} initial={snap} />, root);
    (window as unknown as { __mimenu: unknown }).__mimenu = { repo, db };
  } catch (e) {
    root.innerHTML = `<div class="screen"><h1>No se pudo iniciar</h1><p>${String(e)}</p></div>`;
    console.error(e);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  if (!location.hash) go('hoy', {}, true);
}
boot();
