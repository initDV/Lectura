// Control the Java planner against the PWA for each shipped subject and representative edge cases.
import { readFile } from 'node:fs/promises';
import { compilerPlanches } from '../../src/modules/atlas/calage.js';

export async function atlasFixture() {
  const planches = JSON.parse(await readFile(new URL('../../src/modules/atlas/planches.json', import.meta.url), 'utf8'));
  const compiler = compilerPlanches(planches);
  const segment = (texte, debutMs = 0, finMs = 7000, speechEndMs) => ({ texte, debutMs, finMs, speechEndMs });
  const recognition = planches.map(({ expressions, id }) => {
    const selected = expressions.map(phrase => segment(`Voici ${phrase}.`)).find(s => compiler([s])[0]?.fiche.id === id);
    if (!selected) throw Error(`Atlas : aucun déclencheur reconnu pour ${id}`);
    return [selected.texte, id];
  });
  const cases = [
    [segment('Dans un réseau local, le routeur relie les appareils.', 0, 3000),
      segment('Les appareils échangent des données.', 3000, 5000), segment('La lecture continue.', 5000, 7000)],
    [segment('Dans un réseau local, le routeur relie les appareils.', 0, 3000, 2710),
      segment('Les appareils échangent des données.', 3300, 5000)],
    [segment('Voici un prisme optique. Le rayon de lumière blanche arrive.', 1000, 3200, 2800),
      segment('Les couleurs se séparent du rouge au violet.', 3200, 5600, 5200), segment('La lecture reprend.', 6200, 9200)],
    [segment('La vapeur redevient liquide.', 0, 1900), segment('C’est la condensation sur un verre très froid.', 1900, 4000),
      segment('Sur ce dessin, les gouttes liquides sont au bord.', 4000, 6100), segment('# gouttes liquides', 6100, 6100),
      segment('Sur ce dessin, les gouttes liquides sont au bord.', 6100, 8000)],
    ...['On cite « réseau local ».', 'On ne parle pas de réseau local.', 'Un réseau local ?', 'Titre : réseau local',
      '  # réseau local', '$ réseau local', 'Un réseau local et le cycle de l’eau.', 'Un surréseau localisé.',
      'Le RÉSEAU\u00a0local relie les appareils.', 'We learn how to spot the machines on a network.',
      'The condensation on a cold glass is visible.', 'The glass appears; condensation occurs.',
      'Ils ouvrent la chaussée, construisent le tunnel à faible profondeur puis referment la rue.',
      'Ils ouvrent la chaussée, posent un tunnel à faible profondeur mais referment la rue.',
      'Ils citent « ouvrent la chaussée », parlent du tunnel à faible profondeur puis referment la rue.',
      'On décrit la re\u0301flexion et la réfraction.', 'An optical prism separates the colours.'].map(text => [segment(text)]),
  ].map(segments => ({ segments, windows: compiler(segments).map(({ fiche, debut, fin, gestes, reseau }) => ({
    id: fiche.id, debut, fin, reseau,
    gestes: gestes?.map(({ geste, debut, fin, survol }) => [geste.index, debut, fin, survol]),
  })) }));
  return { recognition, cases };
}
