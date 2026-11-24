// Mise en scène du Robot Lectura. Les repères sont des millisecondes de la source,
// pas des événements déclenchés par le nombre d'images ni les secondes du film de démonstration.
import { premierHoraire } from './horaire.js';
import { typeLigne } from './timeline.js';

const QUESTION = /\?[!?…]*[\s»”'’"\])}*_`]*$/u;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => { const x = clamp(v); return x * x * x * (10 + x * (-15 + 6 * x)); };
const rise = (t, a, b) => ease((t - a) / (b - a));
const pulse = (t, a, b, c, d) => rise(t, a, b) * (1 - rise(t, c, d));
const phase = (t, p) => p ? clamp((t - p[0]) / (p[1] - p[0])) : 0;
export const ROBOT_RIG = {
  x: [86, 152], hip: 354, knee: 424, ankle: 528, stride: 38,
  box: [-32, -6, 382, 588], clockBox: [-24, -6, 409, 588],
};
const SALUT_MS = 1430;

/** Une entrée, le premier horaire, la première question et la sortie. Les lignes muettes et poses imposées sont exclues. */
export function planRobot(segments, duration) {
  const spans = segments.map((s) => {
    const start = clamp(s.debutMs, 0, duration), end = clamp(s.finMs, start, duration);
    const speechEnd = clamp(s.speechEndMs ?? end, start, end);
    const spoken = typeLigne(s.texte) === 'parle' && (!s.type || s.type === 'parle') && /[\p{L}\p{N}]/u.test(s.texte);
    return { ...s, start, end, speechEnd, ok: spoken && speechEnd > start && (!s.expression || s.expression === 'auto') };
  });
  const first = spans.find((s) => s.ok);
  if (!first) return null;
  const question = spans.find((s) => s.ok && QUESTION.test(s.texte));
  const q = question ? [question.speechEnd - Math.min(640, (question.speechEnd - question.start) * .57), question.end] : null;
  let h = null, label = '', hourSpan;
  for (const s of spans) {
    if (!s.ok) continue;
    const time = premierHoraire(s.texte);
    if (!time) continue;
    const length = s.speechEnd - s.start;
    // PCM agrégé sans alignement par mot : estimation locale à la phrase, jamais à la durée totale.
    const at = (i) => s.start + length * i / s.texte.length;
    const begin = Math.max(s.start, at(time.index) - 340);
    const end = Math.min(s.end, at(time.index + time.length) + 230, begin + 1150);
    if (q && s === question) q[0] = Math.min(q[1] - (q[1] - s.start) * .28, Math.max(q[0], end));
    h = [begin, q && s === question ? Math.min(q[0], end) : end];
    if (h[1] <= h[0]) h = [s.start, q && s === question ? q[0] : end];
    if (h[1] > h[0]) { label = time.label; hourSpan = s; }
    else h = null;
    break;
  }
  // Laisse une place aux deux appuis avant d'enchaîner le geste de la main ou de la tête.
  const cap = Math.min(first.end, first === hourSpan && h ? h[0] : Infinity, first === question ? q[0] : Infinity);
  const pas = cap - first.start >= 180 ? [first.start + Math.min(80, (cap - first.start) * .065), Math.min(cap, first.start + 1300)] : null;
  // Après la parole, réutilise la marge du moteur s'il en a une. Les audios importés ne sont ni réécrits ni recadrés.
  const last = spans.at(-1);
  const start = last.ok && last.speechEndMs != null ? Math.max(last.speechEnd, q?.[1] || 0, h?.[1] || 0) : duration;
  const salut = last.ok ? [start, start + SALUT_MS] : null;
  return { pas, h, q, salut, label, end: Math.max(duration, salut?.[1] || 0) };
}

/** Pose articulée issue du prototype : appuis alternés et genou résolu sur deux longueurs constantes. */
export function poseRobot(plan, ms, accents = true) {
  const R = ROBOT_RIG, t = Math.max(0, ms) / 1000, u = phase(ms, plan.pas);
  const h = accents ? phase(ms, plan.h) : 0, q = accents ? phase(ms, plan.q) : 0, s = accents ? phase(ms, plan.salut) : 0;
  const present = pulse(h, .07, .37, .55, 1), back = pulse(h, 0, .09, .13, .24), look = pulse(h, 0, .23, .64, .97);
  const ask = pulse(q, 0, .40, .59, 1), salute = pulse(s, 0, .41, .57, 1), bow = pulse(s, .12, .49, .60, .95);
  const transfer = pulse(u, .03, .30, .72, .99), breath = .5 - .5 * Math.cos(2 * Math.PI * t / 3.6);
  const x = -7 * rise(u, 0, .18) + 25 * rise(u, .19, .49) + 20 * rise(u, .49, .93);
  const bend = 1.3 * breath + 4.4 * transfer + 2.5 * ask + 3.8 * bow;
  const tilt = .9 * Math.sin(t * 1.22) - 1.8 * transfer + 3 * present - 6.2 * ask + 3.2 * bow;
  const rad = tilt * Math.PI / 180, up = R.knee - R.hip, low = R.ankle - R.knee;
  const feet = R.x.map((base, i) => {
    const a = i ? .18 : .59, b = i ? .51 : .93, f = clamp((u - a) / (b - a));
    const lift = f > 0 && f < 1 ? (i ? 19 : 15) * Math.sin(Math.PI * f) ** 2 : 0;
    const hx = 120 + x + (base - 120) * Math.cos(rad), hy = R.hip + (base - 120) * Math.sin(rad);
    const fx = base + R.stride * ease(f), fy = R.ankle - lift;
    return { hx, hy, fx, fy, lift, reach: fy - hy - Math.sqrt((up + low) ** 2 - (fx - hx) ** 2) };
  });
  const y = Math.max(bend, ...feet.map((f) => f.reach)) + .05 * transfer;
  const deg = 180 / Math.PI;
  const legs = feet.map(({ hx, hy, fx, fy, lift }, i) => {
    hy += y;
    const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
    const along = (up ** 2 - low ** 2 + d ** 2) / (2 * d), perp = (i ? 1 : -1) * Math.sqrt(Math.max(0, up ** 2 - along ** 2));
    const kx = hx + (along * dx + perp * dy) / d, ky = hy + (along * dy - perp * dx) / d;
    return { hx, hy, kx, ky, fx, fy, lift, thigh: Math.atan2(hx - kx, ky - hy) * deg, shin: Math.atan2(kx - fx, fy - ky) * deg };
  });
  const swing = (feet[0].lift - feet[1].lift) / 19;
  return { x, y, tilt, legs, blend: accents ? Math.max(pulse(u, 0, .18, .86, 1), present, back, look, ask, salute, bow) : 0,
    head: 1.15 * Math.sin(t * 1.70) + 4.5 * look - 5.1 * ask - 3.6 * bow,
    nod: 1 - .058 * ask - .110 * bow, drop: -.9 * breath + 2.4 * ask + 3.3 * bow,
    armL: 2 + 7 * swing + 9 * ask + 4 * present, foreL: 2 - 7 * swing + 10 * ask + 3 * present,
    armR: -2 - 54 * present + 9 * back + 36 * salute - 6 * swing, foreR: -2 - 52 * present + 75 * salute + 8 * swing,
    gazeX: 4.5 * look - 2.9 * ask, gazeY: 1.4 * look + 1.7 * bow, brow: -5.3 * ask - 1.5 * look,
    antenna: .9 * Math.sin(t * 2.1) - 2.2 * present + 3.9 * bow, clock: pulse(h, 0, .18, .80, 1),
  };
}

// Chiffres vectoriels : même tracé dans les deux moteurs SVG, même sans polices (ou en export vidéo).
export const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
export const SEGMENTS = { a: 'M0 0h16', b: 'M16 0v16', c: 'M16 19v16', d: 'M16 35H0', e: 'M0 35V19', f: 'M0 16V0', g: 'M0 17.5h16' };
export const DIGIT_X = [258, 283, 317, 342], DIGIT_Y = 143;
export function cadran(label) {
  return [...label.replace(':', '')].map((d, i) => [...DIGITS[+d]].map((s) => ({ x: DIGIT_X[i], d: SEGMENTS[s] }))).flat();
}
