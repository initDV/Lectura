// @ts-check
// character.js : animation du robot (code de référence B3, étendu sans le contourner).
// Référence conservée : hauteurs de bouche VIS, respiration, balancement des bras, clignement, API setExpression /
// setViseme / setTalking / start / stop / tick. Ajouts : expressions combinées (yeux, sourcils, bouche, tête, bras,
// corps) fondues en douceur, regard, gestes ponctuels, style de mouvement par personnage, forme de bouche (Pro).
import { EXPRESSIONS, NEUTRE, poseDe, approcher } from './expressions.js';
import { grouperTete, grouperAvantBras, brasDevant } from './rig.js';
import { appliquer as appliquerBouche, formeDe, VISEMES, visemeDe } from './mouth.js';

export { EXPRESSIONS };
const VIS = [5, 9, 14, 19]; // hauteur de la bouche par niveau de lip-sync (0 = fermé)

/** Styles de mouvement : v = vitesse, a = amplitude des bras, pas = saccade (degrés), flotte / ondule = déplacement (px). */
export const STYLES = {
  fluide: { v: 1, a: 1 }, saccade: { v: 1, a: 1, pas: 5 }, sec: { v: 1.5, a: 0.8 }, frappe: { v: 2.4, a: 0.5 },
  flottant: { v: 0.5, a: 0.8, flotte: 5 }, ondulant: { v: 0.6, a: 1, ondule: 3 }, calme: { v: 0.7, a: 1.2 }, expressif: { v: 1.2, a: 1.5 },
};

export function motionParams(m = {}) {
  const s = STYLES[m.style] || STYLES.fluide;
  return { vitesse: (m.vitesseIdle ?? 1) * s.v, amplitude: (m.amplitudeBras ?? 1) * s.a, pas: s.pas || 0, flotte: s.flotte || 0, ondule: s.ondule || 0 };
}

const BOUCHES = { normal: 48, large: 58, rond: 32 };          // largeur de la bouche (Pro : lip-sync par bandes)
const GESTES = {
  hoche: 650, secoue: 750, sursaut: 380, coucou: 1400,
  // Nouveaux gestes expressifs (2026-11-16) : plus de variété selon l'émotion.
  sursaut_fort: 500,    // saut vertical ample (enthousiaste, excite)
  sursaut_double: 700,  // deux petits sauts (peur intense, surprise)
  hoche_lent: 1100,     // hochement profond et lent (triste, contemplatif, pensif)
  dodeline: 800,        // tête qui se balance latéralement (amuse, malicieux, curieux)
  tremble: 500,         // vibration rapide de la tête (colère contenue, peur)
};
/** Gestes scénarisés : séquences multi-articulations jouées au repos. Keyframes sur armR/foreR/headR/gx. */
const GESTES_SCENES = {
  gratter: {
    duree: 2000,
    kf: [
      { t: 0,    armR: 0,    foreR: 0,   headR: 0,  gx: 0 },
      { t: 0.28, armR: -120, foreR: -80, headR: -6, gx: -4 },
      { t: 0.38, armR: -125, foreR: -90, headR: -6, gx: -4 },
      { t: 0.46, armR: -120, foreR: -80, headR: -6, gx: -4 },
      { t: 0.54, armR: -125, foreR: -90, headR: -6, gx: -4 },
      { t: 0.62, armR: -120, foreR: -80, headR: -6, gx: -4 },
      { t: 0.85, armR: -120, foreR: -80, headR: -6, gx: -4 },
      { t: 1,    armR: 0,    foreR: 0,   headR: 0,  gx: 0 },
    ],
  },
  lunettes: {
    duree: 1500,
    kf: [
      { t: 0,    armR: 0,    foreR: 0,   headR: 0,  gx: 0 },
      { t: 0.3,  armR: -140, foreR: -110, headR: -2, gx: 1 },
      { t: 0.45, armR: -145, foreR: -120, headR: -2, gx: 1 },
      { t: 0.55, armR: -140, foreR: -110, headR: -2, gx: 1 },
      { t: 0.7,  armR: -142, foreR: -115, headR: -2, gx: 1 },
      { t: 1,    armR: 0,    foreR: 0,   headR: 0,  gx: 0 },
    ],
  },
};
const f2 = (v) => v.toFixed(2);

