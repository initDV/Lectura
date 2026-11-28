import { describe, expect, it } from 'vitest';
import { compilerPlanches, indexPlanche, opacitePlanche } from '../src/modules/atlas/calage.js';
import { poserReseau } from '../src/modules/atlas/reseau-local.js';
import planches from '../src/modules/atlas/planches.json';

const planifier = compilerPlanches(planches);
const seg = (texte, debutMs = 0, finMs = 3400) => ({ texte, debutMs, finMs });
const ids = (segments) => planifier(segments).map(e => e.fiche.id);

describe('Atlas suit les repères Lectura', () => {
  it('emploie les fenêtres existantes, y compris une phrase courte et un espace sans lecture', () => {
    const plan = planifier([
      seg('Le RÉSEAU local relie les appareils.', 120, 1240),
      seg('Le cycle de l’eau relie les mers au ciel.', 3100, 8600),
    ]);
    expect(plan.map(p => [p.fiche.id, p.debut, p.fin])).toEqual([
      ['reseau-local', 120, 1240], ['vue-cycle-eau', 3100, 8600],
    ]);
    const cadre = (ms) => opacitePlanche(plan[indexPlanche(plan, ms)], ms, false);
    expect(indexPlanche(plan, 0)).toBe(-1);
    expect(cadre(300)).toBeLessThan(1);
    const avant = cadre(700);
    expect(avant).toBe(1);
    expect(cadre(1200)).toBeLessThan(avant);
    expect(cadre(1240)).toBe(0);
    expect(cadre(2000)).toBe(0);
    expect(cadre(3400)).toBeLessThan(1);
    expect(cadre(700)).toBe(avant); // retour au même instant, aucune horloge de rendu
    expect(opacitePlanche(plan[0], 120, true)).toBe(1);
    expect(opacitePlanche(plan[0], 1240, true)).toBe(0);
  });

  it('reconnaît le texte actuel ou un alias borné, pas une citation ou une simple coïncidence', () => {
    expect(ids([seg("Aujourd’hui, on apprend à repérer les machines d'un réseau.")])).toEqual(['reseau-local']);
    expect(ids([seg('We learn how to spot the machines on a network.')])).toEqual(['reseau-local']);
    for (const texte of ['On cite « réseau local ».', 'On ne parle pas de réseau local.', 'Un réseau local ?',
      'Dans un réseau local, je parle aussi du cycle de l’eau.', '$ réseau local', '# réseau local',
      'Le surréseau localisé reste actif.', 'Le banc brille sous le soleil.']) expect(ids([seg(texte)]), texte).toEqual([]);
  });

  it('ne dessine une variante faible que si ses indices sont réunis dans le segment', () => {
    expect(ids([seg('Ils ouvrent la chaussée, construisent le tunnel à faible profondeur puis referment la rue.')]))
      .toEqual(['mobilite-transports-tranchee-couverte']);
    expect(ids([seg('Ils creusent le tunnel à faible profondeur.')])).toEqual([]);
    expect(ids([seg('Ils ouvrent la chaussée, posent un tunnel à faible profondeur mais referment la rue.')])).toEqual([]);
    expect(ids([seg('Ils citent « ouvrent la chaussée », parlent du tunnel à faible profondeur puis referment la rue.')])).toEqual([]);
  });

  it('garde la même planche sur un vrai renvoi contigu et la retire avant un autre sujet', () => {
    const plan = planifier([
      seg('La vapeur redevient liquide.', 0, 1900),
      seg('C’est la condensation sur un verre très froid.', 1900, 4000),
      seg('Sur ce dessin, les gouttes liquides sont au bord.', 4000, 6100),
      seg('# gouttes liquides', 6100, 6100),
      seg('Sur ce dessin, les gouttes liquides sont au bord.', 6100, 8000),
      seg('Le cycle de l’eau reprend.', 8000, 9400),
    ]);
    expect(plan.map(p => [p.fiche.id, p.debut, p.fin])).toEqual([
      ['meteo-cycle-condensation', 0, 6100], ['vue-cycle-eau', 8000, 9400],
    ]);
  });
});

