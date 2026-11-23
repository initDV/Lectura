// @ts-check
// piper-store.js : catalogue, téléchargement (à la demande, par morceaux, reprenable) et suppression des voix
// Lectura HD. Tout vient de NOTRE origine (dossier models/) et reste dans le cache « lectura-models ».
import { t } from '../i18n.js';

export const CACHE = 'lectura-models';
export const BASE = new URL('../../../models/', import.meta.url);
const url = (f) => new URL(f, BASE).href;
let catalogue = null;

/** Liste des voix proposées par ce site (models/index.json, créé par tools/fetch_voice.mjs). */
export async function getCatalogue() {
  if (catalogue) return catalogue;
  let res;
  try { res = await fetch(url('index.json')); } catch { throw new Error(t('voix.hd.err.reseau')); }
  if (!res.ok) throw new Error(t('voix.hd.err.absente'));
  try { catalogue = await res.json(); } catch { throw new Error(t('voix.hd.err.absente')); }
  return catalogue;
}

const modeleDe = (voix) => [{ fichier: voix.config, taille: voix.tailleConfig || 6000 }, ...voix.parts];
const moteurDe = (cat) => cat.moteur?.fichiers || [];
const uniques = (fichiers) => [...new Map(fichiers.map((f) => [f.fichier, f])).values()];
const cleModele = (voix) => JSON.stringify(uniques(modeleDe(voix)).map((f) => f.fichier).sort());

/** Configuration d'abord : une interruption garde des fichiers associés à cette voix. */
export function fichiersDe(cat, voix) {
  return uniques([...modeleDe(voix), ...moteurDe(cat)]);
}
export const tailleDe = (cat, voix) => fichiersDe(cat, voix).reduce((a, f) => a + f.taille, 0);

async function ouvrir() {
  if (!('caches' in self)) throw new Error(t('voix.hd.err.cache'));
  return caches.open(CACHE);
}

/** Inventaire des fichiers conservés, sans télécharger de modèle ni charger ONNX. */
async function inventaire(cat, cache) {
  const moteur = uniques(moteurDe(cat));
  const groupes = new Map();
  for (const v of cat.voix) {
    const cle = cleModele(v);
    if (!groupes.has(cle)) groupes.set(cle, { fichiers: uniques(modeleDe(v)), voix: [] });
    groupes.get(cle).voix.push(v);
  }
  const fichiers = uniques([...moteur, ...[...groupes.values()].flatMap((g) => g.fichiers)]);
  const presents = new Map();
  await Promise.all(fichiers.map(async (f) => {
    const res = await cache.match(url(f.fichier));
    if (!res) return;
    const n = res.headers.get('content-length');
    presents.set(f.fichier, n !== null && /^\d+$/.test(n) ? Number(n) : f.taille);
  }));
  const octetsPresents = (liste) => liste.reduce((n, f) => n + (presents.get(f.fichier) || 0), 0);
  const moteurPret = moteur.every((f) => presents.has(f.fichier));
  const etats = new Map();
  const modeles = [];
  for (const groupe of groupes.values()) {
    const octets = octetsPresents(groupe.fichiers);
    const installe = moteurPret && groupe.fichiers.every((f) => presents.has(f.fichier));
    const partiel = !installe && groupe.fichiers.some((f) => presents.has(f.fichier));
    const modele = { noms: groupe.voix.map((v) => v.nom), octets, installe, partiel };
    if (installe || partiel) modeles.push(modele);
    for (const v of groupe.voix) {
      const requis = fichiersDe(cat, v);
      etats.set(v.id, {
        id: v.id, nom: v.nom, licence: v.licence, attribution: v.attribution, modele,
        installe, partiel, taille: tailleDe(cat, v),
        restant: requis.reduce((n, f) => n + (presents.has(f.fichier) ? 0 : f.taille), 0),
      });
    }
  }
  return { voix: cat.voix.map((v) => etats.get(v.id)), modeles, moteurOctets: octetsPresents(moteur), totalOctets: octetsPresents(fichiers) };
}

export async function etatStockage() { return inventaire(await getCatalogue(), await ouvrir()); }
export async function etatVoix() { return (await etatStockage()).voix; }

