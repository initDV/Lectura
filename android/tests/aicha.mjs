// Sample the Web rig at fixed source times. The native recipe compares both motion and geometry.
import { planAicha, poseAicha } from '../../src/modules/aicha/motion.js';
import { brasAicha, jambesAicha } from '../../src/modules/aicha/rig.js';
import { boucheA, planBouche } from '../../src/modules/aicha/mouth.js';
import { typeLigne } from '../../src/modules/timeline.js';

const segment = (texte, debutMs, finMs, speechEndMs = finMs, expression = 'auto') => ({ texte, debutMs, finMs, speechEndMs, expression });
const long = 'Nous pouvons partir ensemble au marché pour découvrir les étoffes colorées et écouter les commerçantes, puis partager le jus de bissap avec toute la famille';
const scenarios = [
  { id: 'salut-et-pas', duration: 24000, langue: 'fr', segs: [
    segment('Bonjour, nous sommes prêtes !', 0, 2140, 1980, 'content'),
    segment('Avance vers la place, mais garde le même rythme.', 2800, 6420, 6270),
    segment(long, 6500, 17900), segment('Tu viens au marché ?', 18000, 22100, 20700, 'curieux'),
  ], ms: [0, 140, 760, 1650, 2650, 2800, 3080, 3490, 3750, 4360, 4830, 5640, 6115, 8250, 11080, 11980, 12830, 17800, 19500, 20560, 24000] },
  { id: 'attente', duration: 0, langue: 'fr', segs: [], ms: [0], attentes: [0, 1190, 2690, 3520, 3800, 4600, 7000, 7730, 10420, 17200] },
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
];
const vec = ({ x, y, z }) => [x, y, z];
const fix = ({ segs, langue, siwis = false, duration, id, ms, attentes = [0], emotions = true }) => {
  const plan = planAicha(segs, duration, { emotions }), track = planBouche(segs, langue, siwis);
  const frames = ms.flatMap((t) => attentes.map((wait) => [t, wait, 1, false, '', true]));
  frames.push([ms[Math.floor(ms.length / 2)], attentes[Math.floor(attentes.length / 2)], 1.3, true, 'surpris', true]);
  frames.push([ms[0], attentes[Math.floor(attentes.length / 2)], .6, false, 'colere', false]);
  return { id, duration, emotions, langue, siwis, segs: segs.map(s => ({ ...s, spoken: typeLigne(s.texte) === 'parle' })),
    cues: plan.cues, walks: plan.marches, speech: plan.paroles, returns: plan.reprises,
    frames: frames.map(([t, wait, gain, reduced, expression, glasses]) => {
      const level = reduced ? .42 : 1;
      const p = poseAicha(plan, t, { gain, attente: wait, reduit: reduced, expression, monture: glasses, bouche: boucheA(t, track, level) });
      const legs = jambesAicha(p).map(({ hip, knee, ankle, rest, heel, toe, contact, reachable }) => ({
        positions: [hip, knee, ankle, rest, heel, toe, contact].map(vec), reachable,
      }));
      const arms = ['L', 'R'].map((side) => {
        const { S, E, W, main, rot, map } = brasAicha(p, side);
        return { positions: [S, E, W, main, map({ x: -34, y: 71, z: 0 })].map(vec), rot };
      });
      return { t, wait, gain, level, reduced, expression, glasses, p, legs, arms };
    }) };
};
export const aichaFixture = () => scenarios.map(fix);
