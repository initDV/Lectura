// @ts-check
// expressions.js : table des expressions du robot. Chaque expression COMBINE yeux, sourcils, bouche, tête, bras et corps.
// Module pur (aucun DOM) : toutes les valeurs sont des nombres, ce qui permet de fondre une expression dans une autre
// (transition douce) et d'en mélanger deux (ex. surpris + content). Ajouter une expression = ajouter une ligne ici.

/** Pose de repos = dessin d'origine (B2). Les expressions ne décrivent que ce qui change. */
export const NEUTRE = Object.freeze({
  r: 11, lid: 1, gx: 0, gy: 0,          // yeux : rayon, ouverture (1 = ouvert), regard (px)
  browL: 0, browR: 0, rot: 0,           // sourcils : hauteur (px, négatif = levé), inclinaison (+ = triste, - = fâché)
  h: 0, w: 48, my: 0,                   // bouche : hauteur minimale, largeur, décalage vertical
  headR: 0, headX: 0, headY: 0,         // tête : inclinaison (degrés), décalage (px)
  sway: 0,                              // tête : balancement rythmé (degrés)
  armL: 0, armR: 0,                     // épaules : rotation du bras (degrés, + = vers l'extérieur, - = devant le corps)
  foreL: 0, foreR: 0,                   // coudes : pli de l'avant-bras (degrés, + = vers l'extérieur, - = devant le corps)
  swing: 1,                             // ampleur du balancement des bras pendant la parole
  lean: 0, bodyY: 0,                    // corps : penché (degrés), tassement (px)
  bounce: 0, tremble: 0, tempo: 1,      // mouvement : rebond (px), tremblement (px), rythme
});

