// Les planches illustrent les segments déjà datés par Lectura. Pas de redécoupage ni d'horloge Atlas.
import { typeLigne } from '../timeline.js';
import { ID_RESEAU, calerReseau, repererReseau } from './reseau-local.js';
import { calerGestes, compilerScenario, repererGestes } from './gestes.js';

const normaliser = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const mots = (s) => [...s.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu)];
export const cles = (s) => mots(s).map(([mot]) => normaliser(mot));
const doute = /\b(?:ne|n|pas|ni|jamais|aucun|aucune|sans(?! fil\b)|hypothese|peut etre|si|not|never|changeons de sujet|autre sujet|passons a)\b/u;
const renvoi = /\b(?:dans cet exemple|sur ce dessin|sur cette figure|sur ce schema|ce meme dessin|cette meme figure|ce meme schema|cette meme planche)\b/u;

const exclus = /[?？]|^(?:titre|liste|index|glossaire)\s*:/iu;
const citationsAtlas = /«[^»]*»|“[^”]*”|"[^"\n]*"|`[^`\n]*`/gu;
const liaison = /^[\p{L}\p{N}\p{M}_'’\u2010\u2011\s-]+$/u;
const rupture = /\b(?:mais|cependant|tandis que|alors que)\b/u;
// L’APK reçoit ces mêmes règles, avec les expressions et scénarios déjà tokenisés.
export const REGLES_ATLAS = Object.freeze({ doute, renvoi, exclus, citations: citationsAtlas, liaison, rupture });

export function compilerPlanches(planches) {
  const motifs = new Map(), rappels = new Map(), scenarios = new Map();
  for (const fiche of planches) {
    rappels.set(fiche, fiche.rappels.map(s => ` ${cles(s).join(' ')} `));
    const scenario = compilerScenario(fiche.id, cles);
    if (scenario.length) scenarios.set(fiche, scenario);
    const ajouter = (expression, contexte = null) => {
      const suite = cles(expression), premier = suite[0];
      if (!motifs.has(premier)) motifs.set(premier, []);
      motifs.get(premier).push({ fiche, suite, contexte });
    };
    for (const expression of fiche.expressions) ajouter(expression);
    for (const c of fiche.contextuelles ?? []) ajouter(c.expression, { avant: (c.avant ?? []).map(cles), apres: (c.apres ?? []).map(cles) });
  }

  function choisir(segment, antecedent) {
    const { texte } = segment;
    const tokens = mots(texte), liste = tokens.map(([mot]) => normaliser(mot)), ligne = liste.join(' ');
    if (doute.test(ligne) || exclus.test(texte)) return null;
    const citations = [...texte.matchAll(citationsAtlas)];
    const finMot = (i) => tokens[i].index + tokens[i][0].length;
    const correspond = (suite, i) => {
      if (!suite.every((cle, j) => cle === liste[i + j])) return false;
      const debut = tokens[i].index, fin = finMot(i + suite.length - 1);
      return !citations.some((m) => debut < m.index + m[0].length && fin > m.index) &&
        liaison.test(texte.slice(debut, fin));
    };
    const indice = (suites, de, a) => {
      for (let i = de; i < a; i++) if (suites.some(s => i + s.length <= a && correspond(s, i))) return i;
      return -1;
    };
    const candidats = [];
    for (const [i, mot] of liste.entries()) {
      for (const { fiche, suite, contexte } of motifs.get(mot) ?? []) {
        if (!correspond(suite, i)) continue;
        const fin = i + suite.length;
        if (contexte) {
          const a = contexte.avant.length ? indice(contexte.avant, Math.max(0, i - 16), i) : i;
          const b = contexte.apres.length ? indice(contexte.apres, fin, Math.min(liste.length, fin + 16)) : fin - 1;
          if (a < 0 || b < 0 || /;/u.test(texte.slice(tokens[a].index, finMot(b))) ||
            rupture.test(liste.slice(a, b).join(' '))) continue;
        }
        candidats.push({ fiche, i, fin });
      }
    }
    // Une expression plus précise prime sur une expression qu'elle contient, mais pas sur un autre sujet.
    const distinctes = new Set();
    let debut = -1, fin = -1;
    for (const c of candidats.sort((a, b) => a.i - b.i || b.fin - a.fin)) {
      if (c.fin < fin || (c.fin === fin && c.i > debut)) continue;
      distinctes.add(c.fiche); debut = c.i; fin = c.fin;
    }
    if (distinctes.size > 1) return null;
    const fiche = distinctes.values().next().value;
    const rappel = !fiche && antecedent && !citations.length && renvoi.test(ligne) &&
      rappels.get(antecedent).some(s => ` ${ligne} `.includes(s));
    const candidate = fiche ?? antecedent;
    if (!candidate) return null;
    const trouver = (suites) => {
      const i = indice(suites, 0, liste.length);
      if (i < 0) return null;
      const n = suites.reduce((n, s) => s.length > n && correspond(s, i) ? s.length : n, 0);
      return [tokens[i].index, finMot(i + n - 1)];
    };
    if (candidate.id === ID_RESEAU) {
      const reseau = repererReseau(segment, trouver);
      if (fiche || rappel || reseau.suite) return { fiche: candidate, reseau };
    } else if (scenarios.has(candidate)) {
      const { marques, suite } = repererGestes(segment, scenarios.get(candidate), trouver);
      if (fiche || rappel || suite) return { fiche: candidate, marques };
    }
    return fiche || rappel ? { fiche: candidate } : null;
  }

  return (segments) => {
    const dessins = [];
    let precedent = null;
    for (const s of segments) {
      if (!(s.finMs > s.debutMs) || typeLigne(s.texte.trimStart()) !== 'parle') { precedent = null; continue; }
      const continu = precedent?.fin === s.debutMs;
      const choix = choisir(s, continu ? precedent.fiche : null);
      if (!choix) { precedent = null; continue; }
      const { fiche, reseau, marques } = choix;
      if (continu && precedent.fiche === fiche) precedent.fin = s.finMs;
      else dessins.push(precedent = { fiche, debut: s.debutMs, fin: s.finMs });
      if (marques?.length) (precedent.gestes ??= []).push(...marques);
      if (reseau) {
        const reperes = precedent.reseau ??= { signaux: [] };
        reperes.routeur ??= reseau.routeur;
        reperes.liens ??= reseau.liens;
        if (reseau.signal) reperes.signaux.push(reseau.signal);
      }
    }
    for (const dessin of dessins) {
      if (dessin.reseau) dessin.reseau = calerReseau(dessin);
      else if (scenarios.has(dessin.fiche)) dessin.gestes = calerGestes(dessin, scenarios.get(dessin.fiche), dessin.gestes ?? []);
    }
    return dessins;
  };
}

/** Dernière planche commencée. Une fenêtre est fermée à droite, même après un saut de lecture. */
export function indexPlanche(planches, ms) {
  let gauche = -1, droite = planches.length - 1;
  while (gauche < droite) {
    const milieu = (gauche + droite + 1) >> 1;
    if (planches[milieu].debut <= ms) gauche = milieu;
    else droite = milieu - 1;
  }
  return gauche;
}

export function opacitePlanche(planche, ms, reduit) {
  if (!planche || ms < planche.debut || ms >= planche.fin) return 0;
  if (reduit) return 1;
  const duree = planche.fin - planche.debut;
  const doux = (x) => { const r = Math.min(1, x); return r * r * (3 - 2 * r); };
  const entree = doux((ms - planche.debut) / Math.min(560, duree * .22));
  const tenue = doux((planche.fin - ms) / Math.min(320, duree * .16));
  return (.25 + .75 * entree) * tenue;
}
