import { typeLigne } from '../timeline.js';
import { bound, smooth, windowAt } from './math.js';

const SALUT = /(?:^|[^\p{L}])(?:bonjour|bonsoir|salut|coucou|hello|hi|hey)(?!\p{L})/iu;
const DEPLACEMENT = /(?:\b(?:avance|marchons)\b|marche vers|walk forward|come closer|pas de côté|step aside|sidestep)/iu;
const PONCTUATION = /([?!])[\s»”"')\]]*$/u;
const CONTRASTE = /(?:^|[^\p{L}])(?:non|pourtant|mais|but)(?!\p{L})/iu;
const ACCORD = /^\P{L}*(?:oui|exactement|yes|exactly)(?!\p{L})/iu;
const pulse = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));
const APPUI = Object.freeze({ x: 0, z: 0, lift: 0, pitch: 0, grounded: true });
const MARCHE_MIN = 2.05;
const LUNETTES = [2.62, 3.52, 3.94, 4.88];
const FATIGUE = [5.64, 6.74, 7.18, 7.99];
const TERMINAL = [9.62, 10.24, 10.73, 11.46];
const TOURS = ['presente', 'confie', 'marque', 'ouvre', 'hoche', 'presente', 'nuance', 'confie'];

function trajet(start, fin, stride) {
  const duree = Math.min(3.08, fin - start);
  const count = duree >= 2.60 ? 4 : 3;
  return { start, end: start + duree, stride, count, distance: stride * (count - 1.18) };
}

function groupes(texte, debut, span, start, end) {
  const n = Math.min(240, Math.max(1, Math.ceil((end - start) / 2.22)));
  if (n === 1) return [start, end];
  const coupes = Array.from(texte.matchAll(/([,;:…—–])?\s+(?=\S)/gu), (m) => ({
    t: debut + span * (m.index + m[0].length) / texte.length,
    penalite: m[1] ? 1 : 2.1,
  }));
  const dt = (end - start) / n, marge = Math.min(.36, dt * .21), bornes = [start];
  let j = 0;
  for (let i = 1; i < n; i++) {
    const ideal = start + dt * i;
    while (coupes[j]?.t < ideal - marge) j++;
    let t = ideal, score = marge;
    for (let k = j; coupes[k]?.t <= ideal + marge; k++) {
      const distance = Math.abs(coupes[k].t - ideal) * coupes[k].penalite;
      if (distance < score) { score = distance; t = coupes[k].t; }
    }
    bornes.push(t);
  }
  return [...bornes, end];
}

