// @ts-check
// video-store.js : stockage local (IndexedDB) des vidéos exportées, accessible hors ligne.
// Réutilise le magasin « blobs » existant avec un préfixe de clé « video- » (pas de migration).
import { uuid } from './project.js';
import { dbAll, dbDel, dbGet, dbPut } from './storage.js';

const PREFIX = 'video-';
const MAX_VIDEOS = 20;
const MAX_BYTES = 150 * 1024 * 1024; // 150 Mo

/** @returns {Promise<any[]>} */
export async function listerVideos() {
  const toutes = (await dbAll('blobs')) || [];
  return toutes
    .filter((x) => x && typeof x === 'object' && x.id && String(x.id).startsWith(PREFIX))
    .sort((a, b) => b.date - a.date);
}

/**
 * Sauvegarde une vidéo.
 * @param {{ blob: Blob, titre: string, format: string }} o
 * @returns {Promise<string>} identifiant de la vidéo sauvegardée
 */
export async function sauverVideo({ blob, titre, format }) {
  const id = PREFIX + uuid();
  const entree = { id, blob, titre: titre || 'Sans titre', format, mime: blob.type, taille: blob.size, date: Date.now() };
  await dbPut('blobs', id, entree);
  await purger();
  return id;
}

/** @param {string} id @returns {Promise<Blob|null>} */
export async function lireVideo(id) {
  const e = await dbGet('blobs', id);
  return e && e.blob ? e.blob : null;
}

/** @param {string} id */
export async function supprimerVideo(id) {
  await dbDel('blobs', id);
}

async function purger() {
  const liste = await listerVideos();
  let total = 0;
  for (const v of liste) total += v.taille || 0;
  while (liste.length > MAX_VIDEOS || total > MAX_BYTES) {
    const vieille = liste.pop();
    if (!vieille) break;
    total -= vieille.taille || 0;
    await dbDel('blobs', vieille.id);
  }
}
