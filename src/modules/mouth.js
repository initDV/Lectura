// @ts-check
// mouth.js : rendu d'une bouche humaine (lèvres, intérieur, dents, langue).
//
// Le robot ouvre un rectangle. Une bouche humaine ne s'ouvre pas comme ça : les lèvres s'écartent,
// la mâchoire descend, la bouche s'arrondit sur « o » et s'étire sur « i ». Ce module calcule les
// tracés à partir de paramètres simples, en fonctions pures et testables — aucun DOM ici, sauf
// `appliquer` qui écrit dans les éléments.
//
// Repère : la bouche est centrée sur (cx, cy). `hw` = demi-largeur, `gap` = écart vertical des
// lèvres (0 = fermée).

import { ecrire } from './svg.js';
/**
 * Visèmes du français. Un visème est la forme de bouche d'un groupe de sons ; plusieurs lettres
 * partagent la même forme. `poids` module l'ouverture de base du visème.
 */
export const VISEMES = {
  ferme: { ouverture: 0.00, arrondi: 0.0, etirement: 0.0 }, // m, b, p
  a: { ouverture: 0.85, arrondi: 0.1, etirement: 0.1 },     // a, an, en
  e: { ouverture: 0.45, arrondi: 0.0, etirement: 0.55 },    // é, è, e
  i: { ouverture: 0.25, arrondi: 0.0, etirement: 0.85 },    // i, in
  o: { ouverture: 0.70, arrondi: 0.85, etirement: 0.0 },    // o, on, au, eau
  u: { ouverture: 0.30, arrondi: 0.95, etirement: 0.0 },    // ou, u
  f: { ouverture: 0.15, arrondi: 0.0, etirement: 0.35 },    // f, v (dent sur la lèvre)
  l: { ouverture: 0.35, arrondi: 0.1, etirement: 0.25 },    // l, t, d, n, s, z
  r: { ouverture: 0.40, arrondi: 0.35, etirement: 0.15 },   // r, ch, j
};

/** Visème d'une lettre (ou groupe), pour le lip-sync texte. */
const TABLE = new Map(Object.entries({
  a: 'a', à: 'a', â: 'a', an: 'a', en: 'a', em: 'a',
  e: 'e', é: 'e', è: 'e', ê: 'e', ai: 'e', ei: 'e', et: 'e',
  i: 'i', y: 'i', in: 'i', un: 'i',
  o: 'o', au: 'o', eau: 'o', on: 'o', om: 'o',
  u: 'u', ou: 'u', oû: 'u',
  m: 'ferme', b: 'ferme', p: 'ferme',
  f: 'f', v: 'f',
  r: 'r', ch: 'r', j: 'r', g: 'r',
}).flatMap(([k, v]) => [[k, v]]));

/**
 * Forme de bouche pour un bout de texte : arrondi, étirement et ouverture du visème.
 * Sert au lip-sync « texte » (voix du navigateur) comme au lip-sync audio, quand la lettre
 * lue est connue : c'est elle qui dit si la bouche s'arrondit ou s'étire.
 */
export function formeDe(texte) { return VISEMES[visemeDe(texte)] || null; }

/** Visème correspondant à un petit bout de texte (la syllabe en cours). */
export function visemeDe(texte) {
  const t = (texte || '').toLowerCase();
  for (const n of [3, 2, 1]) {
    for (let i = 0; i + n <= t.length; i++) {
      const v = TABLE.get(t.slice(i, i + n));
      if (v) return v;
    }
  }
  return 'a';
}

/** Arrondi à 2 décimales : des tracés courts, donc un SVG plus léger. */
const f = (n) => (Math.round(n * 100) / 100).toString();

/**
 * Calcule les tracés de la bouche. Fonction pure.
 * @param {number} cx centre horizontal
 * @param {number} cy ligne de fermeture des lèvres
 * @param {number} hw demi-largeur
 * @param {number} gap écart vertical des lèvres, en pixels
 * @param {{arrondi?:number, etirement?:number, courbure?:number, dents?:boolean}} [o]
 *   arrondi 0..1 (bouche en cul-de-poule), etirement 0..1 (lèvres tirées), courbure -1..1 (de
 *   rictus à sourire).
 */
