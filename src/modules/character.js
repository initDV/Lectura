// @ts-check
// character.js : animation du robot (code de référence B3, étendu sans le contourner).
// Référence conservée : hauteurs de bouche VIS, respiration, balancement des bras, clignement, expressions de base.
// Ajouts : style de mouvement par personnage (fiche JSON), gestes, expressions Pro, forme de bouche (Pro).
const VIS = [5, 9, 14, 19]; // hauteur de la bouche par niveau de lip-sync (0 = fermé)

/** r = rayon des yeux, brow = décalage des sourcils, h = hauteur minimale de la bouche, rot = inclinaison des sourcils. */
export const EXPRESSIONS = {
  neutre: {},
  content: { h: 8 },
  concentre: { r: 8, brow: 5 },
  surpris: { r: 14, brow: -5, h: 12 },
  sceptique: { r: 10, browL: -6, browR: 3 },   // Pro : un sourcil levé
  fatigue: { r: 10, brow: 4, paupiere: 0.45 }, // Pro : yeux mi-clos
  triste: { brow: 2, rot: 16 },                // Pro : sourcils tombants
};

/** Styles de mouvement : v = vitesse, a = amplitude des bras, pas = saccade (degrés), flotte / ondule = déplacement (px). */
export const STYLES = {
  fluide: { v: 1, a: 1 }, saccade: { v: 1, a: 1, pas: 5 }, sec: { v: 1.5, a: 0.8 }, frappe: { v: 2.4, a: 0.5 },
  flottant: { v: 0.5, a: 0.8, flotte: 5 }, ondulant: { v: 0.6, a: 1, ondule: 3 }, calme: { v: 0.7, a: 1.2 }, expressif: { v: 1.2, a: 1.5 },
};

export function motionParams(m = {}) {
  const s = STYLES[m.style] || STYLES.fluide;
  return { vitesse: (m.vitesseIdle ?? 1) * s.v, amplitude: (m.amplitudeBras ?? 1) * s.a, pas: s.pas || 0, flotte: s.flotte || 0, ondule: s.ondule || 0 };
}

const BOUCHES = { normal: 48, large: 58, rond: 32 }; // largeur de la bouche (Pro : lip-sync par bandes)

export class Character {
  /** @param {SVGSVGElement} svg @param {any} [def] fiche JSON du personnage */
  constructor(svg, def = {}) {
    const q = (s) => svg.querySelector(s);
    this.svgEl = svg;
    this.el = { body: q('#body'), armL: q('#arm-l'), armR: q('#arm-r'), mouth: q('#mouth'),
      eyeL: q('#eye-l'), eyeR: q('#eye-r'), browL: q('#brow-l'), browR: q('#brow-r'), legs: q('#legs') };
    // Reflets des yeux (petits cercles sans id placés après les yeux) : masqués pendant le clignement.
    this.reflets = [...svg.querySelectorAll('#eye-l ~ circle:not([id]), #eye-r ~ circle:not([id])')].filter((c) => +c.getAttribute('r') <= 4);
    this.expr = 'neutre'; this.viseme = 0; this.talk = 0; this.blinkUntil = 0; this.nextBlink = 2000;
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mp = motionParams(def.mouvements);
    const pv = def.pivots || {};
    this.pivL = pv.epaule_g || [34, 224]; this.pivR = pv.epaule_d || [208, 224];
    this.gain = 1; this.rich = false; this.shape = 'normal'; this.gesteFin = 0; this.gesteBras = 1; this.raf = 0;
  }
  setExpression(n) { this.expr = EXPRESSIONS[n] ? n : 'neutre'; }   // neutre | content | concentre | surpris (+ Pro)
  setViseme(l) { this.viseme = Math.max(0, Math.min(3, l | 0)); }
  setTalking(v) { this.talk = Math.max(0, Math.min(1, v)); }
  setMouthShape(shape) { this.shape = BOUCHES[shape] ? shape : 'normal'; } // Pro : 'normal' | 'large' | 'rond'
  setReduced(v) { this.reduce = !!v; }
  setGain(g) { this.gain = g; }                                     // réglage « mouvements » du projet
  setRich(v) { this.rich = !!v; }                                   // Pro : gestes plus amples
  /** Petit geste du bras (mot-clé important). */
  gesture(t = performance.now()) { this.gesteFin = t + 700; this.gesteBras = this.gesteBras === 1 ? -1 : 1; }
  start() { const loop = (t) => { this.tick(t); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); }