export function planAicha(segments, dureeMs, { emotions = true, humeur = null } = {}) {
  const duration = Math.max(0, dureeMs / 1000), cues = [], marches = [], paroles = [];
  let past = 0, spoken = 0, voiced = 0, tour = 0, waved = false, explicite = null, quiet = null;
  const gap = (start, end) => {
    const span = end - start;
    if (span < .44) return;
    cues.push({ start, end: Math.min(start + 2.4, end), kind: 'ecoute', side: 1, face: 'concentre', force: .55 });
    if (!quiet && voiced > 0 && start >= 1.35 && span >= MARCHE_MIN) quiet = trajet(start, end, 35);
  };
  for (const seg of segments) {
    const start = bound(seg.debutMs / 1000, past, duration), end = bound(seg.finMs / 1000, start, duration);
    if (end <= start) continue;
    gap(past, start);
    past = end;
    const texte = seg.texte;
    if (typeLigne(texte) !== 'parle') { gap(start, end); continue; }
    const speechEnd = bound((seg.speechEndMs ?? seg.finMs) / 1000, start, end), span = speechEnd - start;
    const last = Math.min(end, speechEnd + .12);
    if (span > 0) paroles.push({ start, end: last });
    if (span < .1) { gap(start, end); continue; }
    const e = seg.expression && seg.expression !== 'auto' ? { expr: seg.expression, force: 1 } : emotions && humeur?.de(seg);
    const add = (kind, a, b, side) => {
      if (b - a >= .14) cues.push({ start: a, end: b, kind, side, face: e?.expr || 'neutre', force: e?.force ?? 1 });
    };
    const marque = emotions ? PONCTUATION.exec(texte)?.[1] : '';
    let from = start + Math.min(.09, .08 * span);
    const wave = emotions && !waved && spoken < 3 && span >= .68 && SALUT.test(texte.slice(0, 44));
    if (wave) {
      const jusqua = Math.min(last, from + 1.86);
      add('salut', from, jusqua, -1);
      from = jusqua; waved = true;
    }
    const accent = marque && last - from >= .26 ? marque === '?' ? 'question' : 'accent' : '';
    let fin = accent ? Math.max(from, last - 1.16) : last;
    if (accent && fin - from < .61) fin = from;
    if (fin - from >= .14) {
      const bornes = groupes(texte, start, span, from, fin);
      for (let i = 1; i < bornes.length; i++, tour++) {
        const a = bornes[i - 1], b = bornes[i];
        const avant = Math.round(texte.length * (a - start) / span);
        const groupe = texte.slice(i === 1 && !wave ? 0 : avant, Math.ceil(texte.length * (b - start) / span));
        const kind = emotions && CONTRASTE.test(groupe) ? 'nuance' : emotions && ACCORD.test(groupe) ? 'hoche' : TOURS[tour % TOURS.length];
        add(kind, a, b, tour % 2 ? -1 : 1);
      }
    }
    if (accent) { add(accent, fin, last, tour % 2 ? -1 : 1); tour++; }
    if (!explicite && emotions && !wave && span >= MARCHE_MIN && DEPLACEMENT.test(texte)) explicite = trajet(start, speechEnd, 35);
    voiced += span;
    gap(last, end);
    spoken++;
  }
  gap(past, duration);
  const finSalut = cues.find(c => c.kind === 'salut')?.end ?? 0;
  const appuiParle = (apres, stride) => {
    const fin = duration - .48;
    const ref = cues.find(c => c.start >= Math.max(apres, finSalut) && c.start + MARCHE_MIN <= fin && TOURS.includes(c.kind));
    return ref ? trajet(ref.start, fin, stride) : null;
  };
  if (emotions && voiced > 0) {
    const premier = explicite || quiet || (voiced >= 6.2 && duration >= 7.3 ? appuiParle(3.3, 33) : null);
    if (premier) {
      marches.push({ ...premier, depart: 0, pied: 1 });
      const suite = appuiParle(premier.end + 5.5, premier.stride);
      if (suite) marches.push({ ...suite, depart: premier.distance, pied: 0 });
    }
  }
  const reprises = [];
  paroles.forEach(({ start }, i) => {
    if (start - (paroles[i - 1]?.end ?? 0) >= 1.2 && !windowAt(marches, start, start - .9)) reprises.push({ start: start - .82, end: start });
  });
  // Espacer les gestes sans changer le regard.
  let reposMains = 0, cote = 1;
  for (const cue of cues) {
    const salut = cue.kind === 'salut';
    cue.hand = salut ? -1 : cue.kind !== 'ecoute' && cue.kind !== 'hoche'
      && cue.end - cue.start >= .56 && cue.start >= reposMains ? cote : 0;
    if (cue.hand) {
      reposMains = Math.max(cue.end + .28, cue.start + 1.65);
      cote = -cue.hand;
    }
  }
  return { duration, cues, marches, paroles, reprises };
}

const familles = [
  [/^(content|enthousiaste|rire|fier|soulage|malicieu|reconnaissant|amuse|rassurant|excite|apaise|tendre)$/, [.61, .21, .24, .15, 0, -.21]],
  [/^(surpris|emerveille|curieux)$/, [.18, .72, .69, .13, 0, -.19]],
  [/^(sceptique|confus|provocateur|degoute|jaloux)$/, [.05, .23, .53, .72, .34, .11]],
  [/^(concentre|determine|colere|impatient)$/, [0, .02, .10, -.12, .7, .26]],
  [/^(triste|fatigue|gene|inquiet|peur|ennuye|nostalgique|intimide|compatissant|pensif|resigne|honteux|contemplatif)$/, [.03, .43, .08, .19, .25, .54]],
];
const faceDe = (nom) => familles.find(([motif]) => motif.test(nom))?.[1] || [0, 0, 0, 0, 0, 0];