export function dessiner(cx, cy, hw, gap, o = {}) {
  // Les paramètres sont quantifiés avant d'être tracés. Pourquoi : la bouche est redessinée à
  // chaque image, et chaque tracé différent force le navigateur à recalculer la forme. En
  // arrêtant les valeurs au quart de pixel, deux images voisines produisent le MÊME tracé, et la
  // seconde n'est pas écrite du tout (voir `ecrire`).
  //
  // Un quart de pixel sur un dessin de 200 × 330 est invisible : à l'arrivée, le personnage est
  // mis à l'échelle pour tenir dans la scène, et un pixel du dessin couvre alors plusieurs pixels
  // d'écran. Le gain, lui, est réel : voir tools/mesures/character.mjs.
  const PAS = 0.25;
  const q = (v) => Math.round(v / PAS) * PAS;
  const arrondi = Math.max(0, Math.min(1, o.arrondi || 0));
  const etirement = Math.max(0, Math.min(1, o.etirement || 0));
  const courbure = Math.max(-1, Math.min(1, o.courbure || 0));
  const g = Math.max(0, q(gap));

  // L'arrondi resserre la bouche, l'étirement l'élargit et l'aplatit.
  const w = q(hw) * (1 - arrondi * 0.28 + etirement * 0.12);
  // La lèvre supérieure monte un peu moins bas que la lèvre inférieure ne descend : c'est la
  // mâchoire qui travaille.
  const haut = g * 0.35, bas = g * 0.65;
  // Les coins de la bouche montent (sourire) ou descendent (rictus).
  const coin = q(courbure * Math.min(5, w * 0.28));

  const xg = q(cx) - w, xd = q(cx) + w;
  const cyg = q(cy) + coin, cyd = q(cy) + coin;
  // Arc de Cupidon : la lèvre supérieure remonte au milieu.
  const bowH = 2.6 * (1 - etirement * 0.5);
  const bowY = q(cy) - bowH;

  // Intérieur (partie sombre visible quand la bouche s'ouvre).
  const iyBas = q(cy) + bas;
  const interieur = g < 0.4 ? '' : [
    'M', f(xg), f(cyg),
    'Q', f(cx), f(cy + haut * 1.1), f(xd), f(cyd),
    'Q', f(cx), f(iyBas * 1.02 + bas * 0.28), f(xg), f(cyg), 'Z',
  ].join(' ');

  // Lèvre supérieure : du coin gauche, par l'arc de Cupidon, au coin droit, puis le long du bord
  // supérieur de l'intérieur pour fermer la forme.
  const levreHaut = [
    'M', f(xg), f(cyg),
    'Q', f(cx - w * 0.42), f(bowY), f(cx), f(bowY + bowH * 0.22),
    'Q', f(cx + w * 0.42), f(bowY), f(xd), f(cyd),
    'Q', f(cx), f(cy + haut * 1.1), f(xg), f(cyg), 'Z',
  ].join(' ');

  // Lèvre inférieure : du coin gauche au coin droit en passant sous l'intérieur.
  const levreBas = [
    'M', f(xg), f(cyg),
    'Q', f(cx), f(cy + bas * 1.5 + 2), f(xd), f(cyd),
    'Q', f(cx), f(cy + bas * 1.1), f(xg), f(cyg), 'Z',
  ].join(' ');

  // Dents du haut : visibles quand la bouche est franchement ouverte.
  const dents = g < 1.6 ? '' : [
    'M', f(cx - w * 0.62), f(cy + haut * 0.30),
    'Q', f(cx), f(cy + haut * 0.95), f(cx + w * 0.62), f(cy + haut * 0.30),
    'Q', f(cx), f(cy + haut * 0.52), f(cx - w * 0.62), f(cy + haut * 0.30), 'Z',
  ].join(' ');

  // Langue : au fond, visible surtout sur les voyelles ouvertes.
  const langue = g < 2.6 ? '' : [
    'M', f(cx - w * 0.40), f(cy + bas * 0.72),
    'Q', f(cx), f(cy + bas * 1.30), f(cx + w * 0.40), f(cy + bas * 0.72),
    'Q', f(cx), f(cy + bas * 1.02), f(cx - w * 0.40), f(cy + bas * 0.72), 'Z',
  ].join(' ');

  return { interieur, levreHaut, levreBas, dents, langue };
}