async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Télécharge une voix. Les morceaux déjà présents sont conservés : on peut reprendre après une coupure.
 * @param {string} id @param {{onProgress?:(fait:number,total:number)=>void, signal?:AbortSignal}} [o]
 */
export async function telecharger(id, { onProgress, signal } = {}) {
  const cat = await getCatalogue(), voix = cat.voix.find((v) => v.id === id);
  if (!voix) throw new Error(t('voix.hd.err.inconnue', { id }));
  const cache = await ouvrir(), fichiers = fichiersDe(cat, voix), total = tailleDe(cat, voix);
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
  let fait = 0;
  for (const f of fichiers) {
    if (signal?.aborted) throw new Error(t('voix.hd.annule'));
    const u = url(f.fichier);
    if (await cache.match(u)) { fait += f.taille; onProgress?.(fait, total); continue; }
    let res;
    try { res = await fetch(u, { signal, cache: 'no-store' }); } catch (err) {
      if (err?.name === 'AbortError') throw new Error(t('voix.hd.annule'));
      throw new Error(t('voix.hd.err.reseau'));
    }
    if (!res.ok || !res.body) throw new Error(t('voix.hd.err.fichier', { fichier: f.fichier, code: res.status }));
    const lecteur = res.body.getReader(), morceaux = [];
    let recu = 0;
    for (;;) {
      let r;
      try { r = await lecteur.read(); } catch (err) {
        throw new Error(t(err?.name === 'AbortError' ? 'voix.hd.annule' : 'voix.hd.err.reseau'));
      }
      if (r.done) break;
      morceaux.push(r.value); recu += r.value.length;
      onProgress?.(Math.min(total, fait + recu), total);
    }
    const blob = new Blob(morceaux, { type: res.headers.get('content-type') || 'application/octet-stream' });
    if (f.sha256 && (await sha256(await blob.arrayBuffer())) !== f.sha256) throw new Error(t('voix.hd.err.corrompu', { fichier: f.fichier }));
    if (signal?.aborted) throw new Error(t('voix.hd.annule'));
    try {
      await cache.put(u, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
    } catch (err) {
      throw new Error(t(err?.name === 'QuotaExceededError' ? 'voix.hd.err.espace' : 'voix.hd.err.cache'));
    }
    fait += f.taille;
    onProgress?.(fait, total);
  }
}

async function retirerModele(cat, cache, voix) {
  const cle = cleModele(voix);
  // Un groupe de locuteurs MLS partage exactement le même modèle. Ne touche ni au
  // moteur commun, ni à un fichier également référencé par un autre modèle.
  const autres = new Set([...moteurDe(cat), ...cat.voix.filter((v) => cleModele(v) !== cle).flatMap(modeleDe)].map((f) => f.fichier));
  let efface = false;
  for (const f of uniques(modeleDe(voix))) if (!autres.has(f.fichier)) efface = (await cache.delete(url(f.fichier))) || efface;
  return efface;
}

export async function supprimerPartiel(id) {
  const cat = await getCatalogue(), cache = await ouvrir();
  const cible = (await inventaire(cat, cache)).voix.find((v) => v.id === id);
  if (!cible?.partiel) return false;
  return retirerModele(cat, cache, cat.voix.find((v) => v.id === id));
}

/** Une suppression complète concerne tous les locuteurs du modèle sélectionné. */
export async function supprimer(id) {
  const cat = await getCatalogue(), cache = await ouvrir(), voix = cat.voix.find((v) => v.id === id);
  if (!voix) return;
  await retirerModele(cat, cache, voix);
  if (!(await inventaire(cat, cache)).modeles.length) for (const f of moteurDe(cat)) await cache.delete(url(f.fichier));
}

/** « Libérer l'espace » : supprime tout le cache des voix. */
export async function toutSupprimer() {
  if ('caches' in self) await caches.delete(CACHE);
}

/** Lit un fichier installé (ArrayBuffer). */
export async function lire(fichier) {
  const res = await (await ouvrir()).match(url(fichier));
  if (!res) throw new Error(t('voix.hd.err.manquant'));
  return res.arrayBuffer();
}

/** Adresse blob: d'un fichier installé (pour import() / wasm sans réseau, même sans service worker). */
export const urlFichier = url;
