// @ts-check
// storage.js : IndexedDB (petit enrobage maison, sans dépendance). Magasins : settings, projects, blobs, drafts.
// Si IndexedDB est indisponible (navigation privée…), repli en mémoire + avertissement clair.
import { uuid } from './project.js';
import { logError, notify } from './errors.js';

const DB = 'lectura', VERSION = 1, MAGASINS = ['settings', 'projects', 'blobs', 'drafts'];
/** @type {Promise<IDBDatabase|null>|null} */
let ouverture = null;
const memoire = Object.fromEntries(MAGASINS.map((m) => [m, new Map()]));

export const DEFAUTS = {
  langue: 'fr', moteurVoix: 'webspeech', voixId: '', vitesseVoix: 1, hauteurVoix: 1, volume: 1,
  themeTerminal: 'sombre', policeTerminal: 'JetBrains Mono', tailleTexte: 18, vitesseDefilement: 28,
  reduireAnimations: false, modePresentation: false, modeAtlas: false,
  tutorielVu: false, motsPerso: {}, formatVideo: '9:16', themeApp: 'actuel',
  personnageId: 'robot_lectura', titreTerminal: 'rhak_override@sentinel: ~/cours',
  decor: { mur: '#28324d', sol: '#211a33', horizon: '#5ba5c9', neon: '#c67fa6' },
};

const promesse = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

function ouvrir() {
  if (ouverture) return ouverture;
  ouverture = new Promise((res) => {
    const echec = (err) => {
      logError('stockage', err || new Error('IndexedDB indisponible'));
      notify("Stockage local indisponible (navigation privée ?) : tes projets ne seront pas conservés après la fermeture.", 'warn', 9000);
      res(null);
    };
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => { for (const m of MAGASINS) if (!req.result.objectStoreNames.contains(m)) req.result.createObjectStore(m); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => echec(req.error);
      req.onblocked = () => echec(new Error('base de données bloquée par un autre onglet'));
    } catch (err) {
      echec(err);
    }
  });
  return ouverture;
}

async function tx(magasin, mode, fn) {
  const db = await ouvrir();
  if (!db) return fn(null, memoire[magasin]);
  return fn(db.transaction(magasin, mode).objectStore(magasin), null);
}
export const dbGet = (m, cle) => tx(m, 'readonly', (s, mem) => (s ? promesse(s.get(cle)) : mem.get(cle)));
export const dbPut = (m, cle, v) => tx(m, 'readwrite', (s, mem) => (s ? promesse(s.put(v, cle)) : void mem.set(cle, v)));
export const dbDel = (m, cle) => tx(m, 'readwrite', (s, mem) => (s ? promesse(s.delete(cle)) : void mem.delete(cle)));
export const dbAll = (m) => tx(m, 'readonly', (s, mem) => (s ? promesse(s.getAll()) : [...mem.values()]));

/** Relit puis modifie une entrée atomiquement. undefined : aucun changement ; null : supprimer. */
export async function dbUpdate(m, cle, modifier) {
  const db = await ouvrir();
  if (!db) {
    const mem = memoire[m], valeur = modifier(mem.get(cle));
    if (valeur === null) mem.delete(cle);
    else if (valeur !== undefined) mem.set(cle, valeur);
    return valeur;
  }
  return new Promise((res, rej) => {
    const transaction = db.transaction(m, 'readwrite'), magasin = transaction.objectStore(m);
    let valeur, erreur;
    transaction.oncomplete = () => res(valeur);
    transaction.onabort = () => rej(erreur || transaction.error);
    const lecture = magasin.get(cle);
    lecture.onsuccess = () => {
      try {
        valeur = modifier(lecture.result);
        if (valeur === null) magasin.delete(cle);
        else if (valeur !== undefined) magasin.put(valeur, cle);
      } catch (e) { erreur = e; transaction.abort(); }
    };
  });
}

/** Ne migre que les deux champs de l'ancien système de paiement ; aucun projet ni pack n'est touché. */
export async function loadSettings() {
  const s = { ...DEFAUTS, ...((await dbGet('settings', 'main')) || {}) };
  if (Object.hasOwn(s, 'licence') || Object.hasOwn(s, 'idInstallation')) {
    const sansLicence = (saved) => {
      const clean = { ...saved };
      delete clean.licence;
      delete clean.idInstallation;
      return clean;
    };
    delete s.licence;
    delete s.idInstallation;
    try { await dbUpdate('settings', 'main', sansLicence); } catch (err) { logError('réglages', err); }
  }
  return s;
}
export async function saveSettings(settings) {
  await dbPut('settings', 'main', settings);
}

export async function saveProject(p) {
  p.modifieLe = new Date().toISOString();
  await dbPut('projects', p.id, p);
  return p;
}
export const getProject = (id) => dbGet('projects', id);
export async function listProjects() {
  return (await dbAll('projects')).sort((a, b) => String(b.modifieLe).localeCompare(String(a.modifieLe)));
}
export async function deleteProject(id) {
  await dbDel('projects', id);
  await dbDel('blobs', id);
}

export class ProjectAudioMissing extends Error {}

function copieProjet(source, titre, audio) {
  if (source.audio?.source === 'fichier' && !(audio instanceof Blob && audio.size > 0)) {
    throw new ProjectAudioMissing();
  }
  const maintenant = new Date().toISOString();
  return { ...structuredClone(source), id: uuid(), titre: titre.slice(0, 200), creeLe: maintenant, modifieLe: maintenant };
}

/** Duplique un projet enregistré et son audio privé sans toucher au brouillon ou à la source. */
export async function duplicateProject(id, titre) {
  const db = await ouvrir();
  if (!db) {
    const source = memoire.projects.get(id);
    if (!source) throw new Error('Projet source introuvable.');
    const audio = source.audio?.source === 'fichier' ? memoire.blobs.get(id) : null;
    const copie = copieProjet(source, titre, audio);
    memoire.projects.set(copie.id, copie);
    if (audio) memoire.blobs.set(copie.id, audio); // Blob immuable, clé indépendante
    return copie;
  }
  // Les deux écritures réussissent ensemble ou aucune n'est conservée (p. ex. quota dépassé).
  return new Promise((res, rej) => {
    const tx = db.transaction(['projects', 'blobs'], 'readwrite');
    const projets = tx.objectStore('projects'), blobs = tx.objectStore('blobs');
    let copie, erreur;
    tx.oncomplete = () => res(copie);
    tx.onabort = () => rej(erreur || tx.error);
    const source = projets.get(id);
    const annuler = (err) => { erreur = err; tx.abort(); };
    function ecrire(p, audio) {
      try {
        copie = copieProjet(p, titre, audio);
        projets.add(copie, copie.id);
        if (audio) blobs.add(audio, copie.id);
      } catch (err) { annuler(err); }
    }
    source.onsuccess = () => {
      if (!source.result) return annuler(new Error('Projet source introuvable.'));
      if (source.result.audio?.source !== 'fichier') return ecrire(source.result, null);
      const audio = blobs.get(id);
      audio.onsuccess = () => ecrire(source.result, audio.result);
    };
  });
}

/** Fichier audio importé d'un projet (Blob + nom). */
export const saveAudio = (id, blob) => dbPut('blobs', id, blob);
export const getAudio = (id) => dbGet('blobs', id);
export const deleteAudio = (id) => dbDel('blobs', id);

/** Brouillon automatique (un seul : le projet en cours d'édition). */
export const saveDraft = (p) => dbPut('drafts', 'courant', p);
export const getDraft = () => dbGet('drafts', 'courant');
export const clearDraft = () => dbDel('drafts', 'courant');
