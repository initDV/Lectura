import { ecrire } from '../svg.js';
import { bound, focale, HORIZON, interp, smooth, SOL } from './math.js';

const rad = (a) => (a * Math.PI) / 180;
const f = (n) => Number(n.toFixed(3));
const pt = (x, y, z = 0) => ({ x, y, z });
const add = (a, b) => pt(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => pt(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (p, s) => pt(p.x * s, p.y * s, p.z * s);
const blend = (a, b, s) => add(a, scale(sub(b, a), s));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (p) => Math.hypot(p.x, p.y, p.z);
const unit = (p) => scale(p, 1 / (len(p) || 1));
const xy = (p) => `${f(p.x)} ${f(p.y)}`;
const localMirror = (p) => pt(-p.x, p.y, p.z);
const camera = (p) => {
  const k = focale(p.z);
  return pt(p.x * k, HORIZON + (p.y - HORIZON) * k);
};
function rot(p, a, o = pt(0, 0)) {
  if (!a) return p;
  const x = p.x - o.x,
    y = p.y - o.y,
    r = rad(a),
    c = Math.cos(r),
    s = Math.sin(r);
  return pt(o.x + x * c - y * s, o.y + x * s + y * c, p.z);
}
const pitch = (a, roll) => {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a));
  return p => rot(pt(p.x, p.y * c + p.z * s, p.z * c - p.y * s), roll);
};
function attrs(node, attr) {
  for (const [k, v] of Object.entries(attr)) ecrire(node, k, typeof v === 'number' ? f(v) : v);
}
const turn = (a, p) => `rotate(${f(a)} ${xy(p)})`;
const move = (p) => `translate(${xy(p)})`;
const resize = (x, y) => `scale(${f(x)} ${f(y)})`;

function samplePath(d) {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/g) || [];
  const paths = [];
  let c = 0,
    p = pt(0, 0);
  function pair() {
    const r = pt(+tokens[c++], +tokens[c++]);
    if (!Number.isFinite(r.x + r.y)) throw Error('Point invalide');
    return r;
  }
  while (c < tokens.length) {
    const op = tokens[c++];
    if (op === 'M') {
      p = pair();
      paths.push({ points: [p], closed: false });
      continue;
    }
    const path = paths.at(-1);
    if (op === 'Z') {
      path.closed = true;
      continue;
    }
    if (op !== 'L' && op !== 'Q') throw Error('Tracé de membre non reconnu : ' + op);
    const q = pair(),
      r = op === 'Q' ? pair() : q;
    const n = Math.max(1, Math.ceil((len(sub(q, p)) + (op === 'Q' ? len(sub(r, q)) : 0)) / 2.5));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      path.points.push(op === 'Q' ? blend(blend(p, q, u), blend(q, r, u), u) : blend(p, r, u));
    }
    p = r;
  }
  return paths;
}
const mapPath = (paths, map) =>
  paths
    .map(({ points, closed }) => `M${points.map((p) => xy(map(p))).join(' ')}${closed ? 'Z' : ''}`)
    .join(' ');
function boneMap(a, b, A, B, width = 1) {
  const v = pt(b.x - a.x, b.y - a.y),
    l = len(v),
    dir = unit(v),
    normal = pt(-dir.y, dir.x);
  const delta = sub(B, A),
    u = unit(delta),
    n = pt(-u.y, u.x);
  return (p) => {
    const w = pt(p.x - a.x, p.y - a.y);
    return add(A, add(scale(delta, dot(w, dir) / l), scale(n, dot(w, normal) * width)));
  };
}
function bend(a, b, c, A, B, C, r, width = 1) {
  const x = boneMap(a, b, A, B, width),
    y = boneMap(b, c, B, C, width),
    axis = unit(sub(c, a));
  return (p) => {
    const d = dot(sub(p, b), axis);
    if (d <= -r) return x(p);
    if (d >= r) return y(p);
    return blend(x(p), y(p), smooth(-r, r, d));
  };
}

const hipL = pt(-11.7, 85),
  kneeL = pt(-13.1, 159, 12.6),
  ankleL = pt(-10.25, 216);
const hipPivot = pt(0, 77),
  chestPivot = pt(0, 72),
  neckBase = pt(0, 28),
  skullBase = pt(0, 16.9);
const shoulder = pt(-22.5, 35),
  elbow = pt(-29.2, 70.5),
  wrist = pt(-33.1, 101.7);