// Bras, tête, visage.
const gestes = {
  salut:   [[16, 78, .94, 6], [7.2, 3.1, -2.1, .17], [.69, .29, .45, 0, .10]],
  presente:[[5, 37, .84, 3], [11.3, 4.1, 3.2, .55], [.33, .28, .31, .03, .22]],
  confie:  [[0, 41, .66, -3, .77], [3.3, 5.1, 5.5, .11], [.29, .48, .17, .12, -.23]],
  marque:  [[5, 34, .82, 3, 0, 0, .9], [6.5, 2.7, 3.6, .18], [.19, .39, .48, .12, .30]],
  ouvre:   [[5, 37, .84, 3, 0, .62], [5.5, -3.9, -5.3, -.37], [.53, .41, .52, 0, .12]],
  hoche:   [[], [3.2, 2.2, 11.8, .26], [.32, .22, .17, .03, .10]],
  nuance:  [[0, 34, .67, -3, .66, .12], [12, 4.2, -2.7, -.32], [.07, .21, .62, .30, .53]],
  question:[[4, 28, .68, 3, 0, .15], [9.9, 7.1, -6.7, -.36], [.21, .76, .64, .08, .36]],
  accent:  [[5, 36, .80, 3, 0, .22], [7.2, -3.9, 7.1, .18], [.49, .51, .54, 0, .21]],
  ecoute:  [[], [15.2, 5.8, 6.6, .78], [.06, .32, .24, .45, .18]],
};

function acting(plan, t, gain) {
  const cue = windowAt(plan.cues, t), span = cue ? cue.end - cue.start : 1;
  const u = cue ? (t - cue.start) / span : -1, side = cue?.side ?? 1;
  const kind = cue?.kind, nuance = kind === 'nuance';
  const [bras, tete, visage] = gestes[kind] || gestes.ecoute;
  const intensity = gain * (.22 + .78 * smooth(.14, .91, span));
  const look = intensity * pulse(u, 0, .155, .66, .95);
  const neck = intensity * pulse(u, Math.min(.18, .068 / span), .32, .61, .96);
  const skull = intensity * pulse(u, Math.min(.25, .105 / span), .39, .65, 1);
  const face = pulse(u, .04, .255, .68, 1);
  const appui = intensity * pulse(u, .015, .305, .65, .98);
  const turn = nuance ? 2 * smooth(.24, .63, u) - 1 : 1;
  const nod = kind === 'hoche' ? skull * (1 - .69 * pulse(u, .40, .58, .60, .77)) - intensity * 1.9 / 11.8 * pulse(u, .13, .26, .29, .39) : skull;
  return {
    cue, face,
    gazeX: bound(side * look * (kind === 'ecoute' ? 1.8 : 1.35) * turn, -1.8, 1.8), gazeY: look * tete[3],
    neck: side * neck * (kind === 'ecoute' ? 1.94 : 1.41) * turn,
    tilt: side * skull * tete[1], yaw: bound(side * skull * tete[0] * turn, -19, 19), pitch: nod * tete[2],
    weight: side * 2.66 * appui, hip: -.93 * side * appui, chest: (bras[4] > .4 ? -1.33 : 1.25) * side * appui,
    smile: face * visage[0], inner: face * visage[1], outer: face * visage[2], focus: face * visage[3], asym: side * face * visage[4],
  };
}

function jeuMains(cue, t, gain) {
  // Épaule, coude, paume, poignet, plan, index.
  const l = [0, 0, 0, 0, 0, 0], r = l.slice();
  if (!cue?.hand || !gain) return [l, r];
  const { start, end, kind } = cue;
  const [arm, elbow, palm, wrist, fold = 0, contra = 0, index = 0] = gestes[kind][0];
  const span = end - start, u = (t - start) / span;
  const force = Math.min(gain, 1.12) * smooth(.34, .91, span), paume = bound(force);
  const hand = paume * pulse(u, .16, .46, .65, 1);
  const retard = force * contra * pulse(u, .29, .61, .70, 1);
  const [m, o] = cue.hand < 0 ? [l, r] : [r, l];
  m[0] = arm * force * pulse(u, .025, .33, .55, 1);
  m[1] = elbow * force * pulse(u, .07, .42 + .05 * fold, .63, 1);
  m[2] = palm * hand;
  m[3] = wrist * hand * (kind === 'salut' ? Math.sin((u - .4) * Math.PI * 6) : 1);
  m[4] = fold * smooth(0, .6, force) * pulse(u, 0, .26, .72, 1);
  m[5] = index * paume * pulse(u, .32, .48, .58, .78);
  o[0] = 3 * retard; o[1] = 27 * retard;
  o[2] = .67 * retard; o[3] = -3 * retard;
  return [l, r];
}

function progression(u) {
  const s = bound((u - .055) / .90), x = Math.min(s, 1 - s), r = .23;
  const q = Math.min(1, x / r), d = (r * q ** 3 * (1 - q / 2) + Math.max(0, x - r)) / (1 - r);
  return s > .5 ? 1 - d : d;
}

