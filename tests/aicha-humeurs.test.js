import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planAicha, poseAicha } from '../src/modules/aicha/motion.js';
import { boucheA, planBouche, REPOS_BOUCHE } from '../src/modules/aicha/mouth.js';
import { creerHumeur } from '../src/modules/humeur.js';
import { compilerLexique } from '../src/modules/sentiment.js';
import { autoTiming, Timeline } from '../src/modules/timeline.js';

const texte = 'J’ai cru que tu ne viendrais pas… mais te voilà !';
const [debut, fin] = autoTiming(texte, 4000);
const segs = [{ ...debut, finMs: 2440, speechEndMs: 2000 }, { ...fin, debutMs: 2440, speechEndMs: 3770 }];
const lexique = compilerLexique(JSON.parse(readFileSync(new URL('../data/sentiments_fr.json', import.meta.url))));
const plan = (source, segments, options = {}) => planAicha(new Timeline(source, segments).segs, segments.at(-1).finMs,
  { texte: source, humeur: creerHumeur({ lexique, matcher: () => [] }), ...options });
const p = plan(texte, segs);

describe('Direction au sein d’une réplique', () => {
  it('fond les émotions même si l’ellipse est divisée en deux segments audio', () => {
    expect(p.visages).toHaveLength(1);
    const [f] = p.visages, [t] = f.transitions;
    expect(f.face).toBe('inquiet');
    expect(t.to.face).toBe('content');
    expect(t.start).toBeGreaterThanOrEqual(2);
    expect(t.start).toBeLessThan(2.05);
    expect(t.pivot).toBeCloseTo(2.44 + (3.77 - 2.44) * 5 / 15, 8);
    const [inquiet, silence, attend, joie] = [1600, 2380, 2820, 3220].map(t => poseAicha(p, t, { gain: 0 }));
    expect(inquiet.smile).toBeLessThan(-.44);
    expect(silence.gazeY).toBeLessThan(inquiet.gazeY - .16);
    expect(silence.pitch).toBeLessThan(inquiet.pitch - .95);
    expect(silence.smile).toBeLessThan(-.44);
    expect(attend.smile).toBeLessThan(-.44);
    expect(joie.smile).toBeGreaterThan(.8);
    expect(poseAicha(p, 2380, { gain: 0 })).toEqual(silence);
  });

  it('fonctionne aussi dans un seul segment importé, et se déclenche par le vocabulaire ordinaire', () => {
    const bloc = txt => plan(txt, [{ texte: txt, debutMs: 0, finMs: 6800, expression: 'auto' }]);
    expect(bloc(texte).visages[0].transitions[0].leve).toBe(true);
    const autre = 'J’étais triste, puis heureux, puis en colère.';
    const [f] = bloc(autre).visages;
    expect(f.face).toBe('triste');
    expect(f.transitions.map(t => t.to.face)).toEqual(['content', 'colere']);
    const fixe = t => poseAicha(bloc(autre), t * 1000, { reduit: true });
    for (const t of f.transitions) {
      for (const instant of [t.start, t.pivot, t.fin]) {
        const a = fixe(instant - .0001), b = fixe(instant + .0001);
        for (const k of ['smile', 'inner', 'outer', 'lids', 'focus']) expect(a[k]).toBeCloseTo(b[k], 3);
      }
    }
  });

  it('n’enchaîne pas de réplique au travers d’un paragraphe ou d’un silence prolongé', () => {
    const bloc = [debut.texte, fin.texte].join('\n');
    for (const direction of [plan(bloc, segs), plan(texte, [{ ...segs[0], speechEndMs: 1300 }, segs[1]])]) {
      expect(direction.visages).toHaveLength(2);
      expect(direction.visages.every(v => !v.transitions)).toBe(true);
    }
  });

  it('respecte le choix par segment, l’expression directe et le réglage automatique', () => {
    expect(plan(texte, segs, { emotions: false }).visages).toEqual([]);
    const force = [segs[0], { ...segs[1], expression: 'colere' }];
    for (const emotions of [true, false]) {
      const direction = plan(texte, force, { emotions });
      expect(direction.visages.at(-1)).toMatchObject({ face: 'colere', manual: true });
      expect(poseAicha(direction, 3380).focus).toBeCloseTo(1);
    }
    const neutre = plan(texte, [{ ...segs[0], expression: 'neutre' }, segs[1]]);
    const q = poseAicha(neutre, 1240);
    expect([q.smile, q.inner, q.focus]).toEqual([0, 0, 0]);
    expect(poseAicha(p, 3380, { expression: 'triste' }).smile).toBeLessThan(-.9);
  });

  it('ne touche ni aux visèmes, ni à la stabilité du visage en mouvement réduit', () => {
    const lips = planBouche(segs, 'fr');
    expect(boucheA(2380, lips)).toBe(REPOS_BOUCHE);
    for (const t of [1600, 2380, 2820, 3220]) {
      const bouche = boucheA(t, lips);
      const fixe = poseAicha(p, t, { bouche, reduit: true, attente: 10000 });
      expect(fixe).toEqual(poseAicha(p, t, { bouche, reduit: true }));
      expect([fixe.gazeX, fixe.gazeY, fixe.pitch]).toEqual([0, 0, 0]);
      expect(fixe.mouth).toBe(bouche);
    }
    expect(poseAicha(p, 3220, { reduit: true }).smile).toBeGreaterThan(.8);
  });
});
