// @ts-check
// timeline.js : synchro texte / audio. RÈGLE : la position du texte est TOUJOURS calculée depuis le
// temps audio (jamais l'inverse), ce qui rend pause, reprise et recul exacts. Module pur (testé par Vitest).

const SEPARATEUR = /(?<=[.!?…])\s+|\n+/g;
export const CPS_VOIX = 14; // caractères par seconde estimés pour la voix du système (× vitesse)

/** Découpe en phrases en gardant la position de chaque phrase dans le texte d'origine. */
export function splitSentences(texte) {
  const out = [];
  const push = (a, b) => {
    while (a < b && /\s/.test(texte[a])) a++;
    while (b > a && /\s/.test(texte[b - 1])) b--;
    if (b > a) out.push({ texte: texte.slice(a, b), start: a, end: b });
  };
  let last = 0;
  for (const m of texte.matchAll(SEPARATEUR)) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, texte.length);
  return out;
}

/** Poids d'une phrase : longueur + 12 si elle finit par . ! ? … + 6 par , ; : (pauses). */
export function weight(phrase) {
  let p = phrase.length;
  if (/[.!?…]["'»)\]]*$/.test(phrase)) p += 12;
  p += 6 * (phrase.match(/[,;:]/g) || []).length;
  return p;
}

/** Sans timing fourni : répartit dureeMs entre les phrases au prorata de leur poids. */
export function autoTiming(texte, dureeMs) {
  const phrases = splitSentences(texte), poids = phrases.map((p) => weight(p.texte));
  const somme = poids.reduce((a, b) => a + b, 0) || 1;
  let cumul = 0;
  return phrases.map((p, i) => {
    const debutMs = Math.round((dureeMs * cumul) / somme);
    cumul += poids[i];
    const finMs = i === phrases.length - 1 ? Math.round(dureeMs) : Math.round((dureeMs * cumul) / somme);
    return { id: i + 1, texte: p.texte, debutMs, finMs, expression: 'auto' };
  });
}

/** Durée estimée (ms) d'un texte lu par la voix du système. */
export function estimateDurationMs(texte, vitesse = 1) {
  return Math.round((texte.length / (CPS_VOIX * (vitesse || 1))) * 1000);
}

/** Retrouve chaque segment dans le texte ; null si un segment ne correspond plus au texte. */
export function locateSegments(texte, segments) {
  let cur = 0;
  const out = [];
  for (const s of segments) {
    const i = texte.indexOf(s.texte, cur);
    if (i < 0 || !s.texte) return null;
    out.push({ ...s, start: i, end: i + s.texte.length });
    cur = i + s.texte.length;
  }
  return out;
}

/** Vrai si les segments portent un timing utilisable (croissant, non nul) et collent au texte. */
export function segmentsValides(texte, segments) {
  if (!Array.isArray(segments) || !segments.length) return false;
  let t = -1;
  for (const s of segments) {
    if (!(Number.isFinite(s.debutMs) && Number.isFinite(s.finMs)) || s.debutMs < t || s.finMs <= s.debutMs) return false;
    t = s.finMs;
  }
  return locateSegments(texte, segments) !== null;
}

/** Reporte les expressions choisies (par indice de phrase) sur de nouveaux segments. */
export function reportExpressions(nouveaux, anciens = []) {
  return nouveaux.map((s, i) => ({ ...s, expression: anciens[i]?.expression || s.expression || 'auto' }));
}

export class Timeline {
  constructor(texte, segments) {
    this.total = texte.length;
    this.segs = locateSegments(texte, segments) || [];
    this.dureeMs = this.segs.length ? this.segs[this.segs.length - 1].finMs : 0;
  }
  /** Indice du dernier segment commencé à l'instant ms (-1 si aucun). */
  indexAt(ms) {
    let a = -1, b = this.segs.length - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (this.segs[m].debutMs <= ms) a = m;
      else b = m - 1;
    }
    return a;
  }
  segmentAt(ms) {
    return this.segs[this.indexAt(ms)] || null;
  }
  /** Segment qui contient (ou précède) le caractère n : sert à choisir l'expression du personnage. */
  segmentAtChar(n) {
    let a = 0, b = this.segs.length - 1;
    if (b < 0) return null;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (this.segs[m].start <= n) a = m;
      else b = m - 1;
    }
    return this.segs[a];
  }
  /** Nombre de caractères visibles à l'instant ms (interpolation linéaire dans chaque segment). */
  charAt(ms) {
    if (!this.segs.length) return 0;
    if (ms >= this.dureeMs) return this.total;
    const i = this.indexAt(ms);
    if (i < 0) return this.segs[0].start;
    const s = this.segs[i];
    if (ms >= s.finMs) return s.end;
    return Math.floor(s.start + ((s.end - s.start) * (ms - s.debutMs)) / Math.max(1, s.finMs - s.debutMs));
  }
  /** Inverse : instant (ms) auquel le caractère n devient visible. */
  timeAt(n) {
    if (!this.segs.length) return 0;
    if (n >= this.total) return this.dureeMs;
    for (const s of this.segs) {
      if (n < s.start) return s.debutMs;
      if (n < s.end) return Math.round(s.debutMs + ((s.finMs - s.debutMs) * (n - s.start)) / Math.max(1, s.end - s.start));
    }
    return this.dureeMs;
  }
}
