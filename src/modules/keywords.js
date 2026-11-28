// @ts-check
// keywords.js : détection des mots-clés (les plus longs d'abord, mots entiers, accents gérés)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.trim().replace(/\s+/g, ' ');

/**
 * Construit la fonction de découpage texte → jetons [{t, cat}].
 * Ajouts par rapport à la référence : règles du dictionnaire respectées (casse, mots entiers, multi-mots),
 * liste vide tolérée, et priorité à la casse exacte (« ssh » = commande, « SSH » = protocole).
 */
export function buildMatcher(dict) {
  const regles = { sensibleCasse: false, motsEntiers: true, expressionsMultiMots: true, ...(dict.regles || {}) };
  const exact = new Map(), lower = new Map(), words = new Set();
  for (const [cat, { mots }] of Object.entries(dict.categories || {})) {
    for (const brut of mots || []) {
      const m = norm(String(brut));
      if (!m || (!regles.expressionsMultiMots && m.includes(' '))) continue;
      if (!exact.has(m)) exact.set(m, cat);
      if (!lower.has(m.toLowerCase())) lower.set(m.toLowerCase(), cat);
      words.add(m);
    }
  }
  if (!words.size) return (text) => (text ? [{ t: text, cat: null }] : []);
  const liste = [...words].sort((a, b) => b.length - a.length);
  const alt = liste.map((w) => esc(w).replace(/ /g, '[ \\t\\u00a0]+')).join('|');
  const [avant, apres] = regles.motsEntiers ? ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])'] : ['', ''];
  const re = new RegExp(`${avant}(?:${alt})${apres}`, regles.sensibleCasse ? 'gu' : 'giu');
  return (text) => {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), cat: null });
      const cle = norm(m[0]);
      out.push({ t: m[0], cat: exact.get(cle) ?? lower.get(cle.toLowerCase()) ?? null });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last), cat: null });
    return out;
  };
}

/** Fusionne plusieurs dictionnaires (base + enrichi + catégories personnalisées). */
export function mergeDicts(base, ...extras) {
  const out = { version: base.version || 1, categories: {}, regles: { ...(base.regles || {}) } };
  for (const d of [base, ...extras]) {
    if (!d?.categories) continue;
    for (const [cat, def] of Object.entries(d.categories)) {
      const cur = out.categories[cat] || { couleur: '#e6edf3', mots: [] };
      out.categories[cat] = { couleur: def.couleur || cur.couleur, mots: [...cur.mots, ...(def.mots || [])] };
    }
  }
  return out;
}

const RE_CONTENT = /(?<![\p{L}\p{N}_])(réussi|réussie|réussite|bravo|félicitations|parfait|gagné|succès|well done|congratulations|success)(?![\p{L}\p{N}_])/iu;
const RE_CODE = /(^\s*[$#>] )|`[^`]+`|\s--?[a-z][\w-]*|[{};]\s*$|\w+\(.*\)/u;

/**
 * Expression automatique d'un segment (B5) :
 * alerte/attention → surpris ; réussi/bravo → content ; code/commande → concentre ; sinon neutre.
 */
export function autoExpression(texte, matcher) {
  const cats = new Set(matcher(texte).map((j) => j.cat).filter(Boolean));
  if (cats.has('alerte')) return 'surpris';
  if (RE_CONTENT.test(texte)) return 'content';
  if (cats.has('commande') || RE_CODE.test(texte)) return 'concentre';
  return 'neutre';
}
