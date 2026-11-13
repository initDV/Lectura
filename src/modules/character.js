// @ts-check
// Animation du personnage : idle (respiration), parole (gestes), expressions, clignement, visèmes.
// Base = code de référence B3. Ajouts pilotés par le JSON du personnage (aucun code à modifier pour
// ajouter un personnage) : pivots, visière, posture, style de mouvement, expressions et gestes Pro.
const $ = (r, s) => r.querySelector(s);
const VISEMES = [6, 10, 15, 22]; // hauteur de visière par niveau (0 = fermé)

/** Expressions : toutes passent par la visière (B5). Les trois dernières sont réservées à Pro. */
export const EXPRESSIONS = {
  neutre: { w: 52, h: 14, rot: 0 },
  content: { sourire: true },
  concentre: { w: 46, h: 8, rot: -4 },
  surpris: { w: 40, h: 22, rot: 0 },
  sceptique: { w: 46, h: 10, rot: 7 },
  fatigue: { w: 52, h: 5, rot: 0, dy: 3 },
  triste: { w: 38, h: 8, rot: 0, dy: 4 },
};

/** Styles de mouvement (champ "mouvements.style" du JSON). Chaque valeur peut être surchargée dans le JSON. */
export const STYLES = {
  fluide: {},
  saccade: { paliers: 7 }, // animation par paliers (robot)
  sec: { courbe: 0.4, vitesseGestes: 1.5 }, // gestes secs et rapides
  frappe: { vitesseGestes: 2.6, amplitudeBras: 0.45, amplitudeTete: 0.5 }, // frappe au clavier
  flottant: { vitesseIdle: 0.55, vitesseGestes: 0.6, flottement: 7, ondulation: 1.5 },
  ondulant: { vitesseIdle: 0.7, vitesseGestes: 0.65, ondulation: 3.5 },
  calme: { vitesseGestes: 0.7, amplitudeBras: 1.3 },
  expressif: { vitesseGestes: 1.15, amplitudeBras: 1.5, amplitudeTete: 1.4 },
};
const NEUTRE = { vitesseIdle: 1, vitesseGestes: 1, amplitudeBras: 1, amplitudeTete: 1, paliers: 0, courbe: 1, flottement: 0, ondulation: 0 };

export function motionParams(mouvements = {}) {
  const st = STYLES[mouvements.style] || {}, m = { ...NEUTRE, ...st };
  for (const k of Object.keys(NEUTRE)) {
    if (!Number.isFinite(mouvements[k])) continue;
    // vitesseIdle et amplitudeBras multiplient le style ; les autres valeurs le remplacent
    m[k] = k === 'vitesseIdle' || k === 'amplitudeBras' ? (st[k] ?? 1) * mouvements[k] : mouvements[k];
  }
  return m;
}

