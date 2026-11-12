import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { render } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { openWebDb } from './driver.js';
import { migrate } from '../../src/data/migrations.js';
import { Repo } from '../../src/data/repo.js';
import { seedBase } from '../../src/data/seed.js';
import { AppCtx, loadSnapshot, localToday, syncShopping } from './state.js';
import { Header, SheetHost, TabBar, useRoute, go } from './ui.js';
import { Hoy } from './screens/hoy.js';
import { Plan, Cambiar } from './screens/plan.js';
import { Receta } from './screens/receta.js';
import { Cocina } from './screens/cocina.js';
import { Inventario } from './screens/inventario.js';
import { Compras } from './screens/compras.js';
import { Asistente } from './screens/asistente.js';
import { Recetas } from './screens/recetas.js';
import { Editor } from './screens/editor.js';
import { Mas, Familia, Helena } from './screens/familia.js';
import { Progreso } from './screens/progreso.js';
import { Ajustes } from './screens/ajustes.js';
import { Onboarding } from './screens/onboarding.js';
const TABS = ['hoy', 'plan', 'inventario', 'asistente', 'mas'];
const TITLES = {
    plan: 'Plan semanal', inventario: 'Inventario', asistente: 'Asistente', mas: 'Más', receta: 'Receta', cocina: 'Modo cocina',
    cambiar: 'Cambiar comida', compras: 'Lista de compras', recetas: 'Recetario', editar: 'Receta', familia: 'Familia y restricciones',
    helena: 'Helena', progreso: 'Progreso', ajustes: 'Configuración',
};
function App({ repo, initial }) {
    const [data, setData] = useState(initial);
    const [version, setVersion] = useState(0);
    const [todayISO, setToday] = useState(localToday());
    const route = useRoute();
    const commit = useCallback(async (fn) => {
        if (fn)
            await fn(repo);
        let snap = await loadSnapshot(repo);
        await syncShopping(repo, snap);
        snap = await loadSnapshot(repo);
        setData(snap);
        setVersion((v) => v + 1);
    }, [repo]);
    useEffect(() => {
        const f = () => { if (document.visibilityState === 'visible') {
            setToday(localToday());
            commit();
        } };
        document.addEventListener('visibilitychange', f);
        return () => document.removeEventListener('visibilitychange', f);
    }, [commit]);
    const ctx = { repo, data, todayISO, commit, version };
    const [page, arg] = route.path;
    const p = route.params;
    if (!data.onboarded)
        return _jsxs(AppCtx.Provider, { value: ctx, children: [_jsx(Onboarding, {}), _jsx(SheetHost, {})] });
    let content;
    switch (page) {
        case 'plan':
            content = _jsx(Plan, {});
            break;
        case 'inventario':
            content = _jsx(Inventario, {});
            break;
        case 'asistente':
            content = _jsx(Asistente, {});
            break;
        case 'mas':
            content = _jsx(Mas, {});
            break;
        case 'receta':
            content = _jsx(Receta, { id: arg, mealId: p.mealId }, `${arg}-${p.mealId}`);
            break;
        case 'cocina':
            content = _jsx(Cocina, { id: arg, mealId: p.mealId, scale: p.scale }, arg);
            break;
        case 'cambiar':
            content = _jsx(Cambiar, { mealId: arg, date: p.date, slot: p.slot });
            break;
        case 'compras':
            content = _jsx(Compras, {});
            break;
        case 'recetas':
            content = _jsx(Recetas, {});
            break;
        case 'editar':
            content = _jsx(Editor, { id: p.id, dup: p.dup }, `${p.id}-${p.dup}`);
            break;
        case 'familia':
            content = _jsx(Familia, {});
            break;
        case 'helena':
            content = _jsx(Helena, {});
            break;
        case 'progreso':
            content = _jsx(Progreso, {});
            break;
        case 'ajustes':
            content = _jsx(Ajustes, {});
            break;
        default: content = _jsx(Hoy, {});
    }
    const isTab = TABS.includes(page ?? 'hoy') || !page;
    return (_jsxs(AppCtx.Provider, { value: ctx, children: [page && page !== 'hoy' && page !== 'editar' ? _jsx(Header, { title: TITLES[page] ?? '', backTo: !isTab }) : null, content, isTab ? _jsx(TabBar, { active: page ?? 'hoy' }) : null, _jsx(SheetHost, {})] }));
}
async function boot() {
    const root = document.getElementById('app');
    try {
        const db = await openWebDb();
        await migrate(db);
        const repo = new Repo(db);
        await seedBase(repo);
        let snap = await loadSnapshot(repo);
        await syncShopping(repo, snap);
        snap = await loadSnapshot(repo);
        root.innerHTML = '';
        render(_jsx(App, { repo: repo, initial: snap }), root);
        window.__mimenu = { repo, db };
    }
    catch (e) {
        root.innerHTML = `<div class="screen"><h1>No se pudo iniciar</h1><p>${String(e)}</p></div>`;
        console.error(e);
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    }
    if (!location.hash)
        go('hoy', {}, true);
}
boot();