function supports(marches, t, gain) {
  const m = marches[1] && t >= marches[1].start ? marches[1] : marches[0];
  const u = m ? bound((t - m.start) / (m.end - m.start)) : 0;
  const amp = Math.min(gain, 1.1), base = (m?.depart ?? 0) * amp;
  if (!amp || !u || u === 1) {
    return { stepL: APPUI, stepR: APPUI, avance: base + (u === 1 ? m.distance * amp : 0), weight: 0, hip: 0, settle: 0, turn: 0, mix: 0 };
  }
  const stride = m.stride * amp, distance = m.distance * amp, d = distance * progression(u), dt = .8 / m.count;
  const mix = pulse(u, .02, .18, .83, 1), a = Math.PI * ((u - .12) / dt - .76);
  const cycle = amp * pulse(u, .02, .18, .72, .97) * (m.pied ? 1 : -1);
  const dedans = 3.3 * smooth(20, 29, stride);
  const feet = [{ ...APPUI, z: -d }, { ...APPUI, z: -d }];
  for (let i = 0; i < m.count; i++) {
    const side = (m.pied + i) % 2, ferme = i === m.count - 1;
    const off = .12 + i * dt, on = off + .76 * dt;
    const push = amp * (ferme ? 12 : 18), hit = amp * (ferme ? 6 : 11);
    if (u < off) {
      feet[side].pitch += push * smooth(off - .41 * dt, off, u);
      continue;
    }
    const s = bound((u - off) / (on - off));
    const from = Math.max(0, i - 1.18) * stride, to = Math.min((i + .82) * stride, distance);
    const ligne = dedans * ((i > 1 ? 1 - smooth(0, .22, s) : 0) + (i < m.count - 2 ? smooth(.75, 1, s) : 0));
    feet[side] = {
      x: side ? -ligne : ligne,
      z: from + (to - from) * smooth(0, 1, s) - d,
      lift: amp * (ferme ? .72 : 1) * (4.65 * pulse(s, 0, .25, .36, .67) + 2.05 * pulse(s, .14, .40, .76, 1)),
      pitch: s < 1 ? push * (1 - smooth(.11, .51, s)) - hit * smooth(.53, .95, s)
        : -hit * (1 - smooth(on, on + .31 * dt, u)),
      grounded: s === 0 || s === 1,
    };
  }
  return { stepL: feet[0], stepR: feet[1], avance: base + d, mix,
    weight: 4.32 * cycle * Math.sin(a), hip: -4.55 * cycle * Math.sin(a - .23),
    settle: amp * mix * (.61 + 1.42 * Math.cos(a - .14) ** 2), turn: cycle * Math.cos(a) };
}

function blink(t) {
  const q = t % 13.55;
  return Math.max(...[1.19, 4.02, 7.15, 10.76].map(a => pulse(q, a - .061, a, a + .019, a + .132)));
}

