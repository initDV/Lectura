// @ts-check
// sentiment.js : devine le sentiment d'une phrase d'après ses mots et ses expressions (module pur, hors ligne, sans IA).
// Un lexique (data/sentiments_*.json) associe des mots à une expression du robot. On tient compte des expressions de
// plusieurs mots (« bien joué »), des débuts de mots (« réuss* »), de la négation (« pas content »), des intensifs
// (« très »), des émojis et de la ponctuation. Chaque mot trouvé garde sa position : le robot réagit quand il est dit.

const POSITIFS = new Set(['content', 'enthousiaste', 'rire', 'fier', 'tendre', 'emerveille', 'soulage', 'determine', 'malicieu']);
const NEGATIFS = new Set(['triste', 'colere', 'peur', 'fatigue', 'gene', 'inquiet', 'ennuye', 'degoute']);
const RE_MOT = /[\p{L}\p{N}]+/gu;

/** Minuscules sans accents, MÊME longueur que l'original (les positions restent valables). */
export function normaliser(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], b = c.toLowerCase(), d = b.length === 1 ? b.normalize('NFD') : c;
    out += d.length > 1 && /[\u0300-\u036f]/.test(d[1]) ? d[0] : b.length === 1 ? b : c;
  }
  return out;
}
const cle = (s) => (normaliser(String(s)).match(RE_MOT) || []).join(' ');

/**
 * Prépare un ou plusieurs lexiques { emotions: { nom: { mots: [], forts: [] } }, gestes, negations, intensifs, emojis }.
 * `mots` pèsent 1, `forts` 1,6 ; « mot* » accepte toutes les terminaisons ; le premier lexique a la priorité.
 * `gestes` associe un mot à un geste du robot ; un mot peut n'avoir qu'un geste, sans émotion (« oui », « non »).
 */
