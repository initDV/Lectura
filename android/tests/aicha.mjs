// Sample the Web rig at fixed source times. The native recipe compares both motion and geometry.
import { readFileSync } from 'node:fs';
import { NOMS } from '../../src/modules/expressions.js';
import { planAicha, poseAicha } from '../../src/modules/aicha/motion.js';
import { brasAicha, cageAicha, doigtAicha, jambesAicha } from '../../src/modules/aicha/rig.js';
import { boucheA, planBouche } from '../../src/modules/aicha/mouth.js';
import { Timeline, typeLigne } from '../../src/modules/timeline.js';
import { creerHumeur } from '../../src/modules/humeur.js';
import { compilerLexique } from '../../src/modules/sentiment.js';

const segment = (texte, debutMs, finMs, speechEndMs = finMs, expression = 'auto') => ({ texte, debutMs, finMs, speechEndMs, expression });
const long = 'Nous pouvons partir ensemble au marché pour découvrir les étoffes colorées et écouter les commerçantes, puis partager le jus de bissap avec toute la famille';
const scenarios = [
  { id: 'salut-et-pas', duration: 24000, langue: 'fr', segs: [
    segment('Bonjour, nous sommes prêtes !', 0, 2140, 1980, 'content'),
    segment('Avance vers la place, mais garde le même rythme.', 2800, 6420, 6270),
    segment(long, 6500, 17900), segment('Tu viens au marché ?', 18000, 22100, 20700, 'curieux'),
  ], ms: [0, 140, 760, 1650, 2650, 2800, 3080, 3490, 3750, 4360, 4830, 5640, 6115, 8250, 11080, 11980, 12830, 17800, 19500, 20560, 24000] },
  { id: 'figures', duration: 6670, langue: 'fr', segs: [
    segment('Voici une piste pour éclairer notre choix.', 0, 2130, 1980),
    segment('Deux options : le temps ou le détail.', 2550, 5060, 4760),
    segment('Et voilà, nous avons trouvé !', 5240, 6670, 6420),
  ], ms: [365, 574, 644, 1055, 2060, 3060, 3278, 3424, 4820, 5744, 5940, 6420, 6670] },
  { id: 'figures-sans-emotion', duration: 3000, langue: 'fr', emotions: false, segs: [
    segment('Voici !', 0, 840), segment('Deux options !', 1040, 1880), segment('Bravo !', 2080, 2920),
  ], ms: [390, 1430, 2470] },
  { id: 'attente', duration: 0, langue: 'fr', segs: [], ms: [0], montures: [true, false],
    attentes: [0, 1190, 2690, 3520, 3800, 4600, 7000, 7730, 10420, 12610, 12900, 14000, 16300, 17200] },
  { id: 'reprise', duration: 4600, langue: 'fr', segs: [
    segment('Une phrase à huit heures trente.', 0, 2000, 1450), segment('# Silence', 2000, 2600),
    segment('$ attendre', 2600, 2820), segment('On reprend la nuit.', 2820, 4200, 4120, 'fier'),
  ], ms: [251, 943, 2160, 2450, 2630, 2870, 3940, 4500], siwis: true },
  { id: 'espaces-unicode', duration: 16000, langue: 'fr', segs: [
    segment('Oui, nous partons au marché,\uFEFFpuis nous revenons\u00a0avec du jus de bissap\u202f? »\uFEFF', 0, 9800, 9500),
    segment('Non, ce n’est pas encore fini ?\u0085', 10300, 15500, 15000),
  ], ms: [150, 2480, 4690, 7230, 9010, 11350, 14900] },
  { id: 'english', duration: 6000, langue: 'en', emotions: false, segs: [
    segment('Hello, look over here. Shall we go?', 0, 5900, 5800),
  ], ms: [0, 210, 550, 2140, 5400, 5975] },
  { id: 'repertoire-visages', duration: 0, langue: 'fr', segs: [], ms: [0], expressions: NOMS },
  { id: 'humeurs-en-parlant', duration: 13250, langue: 'fr', segs: [
    segment('Non, je ne veux pas, et je ne changerai pas d’avis !', 200, 3780, 3620, 'colere'),
    segment('Je suis triste, mais tu peux rester un peu.', 3920, 9420, 9010, 'triste'),
    segment('Oh, bravo !', 9420, 13250, 12750, 'content'),
  ], ms: [255, 540, 2110, 3600, 3770, 4110, 5430, 7800, 9020, 9585, 10210, 11110, 12850, 13250] },
  ...['replique-aicha', 'replique-monique', 'replique-coupee', 'replique-manuelle'].map((id, i) => {
    const def = JSON.parse(readFileSync(new URL(`../../characters/${i === 0 ? 'aicha' : 'monique'}.json`, import.meta.url)));
    return { id, duration: 4000, langue: 'fr', analyse: true, separateur: i === 2 ? '\n' : ' ',
      segs: [segment('J’ai cru que tu ne viendrais pas…', 0, 2440, 2000),
        segment('mais te voilà !', 2440, 4000, 3770, i === 3 ? 'colere' : 'auto')],
      ms: [420, 1835, 2040, 2250, 2410, 2480, 2883, 2940, 3060, 3220, 3600], ancre: def.appuiHanche };
  }),
  { id: 'tristesse-joie-colere', duration: 6800, analyse: true, langue: 'fr', segs: [
    segment('J’étais triste, puis heureux, puis en colère.', 0, 6800),
  ], ms: [600, 900, 2650, 3080, 3320, 4000, 4790, 5700, 6540, 6590] },
  ...['aicha', 'charlotte', 'doriane', 'monique', 'prisca'].map(id => {
    const def = JSON.parse(readFileSync(new URL(`../../characters/${id}.json`, import.meta.url)));
    return { id: `appui-${id}`, duration: 0, langue: 'fr', segs: [], ms: [0], attentes: [13080, 14000, 16300], ancre: def.appuiHanche };
  }),
  ...['charlotte', 'monique'].map(id => {
    const def = JSON.parse(readFileSync(new URL(`../../characters/${id}.json`, import.meta.url)));
    return { id: `presentation-${id}`, duration: 2500, langue: 'fr', segs: [segment('Voici ce qui change tout.', 0, 2500)],
      ms: [300, 850, 1240, 1560, 2190], ancre: def.appuiHanche };
  }),
];
const vec = ({ x, y, z }) => [x, y, z];
const fix = ({ segs, langue, analyse = false, separateur = ' ', siwis = false, duration, id, ms, attentes = [0], emotions = true, montures = [true], ancre, expressions = [] }) => {
  const texte = segs.map(s => s.texte).join(separateur);
  const lexique = analyse && compilerLexique(JSON.parse(readFileSync(new URL(`../../data/sentiments_${langue}.json`, import.meta.url))));
  const humeur = lexique ? creerHumeur({ lexique, matcher: () => [], actif: emotions }) : null;
  const pieces = new Timeline(texte, segs).segs;
  const plan = planAicha(pieces, duration, { emotions, humeur, texte }), track = planBouche(segs, langue, siwis);
  const frames = ms.flatMap(t => attentes.flatMap(wait => montures.map(glasses => [t, wait, 1, false, '', glasses])));
  frames.push([ms[Math.floor(ms.length / 2)], attentes[Math.floor(attentes.length / 2)], 1.3, true, 'surpris', true]);
  frames.push([ms[0], attentes[Math.floor(attentes.length / 2)], .6, false, 'colere', false]);
  frames.push(...expressions.map(expression => [0, 0, 1, false, expression, true]));
  return { id, duration, emotions, langue, siwis, ancre, analyse, texte, segs: pieces.map(s => ({ ...s, spoken: typeLigne(s.texte) === 'parle' })),
    cues: plan.cues, walks: plan.marches, speech: plan.paroles, returns: plan.reprises, moods: plan.visages,
    frames: frames.map(([t, wait, gain, reduced, expression, glasses]) => {
      const level = reduced ? .42 : 1;
      const p = poseAicha(plan, t, { gain, attente: wait, reduit: reduced, expression, monture: glasses, bouche: boucheA(t, track, level) });
      const legs = jambesAicha(p).map(({ hip, knee, ankle, rest, heel, toe, contact, reachable }) => ({
        positions: [hip, knee, ankle, rest, heel, toe, contact].map(vec), reachable,
      }));
      const arms = ['L', 'R'].map((side) => {
        const a = brasAicha(p, side, undefined, ancre);
        const { S, E, W, main, rot, map, avantBras, largeur, face, ouvert, index, prise, appui } = a;
        return { positions: [S, E, W, main, map({ x: -34, y: 71, z: 0 })].map(vec), rot,
          poignet: [avantBras, largeur, face, ouvert, index, prise, appui], doigts: Array.from({ length: 5 }, (_, i) => doigtAicha(a, i).map(vec)) };
      });
      const { c, s, pente } = cageAicha(p);
      return { t, wait, gain, level, reduced, expression, glasses, p, legs, arms, cage: [c, s, pente] };
    }) };
};
export const aichaFixture = () => scenarios.map(fix);
