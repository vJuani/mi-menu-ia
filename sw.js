// Service worker: guarda la app para usarla sin conexión. Versión 0867269c6c
const CACHE = 'mimenu-0867269c6c';
const FILES = [
  './',
  "./app/src/config/app.js",
  "./app/src/data/backup.js",
  "./app/src/data/catalog.js",
  "./app/src/data/driver.js",
  "./app/src/data/migrations.js",
  "./app/src/data/repo.js",
  "./app/src/data/seed.js",
  "./app/src/domain/adaptations.js",
  "./app/src/domain/assistant.js",
  "./app/src/domain/babySafety.js",
  "./app/src/domain/inventory.js",
  "./app/src/domain/nutrition.js",
  "./app/src/domain/planner.js",
  "./app/src/domain/progress.js",
  "./app/src/domain/recipeEditor.js",
  "./app/src/domain/reminders.js",
  "./app/src/domain/shopping.js",
  "./app/src/domain/substitutions.js",
  "./app/src/domain/textParser.js",
  "./app/src/domain/types.js",
  "./app/src/domain/units.js",
  "./app/web/src/calendar.js",
  "./app/web/src/driver.js",
  "./app/web/src/main.js",
  "./app/web/src/screens/ajustes.js",
  "./app/web/src/screens/asistente.js",
  "./app/web/src/screens/cocina.js",
  "./app/web/src/screens/compras.js",
  "./app/web/src/screens/editor.js",
  "./app/web/src/screens/familia.js",
  "./app/web/src/screens/hoy.js",
  "./app/web/src/screens/inventario.js",
  "./app/web/src/screens/onboarding.js",
  "./app/web/src/screens/plan.js",
  "./app/web/src/screens/progreso.js",
  "./app/web/src/screens/receta.js",
  "./app/web/src/screens/recetas.js",
  "./app/web/src/state.js",
  "./app/web/src/ui.js",
  "./app/web/src/util.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css",
  "./vendor/PREACT-LICENSE",
  "./vendor/preact-hooks.mjs",
  "./vendor/preact-jsx-runtime.mjs",
  "./vendor/preact.mjs",
  "./vendor/sql-wasm.js",
  "./vendor/sql-wasm.wasm",
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
