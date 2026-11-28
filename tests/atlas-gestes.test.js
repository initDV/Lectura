import { describe, expect, it } from 'vitest';
import { compilerPlanches } from '../src/modules/atlas/calage.js';
import { poserCondensation } from '../src/modules/atlas/condensation.js';
import { poserGeste } from '../src/modules/atlas/gestes.js';
import { ID_RESEAU } from '../src/modules/atlas/reseau-local.js';
import { ID_CONDENSATION, SCENARIOS } from '../src/modules/atlas/scenarios.js';
import planches from '../src/modules/atlas/planches.json';

const planifier = compilerPlanches(planches);
const seg = (texte, debutMs = 0, finMs = 4200) => ({ texte, debutMs, finMs });

describe('Les gestes du catalogue Atlas', () => {
  it('couvre les 100 planches distinctes, avec plusieurs étapes dans chaque dessin', () => {
    expect(planches).toHaveLength(100);
    expect(new Set(planches.map(p => p.id)).size).toBe(planches.length);
    expect(new Set(planches.map(p => p.svg)).size).toBe(planches.length);
    expect(Object.keys(SCENARIOS).sort()).toEqual(planches.filter(p => p.id !== ID_RESEAU).map(p => p.id).sort());
    for (const { id, expressions } of planches) {
      const planche = expressions.map(t => planifier([seg(`Voici ${t}.`)])[0]).find(p => p?.fiche.id === id);
      expect(planche, id).toBeDefined();
      if (id === ID_RESEAU) { expect(planche.reseau).toBeDefined(); continue; }
      expect(SCENARIOS[id].length, id).toBeGreaterThanOrEqual(2);
      for (const { mots, zone, trajet } of SCENARIOS[id]) {
        const [x, y, w, h] = zone;
        expect(mots.length, id).toBeGreaterThan(0);
        expect(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 420 && y + h <= 248, id).toBe(true);
        if (trajet) {
          expect(trajet.length >= 4 && trajet.length % 2 === 0, id).toBe(true);
          expect(trajet.every((c, i) => c >= 0 && c <= (i % 2 ? 248 : 420)), id).toBe(true);
          for (let i = 2; i < trajet.length; i += 2) expect(Math.hypot(trajet[i] - trajet[i - 2], trajet[i + 1] - trajet[i - 1]), id).toBeGreaterThan(0);
        }
      }
      expect(planche.gestes.length, id).toBeGreaterThan(0);
      for (const [i, g] of planche.gestes.entries()) {
        expect(g.debut >= (planche.gestes[i - 1]?.fin ?? 0) && g.fin > g.debut && g.fin <= planche.fin, id).toBe(true);
        const milieu = (g.debut + g.fin) / 2;
        expect(poserGeste(planche.gestes, milieu, false)).toEqual({ action: g, u: expect.closeTo(.5), reduit: false });
      }
    }
  });

  it('permet à chaque scénario de continuer sur une locution de suite, sans redémarrer après un blanc', () => {
    for (const { id, expressions } of planches) {
      if (id === ID_RESEAU) continue; // Le pilote a ses propres tests de continuité.
      const debut = expressions.map(t => seg(`Voici ${t}.`)).find(s => planifier([s])[0]?.fiche.id === id);
      const suites = SCENARIOS[id].flatMap(({ suite }, index) => suite.split('|').filter(Boolean).map(mot => ({ mot, index })));
      const active = suites.find(({ mot, index }) => {
        const suite = seg(mot, debut.finMs, 7200), [p] = planifier([debut, suite]);
        return p.fin === suite.finMs && p.gestes.some(g => g.debut >= suite.debutMs && g.geste.index === index) &&
          planifier([suite]).length === 0;
      });
      expect(active, id).toBeDefined();
      const apresBlanc = seg(active.mot, debut.finMs + 120, 7200);
      expect(planifier([debut, apresBlanc]).map(p => p.fin), id).toEqual([debut.finMs]);
      expect(planifier([debut, seg('Changeons de sujet.', 4200, 5400), seg(active.mot, 5400, 7200)]).map(p => p.fin), id).toEqual([4200]);
    }
  });

  it('date les gestes français et anglais dans la durée parlée plutôt que dans la pause', () => {
    for (const { texte, locution } of [
      { texte: 'La construction en tranchée couverte commence : on ouvre la chaussée.', locution: 'ouvre la chaussée' },
      { texte: 'For the cut-and-cover tunnel, we first excavate the street.', locution: 'excavate the street' },
    ]) {
      const s = { ...seg(texte, 1200, 5600), speechEndMs: 4100 };
      const [p] = planifier([s]);
      expect(p.fiche.id).toBe('mobilite-transports-tranchee-couverte');
      const [ouverture] = p.gestes;
      expect(ouverture.geste.index).toBe(0);
      expect(ouverture.survol).toBe(false);
      expect(ouverture.debut).toBeCloseTo(1200 + 2900 * texte.indexOf(locution) / texte.length);
      expect(ouverture.fin).toBeLessThanOrEqual(s.finMs);
      expect(p.fin).toBe(s.finMs);
    }
  });

  it('cale l’ouverture, la construction et la couverture de la rue sur les mots prononcés', () => {
    const a = seg('Pour la construction en tranchée couverte, on ouvre la chaussée.', 0, 3000);
    const b = seg('On construit le tunnel.', 3000, 5200);
    const c = seg('Puis on rétablit la chaussée.', 5200, 7500);
    const [p] = planifier([a, b, c, seg('Reprenons la lecture.', 7500, 9000)]);
    expect([p.fiche.id, p.debut, p.fin]).toEqual(['mobilite-transports-tranchee-couverte', 0, 7500]);
    expect(p.gestes.map(g => g.geste.index)).toEqual([0, 1, 2]);
    expect(p.gestes[1].debut).toBeCloseTo(3000 + 2200 * b.texte.indexOf('construit') / b.texte.length);
    expect(p.gestes[2].debut).toBeCloseTo(5200 + 2300 * c.texte.indexOf('rétablit') / c.texte.length);
    const g = p.gestes[1], t = g.debut + 180, pose = poserGeste(p.gestes, t, false);
    expect(pose.action).toBe(g);
    expect(poserGeste(p.gestes, t + 110, false).u).toBeGreaterThan(pose.u);
    expect(poserGeste(p.gestes, t, false)).toEqual(pose);
    expect(poserGeste(p.gestes, t + 110, true)).toEqual({ action: g, u: 1, reduit: true });
    expect(poserGeste(p.gestes, 7500, false)).toBeNull();
  });

  it('montre le trajet vers le parent sans lancer de commande ni prendre les citations pour des gestes', () => {
    const a = seg('Pour remonter au dossier parent, le dossier de départ est atelier.', 0, 2500);
    const b = seg('Deux points consécutifs permettent de remonter d’un niveau.', 2500, 4500);
    const [p] = planifier([a, b]);
    expect([p.fiche.id, p.fin]).toEqual(['informatique-systemes-dossier-parent', 4500]);
    const remontee = p.gestes.find(g => g.geste.trajet);
    expect(remontee.survol).toBe(false);
    expect(remontee.geste.trajet.points.at(-1)[1]).toBeLessThan(remontee.geste.trajet.points[0][1]);
    for (const texte of ['$ cd ..', 'On cite « remonter d’un niveau ».','On ne peut pas remonter d’un niveau.']) {
      expect(planifier([a, { ...b, texte }])[0]?.fin, texte).toBe(2500);
    }
  });

  it('éclaire les quatre phases de la Lune dans l’ordre de leur lecture, puis rend la place au texte', () => {
    const phrases = [
      'Observons les phases de la Lune.', 'À la nouvelle lune, la face tournée vers nous est sombre.',
      'Au premier quartier, on en voit une moitié éclairée.', 'À la pleine lune, le disque visible est éclairé.',
      'Vient ensuite le dernier quartier.', 'Reprenons la lecture.',
    ];
    const plan = planifier(phrases.map((texte, i) => seg(texte, i * 2500, (i + 1) * 2500)));
    expect(plan.map(p => [p.fiche.id, p.debut, p.fin])).toEqual([['astronomie-phases-lune', 0, 12500]]);
    expect(plan[0].gestes.map(g => g.geste.index)).toEqual([0, 1, 2, 3]);
    expect(plan[0].gestes.every(g => !g.survol)).toBe(true);
  });

  it('prévoit un survol sobre lorsque le texte ne donne pas les étapes et le supprime en mouvements réduits', () => {
    const [p] = planifier([seg('Voici le cycle de l’eau.')]);
    expect(p.gestes).toHaveLength(4);
    expect(p.gestes.every(g => g.survol)).toBe(true);
    const [premier] = p.gestes, milieu = (premier.debut + premier.fin) / 2;
    expect(poserGeste(p.gestes, milieu, false).action).toBe(premier);
    expect(poserGeste(p.gestes, milieu, true)).toBeNull();
  });
});

