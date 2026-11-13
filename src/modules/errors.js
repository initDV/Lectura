// @ts-check
// errors.js : jamais d'échec silencieux. Chaque erreur est journalisée (localStorage, 50 dernières)
// ET affichée en clair (notification aria-live). Le journal est consultable dans « À propos ».
import { bus } from '../state.js';
import { VERSION, BUILD } from '../version.js';

const CLE = 'lectura-journal', MAX = 50;
let memoire = []; // repli si localStorage est indisponible

function lire() {
  try {
    const j = JSON.parse(localStorage.getItem(CLE) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return memoire;
  }
}
function ecrire(j) {
  memoire = j;
  try {
    localStorage.setItem(CLE, JSON.stringify(j));
  } catch {
    /* stockage plein ou interdit : on garde le journal en mémoire */
  }
}

/** Journalise sans notifier. @param {string} ou module ou action concernée */
export function logError(ou, err) {
  const entree = {
    date: new Date().toISOString(),
    ou,
    message: String(err?.message ?? err),
    pile: String(err?.stack || '').split('\n').slice(0, 6).join('\n'),
  };
  ecrire([...lire(), entree].slice(-MAX));
  console.error(`[lectura:${ou}]`, err);
  return entree;
}

/** Notification visible (type : info | ok | warn | error). */
export function notify(message, type = 'info', duree) {
  bus.emit('ui:toast', { type, message, duree });
}

/** Journalise ET affiche l'erreur à l'utilisateur. */
export function report(ou, err, prefixe = '') {
  logError(ou, err);
  notify(`${prefixe ? `${prefixe} ` : ''}${err?.message ?? err}`, 'error');
}

export const getJournal = () => lire();
export const clearJournal = () => ecrire([]);

/** Rapport texte à copier pour demander de l'aide (aucune donnée personnelle, rien n'est envoyé). */
export function buildReport() {
  const lignes = [
    `Lectura ${VERSION} (${BUILD})`,
    `Date : ${new Date().toISOString()}`,
    `Navigateur : ${navigator.userAgent}`,
    `Écran : ${screen.width}x${screen.height} · En ligne : ${navigator.onLine}`,
    `Langue : ${navigator.language}`,
    '',
  ];
  const j = lire();
  if (!j.length) lignes.push('Aucune erreur enregistrée.');
  for (const e of j) lignes.push(`[${e.date}] ${e.ou} : ${e.message}${e.pile ? `\n${e.pile}` : ''}`, '');
  return lignes.join('\n');
}

/** Attrape tout ce qui n'a pas été géré ailleurs. */
export function installGlobalHandlers() {
  window.addEventListener('error', (e) => {
    if (/ResizeObserver loop/.test(e.message || '')) return;
    if (e.target && e.target !== window && /** @type {any} */ (e.target).src) return; // ressource : gérée localement
    report('global', e.error || e.message, 'Erreur inattendue :');
  });
  window.addEventListener('unhandledrejection', (e) => {
    report('promesse', e.reason, 'Erreur inattendue :');
  });
}
