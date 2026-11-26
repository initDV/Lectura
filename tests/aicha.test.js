import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { piecesSvg } from '../src/modules/character-spec.js';
import { autoTiming, Timeline } from '../src/modules/timeline.js';
import { planAicha, poseAicha } from '../src/modules/aicha/motion.js';
import { brasAicha, jambesAicha } from '../src/modules/aicha/rig.js';
import { dalles } from '../src/modules/aicha/decor.js';
import { focale, HORIZON, SOL } from '../src/modules/aicha/math.js';
import { boucheA, enveloppeAudio, planBouche, REPOS_BOUCHE } from '../src/modules/aicha/mouth.js';

const seg = (texte, debutMs, finMs, options = {}) => ({ texte, debutMs, finMs, ...options });
const exemple = [
  seg('Bonjour, moi c’est Aïcha !', 200, 2190, { speechEndMs: 2040 }),
  seg('# Elle attend en écoutant.', 2190, 4500),
  seg('Tu viens au marché ?', 4500, 6140, { expression: 'curieux' }),
  seg('Oui, je vais te montrer le chemin.', 6140, 9000),
];
const plan = planAicha(exemple, 9000);
const repose = planAicha([], 0);
const phrase = 'Aujourd’hui je te propose de partir ensemble au marché pour découvrir les étoffes colorées et écouter les commerçantes raconter comment elles préparent le jus de bissap que nous emporterons ensuite pour le partager au retour avec toute la famille';
const long = planAicha([seg(phrase, 0, 14000)], 14000);
const suite = planAicha([seg('Je m’avance pour te montrer le chemin.', 0, 2800), seg(phrase, 2800, 24000)], 24000);
const court = planAicha([seg('Je m’avance lentement.', 0, 2051)], 2051);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function sampleCue(cue, u) { return 1000 * (cue.start + (cue.end - cue.start) * u); }

