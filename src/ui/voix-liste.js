// @ts-check
// voix-liste.js : ligne « voix » de l'écran principal. Liste des voix françaises disponibles (voix du système,
// voix Lectura HD si elle est téléchargée) et import d'un fichier audio en option.
import { store } from '../state.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { pickFile } from './dom.js';
import { t, getLang, horloge } from '../modules/i18n.js';
import { getEngine, voiceKey } from '../modules/voice/engine.js';
import { MSG_FORMAT, FORMATS_AUDIO } from '../modules/audio.js';
import { saveAudio } from '../modules/storage.js';
import { report } from '../modules/errors.js';
import { ouvrirModale } from './modale.js';

/** Voix françaises du système (liste vide si le navigateur n'a pas de synthèse vocale). */
async function voixSysteme() {
  const m = await getEngine('webspeech');
  return m.disponible ? m.listVoices(getLang()) : [];
}
async function voixHd() {
  try { return await (await getEngine('piper')).listVoices(); } catch { return []; }
}

/** Nom affiché dans la ligne voix. Choisit aussi la première voix française si le projet n'en a pas encore. */
export async function nomVoix(projet) {
  const a = projet.audio;
  if (a.source === 'fichier') return a.nomFichier ? `${a.nomFichier} · ${horloge(a.dureeMs)}` : t('scene.voix.fichierAbsent');
  if (a.voix.moteur === 'piper') {
    const v = (await voixHd()).find((x) => x.id === a.voix.id);
    return v ? `Lectura HD · ${v.nom}` : t('scene.voix.hdAbsente');
  }
  const liste = await voixSysteme(), v = liste.find((x) => voiceKey(x) === a.voix.id) || liste.find((x) => x.default) || liste[0];
  if (!v) return t('scene.voix.aucune');
  if (a.voix.id !== voiceKey(v)) a.voix.id = voiceKey(v);
  return v.name;
}

/** Durée d'un fichier audio, ou erreur claire si le navigateur ne sait pas le lire. */
function dureeAudio(blob) {
  return new Promise((res, rej) => {
    const el = new Audio(), url = URL.createObjectURL(blob);
    const fin = (fn, v) => { clearTimeout(delai); URL.revokeObjectURL(url); el.removeAttribute('src'); fn(v); };
    const delai = setTimeout(() => fin(rej, new Error(MSG_FORMAT)), 15000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => fin(res, Number.isFinite(el.duration) ? el.duration * 1000 : 0);
    el.onerror = () => fin(rej, new Error(MSG_FORMAT));
    el.src = url;
  });
}

/** Import d'un fichier audio (option). Renvoie true si le projet utilise maintenant ce fichier. */
export async function choisirAudio(projet) {
  const f = await pickFile(FORMATS_AUDIO);
  if (!f) return false;
  try {
    const duree = await dureeAudio(f); // échoue avec un message clair si le format n'est pas lisible
    store.audioBlob = f;
    Object.assign(projet.audio, { source: 'fichier', nomFichier: f.name, dureeMs: Math.round(duree) });
    await saveAudio(projet.id, f);
    return true;
  } catch (err) {
    report('audio', err);
    return false;
  }
}

/** Ouvre la liste des voix. `onChange` est appelé après chaque choix. */
export async function ouvrirListeVoix(projet, onChange) {
  const [sys, hd] = await Promise.all([voixSysteme().catch(() => []), voixHd()]);
  const a = projet.audio;
  ouvrirModale(t('scene.voix.choisir'), (fermer) => {
    const choisir = (moteur, id) => () => {
      a.source = 'voix'; a.voix.moteur = moteur; a.voix.id = id;
      fermer(); onChange();
    };
    const ligne = (texte, actif, action, ic) => h('li', null, h('button', { type: 'button', 'aria-pressed': String(actif), onClick: action },
      icon(ic), h('span', { class: 'grow', text: texte })));
    return [
      h('h3', { text: t('scene.voix.systeme') }),
      sys.length
        ? h('ul', { class: 'choix' }, ...sys.map((v) => ligne(`${v.name}${v.localService ? '' : ` · ${t('voix.enLigne')}`}`,
          a.source === 'voix' && a.voix.moteur !== 'piper' && a.voix.id === voiceKey(v), choisir('webspeech', voiceKey(v)), 'voice')))
        : h('p', { class: 'muted small', text: t('voix.err.aucune') }),
      h('h3', { text: t('voix.hd.titre') }),
      hd.length
        ? h('ul', { class: 'choix' }, ...hd.map((v) => ligne(`Lectura HD · ${v.nom}`, a.source === 'voix' && a.voix.moteur === 'piper' && a.voix.id === v.id, choisir('piper', v.id), 'sparkle')))
        : h('ul', { class: 'choix' }, h('li', null, h('a', { href: '#/reglages', onClick: fermer }, icon('download'), h('span', { class: 'grow', text: t('voix.hd.gerer') })))),
      h('h3', { text: t('scene.voix.fichierTitre') }),
      h('ul', { class: 'choix' }, ligne(a.source === 'fichier' && a.nomFichier ? `${a.nomFichier} · ${horloge(a.dureeMs)}` : t('scene.voix.fichier'), a.source === 'fichier',
        async () => { fermer(); if (await choisirAudio(projet)) onChange(); }, 'upload')),
    ];
  });
}
