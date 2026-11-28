// @ts-check
import { NOMS } from '../modules/expressions.js';

/**
 * @param {string} texteNettoye
 * @param {boolean} apercu
 * @param {{audio: {source: string, nomFichier: string, voix: {moteur: string, id: string, vitesse: number}},
 *   personnageId: string, terminal: {vitesseCps: number}}} projet
 */
export function signaturePreparation(texteNettoye, apercu, projet) {
  // L'aperçu n'a pas de voix ni de vitesse cuite : le ralenti agit sur l'horloge déjà chargée.
  if (apercu) return JSON.stringify([texteNettoye, true, projet.personnageId, projet.terminal.vitesseCps]);
  return JSON.stringify([texteNettoye, apercu, projet.audio.source, projet.audio.nomFichier, projet.audio.voix.moteur, projet.audio.voix.id,
    projet.audio.voix.moteur === 'piper' ? projet.audio.voix.vitesse : 0, projet.personnageId, projet.terminal.vitesseCps]);
}

/**
 * @param {string} etat
 * @param {boolean} arrete
 * @returns {'preparation'|'lecture'|'pause'|'repos'}
 */
export function varianteCommandes(etat, arrete) {
  if (etat === 'PREPARATION') return 'preparation';
  if (etat === 'LECTURE') return 'lecture';
  return etat === 'PAUSE' && !arrete ? 'pause' : 'repos';
}

/**
 * Calcule l'expression suivante ; toute valeur absente du cycle, y compris 'auto', ramène à ''.
 * @param {string} expression
 */
export function prochaineExpression(expression) {
  const liste = ['', ...NOMS];
  return liste[(liste.indexOf(expression) + 1) % liste.length];
}
