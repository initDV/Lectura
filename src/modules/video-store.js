// @ts-check
// Médiathèque privée : conserve les anciens enregistrements et clés « video- » d'IndexedDB.
import { fileBase, uuid } from './project.js';
import { dbAll, dbGet, dbPut, dbUpdate } from './storage.js';
import { t } from './i18n.js';

const PREFIX = 'video-';
const MAX_ENTREES = 20, MAX_BYTES = 150 * 1024 * 1024;
const MIMES = { mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm' };

const idMedia = (id) => typeof id === 'string' && id.startsWith(PREFIX);
const estMedia = (x) => !!x && idMedia(x.id) && Object.hasOwn(MIMES, x.format) && x.blob instanceof Blob;
const estEntree = (x, id) => estMedia(x) && x.id === id;
const typeDe = (format) => format === 'mp3' ? 'audio' : 'video';
const infos = ({ id, titre, format, blob, date }) => ({ id, titre, format, mime: MIMES[format], taille: blob.size, date, type: typeDe(format) });
const titreNettoye = (titre) => String(titre ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, 120).trimEnd();

export async function listerMedias(filtre = 'tous') {
  return (await dbAll('blobs')).filter(estMedia).map(infos)
    .filter((m) => filtre === 'tous' || m.type === filtre)
    .sort((a, b) => b.date - a.date);
}

/** Garde le fichier d'export tel quel, sans encodage ni modification de son Blob. */
export async function sauverMedia({ blob, titre, format }) {
  if (!Object.hasOwn(MIMES, format) || !(blob instanceof Blob) || blob.size === 0) throw new Error(t('mv.introuvable'));
  if (blob.size > MAX_BYTES) throw new Error(t('mv.tropGros'));
  const id = PREFIX + uuid();
  await dbPut('blobs', id, { id, blob, titre: titreNettoye(titre) || t('editeur.sansTitre'), format, mime: MIMES[format], taille: blob.size, date: Date.now() });
  const liste = await listerMedias();
  let total = liste.reduce((n, m) => n + m.taille, 0);
  while (liste.length > MAX_ENTREES || total > MAX_BYTES) {
    const ancien = liste.pop();
    total -= ancien.taille;
    await supprimerMedia(ancien.id);
  }
  return id;
}

export async function lireMedia(id) {
  if (!idMedia(id)) return null;
  const e = await dbGet('blobs', id);
  return estEntree(e, id) ? { ...infos(e), blob: e.blob } : null;
}

export async function renommerMedia(id, titre) {
  if (!idMedia(id)) return false;
  titre = titreNettoye(titre);
  if (!titre) throw new Error(t('mv.nomVide'));
  return !!(await dbUpdate('blobs', id, (e) => estEntree(e, id) ? { ...e, titre } : undefined));
}

export async function supprimerMedia(id) {
  return idMedia(id) && (await dbUpdate('blobs', id, (e) => estEntree(e, id) ? null : undefined)) === null;
}

export function fichierMedia(media) {
  const nom = `${fileBase(media)}.${media.format}`;
  return new File([media.blob], nom, { type: media.mime });
}
