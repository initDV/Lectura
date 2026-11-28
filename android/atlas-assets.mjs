// Les mêmes données et motifs qu’en PWA, mais aucun JavaScript dans l’APK.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cles, REGLES_ATLAS } from '../src/modules/atlas/calage.js';
import { DESSIN_CONDENSATION } from '../src/modules/atlas/condensation.js';
import { DESSIN_RESEAU, ID_RESEAU, MOTS_RESEAU } from '../src/modules/atlas/reseau-local.js';
import { ID_CONDENSATION, SCENARIOS } from '../src/modules/atlas/scenarios.js';

export async function empaqueterAtlas(output, read) {
  const planches = JSON.parse(await read('src/modules/atlas/planches.json'));
  const dossier = join(output, 'atlas');
  const identifiants = new Set();
  const tokens = (liste) => liste?.map(cles).filter(s => s.length) ?? [];
  const fiches = planches.map(({ id, nom, description, svg, expressions, contextuelles, rappels, scenario }) => {
    if (!/^[a-z0-9-]+$/.test(id) || identifiants.has(id) || !svg.startsWith('<svg')) throw Error(`Planche Atlas invalide : ${id}`);
    identifiants.add(id);
    return { id, nom, description, expressions: tokens(expressions), rappels: tokens(rappels),
      contextuelles: contextuelles?.map(({ expression, avant, apres }) => ({ mots: cles(expression), avant: tokens(avant), apres: tokens(apres) })),
      gestes: (scenario ?? SCENARIOS[id] ?? []).map(({ mots, suite, zone, trajet }) => ({
        mots: tokens(mots.split('|')), suite: tokens(suite?.split('|')), zone, trajet,
      })),
    };
  });
  await mkdir(dossier, { recursive: true });
  await Promise.all([
    writeFile(join(dossier, 'index.json'), JSON.stringify({ fiches,
      regles: Object.fromEntries(Object.entries(REGLES_ATLAS).map(([k, v]) => [k, v.source])),
      reseau: { id: ID_RESEAU, mots: MOTS_RESEAU, dessin: DESSIN_RESEAU },
      condensation: { id: ID_CONDENSATION, dessin: DESSIN_CONDENSATION },
    })),
    // Charger uniquement le vecteur réellement utilisé, pas un arbre de mille dessins au lancement.
    ...planches.map(({ id, svg }) => writeFile(join(dossier, `${id}.svg`), svg)),
  ]);
}
