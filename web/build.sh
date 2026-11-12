#!/usr/bin/env bash
# Arma la versión web instalable en ./site (lista para GitHub Pages).
# Requisitos: TypeScript (tsc). No usa npm ni descarga nada: Preact y sql.js están en web/vendor.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build site
tsc -p tsconfig.json
mkdir -p site/app
cp -r build/* site/app/
cp index.html styles.css manifest.webmanifest site/
cp -r vendor icons site/
VERSION=$(cd site && find . -type f ! -name sw.js -print0 | sort -z | xargs -0 sha1sum | sha1sum | cut -c1-10)
FILES=$(cd site && find . -type f ! -name sw.js | sed 's#^\./#./#' | sort | sed 's/.*/  "&",/')
cat > site/sw.js <<EOF
// Service worker: guarda la app para usarla sin conexión. Versión ${VERSION}
const CACHE = 'mimenu-${VERSION}';
const FILES = [
  './',
${FILES}
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
EOF
touch site/.nojekyll
echo "Sitio listo en web/site (versión ${VERSION}, $(find site -type f | wc -l) archivos)"