export function compilerLexique(...sources) {
  const lex = { exact: new Map(), prefixes: [], maxMots: 1, negations: new Set(), intensifs: new Map(), emojis: new Map(), reEmoji: null };
  for (const src of sources) {
    if (!src) continue;
    for (const [emotion, def] of Object.entries(src.emotions || {})) {
      for (const [liste, poids] of [[def.mots, 1], [def.forts, 1.6]]) {
        for (const brut of liste || []) {
          const etoile = String(brut).trim().endsWith('*'), k = cle(brut);
          if (!k) continue;
          if (etoile && !k.includes(' ')) { if (!lex.prefixes.some((p) => p.debut === k)) lex.prefixes.push({ debut: k, emotion, poids }); continue; }
          if (!lex.exact.has(k)) lex.exact.set(k, { emotion, poids });
          lex.maxMots = Math.max(lex.maxMots, k.split(' ').length);
        }
      }
    }
    for (const [m, geste] of Object.entries(src.gestes || {})) {
      const k = cle(m), deja = lex.exact.get(k);
      if (deja) deja.geste ||= geste; else if (k) { lex.exact.set(k, { emotion: '', poids: 0, geste }); lex.maxMots = Math.max(lex.maxMots, k.split(' ').length); }
    }
    for (const n of src.negations || []) lex.negations.add(cle(n));
    for (const [m, f] of Object.entries(src.intensifs || {})) if (!lex.intensifs.has(cle(m))) lex.intensifs.set(cle(m), +f || 1);
    for (const [e, emotion] of Object.entries(src.emojis || {})) if (!lex.emojis.has(e)) lex.emojis.set(e, emotion);
  }
  lex.prefixes.sort((a, b) => b.debut.length - a.debut.length); // le début le plus long l'emporte
  if (lex.emojis.size) lex.reEmoji = new RegExp([...lex.emojis.keys()].map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
  return lex;
}

const APRES = new Set(['pas', 'plus', 'jamais', 'guere', 'rien']); // second élément de la négation : « ne … pas »
const NE = new Set(['ne', 'n']);

/**
 * Vrai si le groupe de mots [k, k + n[ est nié : « pas content », « jamais facile », « je n'aime pas », « don't like ».
 * La négation ne traverse ni une virgule ni un mot déjà reconnu (« ne t'inquiète pas, c'est facile » reste positif).
 */
function estNie(mots, k, n, lex, texte) {
  for (let i = k - 1; i >= Math.max(0, k - 3); i--) {
    if (mots[i].pris || /[,;:.!?()]/.test(texte.slice(mots[i].j, mots[i + 1].i))) return false;
    if (lex.negations.has(mots[i].m)) return true;
    if (NE.has(mots[i].m) && mots[k + n] && APRES.has(mots[k + n].m)) return true;
  }
  return false;
}

/**
 * Analyse une phrase. Renvoie l'émotion dominante, sa force (0,35 à 1,25), une éventuelle seconde émotion et la liste
 * des « moments » : [{ pos, fin, emotion, force, mot, geste }] dans l'ordre du texte (positions dans la phrase).
 * Un moment sans émotion (emotion = '') ne porte qu'un geste.
 * @param {string} texte @param {ReturnType<typeof compilerLexique>} lex
 */
export function analyser(texte, lex) {
  const n = normaliser(texte), mots = [...n.matchAll(RE_MOT)].map((m) => ({ m: m[0], i: m.index, j: m.index + m[0].length }));
  const moments = [];
  const ajouter = (k, nb, trouve) => {
    let { emotion, poids } = trouve;
    const pos = mots[k].i, fin = mots[k + nb - 1].j, brut = texte.slice(pos, fin);
    for (let i = Math.max(0, k - 2); i < k; i++) poids *= lex.intensifs.get(mots[i].m) || 1;
    if (brut.length > 3 && brut === brut.toUpperCase() && brut !== brut.toLowerCase()) poids *= 1.3; // MAJUSCULES = on insiste
    if (!emotion) { moments.push({ pos, fin, emotion, poids: 0, mot: brut, geste: trouve.geste }); return; } // geste seul
    if (estNie(mots, k, nb, lex, n)) {
      if (POSITIFS.has(emotion)) { emotion = 'triste'; poids *= 0.7; }        // « pas content » → triste
      else if (NEGATIFS.has(emotion)) { emotion = 'content'; poids *= 0.45; } // « pas peur », « pas grave » → rassurant
      else return;                                                            // « pas étonnant » → rien
    }
    moments.push({ pos, fin, emotion, poids, mot: brut, geste: trouve.geste || '' });
  };
  for (let k = 0; k < mots.length; k++) {
    let nb = Math.min(lex.maxMots, mots.length - k), trouve = null;
    for (; nb >= 1 && !trouve; nb--) trouve = lex.exact.get(nb === 1 ? mots[k].m : mots.slice(k, k + nb).map((x) => x.m).join(' ')) || null;
    if (trouve) nb++;
    else { nb = 1; trouve = lex.prefixes.find((p) => mots[k].m.startsWith(p.debut)) || null; }
    if (!trouve) continue;
    ajouter(k, nb, trouve);
    for (let i = k; i < k + nb; i++) mots[i].pris = true;
    k += nb - 1;
  }
  if (lex.reEmoji) for (const m of texte.matchAll(lex.reEmoji)) moments.push({ pos: m.index, fin: m.index + m[0].length, emotion: lex.emojis.get(m[0]), poids: 1.2, mot: m[0] });
  moments.sort((a, b) => a.pos - b.pos);
  // Ponctuation : « ! » renforce ; sans mot d'émotion, « ?! » ou « !! » = surprise, « ? » = air interrogateur.
  const excl = Math.min(3, (texte.match(/!/g) || []).length), fort = 1 + 0.15 * excl;
  if (!moments.some((m) => m.emotion)) {
    const double = /[!?]{2,}/.exec(texte);
    if (double) moments.push({ pos: double.index, fin: double.index + double[0].length, emotion: 'surpris', poids: 0.8, mot: double[0] });
    else if (/\?\s*["'»)\]]*\s*$/.test(texte)) moments.push({ pos: 0, fin: 0, emotion: 'sceptique', poids: 0.35, mot: '?' });
  }
  moments.sort((a, b) => a.pos - b.pos);
  const force = (s) => Math.max(0.35, Math.min(1.25, (0.55 + 0.35 * s) * (s < 0.5 ? 0.8 : fort)));
  const sortie = moments.map((m) => ({ pos: m.pos, fin: m.fin, emotion: m.emotion, force: m.emotion ? force(m.poids) : 0, mot: m.mot, geste: m.geste || '' }));
  const scores = new Map();
  for (const m of moments) if (m.emotion) scores.set(m.emotion, (scores.get(m.emotion) || 0) + m.poids);
  if (!scores.size) return { emotion: 'neutre', force: 0, second: '', poids: 0, moments: sortie };
  const tri = [...scores].sort((a, b) => b[1] - a[1]); // tri stable : à égalité, la première émotion rencontrée gagne
  const second = tri[1] && tri[1][1] >= tri[0][1] * 0.5 ? tri[1] : null;
  return {
    emotion: tri[0][0], force: force(tri[0][1]), second: second ? second[0] : '', poids: second ? Math.min(0.45, second[1] / (tri[0][1] + second[1])) : 0,
    moments: sortie,
  };
}
