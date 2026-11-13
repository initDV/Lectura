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

/** Fichiers nécessaires à une voix : moteur ONNX + configuration + morceaux du modèle. */
export function fichiersDe(cat, voix) {
  return [...cat.moteur.fichiers, { fichier: voix.config, taille: voix.tailleConfig || 6000 }, ...voix.parts];
}
export const tailleDe = (cat, voix) => fichiersDe(cat, voix).reduce((a, f) => a + f.taille, 0);

async function ouvrir() {
  if (!('caches' in self)) throw new Error(t('voix.hd.err.cache'));
  return caches.open(CACHE);
}

/** @returns {Promise<{id:string, nom:string, installe:boolean, taille:number, licence:string, attribution:string}[]>} */
export async function etatVoix() {
  const cat = await getCatalogue(), cache = await ouvrir(), out = [];
  for (const v of cat.voix) {
    let ok = true;
    for (const f of fichiersDe(cat, v)) if (!(await cache.match(url(f.fichier)))) { ok = false; break; }
    out.push({ id: v.id, nom: v.nom, installe: ok, taille: tailleDe(cat, v), licence: v.licence, attribution: v.attribution });
  }
  return out;
}

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
    try {
      await cache.put(u, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
    } catch (err) {
      throw new Error(t(err?.name === 'QuotaExceededError' ? 'voix.hd.err.espace' : 'voix.hd.err.cache'));
    }
    fait += f.taille;
    onProgress?.(fait, total);
  }
}

/** Supprime une voix (le moteur ONNX est gardé tant qu'une autre voix est installée). */
export async function supprimer(id) {
  const cat = await getCatalogue(), cache = await ouvrir(), voix = cat.voix.find((v) => v.id === id);
  if (!voix) return;
  for (const f of [{ fichier: voix.config }, ...voix.parts]) await cache.delete(url(f.fichier));
  if (!(await etatVoix()).some((v) => v.installe)) for (const f of cat.moteur.fichiers) await cache.delete(url(f.fichier));
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