export function poseAicha(plan, ms, { gain = 1, reduit = false, expression = '', bouche = [1, 0, 0, 0, 0, 0], attente = 0, monture = true } = {}) {
  const t = bound(ms / 1000, 0, plan.duration), k = reduit ? 0 : bound(gain, 0, 1.3);
  const a = acting(plan, t, k), pas = supports(plan.marches, t, k);
  const vie = t + (reduit ? 0 : attente / 1000), activite = k * smooth(0, .32, vie);
  const foyer = Math.sin(vie * .91 - .32) + .27 * Math.sin(vie * 1.63);
  const { mix, turn, weight, settle } = pas;
  const entree = windowAt(plan.reprises, t);
  const redresse = entree ? k * pulse(t - entree.end, -.82, -.42, -.25, 0) : 0;
  const libres = (1 - .83 * mix) * (1 - .76 * redresse), mains = 1 - .94 * mix;
  const balancier = 11.9 * (.97 * turn + .055 * weight);
  const phase = (v) => v.tilt + v.neck * 1.65 + v.yaw * .21 + v.pitch * .25;
  const inertia = bound((phase(acting(plan, t - .158, k)) - phase(a)) * .94, -5.1, 5.1);
  const emotion = faceDe(expression || a.cue?.face || 'neutre');
  const env = expression ? 1 : a.face * (a.cue?.force ?? 0), accent = expression || reduit ? 0 : 1;
  const [l, r] = jeuMains(a.cue, t, k);
  const q = vie % 17.4, cycle = vie - q;
  const coup = activite * (1 - mix) ** 2 * (1 - bound(redresse)) * pulse(q, .74, 1, 1.58, 2.07);
  const tete = coup * coup;
  // Réserver le geste entier.
  const libre = fen => {
    const u = k && pulse(q, ...fen);
    return u && ![plan.paroles, plan.marches, plan.reprises].some(p => windowAt(p, cycle + fen[3] + .08, cycle + fen[0] - .08)) ? u : 0;
  };
  const lunettes = monture ? libre(LUNETTES) : 0;
  const appui = libre(FATIGUE);
  const fatigue = k * appui, talon = k * smooth(.28, 1, appui);
  const relache = q > FATIGUE[2] ? bound(fatigue - talon) : 0;
  const regard = k * libre(TERMINAL);
  const tourne = regard * smooth(9.85, 10.42, q);
  const bassin = pas.hip + 1.95 * fatigue;
  const paupieres = t => reduit ? 0 : Math.max(.58 * talon, .62 * relache, blink(t));
  return {
    avance: pas.avance,
    breath: activite * libres * (.52 * Math.sin(1.83 * vie - .29) + .16 * Math.sin(2.43 * vie + .30)) + 5.2 * talon - 8 * relache + 4.6 * redresse,
    weight: weight + (a.weight + activite * 1.26 * foyer) * libres - .5 * lunettes - 4.6 * fatigue,
    settle: settle + .26 * activite * (1 - Math.cos(vie * 1.19)) + 1.9 * fatigue,
    hip: (a.hip - activite * .58 * foyer) * libres + bassin,
    chest: (a.chest + activite * .74 * foyer) * libres - .83 * bassin,
    buste: -.30 * weight,
    neck: a.neck * libres + .64 * tete + 1.35 * tourne,
    tilt: a.tilt * libres + activite * libres * .56 * Math.sin(vie * 1.51) + 1.15 * tete - .75 * lunettes,
    yaw: bound(a.yaw * libres + 1.25 * turn + 2.4 * tete + 14.6 * tourne, -19, 19),
    pitch: bound(a.pitch * libres + .29 * settle - .96 * mix + 1.4 * lunettes + 3.4 * fatigue - 6.6 * redresse, -13, 13),
    gazeX: bound(a.gazeX * libres + coup + 1.72 * regard, -1.8, 1.8),
    gazeY: a.gazeY * libres + env * emotion[5] * (reduit ? 0 : .66) + .75 * talon + 1.3 * relache + .45 * regard - .55 * redresse,
    hairL: inertia * libres + activite * .24 * Math.sin(vie * 2.3) + 1.4 * turn,
    hairR: .79 * inertia * libres + activite * .29 * Math.sin(vie * 2.11 + .5) + 1.2 * turn,
    lag: -.73 * turn - .12 * a.weight * libres,
    marche: mix, balancier, lacet: 5.2 * turn,
    armL: .55 + l[0] * mains - 1.4 * mix - .16 * weight,
    armR: .25 + r[0] * mains - mix + .16 * weight,
    flexL: bound(2.4 + l[1] * mains + 7.1 * mix + 2.7 * turn, 0, 112),
    flexR: bound(2.5 + r[1] * mains + 6.7 * mix - 2.7 * turn, 0, 99),
    wristL: bound(-.9 + l[3] * mains - 1.2 * mix + .43 * weight, -14, 14),
    wristR: bound(.3 + r[3] * mains - 1.5 * mix - .41 * weight, -14, 14),
    openL: l[2] * mains, openR: r[2] * mains, foldL: l[4] * mains, foldR: r[4] * mains,
    indexL: l[5] * mains, indexR: r[5] * mains,
    lunettes, ajuste: -.9 * lunettes * pulse(q, LUNETTES[1], 3.78, LUNETTES[2], 4.23),
    blinkL: paupieres(vie), blinkR: paupieres(vie - .009),
    stepL: pas.stepL, stepR: talon ? { ...APPUI, pitch: 22 * talon, roll: -10 * talon } : pas.stepR,
    smile: bound(env * emotion[0] + accent * a.smile, 0, .94), inner: bound(env * emotion[1] + accent * a.inner, 0, 1.06),
    outer: bound(env * emotion[2] + accent * a.outer, 0, 1.05), asym: bound(env * emotion[3] + accent * a.asym, -.84, .84),
    focus: bound(env * emotion[4] + accent * a.focus), mouth: bouche,
  };
}