// Bras levés : on passe par DEVANT le corps (angles négatifs, ex. -195 au lieu de 165) pour que le geste reste dans
// le cadre du dessin au lieu de balayer l'extérieur (le robot est collé au bord de l'écran sur téléphone).
/** `geste` = geste joué sur le mot déclencheur. Toutes les poses sont disponibles. */
export const EXPRESSIONS = {
  neutre: {},
  // Les 4 expressions de base (B3 : content h 8 ; concentre r 8 sourcils +5 ; surpris r 14 sourcils -5 h 12).
  content: { h: 8, w: 56, browL: -3, browR: -3, headR: 3, armL: 8, armR: 8, foreL: 16, foreR: 16, sway: 1.5, geste: 'hoche' },
  concentre: { r: 8, browL: 5, browR: 5, rot: -5, gx: 4, gy: 1, w: 42, headY: 3, headR: 2, armR: 6, foreR: 28, swing: 0.5 }, // montre le terminal
  surpris: { r: 14, browL: -5, browR: -5, h: 12, w: 34, headY: -4, armL: 2, armR: 2, foreL: -234, foreR: -234, swing: 0.4, geste: 'sursaut' }, // mains levées
  // Expressions avancées.
  enthousiaste: { r: 12.5, browL: -5, browR: -5, h: 12, w: 58, headY: -3, armL: -195, armR: -195, foreL: 10, foreR: 10,
    bounce: 5, tempo: 1.5, swing: 0.6, geste: 'sursaut_fort' },                                    // bras en l'air
  rire: { lid: 0.3, browL: -4, browR: -4, rot: 5, h: 14, w: 58, headY: -2, sway: 3, armL: 12, armR: 12,
    foreL: -70, foreR: -70, bounce: 3.5, tempo: 2.2, swing: 0.4, geste: 'hoche' },            // mains sur le ventre
  fier: { lid: 0.8, gy: -2, browL: -3, browR: -3, h: 6, w: 54, headY: -5, headR: 4, armL: 28, armR: 28,
    foreL: -75, foreR: -75, swing: 0.3, geste: 'hoche' },                                     // poings sur les hanches
  tendre: { lid: 0.7, browL: -2, browR: -2, rot: 8, h: 7, w: 44, headR: 9, sway: 2, armL: 6, armR: 6,
    foreL: -100, foreR: -100, swing: 0.3, tempo: 0.7 },                                         // mains sur le cœur
  sceptique: { r: 10, gx: -3, gy: -2, browL: -7, browR: 3, rot: -3, w: 34, my: 1, headR: -8, armR: -220,
    foreR: 125, armL: 20, foreL: -70, swing: 0.3 },                                           // main contre la joue, l'autre sur la hanche
  gene: { r: 10, gx: -4, gy: 3, browL: -2, browR: -2, rot: 11, h: 5, w: 28, headR: -6, headY: 4, armR: -210,
    foreR: 40, armL: -3, swing: 0.3, tremble: 0.4 },                                          // main derrière la tête
  triste: { lid: 0.75, gy: 4, browL: 2, browR: 2, rot: 16, w: 32, my: 2, headY: 9, headR: -4, bodyY: 3,
    armL: -3, armR: -3, swing: 0.3, tempo: 0.6, geste: 'hoche_lent' },
  fatigue: { r: 10, lid: 0.4, gy: 3, browL: 4, browR: 4, rot: 8, w: 40, my: 1, headY: 8, headR: 5, bodyY: 4,
    armL: -3, armR: -3, swing: 0.4, tempo: 0.5 },
  colere: { r: 9.5, lid: 0.8, browL: 6, browR: 6, rot: -18, w: 60, my: 2, headY: 3, armL: 22, armR: 22,
    foreL: -55, foreR: -55, swing: 1.2, tremble: 1.5, tempo: 1.6, geste: 'tremble' },          // poings serrés
  peur: { r: 13.5, gx: -3, browL: -6, browR: -6, rot: 14, h: 9, w: 30, headY: 6, bodyY: 3, armL: -210, armR: -210,
    foreL: 120, foreR: 120, swing: 0.3, tremble: 2.2, tempo: 1.4, geste: 'sursaut_double' },         // mains sur les joues
  // Paquet 1 : 8 sentiments supplémentaires.
  curieux: { browL: -4, browR: -4, r: 12, headR: 6, headX: 2, gx: 2, gy: -1,
    w: 46, armL: 4, armR: 4, swing: 0.4, tempo: 1.1, geste: 'dodeline' },
  inquiet: { browL: 4, browR: 4, rot: 4, r: 9, lid: 0.85, headY: 4,
    w: 40, my: 1, bodyY: 2, armL: -3, armR: -3, swing: 0.3, tremble: 0.3, tempo: 0.8, geste: 'secoue' },
  emerveille: { r: 14, browL: -6, browR: -6, h: 10, w: 34, headY: -5,
    armL: 6, armR: 6, foreL: -50, foreR: -50, swing: 0.4, tempo: 1.2, geste: 'sursaut_fort' },
  ennuye: { lid: 0.5, browL: 2, browR: 2, r: 10, headR: 6, headY: 3,
    w: 44, my: 1, armL: 3, armR: 3, swing: 0.3, tempo: 0.7, geste: 'secoue' },
  degoute: { browL: 3, browR: -3, r: 9, lid: 0.7, gx: -3, headY: 3, headR: -4, lean: -2,
    w: 36, my: 1, armR: 10, swing: 0.3, tempo: 0.9, geste: 'secoue' },
  soulage: { lid: 0.5, browL: -2, browR: -2, h: 6, w: 52, headY: -2, bodyY: -1,
    armL: 4, armR: 4, foreL: 12, foreR: 12, swing: 0.4, tempo: 0.9, geste: 'hoche' },
  determine: { browL: 3, browR: 3, rot: -3, r: 10, lid: 0.9, w: 46, h: 2, headR: -2,
    swing: 0.5, tempo: 1.3, geste: 'hoche' },
  malicieu: { browL: -2, browR: 3, rot: -2, r: 11, lid: 0.85, gx: 3, h: 5, w: 46, my: -1, headR: -4, headY: -1,
    armR: 8, foreR: 20, swing: 0.4, tempo: 1.1, geste: 'dodeline' },
  // Paquet 2 : 8 sentiments relationnels.
  reconnaissant: { lid: 0.75, browL: -3, browR: -3, h: 7, w: 52, headR: 5, headY: -2,
    armL: 8, armR: 8, foreL: -85, foreR: -85, swing: 0.4, tempo: 0.9, geste: 'hoche' },
  nostalgique: { lid: 0.65, browL: 1, browR: 1, rot: 5, h: 5, w: 42, my: 1, headR: 7, headY: 3, gx: -3, gy: -2,
    armL: 3, armR: 3, swing: 0.25, tempo: 0.65, geste: 'hoche_lent' },
  jaloux: { r: 10, lid: 0.85, browL: 4, browR: -2, rot: 3, gx: -5, w: 38, my: 1, headR: -3, headY: 2,
    armL: 18, armR: 18, foreL: -60, foreR: -60, swing: 0.4, tempo: 1.1, geste: 'secoue' },
  amuse: { lid: 0.6, browL: -3, browR: -3, rot: 4, h: 10, w: 54, headY: -2, headR: 4, sway: 2,
    armL: 6, armR: 6, foreL: -40, foreR: -40, swing: 0.5, bounce: 1.8, tempo: 1.5, geste: 'dodeline' },
  intimide: { lid: 0.7, browL: 2, browR: 2, rot: 12, gx: -4, gy: 3, h: 4, w: 32, headY: 6, headR: -5, bodyY: 4,
    armL: -6, armR: -6, foreL: -30, foreR: -30, swing: 0.25, tremble: 0.4, tempo: 0.7 },
  rassurant: { lid: 0.9, browL: -2, browR: -2, h: 8, w: 56, headR: 2, headY: -3,
    armL: 14, armR: 14, foreL: 25, foreR: 25, swing: 0.5, tempo: 1, geste: 'hoche' },
  impatient: { r: 9, lid: 0.9, browL: 3, browR: 3, rot: -3, gx: 3, w: 40, headR: -2, headY: 1,
    armL: 5, armR: 5, foreL: -25, foreR: -25, swing: 0.6, bounce: 1.5, tempo: 1.8, geste: 'tremble' },
  compatissant: { lid: 0.8, browL: 2, browR: 2, rot: 8, h: 5, w: 40, my: 1, headR: 6, headY: 3,
    armL: 10, armR: 10, foreL: -70, foreR: -70, swing: 0.3, tempo: 0.85, geste: 'hoche' },
  // Paquet 3 : 8 sentiments mentaux.
  pensif: { lid: 0.75, browL: 2, browR: 2, rot: 4, gx: -3, gy: -3, w: 40, my: 1, headR: 6, headY: 2,
    armL: 4, armR: 4, foreL: -55, foreR: -55, swing: 0.25, tempo: 0.7, geste: 'hoche_lent' },
  confus: { r: 11, browL: -3, browR: 4, rot: -3, gx: -2, gy: 1, w: 40, my: -1, headR: -6, headY: 3,
    armL: 5, armR: 5, foreL: -20, foreR: 20, swing: 0.4, tempo: 0.9, geste: 'sursaut_double' },
  resigne: { lid: 0.65, browL: 2, browR: 2, rot: 10, h: 4, w: 36, my: 2, headR: -3, headY: 6, bodyY: 3,
    armL: -2, armR: -2, swing: 0.25, tempo: 0.6, geste: 'hoche_lent' },
  excite: { r: 12.5, lid: 0.95, browL: -4, browR: -4, h: 11, w: 56, headY: -3, headR: 2,
    armL: -180, armR: -180, foreL: 15, foreR: 15, swing: 0.7, bounce: 4, tremble: 0.5, tempo: 2, geste: 'sursaut_fort' },
  apaise: { lid: 0.65, browL: -1, browR: -1, h: 6, w: 50, headR: 3, headY: 1,
    armL: 4, armR: 4, foreL: 10, foreR: 10, swing: 0.3, tempo: 0.75, geste: 'hoche_lent' },
  honteux: { lid: 0.55, browL: 3, browR: 3, rot: 15, gx: -3, gy: 4, h: 3, w: 32, my: 1, headR: -4, headY: 8, bodyY: 4,
    armL: -4, armR: -4, swing: 0.2, tremble: 0.3, tempo: 0.6 },
  provocateur: { lid: 0.85, browL: -3, browR: 3, rot: -4, gx: 2, h: 7, w: 52, my: -1, headR: -3, headY: -1,
    armL: 25, armR: 25, foreL: -70, foreR: -70, swing: 0.5, tempo: 1.3, geste: 'dodeline' },
  contemplatif: { lid: 0.55, browL: -1, browR: -1, rot: 3, gy: -2, h: 5, w: 42, my: 1, headR: 4, headY: -2,
    armL: 3, armR: 3, foreL: -60, foreR: -60, swing: 0.2, tempo: 0.55, geste: 'hoche_lent' },
};