describe('Catalogue commun', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const commun = JSON.parse(read('characters/index.json')).personnages;

  it.each([
    ['aicha', 'Aïcha', true], ['monique', 'Monique', true], ['prisca', 'Prisca', false],
    ['charlotte', 'Charlotte', false], ['doriane', 'Doriane', false],
  ])('articule %s avec le rig partagé', (id, nom, lunettes) => {
    const def = JSON.parse(read(`characters/${id}.json`));
    const svg = read(`characters/${def.svg}`);
    expect(def).toMatchObject({ id, nom, rig: 'aicha', svg: `${id}.svg` });
    expect(commun).toContain(id);
    const calques = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(calques).size).toBe(calques.length);
    expect(calques).toEqual(expect.arrayContaining(piecesSvg(def)));
    expect(svg).toContain('viewBox="-101 -32 202 288"');
    expect(svg).not.toMatch(/<animate|<script|<image|<foreignObject|href="(?!#)|url\((?!#)/i);
    for (const [, ref] of svg.matchAll(/(?:href="#|url\(#)([\w-]+)/g)) expect(calques).toContain(ref);
    expect(/<g id="lunettes">\s*<(?!\/)/.test(svg)).toBe(lunettes);
  });

  it('ne confond pas les calques du rig articulé et ceux du robot', () => {
    expect(piecesSvg({ rig: 'aicha' })).not.toContain('body');
    expect(piecesSvg({ id: 'robot_lectura' })).toContain('body');
  });
});

describe('Mise en scène au temps de la source', () => {
  it('distingue salut, écoute, question et parole sans toucher à la durée de la source', () => {
    expect(plan.duration).toBe(9);
    expect(plan.cues.map(c => c.kind)).toEqual(['salut', 'ecoute', 'question', 'hoche', 'marque']);
    expect(plan.cues.every((c, i) => c.end <= (plan.cues[i + 1]?.start ?? plan.duration))).toBe(true);
    expect(plan.marches).toHaveLength(1);
    expect(plan.marches[0].start).toBeGreaterThanOrEqual(2.19);
    expect(plan.marches[0].end).toBeLessThanOrEqual(4.5);
  });

  it('garde des poses disjointes et finies sur du texte libre très bref ou sans paroles', () => {
    for (const texte of ['Oui ?', '# Silence\n$ pwd', '…', 'Coucou tout le monde ! Rebonjour. Est-ce vrai ?']) {
      const dt = texte.length * 1000 / 28;
      const direction = planAicha(new Timeline(texte, autoTiming(texte, dt, 1)).segs, dt);
      for (const ms of [0, dt * .01, dt * .35, dt, 2 * dt]) {
        expect(Object.values(poseAicha(direction, ms)).filter(x => typeof x === 'number').every(Number.isFinite)).toBe(true);
      }
      expect(poseAicha(direction, dt)).toEqual(poseAicha(direction, 2 * dt));
    }
  });

  it('anime toute une phrase sans ponctuation, par gestes alternés plutôt que par une seule pose au début', () => {
    expect(long.duration).toBe(14);
    expect(long.cues).toHaveLength(7);
    expect(new Set(long.cues.map(c => c.kind)).size).toBeGreaterThanOrEqual(5);
    expect(long.cues.every((cue, i) => cue.kind !== 'ecoute' && (!i || cue.side !== long.cues[i - 1].side))).toBe(true);
    expect(long.cues.at(-1).end).toBe(14);
    const actives = Array.from({ length: 14 }, (_, s) =>
      Array.from({ length: 20 }, (_, i) => poseAicha(long, s * 1000 + i * 50)).some(p => Math.max(p.flexL, p.flexR) > 18),
    );
    expect(actives.filter(Boolean).length).toBeGreaterThanOrEqual(12);
    expect(actives.slice(-3)).toEqual([true, true, true]);
    expect(long.marches[0]?.start).toBeGreaterThan(2);
    expect(long.marches[0]?.end).toBeLessThan(14);
  });

  it('varie le plan des coudes, le doigt d’accent, les deux mains et la direction du regard', () => {
    const jeu = { ...long, marches: [] };
    const pose = (kind, u) => poseAicha(jeu, sampleCue(jeu.cues.find(c => c.kind === kind), u));
    const raconte = pose('presente', .52), confie = pose('confie', .52), ouvre = pose('ouvre', .56);
    expect(brasAicha(raconte, 'R').W.x).toBeLessThan(-52);
    expect(brasAicha(confie, 'L').W.x).toBeGreaterThan(-12); // main ramenée vers le torse
    expect(ouvre.flexL).toBeGreaterThan(60);
    expect(ouvre.flexR).toBeGreaterThan(28);
    expect(ouvre.flexL - ouvre.flexR).toBeGreaterThan(20); // pas un miroir des deux paumes
    expect(pose('marque', .5).indexR).toBeGreaterThan(.8);
    expect(raconte.gazeX).toBeGreaterThan(.65);
    expect(confie.gazeX).toBeLessThan(-.65);
    expect(pose('hoche', .41).pitch).toBeGreaterThan(8);
  });

  it('laisse la main redescendre pendant le geste suivant sans à-coup ni débordement sur un silence', () => {
    const jeu = { ...long, marches: [] }, first = jeu.cues[0], t = 1000 * first.end;
    expect(jeu.cues[1].start).toBe(first.end);
    const [avant, liaison, apres] = [-1, 0, 1].map(d => poseAicha(jeu, t + d));
    expect(liaison.flexR).toBeGreaterThan(10);
    expect(liaison.openR).toBeGreaterThan(.15);
    expect(avant.flexR).toBeGreaterThan(liaison.flexR);
    expect(apres.flexR).toBeLessThan(liaison.flexR);
    expect(avant.flexR - apres.flexR).toBeLessThan(.5);
    const silence = { ...jeu, cues: [first] };
    expect(poseAicha(silence, t - 1).flexR).toBeCloseTo(2.5, 2);
    expect(poseAicha(silence, t + 1).openR).toBe(0);
  });

  it('fait suivre la paume au coude et accentue avec l’index sans secouer le bras', () => {
    const jeu = { ...long, marches: [] };
    const pose = (kind, u) => poseAicha(jeu, sampleCue(jeu.cues.find(c => c.kind === kind), u));
    const depart = pose('presente', .14), arrivee = pose('presente', .51);
    expect(depart.flexR).toBeGreaterThan(9);
    expect(depart.openR).toBe(0);
    expect(arrivee.openR).toBeGreaterThan(.8);
    expect(pose('marque', .41).indexR).toBeLessThan(.6);
    expect(pose('marque', .52).indexR).toBeGreaterThan(.8);
    expect(pose('marque', .81).indexR).toBe(0);
    expect(pose('marque', .50).flexR).toBeCloseTo(pose('marque', .57).flexR, 8);
  });

  it('ne jette pas les bras sur un mot trop bref pour préparer un geste', () => {
    const bref = planAicha([seg('Oui ?', 0, 246)], 246);
    expect(bref.cues).toHaveLength(1);
    for (let t = 0; t <= 246; t += 5) {
      const p = poseAicha(bref, t, { gain: 1.3 });
      expect([p.flexL, p.flexR, p.openL, p.openR]).toEqual([2.4, 2.5, 0, 0]);
    }
  });

  it('préserve les vrais silences, dont la fin de phrase avant le prochain segment', () => {
    const scenario = planAicha([seg('Une phrase !', 0, 5400, { speechEndMs: 2300 }), seg('# Aucun mot prononcé.', 5400, 9000)], 9000);
    expect(scenario.cues.filter(c => c.kind !== 'ecoute').at(-1).end).toBeLessThanOrEqual(2.42);
    for (const ms of [2510, 3300, 5590, 8200]) {
      const p = poseAicha(scenario, ms), reposSansMots = poseAicha({ ...scenario, cues: [] }, ms);
      for (const k of ['flexL', 'flexR', 'openL', 'openR', 'indexL', 'indexR']) expect(p[k]).toBe(reposSansMots[k]);
    }
    expect(planAicha([seg('# Simple commentaire.', 0, 6000)], 6000).marches).toEqual([]);
    expect(suite.marches[0].start).toBe(0);
    expect(suite.marches[0].end).toBe(2.8);
    expect(suite.marches.map(m => m.pied)).toEqual([1, 0]);
  });

  it('place au repos les coudes à la taille et les mains le long des cuisses', () => {
    const p = poseAicha(repose, 0);
    for (const s of ['L', 'R']) {
      const a = brasAicha(p, s);
      expect(a.E.y).toBeGreaterThan(68);
      expect(a.E.y).toBeLessThan(73);
      expect(a.W.y).toBeGreaterThan(99);
      expect(a.W.y).toBeLessThan(105);
      expect(a.W.x).toBeGreaterThan(-39);
      const doigts = a.main.y + 15 * Math.cos((a.rot + p['wrist' + s]) * Math.PI / 180);
      expect(doigts).toBeGreaterThan(114); // haut de la cuisse, sans descendre aussi bas que la manche longue
      expect(doigts).toBeLessThan(122);
    }
  });

  it('amorce le regard avant le cou et laisse revenir la main par un arc', () => {
    const wave = plan.cues[0], before = wave.start * 1000 + 51;
    const prep = poseAicha(plan, before), high = poseAicha(plan, sampleCue(wave, .49)), release = poseAicha(plan, sampleCue(wave, .85));
    expect(Math.abs(prep.gazeX)).toBeGreaterThan(.015);
    expect(Math.abs(prep.neck)).toBe(0);
    expect(prep.yaw).toBe(0);
    expect(high.flexL).toBeGreaterThan(100);
    expect(high.openL).toBeGreaterThan(.9);
    expect(high.flexR).toBeLessThan(5);
    expect(release.flexL).toBeLessThan(high.flexL);
    expect(release.openL).toBeLessThan(high.openL);
  });

  it('ne dépend ni de l’ordre des images ni du débit de rendu', () => {
    for (const [direction, t] of [[plan, 3251.23], [long, 7122.31], [suite, (suite.marches[1].start + .7) * 1000]]) {
      const ref = poseAicha(direction, t);
      poseAicha(direction, t - 5000);
      poseAicha(direction, t + 5000);
      expect(poseAicha(direction, t)).toEqual(ref);
      expect(poseAicha(direction, 0)).toEqual(poseAicha(repose, 0));
    }
  });

  it('respecte le choix d’expression et la désactivation des accents automatiques', () => {
    const silence = planAicha(exemple, 9000, { emotions: false });
    expect(silence.cues.some(c => c.kind === 'salut' || c.kind === 'question')).toBe(false);
    expect(silence.marches).toEqual([]);
    const question = plan.cues.find(c => c.kind === 'question');
    const t = sampleCue(question, .46);
    expect(poseAicha(plan, t).inner).toBeGreaterThan(.7);
    const forcet = poseAicha(plan, t, { expression: 'content' });
    expect(forcet.smile).toBeGreaterThan(.5);
    expect(forcet.inner).toBeLessThan(.4);
  });

  it('animations réduites : pas, bassin, bras et tête immobiles, lèvres toujours lisibles', () => {
    const fields = ({ mouth: _mouth, smile: _s, inner: _i, outer: _o, asym: _a, focus: _f, ...corps }) =>
      Object.values(corps).map(x => x || 0);
    const neutre = fields(poseAicha(repose, 0, { reduit: true }));
    for (const scenario of [plan, long, suite]) {
      for (let t = 380; t < scenario.duration * 1000; t += 291) {
        const bouche = [1.04, 2.7, .1, 1.22, 0, 0], p = poseAicha(scenario, t, { reduit: true, bouche });
        expect(fields(p)).toEqual(neutre);
        expect(p.mouth).toEqual(bouche);
      }
    }
  });

  it.each([.6, 1, 1.3])('garde les appuis, les longueurs et les angles du rig (gain %f)', (gain) => {
    for (const direction of [plan, long, suite, court]) {
      const levees = [];
      let dernier = null, regard = 0, avance = 0;
      for (let ms = 0; ms <= direction.duration * 1000; ms += 9) {
        const p = poseAicha(direction, ms, { gain });
        if (p.avance < avance - 1e-8) throw new Error(`Marche arrière à ${ms} ms`);
        const legs = jambesAicha(p), [l, r] = legs;
        if (legs.every(v => !v.ground.grounded) || legs.some(v => !v.reachable)) throw new Error(`Appui ou portée faux à ${ms} ms`);
        if (l.toe.z > r.heel.z && r.toe.z > l.heel.z && r.ankle.x - l.ankle.x < 17) throw new Error(`Chaussures qui se traversent à ${ms} ms`);
        if (Math.max(Math.abs(l.ankle.x), Math.abs(r.ankle.x)) > 10.25) throw new Error(`Trajet de pied latéral à ${ms} ms`);
        for (const [i, v] of legs.entries()) {
          if (Math.abs(distance(v.hip, v.knee) - Math.hypot(1.4, 74, 12.6)) > 1e-7 ||
              Math.abs(distance(v.knee, v.ankle) - Math.hypot(2.85, 57, 12.6)) > 1e-7) throw new Error(`Longueur fausse à ${ms} ms`);
          const bas = Math.max(v.heel.y, v.toe.y), avant = dernier?.[i];
          if (Math.abs(bas - (SOL - v.ground.lift)) > 1e-7 || v.ground.lift > 7.5) throw new Error(`Dégagement faux à ${ms} ms`);
          if (v.ground.grounded && avant?.ground.grounded) {
            const d = (a, b) => Math.hypot(a.x - b.x, a.z + p.avance - b.z - avance);
            if (v.ground.x !== avant.ground.x || Math.abs(v.ground.z + p.avance - avant.ground.z - avance) > 1e-7 ||
                (v.ground.pitch >= 0 && avant.ground.pitch >= 0 && d(v.toe, avant.toe) > 1e-7) ||
                (v.ground.pitch <= 0 && avant.ground.pitch <= 0 && d(v.heel, avant.heel) > 1e-7)) throw new Error(`Appui qui glisse à ${ms} ms`);
          }
          if (!v.ground.grounded && avant?.ground.grounded) levees.push(i);
        }
        for (const s of ['L', 'R']) {
          const a = brasAicha(p, s);
          if (Math.abs(distance(a.S, a.E) - Math.hypot(6.7, 35.5)) > 1e-7 ||
              Math.abs(distance(a.E, a.W) - Math.hypot(3.9, 31.2)) > 1e-7) throw new Error(`Manche étirée à ${ms} ms`);
        }
        if (p.flexL < 0 || p.flexL > 112 || p.flexR < 0 || p.flexR > 99) throw new Error(`Coude hors de sa butée à ${ms} ms`);
        if (Math.abs(p.gazeX - regard) > .38) throw new Error(`Regard discontinu à ${ms} ms`);
        dernier = legs;
        regard = p.gazeX;
        avance = p.avance;
      }
      const pas = direction.marches.flatMap(m => Array.from({ length: m.count }, (_, i) => (m.pied + i) % 2));
      expect(levees).toEqual(pas);
      expect(avance).toBeGreaterThan(30);
    }
    const fin = poseAicha(suite, 24000, { gain });
    expect(fin.stepL).toEqual(fin.stepR);
    expect(fin.stepL.z).toBe(0);
  });
});

describe('Vie au repos', () => {
  const attend = (attente, options) => poseAicha(repose, 0, { attente, ...options });

  it('respire, regarde, cligne et ajuste ses lunettes sans lever un pied', () => {
    const neutre = attend(0), regard = attend(1190), touche = attend(3780);
    expect(regard.breath - neutre.breath).toBeGreaterThan(.3);
    expect(regard.gazeX).toBeGreaterThan(.8);
    expect(regard.blinkL).toBeGreaterThan(.95);
    expect(touche.lunettes).toBe(1);
    expect(touche.ajuste).toBeCloseTo(-.9, 8);
    expect(brasAicha(touche, 'L').main.y).toBeLessThan(10);
    expect(distance(brasAicha(touche, 'R').W, brasAicha(neutre, 'R').W)).toBeLessThan(1);
    for (const p of [neutre, regard, touche, attend(5200), attend(10900)]) {
      expect(p.avance).toBe(0);
      expect(p.mouth).toEqual(REPOS_BOUCHE);
      for (const leg of jambesAicha(p)) {
        expect(leg.ground.grounded).toBe(true);
        expect(leg.reachable).toBe(true);
        expect(leg.heel.y).toBeCloseTo(SOL, 9);
        expect(leg.toe.y).toBeCloseTo(SOL, 9);
      }
    }
    for (const ms of [5200, 10900]) {
      const p = attend(ms);
      expect(p.lunettes).toBe(0);
      expect(brasAicha(p, 'L').main.y).toBeGreaterThan(99);
    }
  });

  it('ne lève pas la main vers une monture absente, mais garde les autres microgestes', () => {
    for (let ms = 2620; ms <= 4880; ms += 20) {
      const p = attend(ms, { monture: false });
      expect(p.lunettes).toBe(0);
      expect(Math.abs(p.ajuste)).toBe(0);
      expect(brasAicha(p, 'L').main.y).toBeGreaterThan(99);
    }
    for (const ms of [1190, 7020, 10420]) {
      expect(attend(ms, { monture: false })).toEqual(attend(ms));
    }
  });

  it.each([.6, 1, 1.3])('guide l’index à la monture, sans étirement ni saut (gain %f)', (gain) => {
    let dernier;
    for (let ms = 2600; ms <= 4900; ms += 8) {
      const a = brasAicha(attend(ms, { gain }), 'L');
      expect(distance(a.S, a.E)).toBeCloseTo(Math.hypot(6.7, 35.5), 8);
      expect(distance(a.E, a.W)).toBeCloseTo(Math.hypot(3.9, 31.2), 8);
      if (dernier) {
        expect(distance(a.W, dernier.W)).toBeLessThan(2.2);
        expect(distance(a.E, dernier.E)).toBeLessThan(1.2);
        expect(Math.abs(a.rot - dernier.rot)).toBeLessThan(6);
      }
      dernier = a;
    }
    // Sans rotation de tête, le point de contact est dans le repère du dessin.
    for (const ms of [3520, 3780, 3930]) {
      const p = { ...attend(ms, { gain }), neck: 0, tilt: 0, yaw: 0, pitch: 0, breath: 0 };
      const a = brasAicha(p, 'L'), r = (a.rot + p.wristL) * Math.PI / 180;
      expect(a.main.x + 3.569 * Math.cos(r) - 13.489 * Math.sin(r)).toBeCloseTo(-10.5, 8);
      expect(a.main.y + 3.569 * Math.sin(r) + 13.489 * Math.cos(r)).toBeCloseTo(-6.12 + p.ajuste, 8);
    }
  });

  it('joue aussi dans un silence lu, au même moment à chaque recherche', () => {
    const ecoute = planAicha([seg('# Elle attend en silence.', 0, 12000)], 12000);
    const pose = (ms) => poseAicha(ecoute, ms);
    expect(ecoute.marches).toEqual([]);
    expect(pose(3780).lunettes).toBe(1);
    expect(pose(3780)).toEqual(attend(3780));
    pose(10600);
    pose(1500);
    expect(pose(3780)).toEqual(attend(3780));
  });

  it('omet le geste entier devant une marche ou une reprise de parole, même très brève', () => {
    const mot = planAicha([seg('Oui.', 4550, 4620)], 6000);
    const marche = planAicha([seg('Très bien.', 0, 1800), seg('# Elle fait quelques pas.', 1800, 8000)], 8000);
    expect(mot.cues.every(c => c.kind === 'ecoute')).toBe(true);
    expect(marche.marches).toHaveLength(1);
    for (const direction of [mot, marche, long]) {
      for (let ms = 2650; ms < 4880; ms += 31) expect(poseAicha(direction, ms).lunettes).toBe(0);
    }
  });

  it.each([.6, 1, 1.3])('soulage une jambe sans déplacer les appuis (gain %f)', (gain) => {
    const p = (ms) => attend(ms, { gain });
    const depart = p(5500), transfert = p(5980), haut = p(7000), retour = p(7860);
    expect(transfert.weight).toBeLessThan(depart.weight - .2);
    expect(transfert.stepR).toEqual(depart.stepR);
    expect(haut.weight).toBeLessThan(transfert.weight);
    expect(haut.pitch).toBeGreaterThan(2);
    expect(haut.blinkL).toBeGreaterThan(.3);
    expect(haut.gazeY).toBeGreaterThan(.4);
    expect(haut.stepR.roll).toBeLessThan(-5);
    expect(retour.stepR).toEqual(depart.stepR);
    expect(retour.weight).toBeLessThan(p(8050).weight);
    expect(p(8050).stepR).toEqual(depart.stepR);
    expect(p(24400).stepR).toEqual(haut.stepR);

    const [appui, leve] = jambesAicha(depart);
    const pointeInterieure = { x: 3.5, y: SOL, z: leve.toe.z };
    const talonHaut = jambesAicha(haut)[1].heel.y;
    expect(talonHaut).toBeLessThan(SOL - 5);
    expect(jambesAicha(p(6420))[1].heel.y).toBeGreaterThan(talonHaut);
    expect(jambesAicha(p(7450))[1].heel.y).toBeGreaterThan(talonHaut);
    let precedent = leve;
    for (let ms = 5500; ms <= 8100; ms += 8) {
      const pose = p(ms), [g, d] = jambesAicha(pose);
      expect(pose.avance).toBe(0);
      expect(pose.marche).toBe(0);
      expect(pose.lunettes).toBe(0);
      expect(pose.mouth).toEqual(REPOS_BOUCHE);
      expect(g.heel).toEqual(appui.heel);
      expect(g.toe).toEqual(appui.toe);
      if (pose.stepR.roll) {
        expect(d.contact).toEqual(pointeInterieure);
        expect(d.heel.y).toBeLessThan(SOL);
        expect(d.toe.y).toBeLessThan(SOL);
      } else {
        expect(d.heel).toEqual(leve.heel);
        expect(d.toe).toEqual(leve.toe);
      }
      expect(distance(d.ankle, precedent.ankle)).toBeLessThan(.4);
      for (const j of [g, d]) {
        expect(j.ground.grounded && j.reachable).toBe(true);
        expect(distance(j.hip, j.knee)).toBeCloseTo(Math.hypot(1.4, 74, 12.6), 8);
        expect(distance(j.knee, j.ankle)).toBeCloseTo(Math.hypot(2.85, 57, 12.6), 8);
      }
      precedent = d;
    }
  });

  it('relâche les épaules au retour du talon et garde les yeux baissés un instant', () => {
    const neutre = attend(5000), inspire = attend(7020), expire = attend(7730), reposee = attend(8050);
    expect(inspire.breath).toBeGreaterThan(4.6);
    expect(expire.breath).toBeLessThan(-1.2);
    expect(expire.stepR).toEqual(neutre.stepR);
    expect(expire.gazeY).toBeGreaterThan(.25);
    expect(expire.blinkL).toBeGreaterThan(.12);
    expect(reposee.gazeY).toBe(0);
    expect(Math.abs(reposee.breath)).toBeLessThan(.7);
    for (const s of ['L', 'R']) {
      const a = brasAicha(inspire, s), b = brasAicha(expire, s);
      expect(b.S.y - a.S.y).toBeGreaterThan(2.3);
      expect(distance(b.S, b.E)).toBeCloseTo(distance(a.S, a.E), 8);
      expect(distance(b.E, b.W)).toBeCloseTo(distance(a.E, a.W), 8);
    }
    for (const p of [inspire, expire, reposee]) {
      expect(p.avance).toBe(0);
      expect(p.mouth).toEqual(REPOS_BOUCHE);
    }
  });

  it('tourne les yeux vers le terminal avant la tête et revient de face sans déplacer les pieds', () => {
    const depart = attend(9450), yeux = attend(9800), cote = attend(10420), retour = attend(11500);
    expect(depart.gazeX).toBe(0);
    expect(yeux.gazeX).toBeGreaterThan(.3);
    expect(yeux.yaw).toBe(0);
    expect(cote.gazeX).toBeGreaterThan(1.6);
    expect(cote.yaw).toBeGreaterThan(14);
    expect(cote.neck).toBeGreaterThan(1);
    expect(retour.yaw).toBe(0);
    expect(retour.gazeX).toBe(0);
    for (const p of [yeux, cote, retour]) {
      expect(p.stepL).toEqual(depart.stepL);
      expect(p.stepR).toEqual(depart.stepR);
      expect(p.avance).toBe(0);
      expect(p.lunettes).toBe(0);
    }
  });

  it('ne lance pas le regard si une parole, une marche ou une reprise l’interrompt', () => {
    const mot = planAicha([seg('Oui.', 10970, 11030)], 14500);
    const reprise = planAicha([seg('On reprend.', 11800, 14300)], 14500);
    const marche = planAicha([seg('Je m’avance lentement.', 11100, 13700)], 14500);
    expect(reprise.paroles[0].start).toBeGreaterThan(11.54);
    expect(reprise.reprises[0].start).toBeLessThan(11.46);
    expect(marche.marches[0].start).toBe(11.1);
    for (const direction of [{ ...mot, reprises: [] }, reprise, { ...marche, paroles: [], reprises: [] }]) {
      for (const ms of [9800, 10420]) {
        const p = poseAicha(direction, ms);
        expect(p.gazeX).toBe(0);
        expect(p.yaw).toBe(0);
      }
    }
    expect(poseAicha(reprise, 11480).pitch).toBeLessThan(-6);
  });

  it('se redresse avant la première syllabe après un vrai silence et conserve les visèmes', () => {
    const segments = [
      seg('Une phrase.', 0, 2000, { speechEndMs: 1450 }),
      seg('# Pause.', 2000, 2600), seg('$ attendre', 2600, 2820),
      seg('On reprend.', 2820, 4000),
    ];
    const direction = planAicha(segments, 4000), bouche = planBouche(segments, 'fr');
    expect(direction.marches).toEqual([]);
    expect(direction.reprises).toHaveLength(1);
    const fen = direction.reprises[0];
    expect(fen.start).toBeCloseTo(2, 9);
    expect(fen.end).toBe(2.82);
    const p = (ms, opt) => poseAicha(direction, ms, { bouche: boucheA(ms, bouche), ...opt });
    const neutre = { ...direction, reprises: [] }, haut = p(2450);
    const normal = poseAicha(neutre, 2450);
    expect(haut.pitch).toBeLessThan(-5);
    expect(haut.pitch).toBeLessThan(normal.pitch - 5);
    expect(haut.breath).toBeGreaterThan(normal.breath + 4);
    expect(haut.gazeY).toBeLessThan(normal.gazeY);
    expect(haut.mouth).toBe(REPOS_BOUCHE);
    expect(haut.stepL).toEqual(normal.stepL);
    expect(haut.stepR).toEqual(normal.stepR);
    expect(haut.avance).toBe(0);
    for (const ms of [2820, 2870, 3000]) expect(p(ms)).toEqual(poseAicha(neutre, ms, { bouche: boucheA(ms, bouche) }));
    expect(p(2870).mouth[1]).toBeGreaterThan(0);
    expect(p(2450, { reduit: true }).pitch).toBe(0);
    p(50);
    p(3700);
    expect(p(2450)).toEqual(haut);
  });

  it('n’annonce ni un commentaire, ni une reprise sans temps pour se redresser', () => {
    const mot = seg('Première phrase.', 0, 1600);
    const commande = seg('$ lecture', 1600, 4600);
    const commentaire = seg('# Puis elle attend.', 4600, 6100);
    const scenarios = [
      planAicha([mot, commande, commentaire], 6100),
      planAicha([mot, seg('On reprend.', 2600, 4300)], 4300),
      planAicha([mot, commande, seg('On reprend.', 4600, 6100)], 6100),
    ];
    expect(scenarios[2].marches[0].end).toBe(4.6);
    for (const direction of scenarios) expect(direction.reprises).toEqual([]);
  });

  it('omet le transfert et la levée si une parole ou une marche interrompt la fenêtre', () => {
    const motAvant = planAicha([seg('Oui.', 5565, 5600)], 11000);
    const motApres = planAicha([seg('Oui.', 8020, 8080)], 11000);
    const marche = planAicha([seg('Je m’avance pour regarder.', 7740, 10400)], 11000);
    expect(marche.marches[0].start).toBe(7.74);
    for (const direction of [motAvant, motApres, marche]) {
      for (const ms of [5990, 6420, 7000, 7590]) {
        const p = poseAicha(direction, ms), ref = poseAicha({ ...direction, paroles: [], marches: [], reprises: [] }, ms);
        expect(p.stepR).toEqual(p.stepL);
        expect(p.weight).toBeGreaterThan(ref.weight);
        expect(p.gazeY).toBeLessThanOrEqual(ref.gazeY);
      }
    }
    const silence = planAicha([seg('Un mot.', 0, 11000, { speechEndMs: 4900 })], 11000, { emotions: false });
    expect(poseAicha(silence, 7000).stepR).toEqual(attend(7000).stepR);
  });

  it('retrouve exactement le pied soulevé après une recherche dans le silence', () => {
    const silence = planAicha([seg('# Elle attend en silence.', 0, 12000)], 12000);
    const repere = poseAicha(silence, 7000);
    expect(repere.stepR.pitch).toBeGreaterThan(20);
    expect(repere).toEqual(attend(7000));
    poseAicha(silence, 2000);
    poseAicha(silence, 12000);
    expect(poseAicha(silence, 7000)).toEqual(repere);
    expect(attend(7000, { gain: 0 }).stepR).toEqual(attend(0).stepR);
  });

  it('peut reprendre vie en fin sans bouger le décor, sauf en mouvements réduits', () => {
    const fin = poseAicha(long, 14000), attendLaSuite = poseAicha(long, 14000, { attente: 7150 });
    expect(attendLaSuite.lunettes).toBe(1);
    expect(attendLaSuite.breath).not.toBe(fin.breath);
    expect(attendLaSuite.avance).toBe(fin.avance);
    expect(attendLaSuite.stepL).toEqual(fin.stepL);
    expect(attendLaSuite.stepR).toEqual(fin.stepR);
    const fatigue = poseAicha(long, 14000, { attente: 10400 });
    expect(fatigue.stepR).toEqual(attend(7000).stepR);
    expect(fatigue.stepL).toEqual(fin.stepL);
    expect(fatigue.avance).toBe(fin.avance);
    for (const ms of [3780, 7000, 7730, 10420]) expect(attend(ms, { reduit: true })).toEqual(attend(0, { reduit: true }));
  });
});

describe('Démarche frontale', () => {
  const m = long.marches[0], a = (u) => poseAicha(long, sampleCue(m, u));

  it('déroule talon, semelle puis pointe et conserve le double appui entre les pas', () => {
    const vals = [.27, .29, .375, .49, .54].map(u => jambesAicha(a(u))[1]);
    const [vol, talon, plat, pointe, repart] = vals;
    expect(vol.ground.grounded).toBe(false);
    expect(talon.heel.y).toBeCloseTo(SOL, 8);
    expect(talon.toe.y).toBeLessThan(SOL - 1);
    expect(plat.heel.y).toBeCloseTo(SOL, 8);
    expect(plat.toe.y).toBeCloseTo(SOL, 8);
    expect(pointe.toe.y).toBeCloseTo(SOL, 8);
    expect(pointe.heel.y).toBeLessThan(SOL - 1);
    expect(repart.ground.grounded).toBe(false);
    expect(jambesAicha(a(.29)).every(v => v.ground.grounded)).toBe(true);
    expect(jambesAicha(a(.49)).every(v => v.ground.grounded)).toBe(true);
  });

  it('pose les pieds près de l’axe sans les croiser et referme la marche', () => {
    const largeur = (u) => {
      const [l, r] = jambesAicha(a(u));
      expect(l.ankle.x).toBeLessThan(0);
      expect(r.ankle.x).toBeGreaterThan(0);
      expect(l.ground.grounded && r.ground.grounded).toBe(true);
      return r.ankle.x - l.ankle.x;
    };
    const depart = largeur(0);
    expect(largeur(.49)).toBeGreaterThan(.62 * depart);
    expect(largeur(.49)).toBeLessThan(.73 * depart);
    expect(largeur(1)).toBe(depart);
  });

  it('fait monter la hanche d’appui en gardant les épaules posées', () => {
    for (const [u, signe] of [[.38, 1], [.58, -1]]) {
      const p = a(u), [l, r] = jambesAicha(p);
      expect((signe > 0 ? r : l).ground.grounded).toBe(true);
      expect(signe * p.weight).toBeGreaterThan(3.8);
      expect(signe * p.hip).toBeLessThan(-3.7);
      expect(Math.abs(p.hip)).toBeLessThan(5.1);
      expect(signe * (l.hip.y - r.hip.y)).toBeGreaterThan(1.5);
      expect(Math.abs(p.hip + p.chest)).toBeLessThan(1.25);
      expect(Math.abs(p.buste + p.weight)).toBeLessThan(4.3);
    }
  });

  it('oppose bras et jambes, atténue les grands gestes et maintient la tête haute', () => {
    for (const u of [.29, .49, .69]) {
      const p = a(u), [l, r] = jambesAicha(p), bg = brasAicha(p, 'L'), bd = brasAicha(p, 'R');
      const avanceDroite = Math.sign(r.ankle.z - l.ankle.z);
      expect(avanceDroite * (bg.W.z - bd.W.z)).toBeGreaterThan(20);
      expect(avanceDroite * (r.hip.z - l.hip.z)).toBeGreaterThan(0);
      expect(avanceDroite * (bg.S.z - bd.S.z)).toBeGreaterThan(0);
    }
    for (let u = .18; u <= .83; u += .01) {
      const p = a(u);
      expect(Math.abs(p.weight)).toBeLessThan(5.2);
      expect(Math.abs(p.hip + p.chest + p.tilt + p.neck * .38)).toBeLessThan(2.1);
      expect(Math.min(...['L', 'R'].map(s => brasAicha(p, s).main.y))).toBeGreaterThan(88);
      expect(p.settle).toBeLessThan(2.6);
      expect(Math.max(p.openL, p.openR, p.indexL, p.indexR)).toBeLessThan(.10);
      expect(Math.max(p.flexL, p.flexR)).toBeLessThan(23);
    }
  });

  it('accélère sans secousse, avance régulièrement puis s’arrête', () => {
    const d = (u) => a(u).avance, pas = d(.43) - d(.33);
    expect(pas).toBeGreaterThan(0);
    expect(d(.53) - d(.43)).toBeCloseTo(pas, 9);
    expect(d(.63) - d(.53)).toBeCloseTo(pas, 9);
    expect(d(.08)).toBeLessThan(pas * .02);
    expect(m.distance - d(.92)).toBeLessThan(pas * .02);
    expect(d(1)).toBeCloseTo(m.distance, 9);
  });
});

describe('Défilement en profondeur', () => {
  it('laisse les dalles dans le même monde que le pied d’appui quand la caméra recule', () => {
    const m = long.marches[0], p = poseAicha(long, sampleCue(m, .23));
    const [appui] = jambesAicha(p);
    expect(p.avance).toBeGreaterThan(0);
    expect(appui.ground.grounded).toBe(true);
    expect(appui.ankle.z + p.avance).toBeCloseTo(0, 9);
    const grille = [...dalles(440, p.avance)];
    const dalle = grille.find(r => r.n === 0);
    expect(dalle.y).toBeCloseTo(HORIZON + (appui.ankle.y + 15 - HORIZON) * focale(appui.ankle.z), 9);
    expect(dalle.y).toBeLessThan(SOL);
    const ancienne = new Map([...dalles(440, 0)].map(r => [r.n, r.y]));
    const proche = ancienne.get(0) - dalle.y, lointaine = ancienne.get(-5) - grille.find(r => r.n === -5).y;
    expect(proche).toBeGreaterThan(lointaine);
    expect(lointaine).toBeGreaterThan(0);
  });

  it('conserve le décor à l’arrêt et continue vers l’avant lors de la marche suivante', () => {
    const [a, b] = suite.marches, pose = (t) => poseAicha(suite, t * 1000);
    expect(pose(a.start).avance).toBe(0);
    expect(pose((a.end + b.start) / 2).avance).toBeCloseTo(a.distance);
    expect(pose(b.start).avance).toBeCloseTo(a.distance);
    expect(pose(b.end + .1).avance).toBeCloseTo(a.distance + b.distance);
    expect(pose(24).avance).toBe(pose(b.end + .1).avance);
    expect(poseAicha(suite, 1800, { reduit: true }).avance).toBe(0);
  });
});

describe('Lèvres et voix', () => {
  it('distingue des lèvres jointes, ouvertes, arrondies et le contact F/V', () => {
    const track = planBouche([seg('Maman voit du feu.', 400, 2140)], 'fr', true)[0];
    const shapes = track.phones.map(son => boucheA((son.start + son.end) / 2, [track]));
    expect(shapes.some(s => s[1] === 0 && s[0] < .99)).toBe(true);
    expect(shapes.some(s => s[1] > 3)).toBe(true);
    expect(shapes.some(s => s[2] > .7)).toBe(true);
    expect(shapes.some(s => s[4] > .9)).toBe(true);
  });

  it('ferme la bouche dans les commentaires, les commandes, les silences et après la vraie fin de phrase', () => {
    const track = planBouche([seg('$ ls', 0, 800), seg('# Ne pas lire.', 800, 1200), seg('Papa !', 2400, 5100, { speechEndMs: 4500 })], 'fr');
    for (const ms of [100, 1000, 2300, 4550, 5400]) expect(boucheA(ms, track)).toBe(REPOS_BOUCHE);
    const son = track[0].phones.find(p => p.value[1] > 3), t = (son.start + son.end) / 2;
    expect(boucheA(t, track)[1]).toBeGreaterThan(1);
    expect(boucheA(t, track, 0)).toBe(REPOS_BOUCHE);
  });

  it('garde une enveloppe réelle, même après un saut ou en stéréo inversée', () => {
    const sr = 16000, a = new Float32Array(sr * 2), b = new Float32Array(a.length);
    for (let i = sr / 2; i < sr; i++) { a[i] = .25 * Math.sin(i * 2 * Math.PI * 230 / sr); b[i] = -a[i]; }
    const rms = enveloppeAudio([a, b], sr);
    expect(rms(700)).toBeGreaterThan(.9);
    expect(rms(300)).toBe(0);
    expect(rms(1500)).toBe(0);
    expect(rms(2050)).toBe(0);
    expect(rms(700)).toBeGreaterThan(.9);
    expect(enveloppeAudio([new Float32Array(600)], sr)(12)).toBe(0);
  });
});