const TALON = pt(0, 15, -8), POINTE = pt(0, 15, 12), BORD = pt(-6.75, 15, 12);
function articulation(A, C, ref, l, s) {
  const delta = sub(C, A), d = unit(delta);
  const normal = unit(sub(ref, scale(d, dot(ref, d))));
  const reach = bound(len(delta), Math.abs(l - s) + .001, l + s - .001);
  const u = (reach * reach + l * l - s * s) / (2 * reach);
  return add(add(A, scale(d, u)), scale(normal, Math.sqrt(Math.max(0, l * l - u * u))));
}
function solveLeg(side, ground, hipToWorld) {
  const m = side === 'l' ? p => p : localMirror;
  const a = m(hipL), b = m(kneeL), c = m(ankleL), A = hipToWorld(a);
  const tour = pitch(ground.pitch, ground.roll);
  const pivot = ground.roll ? BORD : ground.pitch > 0 ? POINTE : TALON;
  const contact = pt(c.x + ground.x + pivot.x, SOL - ground.lift, ground.z + pivot.z);
  const C = sub(contact, tour(pivot));
  const base = unit(sub(c, a)), ref = sub(b, a);
  const ahead = sub(ref, scale(base, dot(ref, base)));
  const l = len(ref), s = len(sub(c, b)), distance = len(sub(C, A));
  const B = articulation(A, C, ahead, l, s);
  const leg = bend(a, b, c, camera(A), camera(B), camera(C), 11, 1 + .55 * (focale(C.z) - 1));
  return {
    hip: A,
    knee: B,
    ankle: C,
    rest: c,
    heel: add(C, tour(TALON)), toe: add(C, tour(POINTE)),
    contact, ground,
    reachable: distance <= l + s && distance >= Math.abs(l - s),
    map: (p) => blend(camera(hipToWorld(p)), leg(p), smooth(88, 132, p.y)),
  };
}
export function jambesAicha(p) {
  const yaw = rad(p.lacet), c = Math.cos(yaw), s = Math.sin(yaw);
  const hipToWorld = (v) => {
    const { x, y } = rot(v, p.hip, hipPivot);
    return pt(p.weight + x * c, p.settle + y, x * s);
  };
  return [solveLeg('l', p.stepL, hipToWorld), solveLeg('r', p.stepR, hipToWorld)];
}

const couAu = (p, v) => add(rot(v, p.neck, neckBase), pt(.015 * p.yaw, -.31 * p.breath));
function repereTete(p, contact) {
  const yaw = rad(p.yaw), h = Math.abs(p.pitch), angle = p.tilt + .38 * p.neck;
  const origine = sub(couAu(p, skullBase), skullBase), haut = .132 * p.pitch;
  const sx = Math.cos(yaw), sy = 1 - .0041 * h;
  const visage = pt(2.36 * Math.sin(yaw) / .33, .12 * p.pitch);
  const rx = 1 - .059 * Math.abs(p.yaw) / 20, ry = 1 - .006 * h;
  if (contact) {
    const x = (visage.x - 10.5 * rx) * sx, y = (visage.y + (-6.12 + p.ajuste) * ry) * sy + haut;
    return add(origine, rot(pt(x, y), angle, skullBase));
  }
  return { origine, angle, haut, sx, sy, visage, rx, ry };
}

