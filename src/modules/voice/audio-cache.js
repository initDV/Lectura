// @ts-check
// audio-cache.js : cache IndexedDB des synthèses Piper, une entrée par phrase (texte + voix + vitesse).
// But : ne jamais synthétiser deux fois la même phrase. Éviction LRU au-delà du quota.
const DB = 'lectura-audio-cache', VERSION = 1, STORE = 'phrases';
const QUOTA = 80 * 1024 * 1024; // 80 Mo max

/** @type {Promise<IDBDatabase|null>|null} */
let ouverture = null;

function ouvrir() {
  if (ouverture) return ouverture;
  ouverture = new Promise((res) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch { res(null); }
  });
  return ouverture;
}

const promesse = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

/** Hash SHA-1 stable d'une phrase (texte + voix + vitesse). */
export async function hashPhrase(texte, voixId, vitesse) {
  const data = new TextEncoder().encode(`${voixId}|${vitesse.toFixed(3)}|${texte}`);
  const h = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Récupère une entrée { samples, sampleRate } ou null. */
export async function getPhrase(id) {
  const db = await ouvrir(); if (!db) return null;
  try {
    const e = await promesse(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
    if (!e) return null;
    return { samples: new Float32Array(e.buffer), sampleRate: e.sr };
  } catch { return null; }
}

/** Stocke { samples, sampleRate }, avec éviction LRU si nécessaire. */
export async function setPhrase(id, samples, sampleRate) {
  const db = await ouvrir(); if (!db) return;
  const buffer = samples.slice().buffer;
  try {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    await promesse(store.put({ id, buffer, sr: sampleRate, date: Date.now(), taille: buffer.byteLength }));
    await tx.complete;
    await evincer();
  } catch { /* silencieux : le cache ne doit jamais bloquer la lecture */ }
}

/** Supprime les entrées les plus anciennes jusqu'à repasser sous le quota. */
async function evincer() {
  const db = await ouvrir(); if (!db) return;
  const toutes = await promesse(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  let total = 0;
  for (const e of toutes) total += e.taille || 0;
  if (total <= QUOTA) return;
  toutes.sort((a, b) => a.date - b.date);
  const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
  for (const e of toutes) {
    if (total <= QUOTA * 0.9) break; // marge : on évince jusqu'à 90 % du quota
    store.delete(e.id);
    total -= e.taille || 0;
  }
  await tx.complete;
}

/** Informations pour l'écran Réglages. */
export async function infoCache() {
  const db = await ouvrir(); if (!db) return { phrases: 0, taille: 0 };
  try {
    const toutes = await promesse(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    return { phrases: toutes.length, taille: toutes.reduce((a, e) => a + (e.taille || 0), 0) };
  } catch { return { phrases: 0, taille: 0 }; }
}

/** Vide intégralement le cache audio. */
export async function viderCache() {
  const db = await ouvrir(); if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await tx.complete;
  } catch { /* ignore */ }
}