export const NOMS = Object.keys(EXPRESSIONS);
const CLES = /** @type {(keyof typeof NEUTRE)[]} */ (Object.keys(NEUTRE));

/** Expression inconnue (p. ex. dans un ancien projet) → neutre. */
export const expressionJouable = (nom) => Object.hasOwn(EXPRESSIONS, nom) ? nom : 'neutre';

/** Geste associé à une expression ('' si aucun). */
export const gesteDe = (nom) => EXPRESSIONS[nom]?.geste || '';

const MEMBRES = new Set(['armL', 'armR', 'foreL', 'foreR']);
const palier = (f) => { const x = Math.max(0, Math.min(1, (f - 0.56) / 0.08)); return x * x * (3 - 2 * x); };

/**
 * Pose complète d'une expression. `force` (0 à 1,25) dose l'écart au repos ; `mix` + `poids` (0 à 0,5) mélangent une
 * seconde expression : c'est ce qui donne les expressions combinées.
 * Les bras font exception : une émotion légère (force < 0,56) ne se lit que sur le visage et la tête ; au-delà, les
 * bras prennent la pose entière de l'expression principale (une demi-pose de bras ne ressemble à rien).
 */
export function poseDe(nom, force = 1, mix = '', poids = 0) {
  const a = EXPRESSIONS[nom] || {}, b = (mix && EXPRESSIONS[mix]) || null;
  const f = Math.max(0, Math.min(1.25, force)), p = b ? Math.max(0, Math.min(0.5, poids)) : 0, fm = palier(f);
  /** @type {Record<string, number>} */ const out = {};
  for (const k of CLES) {
    const n = NEUTRE[k], va = a[k] ?? n;
    if (MEMBRES.has(k)) { out[k] = n + (va - n) * fm; continue; }
    const v = b ? va + ((b[k] ?? n) - va) * p : va;
    out[k] = n + (v - n) * f;
  }
  out.r = Math.max(6, Math.min(15, out.r));          // l'œil reste dans sa monture
  out.lid = Math.max(0.15, Math.min(1, out.lid));
  out.w = Math.max(20, Math.min(64, out.w));
  return out;
}

/**
 * Rapproche `pose` de `cible` (lissage exponentiel) : `a` = part du chemin parcourue pendant cette image (0 à 1),
 * `aBras` = la même chose pour les bras, plus lents que le visage.
 */
export function approcher(pose, cible, a, aBras = a) {
  for (const k of CLES) pose[k] += (cible[k] - pose[k]) * (MEMBRES.has(k) ? aBras : a);
  return pose;
}
