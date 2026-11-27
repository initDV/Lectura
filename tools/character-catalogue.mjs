// Build-time contract shared by the PWA and the native Android asset packer.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { piecesSvg, RIG_AICHA } from '../src/modules/character-spec.js';

const INDEX = 'index.json';
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const lireIndex = (dossier) => JSON.parse(readFileSync(join(dossier, INDEX), 'utf8'));

function fichiersPersonnage(dossier, id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`Identifiant de personnage invalide : ${id}`);
  const fiche = `${id}.json`, def = JSON.parse(readFileSync(join(dossier, fiche), 'utf8'));
  if (def.id !== id) throw new Error(`« id » vaut « ${def.id} » mais le fichier s'appelle ${fiche}`);
  if (def.rig && def.rig !== RIG_AICHA) throw new Error(`Rig inconnu pour ${id} : ${def.rig}`);
  for (const k of ['nom', 'svg', 'mouvements']) if (!def[k]) throw new Error(`${fiche} : champ « ${k} » manquant`);
  const a = def.appuiHanche;
  if (a !== undefined && (def.rig !== RIG_AICHA || !Array.isArray(a) || a.length < 2 || a.length > 3 ||
      !Number.isFinite(a[0]) || a[0] <= 0 || !Number.isFinite(a[1]) || (a.length === 3 && typeof a[2] !== 'boolean'))) {
    throw new Error(`${fiche} : appuiHanche doit contenir [x positif, y, sur veste (facultatif)]`);
  }
  const dessins = [def.svg, def.svgScene].filter(Boolean);
  for (const nom of dessins) {
    if (typeof nom !== 'string' || !/^[a-z0-9][a-z0-9_-]*\.svg$/.test(nom)) throw new Error(`${fiche} : nom SVG invalide`);
    const svg = readFileSync(join(dossier, nom), 'utf8');
    for (const p of piecesSvg(def)) if (!svg.includes(`id="${p}"`)) throw new Error(`${nom} : élément #${p} manquant`);
    if (/href="(?!#)|<image|<foreignObject/i.test(svg)) throw new Error(`${nom} : le dessin doit être autonome (aucune référence externe)`);
    if (/<script|\son\w+=|javascript:/i.test(svg)) throw new Error(`${nom} : script interdit dans un personnage`);
  }
  return [fiche, ...dessins];
}

/** A build exports only the explicitly indexed characters and their referenced artwork. */
export function empaqueterPersonnages(source, destination) {
  const { personnages } = lireIndex(source);
  if (!Array.isArray(personnages) || !personnages.length || new Set(personnages).size !== personnages.length) {
    throw new Error('Catalogue de personnages absent, vide ou avec des doublons.');
  }
  if (!personnages.includes('robot_lectura')) throw new Error('Robot Lectura est requis pour ouvrir les anciens projets.');
  const fichiers = new Set([INDEX, ...personnages.flatMap((id) => fichiersPersonnage(source, id))]);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const nom of fichiers) copyFileSync(join(source, nom), join(destination, nom));
  return personnages;
}

/** Explicit maintainer action: adopt new validated sheets, keeping the curated order. */
export function reindexerPersonnages(dossier) {
  const index = lireIndex(dossier);
  const nouveaux = readdirSync(dossier).filter((nom) => nom.endsWith('.json') && nom !== INDEX).sort().map((nom) => nom.slice(0, -5));
  for (const id of nouveaux) fichiersPersonnage(dossier, id);
  index.personnages = [...new Set([...index.personnages.filter((id) => nouveaux.includes(id)), ...nouveaux])];
  writeFileSync(join(dossier, INDEX), `${JSON.stringify(index, null, 2)}\n`);
  return index.personnages;
}
