// @ts-check
// humeur.js : choisit, à chaque instant, l'expression du robot pour la phrase en cours (module pur).
// Ordre de priorité : expression imposée par l'auteur > sentiment des mots (sentiment.js) > mots-clés du terminal.
// Le sentiment suit la POSITION du texte : avant le mot déclencheur le robot l'annonce à peine, puis il réagit quand le
// mot est prononcé, et garde un peu de l'émotion précédente (expression combinée).
import { analyser } from './sentiment.js';
import { autoExpression } from './keywords.js';
import { typeLigne } from './timeline.js';
import { EXPRESSIONS, expressionJouable, gesteDe } from './expressions.js';

const ANNONCE = 0.35; // part de l'expression montrée avant le premier mot déclencheur
const MELANGE = 0.3;  // part de l'émotion précédente gardée dans la suivante

/**
 * @param {{ lexique?: any, matcher: (t: string) => {t: string, cat: string|null}[], actif?: boolean }} o
 * `actif` = émotions automatiques d'après les mots.
 */
export function creerHumeur({ lexique = null, matcher, actif = true }) {
  const cache = new Map();
  const jouable = expressionJouable;

  /** Analyse d'une phrase : { expr, force, second, poids, moments, source }. */
  function de(seg) {
    if (!seg) return { expr: 'neutre', force: 1, second: '', poids: 0, moments: [], source: 'neutre' };
    const cleCache = seg.id ?? seg.texte;
    if (cache.has(cleCache)) return cache.get(cleCache);
    let r;
    const e = seg.expression, type = typeLigne(seg.texte);
    if (e && e !== 'auto' && EXPRESSIONS[e]) r = { expr: jouable(e), force: 1, second: '', poids: 0, moments: [], source: 'manuel' };
    else if (type === 'commande') r = { expr: 'concentre', force: 1, second: '', poids: 0, moments: [], source: 'ligne' };
    else if (type === 'commentaire') r = { expr: 'concentre', force: 0.6, second: '', poids: 0, moments: [], source: 'ligne' };
    else {
      const a = actif && lexique ? analyser(seg.texte, lexique) : null;
      if (a && a.emotion !== 'neutre') {
        const second = a.second && jouable(a.second) !== jouable(a.emotion) ? jouable(a.second) : '';
        r = { expr: jouable(a.emotion), force: a.force, second, poids: second ? a.poids : 0, source: 'sentiment',
          moments: a.moments.map((m) => ({ ...m, emotion: m.emotion && jouable(m.emotion), geste: m.geste || (m.emotion ? gesteDe(m.emotion) : '') })) };
      } else {
        const k = autoExpression(seg.texte, matcher);
        r = { expr: k, force: k === 'concentre' ? 0.8 : 1, second: '', poids: 0, moments: a ? a.moments : [], source: k === 'neutre' ? 'neutre' : 'mots-cles' };
      }
    }
    cache.set(cleCache, r);
    return r;
  }

  /**
   * État à la position `n` (caractères depuis le début de la phrase).
   * `rang` = nombre de mots déclencheurs déjà passés : quand il augmente, jouer `geste`.
   */
  function etat(seg, n) {
    const a = de(seg);
    if (!a.moments.length) return { expr: a.expr, force: a.force, mix: '', poids: 0, rang: 0, geste: '' };
    let rang = 0;
    while (rang < a.moments.length && a.moments[rang].pos <= n) rang++;
    const passes = a.moments.slice(0, rang).filter((m) => m.emotion), geste = rang ? a.moments[rang - 1].geste : '';
    if (!passes.length) return { expr: a.expr, force: a.source === 'sentiment' ? a.force * ANNONCE : a.force, mix: '', poids: 0, rang, geste };
    const m = passes[passes.length - 1];
    let avant = '';
    for (let i = passes.length - 2; i >= 0 && !avant; i--) if (passes[i].emotion !== m.emotion) avant = passes[i].emotion;
    return { expr: m.emotion, force: m.force, mix: avant, poids: avant ? MELANGE : 0, rang, geste };
  }

  return { de, etat, vider: () => cache.clear() };
}
