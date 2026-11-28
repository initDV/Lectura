// Piste faciale autonome sur l’horloge de la source : mêmes images en lecture, en recherche et à l’export.
import { bound, interp, smooth, windowAt } from './math.js';
import { faceDe } from './visages.js';

const finForte = /[.!?][”»"’')\]]*\s*$/u;
const suspendue = /(?:…|\.{3})[”»"’')\]]*\s*$/u;
const contraste = /^(?:mais|pourtant|but|yet)\b/iu;
const pauseInterne = /(?:…|\.{3})[”»"’')\]]*\s*(?:(?:mais|pourtant|but|yet)\s+)?$/iu;

// Follow one thought across audio chunks (commas, ellipses, forced splits), never across lines.
export function reprendReplique(avant, apres, texte) {
  return avant?.end <= apres.start && typeof texte === 'string' && /^[^\S\r\n\u2028\u2029]*$/.test(texte.slice(avant.end, apres.start))
    && (suspendue.test(avant.texte) ? /^\p{Ll}/u.test(apres.texte) || contraste.test(apres.texte) : !finForte.test(avant.texte));
}

// The Android speech planner can map expanded numbers/pronunciations back to the source.
export function heureMot(p, pos) {
  const map = p.cursor;
  let ratio = bound(pos / p.texte.length);
  if (map?.length && Number.isFinite(p.offset)) {
    let lo = 0, hi = map.length;
    while (lo < hi) { const mi = (lo + hi) >>> 1; if (map[mi] < p.offset + pos) lo = mi + 1; else hi = mi; }
    ratio = lo / map.length;
  }
  return p.start + (p.speechEnd - p.start) * ratio;
}

function ajouterReplique(piste, phrases) {
  if (!phrases.length) return;
  const premiere = phrases[0], start = premiere.start, end = phrases.at(-1).end;
  if (premiere.manual) {
    piste.push({ start, end, face: premiere.face, force: 1, manual: true });
    return;
  }
  const notes = [];
  for (const [i, p] of phrases.entries()) {
    for (const n of p.indices) {
      const at = Math.min(heureMot(p, n.pos), p.speechEnd - .04), avant = notes.at(-1), prec = i > 0 ? phrases[i - 1] : null;
      if (n.face === (avant?.face ?? 'neutre') || (avant && at - avant.at < .25)) continue;
      const ellipse = pauseInterne.exec(p.texte.slice(0, n.pos));
      const pause = ellipse ? heureMot(p, ellipse.index) : prec && at - p.start <= .56 && suspendue.test(prec.texte)
        ? prec.speechEnd < p.start - .03 ? prec.speechEnd : p.start - Math.min(.22, .15 * (prec.speechEnd - prec.start))
        : null;
      notes.push({ at, face: n.face, force: n.force, pause });
    }
  }
  if (!notes.length) return;
  // A late keyword never paints its emotion on the beginning of the sentence.
  if (notes[0].at > start + .07) notes.unshift({ at: start, face: 'neutre', force: 1 });
  const transitions = [];
  for (let i = 1; i < notes.length; i++) {
    const from = notes[i - 1], to = notes[i], pivot = to.at, ecart = pivot - from.at;
    const avant = transitions.at(-1), yeux = pivot - Math.min(.15, .4 * ecart);
    const debut = Math.max(avant?.fin ?? from.at, to.pause === null ? yeux : Math.min(yeux, Math.max(to.pause, pivot - .86)));
    const fin = pivot + Math.min(.21, .4 * ((notes[i + 1]?.at ?? end) - pivot));
    if (avant) avant.end = debut;
    transitions.push({ start: debut, end, fin, pivot, from, to, leve: to.pause !== null });
  }
  const { face, force } = notes[0];
  piste.push({ start, end, face, force, ...(transitions.length ? { transitions } : {}) });
}

export function pisteHumeurs(phrases) {
  const piste = [];
  let replique = [];
  for (const p of phrases) {
    const prec = replique.at(-1);
    if (prec && (!p.liee || p.start - prec.speechEnd > .85 || p.manual || prec.manual)) {
      ajouterReplique(piste, replique);
      replique = [];
    }
    replique.push(p);
  }
  ajouterReplique(piste, replique);
  return piste;
}

export function jouerVisage(humeur, t, expression, cueFace, cueForce) {
  let face = faceDe(expression || humeur?.face || cueFace || 'neutre'), force = expression ? 1 : humeur?.force ?? cueForce, leve = 0;
  const ton = !expression && humeur?.transitions && windowAt(humeur.transitions, t);
  if (ton) {
    const { start, fin, pivot, from, to } = ton;
    const arrivee = faceDe(to.face);
    if (t >= fin) { face = arrivee; force = to.force; }
    else {
      const yeux = smooth(start, pivot, t), bouche = smooth(pivot, fin, t);
      face = faceDe(from.face).map((v, i) => interp(v, arrivee[i], i === 0 || i === 8 ? bouche : yeux));
      force = interp(from.force, to.force, yeux);
      if (ton.leve) leve = yeux * (1 - bouche);
    }
  }
  return { face, force, leve };
}
