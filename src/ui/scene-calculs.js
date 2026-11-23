// @ts-check
/**
 * @param {string} texteNettoye
 * @param {boolean} apercu
 * @param {{audio: {source: string, nomFichier: string, voix: {moteur: string, id: string, vitesse: number}},
 *   personnageId: string, terminal: {vitesseCps: number}}} projet
 */
export function signaturePreparation(texteNettoye, apercu, projet) {
  return JSON.stringify([texteNettoye, apercu, projet.audio.source, projet.audio.nomFichier, projet.audio.voix.moteur, projet.audio.voix.id,
    projet.audio.voix.moteur === 'piper' ? projet.audio.voix.vitesse : 0, projet.personnageId, projet.terminal.vitesseCps]);
}
