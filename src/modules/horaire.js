// Heures civiles uniquement. L'orthographe d'origine reste dans le projet et dans le terminal.
import { entierEnMots } from './voice/nombres.js';

const CHIFFRES = /(?<![\p{L}\p{M}\p{N}.,:/+−-])([01]?[0-9]|2[0-3])(?:[ \t\u00a0\u202f]*[hH][ \t\u00a0\u202f]*|:)([0-5][0-9])(?![\p{L}\p{M}\p{N}]|[.:,/-][0-9])/gu;
const nombres = new Map(Array.from({ length: 60 }, (_, n) => [entierEnMots(n), n]));
const mots = (n) => [...nombres].filter(([, v]) => v < n).map(([k]) => k).sort((a,b) => b.length - a.length).join('|');
// En toutes lettres, exige des minutes explicites (on ne montre pas une horloge sur « huit heures de travail »).
const MOTS = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}-])(une|${mots(24)})[ \\t\\u00a0\\u202f]+heures?[ \\t\\u00a0\\u202f]+(et demie|et quart|${mots(60)})(?![\\p{L}\\p{M}\\p{N}-])`, 'giu');
const etiquette = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

export function heuresEnMots(texte) {
  return texte.replace(CHIFFRES, (_, hh, mm) => {
    const h = +hh, m = +mm;
    return `${h === 1 ? 'une heure' : `${entierEnMots(h)} heure${h === 0 ? '' : 's'}`}${m ? ` ${entierEnMots(m)}` : ''}`;
  });
}

/** Premier horaire du texte. Index UTF-16, y compris après des accents et des emoji. */
export function premierHoraire(texte) {
  // matchAll n'avance pas l'état lastIndex des expressions réutilisées entre les scènes.
  const digit = texte.matchAll(CHIFFRES).next().value;
  const mot = texte.matchAll(MOTS).next().value;
  const m = digit && (!mot || digit.index < mot.index) ? digit : mot;
  if (!m) return null;
  const motH = m[1].toLowerCase(), motM = m[2].toLowerCase();
  const h = m === digit ? +motH : motH === 'une' ? 1 : nombres.get(motH);
  const min = m === digit ? +motM : motM === 'et demie' ? 30 : motM === 'et quart' ? 15 : nombres.get(motM);
  return { index: m.index, length: m[0].length, label: etiquette(h, min) };
}
