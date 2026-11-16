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
  reduireAnimations: false, modePresentation: false, idInstallation: '', licence: '',
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

/** Réglages complets ; crée l'identifiant d'installation à la première visite. */
export async function loadSettings() {
  const s = { ...DEFAUTS, ...((await dbGet('settings', 'main')) || {}) };
  if (!s.idInstallation) {
    s.idInstallation = uuid();
    await dbPut('settings', 'main', s);
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

/** Fichier audio importé d'un projet (Blob + nom). */
export const saveAudio = (id, blob) => dbPut('blobs', id, blob);
export const getAudio = (id) => dbGet('blobs', id);
export const deleteAudio = (id) => dbDel('blobs', id);

/** Brouillon automatique (un seul : le projet en cours d'édition). */
export const saveDraft = (p) => dbPut('drafts', 'courant', p);
export const getDraft = () => dbGet('drafts', 'courant');
export const clearDraft = () => dbDel('drafts', 'courant');