export class Character {
  /** @param {SVGSVGElement} svg @param {any} [def] fiche JSON du personnage */
  constructor(svg, def = {}) {
    const q = (s) => svg.querySelector(s);
    this.svgEl = svg;
    this.el = { head: grouperTete(svg), body: q('#body'), armL: q('#arm-l'), armR: q('#arm-r'), mouth: q('#mouth'),
      eyeL: q('#eye-l'), eyeR: q('#eye-r'), browL: q('#brow-l'), browR: q('#brow-r'), legs: q('#legs') };
    // Reflets des yeux (petits cercles sans id placés après les yeux) : ils suivent le regard, masqués quand l'œil se ferme.
    this.el.foreL = grouperAvantBras(this.el.armL); this.el.foreR = grouperAvantBras(this.el.armR);
    brasDevant(this.el.body, this.el.armL, this.el.armR);
    this.reflets = [...svg.querySelectorAll('#eye-l ~ circle:not([id]), #eye-r ~ circle:not([id])')].filter((c) => +c.getAttribute('r') <= 4);
    this.expr = 'neutre'; this.viseme = 0; this.talk = 0; this.talkLisse = 0; this.blinkUntil = 0; this.nextBlink = 2000;
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mp = motionParams(def.mouvements);
    const pv = def.pivots || {};
    this.pivL = pv.epaule_g || [34, 224]; this.pivR = pv.epaule_d || [208, 224]; this.cou = pv.cou || [120, 202];
    this.coudeL = pv.coude_g || [this.pivL[0], 266]; this.coudeR = pv.coude_d || [this.pivR[0], 266];
    // Lit cy sur l'élément #eye-l directement (circle) OU sur son premier enfant (groupe)
    // → permet aux SVG qui utilisent <g id="eye-l"><ellipse .../></g> de cligner au bon endroit.
    const eyeNode = this.el.eyeL;
    const eyeCy = eyeNode.getAttribute('cy')
      || eyeNode.querySelector('ellipse')?.getAttribute('cy')
      || eyeNode.querySelector('circle')?.getAttribute('cy')
      || 129;
    this.yeuxY = +eyeCy;
    // Attributs de BASE du SVG : chaque personnage peut avoir des yeux et une bouche de tailles
    // différentes. On lit les valeurs d'origine et on les utilise comme référence pour les expressions.
    // Robot : r=11, w=48. Amina (viewBox 200x330) : r=4, w=28 par exemple.
    this.rBase = Math.max(1, +this.el.eyeL.getAttribute('r') || 11);
    this._visemeDe = visemeDe;
    this.wBase = Math.max(1, +this.el.mouth.getAttribute('width') || 48);
    this.hBase = Math.max(1, +this.el.mouth.getAttribute('height') || 5);
    this.yBase = +this.el.mouth.getAttribute('y') || 163;
    this.xBase = +this.el.mouth.getAttribute('x') || 96;
    // Détection : <rect id="mouth"> (robot, bouche simple) ou <g id="mouth"> (humains, lèvres dessinées).
    // Le type "lèvres" vient aussi de la fiche JSON : def.bouche?.type === 'levres'.
    const gm = this.el.mouth;
    const estGroupe = gm && gm.tagName.toLowerCase() === 'g';
    const typeLevre = (def.bouche && def.bouche.type === 'levres');
    // Détection humain : le personnage a des lèvres dessinées (def.bouche.type === 'levres').
    // On adapte alors les amplitudes de mouvement (le robot fait 600px de haut, l'humain 330).
    this.estHumain = estGroupe && typeLevre;
    this.bassin = pv.bassin || [120, 354];  // pivot de rotation du corps (robot par défaut)
    this.sourcilG = pv.sourcil_g || [92, 104];
    this.sourcilD = pv.sourcil_d || [148, 104];
    // Facteur d'échelle : 1.0 pour le robot, ~0.55 pour un humain de 330px.
    this.scale = this.estHumain ? 0.55 : 1.0;
    // Les bras des humains sont collés au corps par défaut (dans le SVG), contrairement au robot
    // qui a les bras écartés. On atténue donc les rotations de bras pour les humains, sinon ils
    // ressemblent à des ailes qui s'ouvrent.
    // Humains : les gestes de bras obéissent à des règles différentes du robot.
    // Le robot a des bras mécaniques (rotations amples, gestes précis).
    // L'humain gesticule naturellement pendant la parole (balancement + amplitude).
    this.membreScale = this.estHumain ? 0.6 : 1.0;
    if (estGroupe && typeLevre) {
      this.bouche = {
        interieur: gm.querySelector('#levre-creux'),
        levreHaut: gm.querySelector('#levre-haut'),
        levreBas: gm.querySelector('#levre-bas'),
        dents: gm.querySelector('#bouche-dents'),
        langue: gm.querySelector('#bouche-langue'),
        demiLargeur: def.bouche.demiLargeur || 9.5,
        ouvertureMax: def.bouche.ouvertureMax || 8,
      };
      const pvM = def.pivots || {};
      this.centreX = (Array.isArray(pvM.centre) && pvM.centre) || pvM.bouche * 0 + 100;
      this.centreX = typeof pvM.centre === 'number' ? pvM.centre : (pvM.bouche || 100);
      this.centreX = (Array.isArray(pvM.centre) ? pvM.centre[0] : pvM.centre) || (pvM.bouche || 100);
      this.boucheY = typeof pvM.bouche === 'number' ? pvM.bouche : (pvM.centre || 84);
      // Simplification : le JSON stocke centre=100, bouche=84 (nombres).
      this.centreX = typeof pvM.centre === 'number' ? pvM.centre : 100;
      this.boucheY = typeof pvM.bouche === 'number' ? pvM.bouche : 84;
    } else {
      this.bouche = null;
    }
    this.gain = 1; this.rich = false; this.shape = 'normal'; this.gesteFin = 0; this.gesteBras = 1; this.raf = 0;
    this.pose = { ...NEUTRE }; this.cible = { ...NEUTRE }; this.phase = 0; this.dernier = 0;
    this.geste = { type: '', t0: 0 }; this.regard = [0, 0]; this.coup = [0, 0]; this.coupFin = 0; this.nextCoup = 1500;
    this.reaction = { type: '', t0: 0, duree: 0 };
    this.parasite = { type: '', t0: 0, duree: 0, amp: 0 };
    this.nextParasite = 4000 + Math.random() * 3000;
    this.scene = { type: '', t0: 0, duree: 0 };
  }
  /**
   * neutre | content | concentre | surpris (+ expressions Pro). `force` dose l'expression, `mix` + `poids` en mélangent
   * une seconde (expression combinée). Le visage et le corps glissent vers la nouvelle pose en ~0,3 s.
   */
  setExpression(n, force = 1, mix = '', poids = 0) {
    this.expr = EXPRESSIONS[n] ? n : 'neutre';
    this.cible = poseDe(this.expr, force, mix, poids);
    // Humains : les gestes de bras des expressions sont LIMITÉS à des valeurs humaines.
    // Un robot peut lever les bras à 195° (bras tendus vers le haut) ; un humain ne lève
    // pas les bras aussi haut en parlant. On clamp : bras max ±50°, coudes max ±70°.
    if (this.estHumain) {
      const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
      this.cible.armL = clamp(this.cible.armL * 0.6, 50);
      this.cible.armR = clamp(this.cible.armR * 0.6, 50);
      this.cible.foreL = clamp(this.cible.foreL * 0.6, 70);
      this.cible.foreR = clamp(this.cible.foreR * 0.6, 70);
    }
  }
  /** Applique tout de suite la pose visée, sans transition (vignettes, tests). */
  snap() { this.pose = { ...this.cible }; }
  setViseme(l, car = '', nom = '') {
    this.viseme = Math.max(0, Math.min(3, l | 0));
    this.lettre = car;
    // visemeNom : forme de bouche pour mouth.js (a/e/i/o/u). Si non fourni, calculé depuis la lettre.
    this.visemeNom = nom || (car ? (this._visemeDe ? this._visemeDe(car) : '') : '');
  }
  setTalking(v) { this.talk = Math.max(0, Math.min(1, v)); }
  setMouthShape(shape) { this.shape = BOUCHES[shape] ? shape : 'normal'; } // Pro : 'normal' | 'large' | 'rond'
  setReduced(v) { this.reduce = !!v; }
  /** Réaction ponctuation (Bloc 2) : impulsion visuelle courte. Aucun effet sur la voix, la bouche, les sentiments. */
  reagir(type, t = performance.now()) {
    const DUREES = { interro: 550, excla: 260, suspens: 700, virgule: 220 };
    if (DUREES[type]) this.reaction = { type, t0: t, duree: DUREES[type] };
  }
  setGain(g) { this.gain = g; }                                     // réglage « mouvements » du projet
  setRich(v) { this.rich = !!v; }                                   // Pro : gestes plus amples
  /** Geste ponctuel : 'bras' (mot-clé important), 'hoche' (oui), 'secoue' (non), 'sursaut', 'coucou' (salut de la main). */
  gesture(t = performance.now(), type = 'bras') {
    if (this.geste.type && t - this.geste.t0 < GESTES[this.geste.type] * 0.8) return;
    if (this.gesteFin && t < this.gesteFin - 140) return;
    this.parasite = { type: '', t0: 0, duree: 0, amp: 0 };
    this.scene = { type: '', t0: 0, duree: 0 };
    if (GESTES[type]) this.geste = { type, t0: t };
    else { this.gesteFin = t + 700; this.gesteBras = this.gesteBras === 1 ? -1 : 1; }
  }
  start() { const loop = (t) => { this.tick(t); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); }

