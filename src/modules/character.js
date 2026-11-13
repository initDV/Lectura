// @ts-check
// character.js : animation du robot (code de référence B3, étendu sans le contourner).
// Référence conservée : hauteurs de bouche VIS, respiration, balancement des bras, clignement, API setExpression /
// setViseme / setTalking / start / stop / tick. Ajouts : expressions combinées (yeux, sourcils, bouche, tête, bras,
// corps) fondues en douceur, regard, gestes ponctuels, style de mouvement par personnage, forme de bouche (Pro).
import { EXPRESSIONS, NEUTRE, poseDe, approcher } from './expressions.js';
import { grouperTete, grouperAvantBras, brasDevant } from './rig.js';

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
const GESTES = { hoche: 650, secoue: 750, sursaut: 380, coucou: 1400 }; // gestes ponctuels (tête, corps, main) : durée (ms)
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
    this.expr = 'neutre'; this.viseme = 0; this.talk = 0; this.blinkUntil = 0; this.nextBlink = 2000;
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mp = motionParams(def.mouvements);
    const pv = def.pivots || {};
    this.pivL = pv.epaule_g || [34, 224]; this.pivR = pv.epaule_d || [208, 224]; this.cou = pv.cou || [120, 202];
    this.coudeL = pv.coude_g || [this.pivL[0], 266]; this.coudeR = pv.coude_d || [this.pivR[0], 266];
    this.yeuxY = +this.el.eyeL.getAttribute('cy') || 129;
    this.gain = 1; this.rich = false; this.shape = 'normal'; this.gesteFin = 0; this.gesteBras = 1; this.raf = 0;
    this.pose = { ...NEUTRE }; this.cible = { ...NEUTRE }; this.phase = 0; this.dernier = 0;
    this.geste = { type: '', t0: 0 }; this.regard = [0, 0]; this.coup = [0, 0]; this.coupFin = 0; this.nextCoup = 1500;
  }
  /**
   * neutre | content | concentre | surpris (+ expressions Pro). `force` dose l'expression, `mix` + `poids` en mélangent
   * une seconde (expression combinée). Le visage et le corps glissent vers la nouvelle pose en ~0,3 s.
   */
  setExpression(n, force = 1, mix = '', poids = 0) {
    this.expr = EXPRESSIONS[n] ? n : 'neutre';
    this.cible = poseDe(this.expr, force, mix, poids);
  }
  /** Applique tout de suite la pose visée, sans transition (vignettes, tests). */
  snap() { this.pose = { ...this.cible }; }
  setViseme(l) { this.viseme = Math.max(0, Math.min(3, l | 0)); }
  setTalking(v) { this.talk = Math.max(0, Math.min(1, v)); }
  setMouthShape(shape) { this.shape = BOUCHES[shape] ? shape : 'normal'; } // Pro : 'normal' | 'large' | 'rond'
  setReduced(v) { this.reduce = !!v; }
  setGain(g) { this.gain = g; }                                     // réglage « mouvements » du projet
  setRich(v) { this.rich = !!v; }                                   // Pro : gestes plus amples
  /** Geste ponctuel : 'bras' (mot-clé important), 'hoche' (oui), 'secoue' (non), 'sursaut', 'coucou' (salut de la main). */
  gesture(t = performance.now(), type = 'bras') {
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
    this.phase += (dt / 1000) * p.vitesse * o.tempo;               // le rythme suit l'humeur sans à-coup
    const s = this.phase;
    if (t > this.nextBlink) { this.blinkUntil = t + 120; this.nextBlink = t + 2500 + Math.random() * 3000; }
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
      if (this.geste.type === 'hoche') gy = Math.sin(u * 4 * Math.PI) * 5 * (1 - u) * k;
      else if (this.geste.type === 'secoue') gx = Math.sin(u * 6 * Math.PI) * 5 * (1 - u) * k;
      else if (this.geste.type === 'coucou') { salut = Math.min(1, Math.sin(u * Math.PI) * 1.8); agite = Math.sin(u * 10 * Math.PI) * 22; }
      else saut = -Math.sin(u * Math.PI) * 9 * k;
    }
    // Corps : respiration (référence), rebond, tremblement, flottement ; les jambes ne suivent que les déplacements.
    const br = Math.sin(s * 1.6) * 1.5 * k, tr = o.tremble * k;
    const dx = (p.ondule ? Math.sin(s * 1.1) * p.ondule * k : 0) + Math.sin(t * 0.055) * tr;
    const dy = (p.flotte ? -(Math.sin(s * 0.9) + 1) * p.flotte * k : 0) - Math.abs(Math.sin(s * 3.2)) * o.bounce * k + saut + Math.cos(t * 0.047) * tr * 0.4;
    const tout = Math.abs(dx) + Math.abs(dy) > 0.004 ? `translate(${f2(dx)} ${f2(dy)}) ` : '';
    const pench = Math.abs(o.lean) > 0.02 ? ` rotate(${f2(o.lean)} 120 354)` : '';
    e.body.setAttribute('transform', `${tout}translate(0 ${f2(o.bodyY - br * 0.6)})${pench}`);
    if (e.legs) e.legs.setAttribute('transform', tout.trim());
    // Tête : pose de l'expression + balancement + léger mouvement pendant la parole + geste ponctuel.
    const hr = o.headR + Math.sin(s * 1.3) * o.sway * k + Math.sin(s * 2.1) * 1.3 * this.talk * k;
    const hy = o.headY + gy + Math.sin(s * 4.2) * 0.9 * this.talk * k, hx = o.headX + gx;
    e.head.setAttribute('transform', `translate(${f2(hx)} ${f2(hy)}) rotate(${f2(hr)} ${this.cou[0]} ${this.cou[1]})`);
    // Bras : épaule et coude de l'expression + balancement pendant la parole (référence) + geste ; « pas » = mouvement saccadé.
    const cran = (a) => (p.pas ? Math.round(a / p.pas) * p.pas : a), base = `${tout}translate(0 ${f2(o.bodyY)})${pench} `;
    const g = t < this.gesteFin ? Math.sin(Math.PI * (1 - (this.gesteFin - t) / 700)) * (this.rich ? 42 : 24) * k : 0;
    const amp = 10 * this.talk * k * p.amplitude * o.swing;
    const epL = o.armL + (24 - o.armL) * salut, coL = o.foreL + (agite - 204 - o.foreL) * salut; // « coucou » : avant-bras gauche levé, main agitée
    const aL = epL + cran(Math.sin(s * 3.1) * amp + (this.gesteBras < 0 ? g : 0));
    const aR = -o.armR + cran(-Math.sin(s * 2.7 + 1) * amp - (this.gesteBras > 0 ? g : 0));
    e.armL.setAttribute('transform', `${base}rotate(${f2(aL)} ${this.pivL[0]} ${this.pivL[1]})`);
    e.armR.setAttribute('transform', `${base}rotate(${f2(aR)} ${this.pivR[0]} ${this.pivR[1]})`);
    const fL = coL + cran(Math.sin(s * 3.7 + 2) * amp * 0.7 + (this.gesteBras < 0 ? g * 0.9 : 0));
    const fR = -o.foreR + cran(-Math.sin(s * 3.3) * amp * 0.7 - (this.gesteBras > 0 ? g * 0.9 : 0));
    e.foreL.setAttribute('transform', `rotate(${f2(fL)} ${this.coudeL[0]} ${this.coudeL[1]})`);
    e.foreR.setAttribute('transform', `rotate(${f2(fR)} ${this.coudeR[0]} ${this.coudeR[1]})`);
    // Bouche : la hauteur suit le niveau de lip-sync, l'expression fixe un minimum, une largeur et un décalage.
    const h = Math.max(VIS[this.viseme], o.h), w = o.w * (this.rich ? BOUCHES[this.shape] / 48 : 1), m = e.mouth;
    m.setAttribute('height', f2(h)); m.setAttribute('y', f2(165.5 + o.my - h / 2)); m.setAttribute('rx', f2(Math.min(h / 2, 6)));
    m.setAttribute('width', f2(w)); m.setAttribute('x', f2(120 - w / 2));
    // Yeux : rayon et ouverture selon l'expression, regard, clignement par écrasement vertical autour du centre.
    const sy = t < this.blinkUntil ? 0.15 : o.lid, rx = o.gx + this.regard[0], ry = o.gy + this.regard[1], y = this.yeuxY;
    const vers = `translate(${f2(rx)} ${f2(ry)})`;
    for (const eye of [e.eyeL, e.eyeR]) {
      eye.setAttribute('r', f2(o.r));
      eye.setAttribute('transform', sy > 0.995 ? vers : `${vers} translate(0 ${y}) scale(1 ${f2(sy)}) translate(0 ${-y})`);
    }
    for (const r of this.reflets) { r.setAttribute('transform', vers); r.setAttribute('opacity', sy > 0.6 ? '1' : '0'); }
    // Sourcils : hauteur de chacun + inclinaison symétrique (positive = triste, négative = fâché).
    e.browL.setAttribute('transform', `translate(0 ${f2(o.browL)}) rotate(${f2(-o.rot)} 92 104)`);
    e.browR.setAttribute('transform', `translate(0 ${f2(o.browR)}) rotate(${f2(o.rot)} 148 104)`);
  }
}
