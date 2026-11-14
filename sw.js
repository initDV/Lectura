// Service worker de Lectura : RÉSEAU D'ABORD (un appareil connecté reçoit toujours la dernière version),
// copie locale seulement hors ligne ou si le réseau met plus de 5 s à répondre.
// VERSION et SHELL sont réécrits par tools/build.mjs (liste complète des fichiers du build).
const VERSION = 'lectura-v1.0.0';
const MODELS = 'lectura-models'; // jamais supprimé à l'activation
const SHELL = ['./', './index.html', './offline.html', './manifest.webmanifest'];
const DELAI_MS = 5000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('lectura-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  // Voix HD : cache d'abord (gros fichiers immuables). Le catalogue index.json suit la règle normale (réseau d'abord).
  if (u.pathname.includes('/models/') && !u.pathname.endsWith('/index.json')) return e.respondWith(cacheFirst(r, MODELS));
  if (r.headers.has('range')) return; // laisser le navigateur gérer les requêtes audio partielles
  e.respondWith(networkFirst(r));
});

// Correctif par rapport à la référence : sur une connexion lente, on n'abandonne PAS le réseau après 5 s
// s'il n'existe aucune copie locale (sinon la toute première visite échouerait). Le téléchargement
// continue en arrière-plan et met la copie locale à jour.
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const nav = req.mode === 'navigate';
  const net = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  net.catch(() => {}); // évite un rejet non géré si la copie locale a déjà été servie
  const local = () => cache.match(req, { ignoreSearch: nav });
  try {
    const rapide = await Promise.race([net, new Promise((r) => setTimeout(r, DELAI_MS, null))]);
    if (rapide) return rapide;
    return (await local()) || (await net);
  } catch {
    return (
      (await local()) ||
      (nav ? (await cache.match('./index.html')) || (await cache.match('./offline.html')) || Response.error() : Response.error())
    );
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}