export class Character {
  constructor(svg, def = {}) {
    this.svg = svg; this.def = def;
    this.el = {
      root: $(svg, '#char'), head: $(svg, '#head'), visor: $(svg, '#visor'), smile: $(svg, '#visor-happy'), torso: $(svg, '#torso'),
      armL: $(svg, '#arm-l'), armR: $(svg, '#arm-r'), legL: $(svg, '#leg-l'), legR: $(svg, '#leg-r'),
    };
    const pv = def.pivots || {}, vis = def.visiere || {};
    this.piv = { eg: pv.epaule_g || [115, 122], ed: pv.epaule_d || [185, 122], cou: pv.cou || [150, 95], hg: pv.hanche_g || [135, 200], hd: pv.hanche_d || [165, 200] };
    this.vis = { cx: vis.centre?.[0] ?? 150, cy: vis.centre?.[1] ?? 54, sw: (vis.largeur ?? 52) / 52, sh: (vis.hauteur ?? 14) / 14 };
    this.m = motionParams(def.mouvements);
    this.lean = def.posture?.inclinaison || 0;
    this.rest = def.posture?.brasRepos || [-35, 35];
    this.expr = 'neutre'; this.viseme = 0; this.talk = 0; this.talkS = 0; this.raf = 0; this.shape = 'normal';
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gain = 1; this.rich = false; this.gestStart = -1e9; this.gestDur = 900;
    this.blinkUntil = 0; this.nextBlink = 2500;
    this.pose = { armL: this.rest[0], armR: this.rest[1], headDy: 0, headRot: 0, torsoDy: 0, visor: { x: 124, y: 47, w: 52, h: 14, rx: 7 }, expr: 'neutre' };
    this.applyVisor();
  }
  setExpression(name) { this.expr = EXPRESSIONS[name] ? name : 'neutre'; this.applyVisor(); }  // neutre | content | concentre | surpris (+ Pro)
  setViseme(level) { this.viseme = Math.max(0, Math.min(3, level | 0)); this.applyVisor(); }
  setTalking(v) { this.talk = Math.max(0, Math.min(1, v)); }          // intensité des gestes 0..1
  setMouthShape(shape) { this.shape = shape; }                         // Pro : 'normal' | 'large' | 'rond'
  setReduced(v) { this.reduce = !!v; }
  setGain(g) { this.gain = g; }                                        // réglage « mouvements » du projet
  setRich(v) { this.rich = !!v; }                                      // Pro : gestes riches
  gesture() { if (this.rich) this.gestStart = performance.now(); }     // Pro : geste d'appui (montre le terminal)
  applyVisor() {
    const { visor, smile } = this.el, { cx, cy, sw, sh } = this.vis;
    const e = EXPRESSIONS[this.expr] || EXPRESSIONS.neutre;
    const happy = !!e.sourire && !!smile;
    if (smile) smile.style.display = happy ? '' : 'none';
    visor.style.display = happy ? 'none' : '';
    this.pose.expr = happy ? 'content' : this.expr;
    if (happy) return;
    let h = (e.h ?? 14) * sh, w = (e.w ?? 52) * sw;
    const rot = e.rot || 0;
    if (this.viseme > 0 && this.expr !== 'surpris') h = Math.max(h, VISEMES[this.viseme] * sh);
    if (this.viseme > 0 && this.shape === 'large') { w *= 1.12; h *= 0.72; }
    if (this.viseme > 0 && this.shape === 'rond') w *= 0.86;
    if (performance.now() < this.blinkUntil) h = 3;
    const rx = Math.min(h / 2, 11), x = cx - w / 2, y = cy + (e.dy || 0) * sh - h / 2;
    visor.setAttribute('x', x); visor.setAttribute('y', y);
    visor.setAttribute('width', w); visor.setAttribute('height', h); visor.setAttribute('rx', rx);
    visor.setAttribute('transform', `rotate(${rot} ${cx} ${cy})`);
    this.pose.visor = { x, y, w, h, rx, rot };
  }
  start() {
    this.stop();
    const loop = (t) => { this.tick(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); }
  tick(t) {
    const m = this.m, k = (this.reduce ? 0.25 : 1) * this.gain;
    this.talkS += (this.talk - this.talkS) * 0.18; // lissage : évite les à-coups quand la parole démarre / s'arrête
    const s = t / 1000, si = s * m.vitesseIdle, talk = this.talkS;
    let sg = s * m.vitesseGestes;
    if (m.paliers > 0) sg = Math.floor(sg * m.paliers) / m.paliers;
    const wave = (x) => { const v = Math.sin(x); return m.courbe === 1 ? v : Math.sign(v) * Math.abs(v) ** m.courbe; };
    if (t > this.nextBlink) { this.blinkUntil = t + 110; this.nextBlink = t + 2500 + Math.random() * 3000; }
    const breathe = Math.sin(si * 1.6) * 1.2 * k;
    let nod = wave(sg * 5.2) * 2.5 * talk * k * m.amplitudeTete;
    let swingL = wave(sg * 3.1) * 14 * talk * k * m.amplitudeBras;
    const swingR = wave(sg * 2.7 + 1.3) * 10 * talk * k * m.amplitudeBras;
    const p = this.pose;
    p.torsoDy = -breathe * 0.5; p.headDy = -breathe;
    if (this.rich) { nod += Math.sin(si * 0.7) * 1.6 * k; swingL += wave(sg * 6.2) * 4 * talk * k; }
    p.headRot = nod;
    p.armL = this.rest[0] - 4 * Math.sin(si * 1.6) * k + swingL;   // bras gauche : repos vers le bas (angle négatif)
    p.armR = this.rest[1] + 4 * Math.sin(si * 1.6 + 0.5) * k - swingR; // bras droit : repos vers le bas (angle positif)
    const g = (t - this.gestStart) / this.gestDur; // Pro : geste d'appui, bras droit levé vers le terminal
    if (g >= 0 && g <= 1) { const a = Math.sin(Math.PI * g) * Math.min(1, k); p.armR += (-22 - p.armR) * a; p.headRot += 3 * a; }
    p.bodyDy = Math.sin(si * 0.9) * m.flottement * k;
    p.bodyRot = Math.sin(si * 1.1) * m.ondulation * k;
    p.leg = m.ondulation ? Math.sin(si * 1.1 + 1.2) * m.ondulation * 0.7 * k : 0;
    p.lean = this.lean;
    const set = (el, v) => el && el.setAttribute('transform', v);
    const { eg, ed, cou, hg, hd } = this.piv;
    const up = this.lean ? `rotate(${this.lean} 150 215) ` : ''; // posture voûtée : buste incliné autour du bassin
    set(this.el.torso, `${up}translate(0 ${p.torsoDy.toFixed(2)})`);
    set(this.el.head, `${up}translate(0 ${p.headDy.toFixed(2)}) rotate(${p.headRot.toFixed(2)} ${cou[0]} ${cou[1]})`);
    set(this.el.armL, `${up}rotate(${p.armL.toFixed(2)} ${eg[0]} ${eg[1]})`);
    set(this.el.armR, `${up}rotate(${p.armR.toFixed(2)} ${ed[0]} ${ed[1]})`);
    if (m.flottement || m.ondulation) {
      set(this.el.root, `translate(0 ${p.bodyDy.toFixed(2)}) rotate(${p.bodyRot.toFixed(2)} 150 350)`);
      set(this.el.legL, `rotate(${p.leg.toFixed(2)} ${hg[0]} ${hg[1]})`);
      set(this.el.legR, `rotate(${(-p.leg).toFixed(2)} ${hd[0]} ${hd[1]})`);
    }
    this.applyVisor(); // met aussi à jour le clignement
  }
  getPose() { return this.pose; } // utilisé par l'export vidéo (canvas)
}
