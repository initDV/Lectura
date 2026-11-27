// Piste faciale autonome sur l’horloge de la source : mêmes images en lecture, en recherche et à l’export.
import { bound, interp, smooth, windowAt } from './math.js';
import { faceDe, VISAGES } from './visages.js';

const suspendue = /(?:…|\.{3})[”»"’')\]]*\s*$/u;
const contraste = /^(?:mais|pourtant|but|yet)\b/iu;
const pauseInterne = /(?:…|\.{3})[”»"’')\]]*\s*(?:(?:mais|pourtant|but|yet)\s+)?$/iu;

// Les points de suspension peuvent couper l’audio en deux sans terminer la réplique.
export function reprendReplique(avant, apres, texte) {
  return avant?.end <= apres.start && typeof texte === 'string' && /^[^\S\r\n\u2028\u2029]*$/.test(texte.slice(avant.end, apres.start))
    && suspendue.test(avant.texte) && (/^\p{Ll}/u.test(apres.texte) || contraste.test(apres.texte));
}

// Indices de situation propres aux lectrices : ne pas modifier le lexique ni les gestes des robots.
const contextes = [
  ['inquiet', .93, /(?<![\p{L}\p{N}])(?:j['’]ai\s+cru|je\s+pensais)\s+que\s+(?:tu|vous)\s+(?:ne\s+|n['’])(?:viendr|reviendr|arriver)(?:ais|iez)\s+pas(?![\p{L}\p{N}])/giu],
  ['content', .96, /(?<![\p{L}\p{N}])(?:te|vous)\s+voil[àa](?![\p{L}\p{N}])/giu],
];

export function indicesVisage(texte, moments = []) {
  const jeu = contextes.flatMap(([face, force, motif]) => Array.from(texte.matchAll(motif), ({ index: pos, 0: mot }) => ({ pos, fin: pos + mot.length, face, force })));
  return jeu.concat(moments.filter(m => m.emotion && m.emotion !== 'neutre' && Object.hasOwn(VISAGES, m.emotion)
    && !jeu.some(({ pos, fin }) => m.pos >= pos && m.pos < fin))
    .map(({ pos, emotion: face, force }) => ({ pos, face, force }))).sort((a, b) => a.pos - b.pos);
}

function ajouterReplique(piste, phrases) {
  if (!phrases.length) return;
  const notes = [];
  for (const [i, p] of phrases.entries()) {
    for (const n of p.indices) {
      const heure = pos => p.start + (p.speechEnd - p.start) * bound(pos / p.texte.length);
      const at = heure(n.pos), avant = notes.at(-1), prec = i > 0 ? phrases[i - 1] : null;
      if (avant && (n.face === avant.face || at - avant.at < .08)) continue;
      const ellipse = pauseInterne.exec(p.texte.slice(0, n.pos));
      // Préférer le silence daté ; sinon estimer la queue de l’ellipse avec le texte.
      const pause = ellipse ? heure(ellipse.index) : prec && at - p.start <= .56
        ? prec.speechEnd < p.start - .03 ? prec.speechEnd : p.start - Math.min(.22, .15 * (prec.speechEnd - prec.start))
        : null;
      notes.push({ at, face: n.face, force: n.force, pause });
    }
  }
  if (notes.length < 2) {
    for (const p of phrases) {
      const contexte = p.indices[0];
      const face = p.face === 'neutre' && !p.manual ? contexte?.face ?? p.face : p.face;
      if (p.manual || face !== 'neutre') piste.push({ start: p.start, end: p.end, face,
        force: p.face === 'neutre' && contexte ? contexte.force : p.force, manual: p.manual });
    }
    return;
  }
  const end = phrases.at(-1).end, transitions = [];
  for (let i = 1; i < notes.length; i++) {
    const from = notes[i - 1], to = notes[i], pivot = to.at, ecart = pivot - from.at;
    const avant = transitions.at(-1), yeux = pivot - Math.min(.15, .4 * ecart);
    const start = Math.max(avant?.fin ?? from.at, to.pause === null ? yeux : Math.min(yeux, Math.max(to.pause, pivot - .86)));
    const fin = pivot + Math.min(.21, .4 * ((notes[i + 1]?.at ?? end) - pivot));
    if (avant) avant.end = start;
    transitions.push({ start, end, fin, pivot, from, to, leve: to.pause !== null });
  }
  piste.push({ start: phrases[0].start, end, face: notes[0].face, force: notes[0].force, transitions });
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
  let nom = expression || humeur?.face || cueFace || 'neutre';
  let face = faceDe(nom), force = expression ? 1 : humeur?.force ?? cueForce, leve = 0;
  const ton = !expression && humeur?.transitions && windowAt(humeur.transitions, t);
  if (ton) {
    const { start, fin, pivot, from, to } = ton;
    nom = to.face;
    const arrivee = faceDe(nom);
    if (t >= fin) { face = arrivee; force = to.force; }
    else {
      const yeux = smooth(start, pivot, t), bouche = smooth(pivot, fin, t);
      face = faceDe(from.face).map((v, i) => interp(v, arrivee[i], i === 0 || i === 8 ? bouche : yeux));
      force = interp(from.force, to.force, yeux);
      if (ton.leve) leve = yeux * (1 - bouche);
    }
  }
  return { face, force, nom, leve };
}
