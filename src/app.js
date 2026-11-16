// @ts-check
// app.js : démarrage + machine d'états centralisée.
// IDLE → PREPARATION (décodage/synthèse) → PRET → LECTURE ⇄ PAUSE → FIN ; ERREUR depuis tout état.
import { bus, store } from './state.js';
import { installGlobalHandlers, logError, notify, report } from './modules/errors.js';
import { loadSettings, saveSettings, saveDraft, clearDraft } from './modules/storage.js';
import { setLang, t, taille } from './modules/i18n.js';
import { verifyLicense } from './modules/license.js';
import { initPwa, storageInfo } from './modules/pwa.js';
import { initToasts } from './ui/toast.js';
import { initShell, refreshShell } from './ui/shell.js';
import { initRouter, naviguer, currentRoute } from './router.js';

export const TRANSITIONS = {
  IDLE: ['PREPARATION'],
  PREPARATION: ['PRET', 'IDLE'],
  PRET: ['LECTURE', 'PREPARATION', 'IDLE'],
  LECTURE: ['PAUSE', 'FIN', 'IDLE'],
  PAUSE: ['LECTURE', 'FIN', 'PREPARATION', 'IDLE'],
  FIN: ['LECTURE', 'PAUSE', 'PREPARATION', 'IDLE'],
  ERREUR: ['PREPARATION', 'IDLE'],
};

/** Change d'état. ERREUR est accessible depuis tout état. Renvoie false (et journalise) si la transition est interdite. */
export function transition(vers, info) {
  const de = store.etat;
  if (vers === de) return true;
  if (vers !== 'ERREUR' && !(TRANSITIONS[de] || []).includes(vers)) {
    logError('etats', new Error(`Transition interdite : ${de} → ${vers}`));
    return false;
  }
  store.etat = vers;
  bus.emit('app:state', { de, vers, info });
  return true;
}

/** Modifie et enregistre des réglages. */
export async function majReglages(patch) {
  Object.assign(store.settings, patch);
  await saveSettings(store.settings);
  bus.emit('settings:changed', patch);
  if ('langue' in patch) {
    await setLang(patch.langue);
    refreshShell(currentRoute());
    await naviguer();
  }
}

/** Vérifie une clé de licence ; si elle est valide, l'enregistre et débloque Pro. */
export async function activerLicence(cle) {
  const r = await verifyLicense(cle, store.settings.idInstallation);
  if (r.ok) {
    store.pro = true;
    store.licence = r.data;
    await majReglages({ licence: cle.trim() });
    bus.emit('license:changed', { pro: true, data: r.data });
  }
  return r;
}

export async function retirerLicence() {
  store.pro = false;
  store.licence = null;
  await majReglages({ licence: '' });
  bus.emit('license:changed', { pro: false });
}

async function verifierLicenceEnregistree() {
  const cle = store.settings.licence;
  if (!cle) return;
  const r = await verifyLicense(cle, store.settings.idInstallation);
  store.pro = r.ok;
  store.licence = r.ok ? r.data : null;
  if (!r.ok) notify(t(`pro.err.${r.reason}`), 'warn');
}

async function surveillerQuota() {
  const info = await storageInfo();
  if (info.ratio > 0.8) notify(t('stockage.alerte', { usage: taille(info.usage), quota: taille(info.quota) }), 'warn', 10000);
}

let dernierBrouillon = '';
async function sauverBrouillon() {
  const p = store.projet;
  if (!p) return;
  const j = JSON.stringify(p);
  if (j === dernierBrouillon) return;
  try {
    if (p.texte.trim()) await saveDraft(JSON.parse(j)); else await clearDraft();
    dernierBrouillon = j;
  } catch (err) { report('brouillon', err); }
}

// Applique le thème d'apparence au démarrage (data-theme sur <html>).
export function appliquerTheme(nom) {
  document.documentElement.setAttribute('data-theme', nom || 'actuel');
}

export async function demarrer() {
  installGlobalHandlers();
  initToasts();
  store.settings = await loadSettings();
  appliquerTheme(store.settings.themeApp || 'actuel');
  await setLang(store.settings.langue);
  await verifierLicenceEnregistree();
  initShell();
  // Brouillon automatique toutes les 5 s : il reflète le projet ouvert et sera rouvert au prochain démarrage.
  setInterval(sauverBrouillon, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sauverBrouillon(); });
  window.addEventListener('beforeunload', (e) => {
    if (!store.projet || !store.projet.texte.trim() || JSON.stringify(store.projet) === dernierBrouillon) return; // tout est déjà sauvegardé
    e.preventDefault();
    e.returnValue = ''; // le navigateur affiche son propre message « modifications non enregistrées »
  });
  await initRouter();
  /** @type {any} */ (window).__lecturaPret = true;
  initPwa();
  surveillerQuota();
  if (!store.settings.tutorielVu) (await import('./ui/tutoriel.js')).ouvrirTutoriel();
}