describe('Condensation sur le verre', () => {
  const a = seg('La vapeur redevient liquide sur la paroi froide du verre.', 0, 3000);
  const b = seg('De petites gouttes se forment.', 3000, 6000);
  const c = seg('Les gouttes se rejoignent puis glissent le long du verre.', 6000, 9000);

  it('conserve le verre pour les étapes contiguës et montre la transformation dans l’ordre', () => {
    const [p] = planifier([a, b, c, seg('La lecture continue.', 9000, 10000)]);
    expect([p.fiche.id, p.debut, p.fin]).toEqual([ID_CONDENSATION, 0, 9000]);
    expect(p.gestes.map(g => g.geste.index)).toEqual([0, 1, 2, 3]);
    const pose = (ms, r = false) => poserCondensation(p.gestes, ms, r);
    expect(pose(1000)).toEqual({ froid: 0, gouttes: 0, fusion: 0, glisse: 0 });
    expect(pose(2900)).toEqual({ froid: 1, gouttes: 0, fusion: 0, glisse: 0 });
    expect(pose(3500).gouttes).toBeGreaterThan(0);
    expect(pose(5500)).toEqual({ froid: 1, gouttes: 1, fusion: 0, glisse: 0 });
    const reunion = pose(6800);
    expect(reunion.fusion).toBeGreaterThan(0);
    expect(reunion.fusion).toBeLessThan(1);
    expect(pose(8010)).toMatchObject({ froid: 1, gouttes: 1, fusion: 1 });
    expect(pose(8010).glisse).toBeGreaterThan(0);
    expect(pose(6800)).toEqual(reunion);
    expect(pose(6800, true)).toEqual({ froid: 1, gouttes: 1, fusion: 1, glisse: 0 });
  });

  it('reconnaît le verre froid en anglais et peut en montrer une pose fixe si le texte ne détaille pas les étapes', () => {
    const [p] = planifier([seg('The condensation on a cold glass is visible.', 0, 2800),
      seg('Tiny droplets form.', 2800, 5000), seg('The droplets merge and then run down.', 5000, 7600)]);
    expect(p.fiche.id).toBe(ID_CONDENSATION);
    expect(p.gestes.map(g => g.geste.index)).toEqual([0, 1, 2, 3]);
    const [intro] = planifier([seg('Voici la condensation de la vapeur.')]);
    expect(intro.gestes.every(g => g.survol)).toBe(true);
    expect(poserCondensation(intro.gestes, 100, true)).toEqual({ froid: 1, gouttes: 1, fusion: 0, glisse: 0 });
    expect(poserCondensation(intro.gestes, 3000, true)).toEqual(poserCondensation(intro.gestes, 100, true));
  });

  it('ne fait pas glisser de goutte quand seule leur formation est lue ou que le sujet est interrompu', () => {
    const [p] = planifier([a, b]);
    expect(poserCondensation(p.gestes, 5800, false)).toEqual({ froid: 1, gouttes: 1, fusion: 0, glisse: 0 });
    expect(planifier([a, { ...b, debutMs: 3300 }, c]).map(g => g.fin)).toEqual([3000]);
    expect(planifier([b, c])).toEqual([]);
  });
});
