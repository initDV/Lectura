// @ts-check
// audio-cache.js : cache IndexedDB des synthèses Piper, une entrée par phrase (révision + texte + voix + vitesse).
// But : ne jamais synthétiser deux fois la même phrase. Éviction des anciens rendus au-delà du quota.
// Deux étages (phrases + WAV) partagent cette révision. Ne jamais invalider lectura-models.
export const PIPER_RENDER_VERSION = 'fr-voiced-2';
const DB = 'lectura-audio-cache', VERSION = 2, STORE = 'phrases';
const QUOTA = 80 * 1024 * 1024; // 80 Mo max

/** @type {Promise<IDBDatabase|null>|null} */
let ouverture = null;

function ouvrir() {
  if (ouverture) return ouverture;
  ouverture = new Promise((res) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const s = req.result.objectStoreNames.contains(STORE)
          ? req.transaction.objectStore(STORE) : req.result.createObjectStore(STORE, { keyPath: 'id' });
        // Les clés de cet index permettent de comptabiliser/évincer sans matérialiser les PCM.
        s.createIndex('stock', ['date', 'taille']);
      };
      let bloque = false;
      req.onblocked = () => { bloque = true; res(null); }; // Un ancien onglet ne doit pas bloquer la lecture.
      req.onerror = () => res(null);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); ouverture = null; };
        if (bloque) ouverture = Promise.resolve(db); // Le cache redevient disponible quand l'ancien onglet se ferme.
        else res(db);
      };
    } catch { res(null); }
  });
  return ouverture;
}

const promesse = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txComplete = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('tx abort')); });
/** Cache L1 borné et accès rapide, même sans IndexedDB. */
const L1 = new Map(), LIMITE_L1 = 8 * 1024 * 1024;
let octetsL1 = 0;
function retenir(id, entree) {
  const n = entree.samples.byteLength;
  if (L1.has(id)) { octetsL1 -= L1.get(id).samples.byteLength; L1.delete(id); }
  if (n > LIMITE_L1) return;
  L1.set(id, entree); octetsL1 += n;
  while (octetsL1 > LIMITE_L1) {
    const k = L1.keys().next().value;
    octetsL1 -= L1.get(k).samples.byteLength; L1.delete(k);
  }
}

/** Hash SHA-1 stable d'une phrase (texte + voix + vitesse). */
export async function hashPhrase(texte, voixId, vitesse) {
  const data = new TextEncoder().encode(JSON.stringify([PIPER_RENDER_VERSION, voixId, vitesse, texte]));
  const h = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Récupère une entrée { samples, sampleRate, peak } ou null. */
export async function getPhrase(id) {
  if (L1.has(id)) { const e = L1.get(id); retenir(id, e); return e; }
  const db = await ouvrir(); if (!db) return null;
  try {
    const e = await promesse(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
    if (!e || !(e.buffer instanceof ArrayBuffer) || !e.buffer.byteLength || !Number.isFinite(e.peak) || !Number.isInteger(e.sr) || e.sr < 8000 || e.sr > 48000) return null;
    const val = { samples: new Float32Array(e.buffer), sampleRate: e.sr, peak: e.peak };
    retenir(id, val);
    return val;
  } catch { return null; }
}

/** Stocke { samples, sampleRate, peak }, avec éviction par date si nécessaire. */
export async function setPhrase(id, samples, sampleRate, peak) {
  retenir(id, { samples, sampleRate, peak });
  if (samples.byteLength > QUOTA) return;
  const db = await ouvrir(); if (!db) return;
  const buffer = samples.byteLength === samples.buffer.byteLength ? samples.buffer : samples.slice().buffer;
  try {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    store.put({ id, buffer, sr: sampleRate, peak, date: Date.now(), taille: buffer.byteLength });
    await txComplete(tx);
    await evincer();
  } catch { /* silencieux : le cache ne doit jamais bloquer la lecture */ }
}

function inventaire(db) {
  return new Promise((res, rej) => {
    const lignes = [], req = db.transaction(STORE, 'readonly').objectStore(STORE).index('stock').openKeyCursor();
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { res(lignes); return; }
      lignes.push({ id: c.primaryKey, taille: c.key[1] });
      c.continue();
    };
  });
}

/** Les plus anciennes d'abord, sans charger les échantillons depuis IndexedDB. */
async function evincer() {
  const db = await ouvrir(); if (!db) return;
  const cles = await inventaire(db);
  let total = cles.reduce((a, e) => a + e.taille, 0);
  if (total <= QUOTA) return;
  const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
  for (const e of cles) {
    if (total <= QUOTA * 0.9) break;
    store.delete(e.id);
    total -= e.taille;
  }
  await txComplete(tx);
}

export async function infoCache() {
  const db = await ouvrir(); if (!db) return { phrases: 0, taille: 0 };
  try {
    const cles = await inventaire(db);
    return { phrases: cles.length, taille: cles.reduce((a, e) => a + e.taille, 0) };
  } catch { return { phrases: 0, taille: 0 }; }
}

/** Vide intégralement le cache audio. */
export async function viderCache() {
  L1.clear(); octetsL1 = 0;
  const db = await ouvrir(); if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txComplete(tx);
  } catch { /* ignore */ }
}