  tick(t) {
    const p = this.mp, s = (t / 1000) * p.vitesse, k = (this.reduce ? 0.25 : 1) * this.gain, e = this.el, x = EXPRESSIONS[this.expr];
    if (t > this.nextBlink) { this.blinkUntil = t + 120; this.nextBlink = t + 2500 + Math.random() * 3000; }
    const br = Math.sin(s * 1.6) * 1.5 * k;
    const dx = p.ondule ? Math.sin(s * 1.1) * p.ondule * k : 0, dy = p.flotte ? -(Math.sin(s * 0.9) + 1) * p.flotte * k : 0;
    const base = dx || dy ? `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) ` : '';
    e.body.setAttribute('transform', `translate(${dx.toFixed(2)} ${(dy - br * 0.6).toFixed(2)})`);
    if (e.legs && (p.flotte || p.ondule)) e.legs.setAttribute('transform', base.trim());
    // Bras : balancement pendant la parole (référence) + geste ponctuel ; « pas » donne un mouvement saccadé.
    const cran = (a) => (p.pas ? Math.round(a / p.pas) * p.pas : a);
    const g = t < this.gesteFin ? Math.sin(Math.PI * (1 - (this.gesteFin - t) / 700)) * (this.rich ? 42 : 24) * k : 0;
    const aL = cran(Math.sin(s * 3.1) * 10 * this.talk * k * p.amplitude + (this.gesteBras < 0 ? g : 0));
    const aR = cran(-Math.sin(s * 2.7 + 1) * 10 * this.talk * k * p.amplitude - (this.gesteBras > 0 ? g : 0));
    e.armL.setAttribute('transform', `${base}rotate(${aL.toFixed(2)} ${this.pivL[0]} ${this.pivL[1]})`);
    e.armR.setAttribute('transform', `${base}rotate(${aR.toFixed(2)} ${this.pivR[0]} ${this.pivR[1]})`);
    // Bouche : la hauteur suit le niveau de lip-sync, l'expression fixe un minimum.
    const h = Math.max(VIS[this.viseme], x.h || 0), w = this.rich ? BOUCHES[this.shape] : 48, m = e.mouth;
    m.setAttribute('height', h); m.setAttribute('y', 165.5 - h / 2); m.setAttribute('rx', Math.min(h / 2, 6));
    m.setAttribute('width', w); m.setAttribute('x', 120 - w / 2);
    // Yeux : rayon selon l'expression, clignement par écrasement vertical autour de y = 129.
    const blink = t < this.blinkUntil, sy = blink ? 0.15 : x.paupiere || 1;
    for (const eye of [e.eyeL, e.eyeR]) {
      eye.setAttribute('r', x.r || 11);
      eye.setAttribute('transform', sy === 1 ? '' : `translate(0 129) scale(1 ${sy}) translate(0 -129)`);
    }
    for (const r of this.reflets) r.setAttribute('opacity', sy === 1 ? '1' : '0');
    const rot = x.rot || 0;
    e.browL.setAttribute('transform', `translate(0 ${x.browL ?? x.brow ?? 0})${rot ? ` rotate(${-rot} 92 104)` : ''}`);
    e.browR.setAttribute('transform', `translate(0 ${x.browR ?? x.brow ?? 0})${rot ? ` rotate(${rot} 148 104)` : ''}`);
  }
}