describe('Planche animée « Réseau local »', () => {
  const intro = seg('Dans un réseau local, le routeur relie les appareils.', 0, 3000);
  const echange = seg('Les appareils échangent des données.', 3000, 5000);

  it('allume le routeur puis les liaisons et ne déplace un signal que pendant un échange', () => {
    const plan = planifier([intro, echange, seg('La lecture continue.', 5000, 6000)]);
    expect(plan.map(p => [p.fiche.id, p.debut, p.fin])).toEqual([['reseau-local', 0, 5000]]);
    const p = plan[0].reseau, pose = (ms) => poserReseau(p, ms, false);
    expect(p.routeur[0]).toBeCloseTo(3000 * intro.texte.indexOf('routeur') / intro.texte.length);
    expect(p.liens[0]).toBeCloseTo(3000 * intro.texte.indexOf('relie') / intro.texte.length);
    expect(p.signaux[0].debut).toBeCloseTo(3000 + 2000 * echange.texte.indexOf('échangent') / echange.texte.length);
    expect(pose(1000)).toEqual({ routeur: 0, liens: 0, trajet: false, signal: null });
    expect(pose(1700)).toMatchObject({ liens: 0, signal: null });
    expect(pose(1700).routeur).toBeGreaterThan(.8);
    expect(pose(2400).liens).toBeGreaterThan(.5);
    expect(pose(3400)).toEqual({ routeur: 1, liens: 1, trajet: false, signal: null });
    const premier = pose(3990);
    expect(premier.signal).toBeGreaterThan(0);
    expect(pose(4700).signal).toBeGreaterThan(premier.signal);
    expect(pose(3990)).toEqual(premier);
    expect(pose(5000).signal).toBeNull();
  });

  it('ne prolonge pas une planche séparée par un blanc, une commande ou un changement de sujet', () => {
    for (const segments of [
      [intro, { ...echange, debutMs: 3200 }],
      [intro, seg('$ les appareils échangent des données', 3000, 3000), echange],
      [intro, seg('Sans rapport, les appareils échangent des données.', 3000, 5000)],
      [intro, seg('Quels appareils échangent des données ?', 3000, 5000)],
      [intro, seg('Les appareils ne transmettent pas de données.', 3000, 5000)],
      [intro, seg('Le routeur contient des données.', 3000, 5000)],
    ]) expect(planifier(segments).map(({ fin }) => fin)).toEqual([3000]);
    expect(ids([echange])).toEqual([]);
    expect(ids([intro, seg('Le cycle de l’eau est à l’étude.', 3000, 5000)])).toEqual(['reseau-local', 'vue-cycle-eau']);
  });

  it('réserve le signal aux échanges affirmés, y compris en anglais', () => {
    const [citation] = planifier([seg('Dans ce réseau local, on lit « échange de données ».')]);
    expect(citation.reseau.signaux).toEqual([]);
    const phrase = 'On a local network, the router connects devices and they exchange data.';
    const [planche] = planifier([{ ...seg(phrase, 1000, 5300), speechEndMs: 4800 }]);
    const [signal] = planche.reseau.signaux;
    expect(signal.debut).toBeCloseTo(1000 + 3800 * phrase.indexOf('exchange') / phrase.length);
    expect(signal.fin).toBeLessThanOrEqual(5300);
    expect(poserReseau(planche.reseau, signal.debut - 1, true)).toEqual({ routeur: 1, liens: 1, trajet: false, signal: null });
    const reduit = { routeur: 1, liens: 1, trajet: true, signal: null };
    expect(poserReseau(planche.reseau, signal.debut + 1, true)).toEqual(reduit);
    expect(poserReseau(planche.reseau, signal.fin - 1, true)).toEqual(reduit);
  });
});
