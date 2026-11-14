// @ts-check
// pwa.js : service worker (réseau d'abord), invite de mise à jour, installation, réseau, stockage, veille écran.
import { bus, store } from '../state.js';
import { logError } from './errors.js';

/** @type {any} */ let invite = null; // événement beforeinstallprompt mis de côté
let rechargeDemandee = false;
/** @type {any} */ let reg = null; // enregistrement du service worker
/** @type {any} */ let attente = null; // nouvelle version téléchargée, prête à être activée
/** @type {any} */ let verrou = null;

export async function initPwa() {
  window.addEventListener('online', () => { store.enLigne = true; bus.emit('net:online'); });
  window.addEventListener('offline', () => { store.enLigne = false; bus.emit('net:offline'); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invite = e; bus.emit('pwa:installable'); });
  window.addEventListener('appinstalled', () => { invite = null; bus.emit('pwa:installed'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && verrou?.voulu) wakeLock(true); });
  if (!('serviceWorker' in navigator)) return; // http non sécurisé ou vieux navigateur : l'app marche, sans hors-ligne
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
    const surveiller = (w) => w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) { attente = w; bus.emit('sw:update-available', w); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) { attente = reg.waiting; bus.emit('sw:update-available', reg.waiting); }
    reg.addEventListener('updatefound', () => surveiller(reg.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (rechargeDemandee) location.reload(); });
    // Un appareil connecté vérifie souvent s'il existe une nouvelle version.
    const verifier = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
    bus.on('net:online', verifier);
    setInterval(verifier, 30 * 60 * 1000);
  } catch (err) {
    logError('service-worker', err);
    bus.emit('ui:toast', { type: 'warn', message: `Le mode hors ligne n'a pas pu être activé : ${err.message}` });
  }
}

/** Bouton « Recharger » : active la nouvelle version puis recharge la page. */
export function applyUpdate(worker) {
  rechargeDemandee = true;
  worker.postMessage('SKIP_WAITING');
  setTimeout(() => location.reload(), 4000); // filet de sécurité si controllerchange n'arrive pas
}

export const canInstall = () => !!invite;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Ouvre l'invite d'installation du navigateur. Renvoie true si l'utilisateur accepte. */
export async function promptInstall() {
  if (!invite) return false;
  invite.prompt();
  const { outcome } = await invite.userChoice;
  invite = null;
  return outcome === 'accepted';
}

/** Espace utilisé / quota / persistance. */
export async function storageInfo() {
  const info = { usage: NaN, quota: NaN, persiste: false, ratio: 0 };
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      info.usage = e.usage ?? NaN; info.quota = e.quota ?? NaN;
      info.ratio = info.quota ? info.usage / info.quota : 0;
    }
    if (navigator.storage?.persisted) info.persiste = await navigator.storage.persisted();
  } catch (err) {
    logError('stockage', err);
  }
  return info;
}

/** Demande au navigateur de ne pas effacer nos données (projets, voix) quand la place manque. */
export async function requestPersist() {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}

/** Empêche la mise en veille de l'écran pendant la lecture / l'enregistrement (si le navigateur le permet). */
export async function wakeLock(actif) {
  try {
    if (actif) {
      if (!('wakeLock' in navigator)) return false;
      const v = await /** @type {any} */ (navigator).wakeLock.request('screen');
      v.voulu = true;
      verrou = v;
      return true;
    }
    if (verrou) { verrou.voulu = false; await verrou.release?.(); verrou = null; }
  } catch {
    /* refusé (batterie faible, onglet caché) : sans gravité */
  }
  return false;
}

/** Une nouvelle version est téléchargée et attend d'être activée. */
export const updateReady = () => !!attente;

/** Active la nouvelle version prête, puis recharge la page. */
export function applyReadyUpdate() { if (attente) applyUpdate(attente); }

/** Cherche une nouvelle version maintenant. Renvoie 'prete' | 'a-jour' | 'hors-ligne' | 'erreur'. */
export async function checkForUpdate() {
  if (!reg) return 'erreur';
  if (!navigator.onLine) return 'hors-ligne';
  try {
    await reg.update();
    if (reg.installing) { // téléchargement en cours : on attend la fin (15 s au maximum)
      const w = reg.installing;
      await new Promise((ok) => { w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'redundant') ok(null); }); setTimeout(ok, 15000); });
    }
    if (reg.waiting && navigator.serviceWorker.controller) { attente = attente || reg.waiting; return 'prete'; }
    return attente ? 'prete' : 'a-jour';
  } catch {
    return 'erreur';
  }
}
