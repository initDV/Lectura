// @ts-check
// prechauffer-texte.js : synthétise en arrière-plan les premières phrases du texte pour que
// « Lancer » démarre immédiatement. Le résultat est mis en cache (L1 + IndexedDB) par
// piper.synthesize, donc la lecture suivante n'attend pas.
//
// Principe : on appelle synthétiser sur un texte tronqué aux N premières phrases. Le cache
// fait le tri : les phrases déjà en cache sont instantanées, seules les nouvelles sont calculées.
// Debounce : si l'utilisateur tape vite, un seul préchauffage est lancé (le dernier).
// Annulation : si un nouveau texte arrive pendant la synthèse, on arrête au prochain cycle.
import { getEngine } from './engine.js';
import { splitSentences } from '../timeline.js';

let debounceId = 0;
let jeton = 0;

/**
 * Lance un préchauffage différé du texte. Idempotent : si le texte change entre-temps,
 * le préchauffage précédent est annulé.
 * @param {string} texte texte brut (sera nettoyé par l'appelant si besoin)
 * @param {string} voixId identifiant de la voix HD
 * @param {{ maxPhrases?: number, vitesse?: number, debounceMs?: number }} [opts]
 */
export function prechaufferTexte(texte, voixId, opts = {}) {
  const { maxPhrases = 5, vitesse = 1, debounceMs = 2000 } = opts;
  if (!texte || texte.length < 30) return;
  if (!voixId) return;

  // Annulation du préchauffage précédent
  if (debounceId) clearTimeout(debounceId);
  const monJeton = ++jeton;

  debounceId = setTimeout(async () => {
    if (monJeton !== jeton) return;
    try {
      const phrases = splitSentences(texte).filter((p) => p.type === 'parle');
      if (!phrases.length) return;
      const nPremieres = phrases.slice(0, maxPhrases);
      const fin = nPremieres[nPremieres.length - 1].end;
      const textePartiel = texte.slice(0, fin);
      if (textePartiel.length < 20) return;
      const moteur = await getEngine('piper');
      // synthesize est cache-aware : il ne synthétise que les phrases absentes du cache.
      await moteur.synthesize(textePartiel, { voixId, vitesse });
    } catch (err) {
      // Silencieux : un préchauffage raté ne doit jamais bloquer l'utilisateur.
      // La lecture normale prendra le relais (et signalera l'erreur si besoin).
      console.debug?.('[prechauffer-texte] ignoré :', err?.message || err);
    }
  }, debounceMs);
}

/** Annule un préchauffage en cours (par exemple au clic Lancer). */
export function annulerPrechauffage() {
  if (debounceId) clearTimeout(debounceId);
  debounceId = 0;
  jeton++;
}