export function brasAicha(p, side) {
  const touche = side === 'L' ? p.lunettes : 0, pincement = -135;
  const angle = p['arm' + side], palm = p['open' + side], flex = rad(p['flex' + side]);
  const plane = Math.PI * p['fold' + side], balancier = side === 'L' ? p.balancier : -p.balancier;
  const S = add(shoulder, pt(-.74 * smooth(5, 43, angle), -1.75 * smooth(4, 39, angle) - .38 * p.breath, .1 * balancier));
  const upper = rot(sub(elbow, shoulder), angle), lower = rot(sub(wrist, elbow), angle);
  const project = (v, k, l) => pt(v.x * k, v.y * k, Math.sqrt(Math.max(0, l ** 2 - (v.x ** 2 + v.y ** 2) * k ** 2)));
  const swing = pitch(-balancier);
  const l = len(upper), s = len(lower);
  let E = add(S, swing(project(upper, 1 - .034 * palm, l)));
  const v = add(scale(lower, Math.cos(flex)), scale(rot(lower, 90), Math.sin(flex) * Math.cos(plane) * (1 - p.marche)));
  const k = 1 - .12 * palm - .17 * smooth(16, 34, -v.x);
  let W = add(E, swing(project(v, k, s)));
  if (touche) {
    const bout = rot(pt(3.569, 13.489), pincement + p.wristL);
    const cible = { ...sub(repereTete(p, true), bout), z: 29 };
    const coude = articulation(S, cible, pt(-.85, .22, 1), l, s);
    const a = sub(W, E), b = sub(cible, coude);
    E = add(S, scale(unit(sub(blend(E, coude, touche), S)), l));
    const pli = interp(Math.atan2(a.z, a.y), Math.PI - Math.atan2(b.z, -b.y), touche);
    const x = interp(a.x, b.x, touche) + 10 * Math.sin(Math.PI * touche);
    const h = Math.sqrt(s * s - x * x);
    W = add(E, pt(x, h * Math.cos(pli), h * Math.sin(pli)));
  }
  const vue = (q) => camera(pt(q.x, q.y, q.z * p.marche));
  const e = vue(E), main = vue(W);
  const angleMain = Math.atan2(e.x - main.x, main.y - e.y) / rad(1);
  return { S, E, W, main, map: bend(shoulder, elbow, wrist, vue(S), e, main, 5.9), rot: interp(angleMain, pincement, smooth(.64, 1, touche)) };
}
const knuckles = [[-2.78, 7.15, 12.25, -4.2], [-.98, 7.73, 14.82, -1.65], [.84, 7.66, 15.33, .92], [2.5, 6.77, 13.54, 3.26]];
const strands = [pt(-10, -12), pt(-12, -8), pt(-13.5, -3)];
export function rigAicha(svg) {
  const nodes = new Map([...svg.querySelectorAll('[id]')].map((n) => [n.id, n]));
  const get = (id) => nodes.get(id);
  const set = (id, attr) => attrs(get(id), attr);
  const path = (id, d) => set(id, { d });
  const transform = (id, ...ts) => set(id, { transform: ts.join(' ') });
  const limbs = ['l', 'r'];
  const forMap = (parent) =>
    [...get(parent).querySelectorAll(':scope > path, :scope > g#liseres-r > path')].map((el) => ({
      el,
      p: samplePath(el.getAttribute('d')),
      flip: el.parentNode.id === 'liseres-r',
    }));
  const legs = forMap('pantalon');
  const sleeves = { l: forMap('bras-l'), r: forMap('bras-r') };
  const light = { l: get('bras-l').querySelector('ellipse'), r: get('bras-r').querySelector('ellipse') };
  set('aicha-sol', { display: 'inline', 'aria-hidden': 'true' });
  const head = get('tete'), mancheG = get('bras-l'), mainG = get('poignet-l');
  for (const side of limbs) head.before(get('bras-' + side));

  function drawEye(side, p) {
    const m = side === 'l' ? 1 : -1,
      b = side === 'l' ? p.blinkL : p.blinkR;
    const raise = p.inner * .57 + p.outer * .22 - p.focus * .24;
    const lower = p.smile * .68 + p.focus * .25;
    const topA = interp(-5.2 - raise, -1.14, b),
      topB = interp(-5 - raise, -.4, b),
      topC = interp(-4.8 - raise, .03, b);
    const lowA = interp(2.2 - lower, .06, b),
      lowB = interp(1.6 - lower, -.61, b);
    const upper = `M-10.6 -1.6 Q-8.6 ${f(topA)} -5.8 ${f(topB)} Q-3.38 ${f(topC)} -2.4 -.4`;
    const outline = `${upper} Q-4.6 ${f(lowA)} -7 ${f(lowA)} Q-9.6 ${f(lowB)} -10.6 -1.6Z`;
    path('blanc-' + side, outline);
    path('limite-' + side, outline);
    set('blanc-' + side, { opacity: 1 - smooth(.83, .99, b) });
    set('iris-' + side, {
      opacity: 1 - smooth(.79, .98, b),
      transform: move(pt(bound(p.gazeX * m, -1.8, 1.8), bound(p.gazeY, -1.04, 1.12))),
    });
    path(
      'ombre-paupiere-' + side,
      `${upper} Q-5 ${f(interp(-3.4 - raise * .6, -.18, b))} -6.4 ${f(interp(-3.6 - raise * .66, -.33, b))} Q-9 ${f(interp(-3.6 - raise * .6, -.98, b))} -10.6 -1.6Z`,
    );
    set('ombre-paupiere-' + side, { opacity: .14 * (1 - b) });
    path(
      'paupiere-haute-' + side,
      `M-10.9 -1.8 Q-8.6 ${f(topA - .52)} -5.8 ${f(topB - .45)} Q-3.2 ${f(topC - .31)} -2.2 -.4`,
    );
    set('paupiere-haute-' + side, { 'stroke-width': interp(1.36, 1.0, b) });
    path('cil-' + side, `M-10.9 -1.8 L-11.9 ${f(-2.5 + .37 * b)}`);
    path('paupiere-basse-' + side, `M-9.8 -.4 Q-7 ${f(lowA + .37)} -3.4 ${f(.6 - .32 * lower)}`);
    set('paupiere-basse-' + side, { opacity: 1 - smooth(.46, .93, b) });
    const liftOut = p.outer + .54 * p.asym * m,
      liftIn = p.inner + .21 * p.asym * m;
    const pull = .68 * p.focus;
    path(
      'sourcil-' + side,
      `M${f(-12 + .2 * pull)} ${f(-9 - 1.53 * liftOut + .2 * p.focus)} Q-7.22 ${f(-12 - 1.51 * liftOut - 1.42 * liftIn - .19 * p.focus)} ${f(-2.2 + pull)} ${f(-9.4 - 1.95 * liftIn + 1.19 * p.focus)}`,
    );
  }

  function drawMouth(p) {
    const [w, o, round, jaw, bite, tongue] = p.mouth;
    const joy = p.smile;
    const b = 4.78 * w + .61 * joy * (1 - round),
      lx = -b,
      rx = b;
    const core = 10.99 + jaw * .41 + .23 * round;
    const L = core - 1.04 * joy + .12 * p.focus + .32 * p.asym;
    const R = core - 1.15 * joy + .04 * p.focus - .46 * p.asym;
    const U = core - .43 * o,
      D = core + .62 * o;
    const b0 = interp(.55, .82, round),
      b1 = interp(.22, .36, round);
    const top = `C ${f(lx * b0)} ${f(U)} ${f(lx * b1)} ${f(U)} 0 ${f(U)} C ${f(rx * b1)} ${f(U)} ${f(rx * b0)} ${f(U)} ${f(rx)} ${f(R)}`;
    const lower = `C ${f(rx * b0)} ${f(D)} ${f(rx * b1)} ${f(D + .08)} 0 ${f(D)} C ${f(lx * b1)} ${f(D + .08)} ${f(lx * b0)} ${f(D)} ${f(lx)} ${f(L)}`;
    const op = `M${f(lx)} ${f(L)} ${top} ${lower} Z`;
    path('bord-bouche', op);
    path('cavite', op);
    set('cavite', { opacity: .6 + .4 * smooth(.01, .32, o) });
    path(
      'levre-haute',
      `M${f(rx)} ${f(R)} Q${f(rx * .61)} ${f(U - 1.02)} ${f(rx * .29)} ${f(U - .8)} Q0 ${f(U - 1.57 - .28 * round)} ${f(lx * .29)} ${f(U - .8)} Q${f(lx * .64)} ${f(U - .97)} ${f(lx)} ${f(L)} ${top}Z`,
    );
    path(
      'levre-basse',
      `M${f(rx)} ${f(R)} ${lower} Q${f(lx * .72)} ${f(D + 1.3)} 0 ${f(D + 1.71 - .23 * bite)} Q${f(rx * .72)} ${f(D + 1.3)} ${f(rx)} ${f(R)}Z`,
    );
    path(
      'dents',
      `M${f(lx * .88)} ${f(U - 1.16)} H${f(rx * .88)} Q${f(rx * .78)} ${f(U + .83 + .37 * bite)} ${f(rx * .5)} ${f(U + .91 + .55 * bite)} Q0 ${f(U + 1.02 + .57 * bite)} ${f(lx * .57)} ${f(U + .88 + .51 * bite)} Q${f(lx * .75)} ${f(U + .77 + .44 * bite)} ${f(lx * .88)} ${f(U - 1.16)}Z`,
    );
    set('dents', { opacity: bound(smooth(.18, 1.17, o) * (.72 - .28 * round) + .68 * bite) });
    path(
      'langue',
      `M${f(lx * .83)} ${f(D + .1)} Q${f(lx * .32)} ${f(D - .68 - .4 * tongue)} .19 ${f(D - .42 - .79 * tongue)} Q${f(rx * .49)} ${f(D - .58 - .3 * tongue)} ${f(rx * .83)} ${f(D + .1)} V${f(D + 2)} H${f(lx * .83)}Z`,
    );
    set('langue', { opacity: bound(smooth(.98, 2.83, o) * .62 + .52 * tongue) });
    path('reflet-levre', `M${f(lx * .24)} ${f(D + .92)} Q0 ${f(D + 1.26)} ${f(rx * .24)} ${f(D + .91)}`);
    const active = smooth(.035, .28, Math.max(joy * .78, o, .41 * bite, (1 - w) * 1.6));
    set('bouche', { opacity: active });
    set('levres-repos', { opacity: 1 - active });
    path(
      'visage-peau',
      `M-12.5 -4 Q-12.7 3 -10.5 8.5 Q-8.3 ${f(13.5 + .43 * jaw)} -4.2 ${f(16 + .81 * jaw)} Q-2 ${f(17.2 + jaw)} 0 ${f(17.2 + jaw)} Q2 ${f(17.2 + jaw)} 4.2 ${f(16 + .81 * jaw)} Q8.3 ${f(13.5 + .43 * jaw)} 10.5 8.5 Q12.7 3 12.5 -4 Q12.3 -16.5 0 -17 Q-12.3 -16.5 -12.5 -4 Z`,
    );
    path(
      'visage-ombre',
      `M3 -16.5 Q12.3 -16 12.5 -4 Q12.7 3 10.5 8.5 Q8.3 ${f(13.5 + .43 * jaw)} 4.2 ${f(16 + .81 * jaw)} Q2 ${f(17.2 + jaw)} 0 ${f(17.2 + jaw)} Q6 ${f(8 + .28 * jaw)} 4 -2Z`,
    );
  }

  function drawHand(side, arm, p) {
    const s = side.toUpperCase(), touche = side === 'l' ? p.lunettes : 0;
    const palmed = p['open' + s] + touche, index = p['index' + s] + smooth(.54, 1, touche);
    const radial = (side === 'l' ? .17 : .34) + .26 * (1 - palmed);
    transform('poignet-' + side, move(arm.main), turn(arm.rot + p['wrist' + s], pt(0, 0)));
    const facing = smooth(.18, .77, palmed);
    set('paume-' + side, { opacity: facing, transform: resize(interp(.68, 1, facing), 1) });
    set('profil-' + side, { opacity: 1 - facing, transform: resize(1 - .17 * facing, 1) });
    const bendThumb = radial * 1.24;
    path(
      'pouce-' + side,
      `M2.58 5.7 Q${f(5.12 - .55 * bendThumb)} 3.78 ${f(5.8 - .22 * bendThumb)} 6.79 Q${f(5.96 - .55 * bendThumb)} 8.19 ${f(5.53 - .94 * bendThumb)} ${f(9.78 - .9 * bendThumb)}`,
    );
    knuckles.forEach(([x, y, end, ox], i) => {
      const repos = radial + .055 * (3 - i);
      const curl = interp(repos, i === 3 ? .025 : .94, index);
      const loose = .37 + (1 - curl) * .63;
      const tip = ox * loose + (1 - curl) * Math.sign(ox) * .36,
        bottom = end - curl * (i < 2 ? 2.86 : 2.04) - (i === 3 ? 0 : 3.55 * index);
      path(
        `doigt-${side}-${i}`,
        `M${x} ${y} Q${f(interp(x, ox, .74))} ${f(interp(y, bottom, .56))} ${f(tip + .39 * curl)} ${f(bottom)}`,
      );
    });
  }

  function draw(p, t) {
    const pelvis = pt(p.weight, p.settle);
    const [L, R] = jambesAicha(p);
    const trousers = (v) => blend(L.map(v), R.map(v), smooth(-2.75, 2.75, v.x));
    for (const { el, p, flip } of legs)
      ecrire(el, 'd', mapPath(p, flip ? (v) => localMirror(trousers(localMirror(v))) : trousers));
    [L, R].forEach((v, i) => {
      const side = limbs[i];
      const A = camera(v.ankle), B = scale(sub(camera(v.toe), A), 1 / 15), k = focale(v.toe.z);
      const ombre = camera(pt(v.ankle.x, SOL + .6, .45 * v.toe.z + .55 * v.heel.z));
      const axe = rot(pt(k, 0), v.ground.roll);
      transform('chaussure-' + side, move(A), `matrix(${xy(axe)} ${xy(B)} 0 0)`, move(scale(v.rest, -1)));
      set('ombre-chaussure-' + side, { cx: ombre.x, cy: ombre.y, rx: 10.8 * k, opacity: .6 * Math.exp(-.095 * v.ground.lift) });
    });
    const bassin = get('bassin'), devant = get(L.toe.z > R.toe.z ? 'chaussure-l' : 'chaussure-r');
    if (bassin.previousElementSibling !== devant) svg.insertBefore(devant, bassin);
    set('ombre-appui', { cx: p.weight * .6 });
    transform('bassin', move(pelvis), turn(p.hip, hipPivot));
    transform('buste', move(pt(p.buste, 0)), turn(p.chest, chestPivot));
    transform(
      'sweat',
      'translate(0 72)',
      resize(1 + .0086 * p.breath, 1 + .0105 * p.breath),
      'translate(0 -72)',
    );
    const drift = f(p.lag * .7 + Math.sin(t * 2.83) * .16),
      endY = f(49 + Math.abs(drift) * .044);
    path(
      'cordons',
      `M-2.6 33 Q-2.68 41 ${f(-3 + drift)} ${endY} M2.6 33 Q2.8 41 ${f(3 + drift * .82)} ${f(endY + .08)}`,
    );
    set('embout-l', { cx: -3 + drift, cy: endY + .5 });
    set('embout-r', { cx: 3 + drift * .82, cy: endY + .55 });
    limbs.forEach((side) => {
      const s = side.toUpperCase(), arm = brasAicha(p, s);
      for (const { el, p: points } of sleeves[side]) ecrire(el, 'd', mapPath(points, arm.map));
      const base = pt(-25, 40), lit = arm.map(base);
      attrs(light[side], { transform: `${move(sub(lit, base))} ${turn(20 + p['arm' + s], base)}` });
      drawHand(side, arm, p);
    });
    const c = (x, y) => xy(couAu(p, pt(x, y)));
    path('cou', `M${c(-5.6, 9)} L${c(5.6, 9)} Q${c(5.4, 17)} ${c(6.4, 22)} Q8 26 12 29 L-12 29 Q-8 26 ${c(-6.4, 22)} Q${c(-5.4, 17)} ${c(-5.6, 9)}Z`);
    path('cou-ombre', `M${c(-5.5, 10)} L${c(5.5, 10)} Q${c(5.3, 16)} ${c(6, 20.65)} Q${c(1.1, 19.1 + .13 * p.pitch)} ${c(-6.2, 24)} Q${c(-5.6, 18)} ${c(-5.5, 10)}Z`);
    const { origine, angle, haut, sx, sy, visage, rx, ry } = repereTete(p);
    transform('tete', move(origine), turn(angle, skullBase), move(pt(0, haut)), resize(sx, sy));
    transform('plan-visage', move(visage), resize(rx, ry));
    transform('lunettes', move(pt(0, p.ajuste)));
    const calque = p.lunettes ? head.parentNode : mancheG;
    if (mainG.parentNode !== calque) calque.append(mainG);
    const cheek = p.smile;
    transform('joues', move(pt(.1 * p.asym, -.7 * cheek + .15 * p.focus)));
    set('front', {
      opacity: .33 * smooth(.3, 1.41, p.inner + .85 * p.outer),
      transform: move(pt(0, -.22 * p.inner)),
    });
    set('pli-concentration', { opacity: .46 * p.focus });
    limbs.forEach((side) => {
      const m = side === 'l' ? 1 : -1;
      strands.forEach((o, i) =>
        transform(
          `tresse-${side}-${i}`,
          turn(
            p[side === 'l' ? 'hairL' : 'hairR'] * m * (1 - .061 * i) +
              .21 * Math.sin(t * 4.2 + i * .95) * Math.abs(p.hairL + p.hairR) * .16,
            o,
          ),
        ),
      );
      drawEye(side, p);
    });
    drawMouth(p);
  }
  return { draw };
}