  tick(t) {
    const dt = this.dernier ? Math.max(0, Math.min(100, t - this.dernier)) : 0;
    if (!this.dernier) this.snap(); else approcher(this.pose, this.cible, 1 - Math.exp(-dt / 110), 1 - Math.exp(-dt / 190));
    this.dernier = t;
    const p = this.mp, o = this.pose, e = this.el, k = (this.reduce ? 0.25 : 1) * this.gain;
    let sceneArmR = 0, sceneForeR = 0, sceneHeadR = 0, sceneGx = 0;
    // Ponctuation : impulsion courte (interro→sourcil, excla→sursaut, suspens→regard, virgule→tilt tête).
    let rBrow = 0, rDy = 0, rGx = 0, rGy = 0, rHeadR = 0, rHeadY = 0;
    if (this.reaction.type) {
      const u = (t - this.reaction.t0) / this.reaction.duree;
      if (u >= 0 && u < 1) {
        const env = Math.sin(u * Math.PI);
        if (this.reaction.type === 'interro') { rBrow = -16 * env * k; rHeadY = -3 * env * k; }
        else if (this.reaction.type === 'excla') rDy = -4 * env * k;
        else if (this.reaction.type === 'suspens') { rGx = -2.5 * env * k; rGy = -2 * env * k; }
        else if (this.reaction.type === 'virgule') rHeadR = 2.5 * env * k;
      }
    }
    this.phase += (dt / 1000) * p.vitesse * o.tempo;               // le rythme suit l'humeur sans à-coup
    const s = this.phase;
    this.talkLisse += (this.talk - this.talkLisse) * (1 - Math.exp(-dt / 250)); // lisse la source (audio ou booléen)
    if (t > this.nextBlink) {
      this.blinkUntil = t + 120;
      const double = Math.random() < 0.12;
      this.nextBlink = t + 120 + (double ? 170 : 2500 + Math.random() * 3000);
    }
    // Coups d'œil : vers le terminal (à droite) quand il parle, au hasard au repos.
    if (t > this.nextCoup && !this.reduce) {
      this.coup = this.talk > 0.5 ? [4.5, 1] : [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3];
      this.coupFin = t + 450 + Math.random() * 700; this.nextCoup = this.coupFin + 2200 + Math.random() * 3500;
    }
    const versCoup = t < this.coupFin ? this.coup : [0, 0], ar = 1 - Math.exp(-dt / 70);
    this.regard[0] += (versCoup[0] - this.regard[0]) * ar; this.regard[1] += (versCoup[1] - this.regard[1]) * ar;
    // Geste ponctuel (hochement, signe de tête « non », sursaut) : une courte impulsion amortie.
    let gx = 0, gy = 0, saut = 0, salut = 0, agite = 0;
    const u = this.geste.type ? (t - this.geste.t0) / GESTES[this.geste.type] : 1;
    if (u >= 0 && u < 1) {
      const gs = this.scale;  // 1.0 robot, ~0.55 humain : gestes moins amples
      if (this.geste.type === 'hoche') gy = Math.sin(u * 4 * Math.PI) * 5 * (1 - u) * k * gs;
      else if (this.geste.type === 'hoche_lent') gy = Math.sin(u * 2 * Math.PI) * 7 * (1 - u) * k * gs;
      else if (this.geste.type === 'secoue') gx = Math.sin(u * 6 * Math.PI) * 5 * (1 - u) * k * gs;
      else if (this.geste.type === 'dodeline') { gx = Math.sin(u * 3 * Math.PI) * 7 * (1 - u) * k * gs; gy = Math.sin(u * 2 * Math.PI) * 2 * (1 - u) * k * gs; }
      else if (this.geste.type === 'tremble') gx = Math.sin(u * 15 * Math.PI) * 3 * (1 - u) * k * gs;
      else if (this.geste.type === 'coucou') { salut = Math.min(1, Math.sin(u * Math.PI) * 1.8); agite = Math.sin(u * 10 * Math.PI) * 22 * gs; }
      else if (this.geste.type === 'sursaut_fort') saut = -Math.sin(u * Math.PI) * 18 * k * gs;
      else if (this.geste.type === 'sursaut_double') saut = -Math.abs(Math.sin(u * 2 * Math.PI)) * 12 * k * gs;
      else saut = -Math.sin(u * Math.PI) * 9 * k * gs;
    }
    // Corps : respiration (référence), rebond, tremblement, flottement ; les jambes ne suivent que les déplacements.
    const br = Math.sin(s * 1.6) * 4.0 * k * this.scale, tr = o.tremble * k;
    const dodeline = Math.sin(s * 0.55) * 1.8 * k * this.scale;
    const dx = (p.ondule ? Math.sin(s * 1.1) * p.ondule * k : 0) + Math.sin(t * 0.055) * tr;
    const dy = (p.flotte ? -(Math.sin(s * 0.9) + 1) * p.flotte * k : 0) - Math.abs(Math.sin(s * 3.2)) * o.bounce * k + saut + Math.cos(t * 0.047) * tr * 0.4 + rDy;
    const tout = Math.abs(dx) + Math.abs(dy) > 0.004 ? `translate(${f2(dx)} ${f2(dy)}) ` : '';
    const pench = Math.abs(o.lean) > 0.02 ? ` rotate(${f2(o.lean * this.scale)} ${this.bassin[0]} ${this.bassin[1]})` : '';
    e.body.setAttribute('transform', `${tout}translate(${f2(dodeline * 1.0)} ${f2(o.bodyY - br * 1.3)})${pench}`);
    if (e.legs) e.legs.setAttribute('transform', `${tout}rotate(${f2(dodeline * 0.8)} 120 354)`);
    // Tête : pose de l'expression + balancement + léger mouvement pendant la parole + geste ponctuel.
    const hr = o.headR + rHeadR + sceneHeadR + Math.sin(s * 1.1) * Math.max(o.sway, 2.5 * this.scale) * k + Math.sin(s * 2.1) * 1.3 * this.talk * k * this.scale;
    const hy = o.headY + gy + br * 0.55 + Math.sin(s * 4.2) * 0.9 * this.talk * k + rHeadY, hx = o.headX + gx;
    e.head.setAttribute('transform', `translate(${f2(hx)} ${f2(hy)}) rotate(${f2(hr)} ${this.cou[0]} ${this.cou[1]})`);
    // Geste scénarisé : séquence multi-articulations (gratter, lunettes). Interpolation entre keyframes.
    if (this.scene.type) {
      const u = (t - this.scene.t0) / this.scene.duree;
      if (u >= 0 && u < 1) {
        const def = GESTES_SCENES[this.scene.type];
        let k1 = def.kf[0], k2 = def.kf[def.kf.length - 1];
        for (let i = 0; i < def.kf.length - 1; i++) {
          if (u >= def.kf[i].t && u <= def.kf[i + 1].t) { k1 = def.kf[i]; k2 = def.kf[i + 1]; break; }
        }
        const f = (u - k1.t) / (k2.t - k1.t || 1), sm = f * f * (3 - 2 * f);
        sceneArmR = (k1.armR || 0) + ((k2.armR || 0) - (k1.armR || 0)) * sm;
        sceneForeR = (k1.foreR || 0) + ((k2.foreR || 0) - (k1.foreR || 0)) * sm;
        sceneHeadR = (k1.headR || 0) + ((k2.headR || 0) - (k1.headR || 0)) * sm;
        sceneGx = (k1.gx || 0) + ((k2.gx || 0) - (k1.gx || 0)) * sm;
      } else { this.scene = { type: '', t0: 0, duree: 0 }; }
    }
    // Geste parasite : micro-mouvement des bras quand rien ne se passe (le robot ne reste jamais figé).
    let paraL = 0, paraR = 0, paraFL = 0, paraFR = 0;
    const gesteActif = !!this.geste.type && (t - this.geste.t0) < GESTES[this.geste.type];
    const brasActif = t < this.gesteFin;
    if (!this.reduce && !gesteActif && !brasActif && !this.scene.type && t > this.nextParasite && this.talkLisse < 0.4) {
      if (Math.random() < 0.35) {
        const SCENES = ['gratter', 'lunettes'];
        const type = SCENES[(Math.random() * SCENES.length) | 0];
        this.scene = { type, t0: t, duree: GESTES_SCENES[type].duree };
        this.nextParasite = t + 9000 + Math.random() * 6000;
      } else {
        const TYPES = ['bras', 'epauleG', 'epauleD', 'coudeG', 'coudeD'];
        const type = TYPES[(Math.random() * TYPES.length) | 0];
        const duree = 400 + Math.random() * 500;
        const amp = ((type.startsWith('coude') ? 5 : 3) + Math.random() * 5) * this.scale;
        this.parasite = { type, t0: t, duree, amp };
        this.nextParasite = t + (this.talk > 0.3 ? 12000 + Math.random() * 6000 : 5500 + Math.random() * 3500);
      }
    }
    if (this.parasite.type) {
      const u = (t - this.parasite.t0) / this.parasite.duree;
      if (u >= 0 && u < 1) {
        const env = Math.sin(u * Math.PI), a = this.parasite.amp * env * k;
        if (this.parasite.type === 'bras') { paraL = a; paraR = -a; }
        else if (this.parasite.type === 'epauleG') paraL = a;
        else if (this.parasite.type === 'epauleD') paraR = -a;
        else if (this.parasite.type === 'coudeG') paraFL = a;
        else if (this.parasite.type === 'coudeD') paraFR = -a;
      }
    }
    // Bras : épaule et coude de l'expression + balancement pendant la parole (référence) + geste + parasite ; « pas » = mouvement saccadé.
    const cran = (a) => (p.pas ? Math.round(a / p.pas) * p.pas : a), base = `${tout}translate(0 ${f2(o.bodyY)})${pench} `;
    const g = t < this.gesteFin ? Math.sin(Math.PI * (1 - (this.gesteFin - t) / 700)) * (this.rich ? 42 : 24) * k : 0;
    // Humains : gesticulent naturellement avec les mains en parlant. Le robot a un balancement
    // plus mécanique ; l'humain bouge plus, plus lentement, plus organique.
    const amp = (this.estHumain ? 12 : 7) * this.talkLisse * k * p.amplitude * o.swing;
    const epL = o.armL + (24 - o.armL) * salut, coL = o.foreL + (agite - 204 - o.foreL) * salut; // « coucou » : avant-bras gauche levé, main agitée
    const f1 = this.estHumain ? 0.85 : 1.3; // humains : balancement plus lent
    const f2b = this.estHumain ? 0.7 : 1.1;
    const aL = epL + cran(Math.sin(s * f1) * amp + (this.gesteBras < 0 ? g : 0)) + paraL;
    const aR = -o.armR + cran(-Math.sin(s * f2b + 1) * amp - (this.gesteBras > 0 ? g : 0)) + paraR + sceneArmR;
    e.armL.setAttribute('transform', `${base}rotate(${f2(aL)} ${this.pivL[0]} ${this.pivL[1]})`);
    e.armR.setAttribute('transform', `${base}rotate(${f2(aR)} ${this.pivR[0]} ${this.pivR[1]})`);
    const fL = coL + cran(Math.sin(s * 1.4 + 2) * amp * 0.8 + (this.gesteBras < 0 ? g * 0.9 : 0)) + paraFL;
    const fR = -o.foreR + cran(-Math.sin(s * 1.2) * amp * 0.8 - (this.gesteBras > 0 ? g * 0.9 : 0)) + paraFR + sceneForeR;
    e.foreL.setAttribute('transform', `rotate(${f2(fL)} ${this.coudeL[0]} ${this.coudeL[1]})`);
    e.foreR.setAttribute('transform', `rotate(${f2(fR)} ${this.coudeR[0]} ${this.coudeR[1]})`);
    // Bouche : la hauteur suit le niveau de lip-sync, l'expression fixe un minimum, une largeur et un décalage.
    const h = Math.max(VIS[this.viseme], o.h), w = o.w * (this.rich ? BOUCHES[this.shape] / 48 : 1), m = e.mouth;
    // Bouche : deux modèles selon le personnage.
    if (this.bouche) {
      // Humains : lèvres dessinées (courbes, dents, langue) via mouth.js.
      const v = VISEMES[this.visemeNom] || (this.lettre && formeDe(this.lettre)) || {};
      appliquerBouche(this.bouche, this.centreX + o.gx * 0.2, this.boucheY + o.my,
        this.bouche.demiLargeur * (w / 48),
        h * (this.bouche.ouvertureMax / 19),
        { courbure: o.sourire || 0, arrondi: Math.max(o.rond || 0, v.arrondi || 0), etirement: v.etirement || 0 });
    } else {
      // Robot : ouverture symétrique (rect).
      const hAdapte = Math.max(1, h * this.hBase / 5);
      const wAdapte = Math.max(1, w * this.wBase / 48);
      const cx = this.xBase + this.wBase / 2;
      const cy = this.yBase + this.hBase / 2 + o.my;
      m.setAttribute('height', f2(hAdapte));
      m.setAttribute('width', f2(wAdapte));
      m.setAttribute('x', f2(cx - wAdapte / 2));
      m.setAttribute('y', f2(cy - hAdapte / 2));
      m.setAttribute('rx', f2(Math.min(hAdapte / 2, wAdapte / 2, 6)));
    }
    // Yeux : rayon et ouverture selon l'expression, regard, clignement par écrasement vertical autour du centre.
    const sy = t < this.blinkUntil ? 0.15 : o.lid, rx = o.gx + this.regard[0], ry = o.gy + this.regard[1], y = this.yeuxY;
    const driftX = Math.sin(s * 0.55) * 1.3 * k + Math.sin(s * 1.5) * 0.6 * k + rGx + sceneGx;
    const driftY = Math.cos(s * 0.45) * 0.8 * k + rGy;
    const vers = `translate(${f2(rx + driftX)} ${f2(ry + driftY)})`;
    for (const eye of [e.eyeL, e.eyeR]) {
      eye.setAttribute('r', f2(o.r * this.rBase / 11)); // rBase : adapte le rayon au personnage
      eye.setAttribute('transform', sy > 0.995 ? vers : `${vers} translate(0 ${y}) scale(1 ${f2(sy)}) translate(0 ${-y})`);
    }
    for (const r of this.reflets) { r.setAttribute('transform', vers); r.setAttribute('opacity', sy > 0.6 ? '1' : '0'); }
    // Sourcils : hauteur de chacun + inclinaison symétrique (positive = triste, négative = fâché).
    e.browL.setAttribute('transform', `translate(0 ${f2(o.browL + rBrow)}) rotate(${f2(-o.rot * this.scale)} ${this.sourcilG[0]} ${this.sourcilG[1]})`);
    e.browR.setAttribute('transform', `translate(0 ${f2(o.browR + rBrow)}) rotate(${f2(o.rot * this.scale)} ${this.sourcilD[0]} ${this.sourcilD[1]})`);
  }
}