/**
 * Écrit les tracés dans les éléments d'un groupe #mouth.
 * @param {{interieur?:Element, levreHaut?:Element, levreBas?:Element, dents?:Element, langue?:Element}} el
 */
export function appliquer(el, cx, cy, hw, gap, o = {}) {
  const d = dessiner(cx, cy, hw, gap, o);
  for (const cle of ['interieur', 'levreHaut', 'levreBas', 'dents', 'langue']) {
    const e = el[cle];
    if (!e) continue;
    if (!d[cle]) { ecrire(e, 'opacity', '0'); continue; }
    ecrire(e, 'd', d[cle]);
    ecrire(e, 'opacity', '1');
  }
}

/**
 * Modèle « Wend » : la bouche du personnage de référence, reproduite trait pour trait d'après
 * son script d'origine. Trois éléments seulement — le trait de sourire (fermé), l'ouverture,
 * la langue — contre cinq pour le modèle à lèvres. Les deux coexistent : c'est la fiche du
 * personnage qui choisit.
 *
 * @param {number} ouverture 0 = fermée (le trait de sourire suffit), > 1.3 = bouche ouverte
 * @param {number} courbure creux de la bouche (positif = sourire, négatif = rictus)
 */
export function dessinerWend(ouverture, courbure = 0, viseme = null) {
  const v = viseme && VISEMES[viseme] ? VISEMES[viseme] : null;
  // Borné à 9 : au-delà, le tracé descend sous le menton (y 98). Une expression qui demande
  // plus ne doit pas déformer le visage, elle sature sur la plus grande ouverture possible.
  const ouv = Math.max(0, Math.min(9, ouverture));
  // Le visème resserre la bouche sur « o / ou » et l'étire sur « i / é » : c'est cette
  // modulation qui fait lire les mots sur les lèvres, pas seulement l'amplitude.
  let w = 10 - ouv * 0.38;
  if (v) w *= 1 - v.arrondi * 0.22 + v.etirement * 0.30;
  const y = 84;
  if (ouv < 1.3) {
    return { sm: `M${f(100 - w)} ${y} Q100 ${f(y + courbure * 1.6)} ${f(100 + w)} ${y}`, mo: '',
             tgY: 0, smOp: 1, moOp: 0, tgOp: 0 };
  }
  return { sm: '', mo: `M${f(100 - w)} ${y} Q100 ${f(y + courbure * 0.5 - 1)} ${f(100 + w)} ${y} Q100 ${f(y + ouv * 2)} ${f(100 - w)} ${y}Z`,
           tgY: y + ouv * 0.8, smOp: 0, moOp: 1, tgOp: ouv > 4 ? 0.9 : 0 };
}

/** Écrit le modèle Wend dans un groupe #mouth qui contient #sm, #mo et #tg. */
export function appliquerWend(el, ouverture, courbure = 0, viseme = null) {
  const d = dessinerWend(ouverture, courbure, viseme);
  if (el.sm) { if (d.sm) ecrire(el.sm, 'd', d.sm); ecrire(el.sm, 'opacity', d.smOp); }
  if (el.mo) { if (d.mo) ecrire(el.mo, 'd', d.mo); ecrire(el.mo, 'opacity', d.moOp); }
  if (el.tg) { ecrire(el.tg, 'cy', f(d.tgY || 88)); ecrire(el.tg, 'opacity', d.tgOp); }
}
