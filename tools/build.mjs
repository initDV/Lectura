#!/usr/bin/env node
// tools/build.mjs : fabrique dist/ (site statique prêt pour GitHub Pages ou Cloudflare Pages), sans dépendance.
//   node tools/build.mjs           copie le site, numérote la version, liste les fichiers à garder hors ligne
//   node tools/build.mjs --index   reconstruit seulement characters/index.json (après l'ajout d'un personnage)
// Production « sans bundler » : les modules ES natifs sont servis tels quels (voir docs/DECISIONS.md).
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(racine, 'dist');
const A_COPIER = ['index.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'THIRD_PARTY_LICENSES.md', 'src', 'characters', 'data', 'icons', 'fonts'];
const PAGES_PUBLIQUES = ['app', 'privacy', 'robots.txt', 'sitemap.xml', 'google121a4ae782cb28f.html'];
const RELEASE_ANDROID = 'v1.1.1';
const PIECES = ['#body', '#arm-l', '#arm-r', '#mouth', '#eye-l', '#eye-r', '#brow-l', '#brow-r'];

/** Vérifie chaque personnage (JSON + SVG) et réécrit characters/index.json : aucun code à modifier pour en ajouter un. */
function indexPersonnages() {
  const dossier = join(racine, 'characters'), ids = [], erreurs = [];
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json') && x !== 'index.json').sort()) {
    try {
      const def = JSON.parse(readFileSync(join(dossier, f), 'utf8')), id = f.slice(0, -5);
      if (def.id !== id) throw new Error(`"id" vaut "${def.id}" mais le fichier s'appelle ${f}`);
      for (const k of ['nom', 'svg', 'mouvements']) if (!def[k]) throw new Error(`champ "${k}" manquant`);
      for (const nom of [def.svg, def.svgScene].filter(Boolean)) {
        const svg = readFileSync(join(dossier, nom), 'utf8');
        for (const p of PIECES) if (!svg.includes(`id="${p.slice(1)}"`)) throw new Error(`${nom} : élément ${p} manquant`);
        if (/href="(?!#)|<image|<foreignObject/i.test(svg)) throw new Error(`${nom} : le dessin doit être autonome (aucune référence externe)`);
        if (/<script|\son\w+=|javascript:/i.test(svg)) throw new Error(`${nom} : script interdit dans un personnage`);
      }
      ids.push(id);
    } catch (err) { erreurs.push(`  ✖ ${f} : ${err.message}`); }
  }
  if (erreurs.length) throw new Error(`Personnages invalides :\n${erreurs.join('\n')}`);
  const ordre = ['robot_lectura', 'robot_rouge'], rang = (id) => (ordre.includes(id) ? ordre.indexOf(id) : ordre.length);
  const liste = ids.sort((a, b) => rang(a) - rang(b));
  const ancien = JSON.parse(readFileSync(join(dossier, 'index.json'), 'utf8'));
  const garde = (ancien.personnages || ancien).filter((id) => liste.includes(id)); // conserve l'ordre déjà choisi
  const final = [...garde, ...liste.filter((id) => !garde.includes(id))];
  writeFileSync(join(dossier, 'index.json'), `${JSON.stringify(Array.isArray(ancien) ? final : { ...ancien, personnages: final }, null, 2)}\n`);
  console.log(`✔ characters/index.json : ${final.length} personnages (${final.join(', ')})`);
}

const lister = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? lister(p) : [p]; });

function construire() {
  if (!existsSync(join(racine, 'THIRD_PARTY_LICENSES.md'))) throw new Error('THIRD_PARTY_LICENSES.md est absent.');
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  for (const f of A_COPIER) cpSync(join(racine, f), join(dist, f), { recursive: true });
  writeFileSync(join(dist, '.nojekyll'), '');
  let voix = 'non incluse (lance « npm run voice » avant le build pour proposer la voix HD)';
  if (existsSync(join(racine, 'models', 'index.json'))) { cpSync(join(racine, 'models'), join(dist, 'models'), { recursive: true }); voix = 'incluse (téléchargée par l\'utilisateur seulement à sa demande)'; }
  else { // catalogue vide : l'application affiche « voix HD non proposée » sans requête en échec
    mkdirSync(join(dist, 'models'), { recursive: true });
    writeFileSync(join(dist, 'models', 'index.json'), `${JSON.stringify({ moteur: null, voix: [] })}\n`);
  }

  // Pages de téléchargement, confidentialité et référencement : publiques, hors du précache.
  for (const f of PAGES_PUBLIQUES) cpSync(join(racine, f), join(dist, f), { recursive: true });
  // Le dossier source /app/ reste aussi le gabarit de la distribution historique 1.0.0.
  const telechargements = join(dist, 'app', 'index.html');
  writeFileSync(telechargements, readFileSync(telechargements, 'utf8').replaceAll('v1.0.0', RELEASE_ANDROID));

  // Fichiers gardés hors ligne dès la première visite : tout sauf models/ (à la demande) et les fichiers de service.
  const fichiers = lister(dist).map((p) => relative(dist, p).split(sep).join('/'))
    .filter((p) => (!p.startsWith('models/') || p === 'models/index.json') && !['sw.js', '.nojekyll', 'LICENSE', 'THIRD_PARTY_LICENSES.md'].includes(p))
    .filter((p) => !p.startsWith('src/vendor/aac/') && !PAGES_PUBLIQUES.some((f) => p === f || p.startsWith(`${f}/`))).sort();
  // models/index.json (catalogue des voix, quelques Ko) est gardé hors ligne ; les fichiers de voix restent à la demande.
  const empreinte = createHash('sha256');
  for (const f of fichiers) empreinte.update(f).update(readFileSync(join(dist, f)));
  const h = empreinte.digest('hex').slice(0, 10), version = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).version;
  const date = new Date().toISOString().slice(0, 10);

  const remplacer = (fichier, regex, par) => {
    const p = join(dist, fichier), s = readFileSync(p, 'utf8');
    if (!regex.test(s)) throw new Error(`${fichier} : repère introuvable (${regex}). Le fichier a changé, corrige tools/build.mjs.`);
    writeFileSync(p, s.replace(regex, par));
  };
  remplacer('src/version.js', /export const VERSION = '[^']*';/, `export const VERSION = '${version}';`);
  remplacer('src/version.js', /export const BUILD = '[^']*';/, `export const BUILD = '${date} · ${h}';`);
  remplacer('sw.js', /const VERSION = '[^']*';/, `const VERSION = 'lectura-v${version}-${h}';`);
  remplacer('sw.js', /const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(['./', ...fichiers.map((f) => `./${f}`)])};`);

  // Poids du premier chargement (objectif du cahier des charges : moins de 300 Ko gzip).
  const initial = fichiers.filter((f) => /\.(js|css|html|webmanifest)$/.test(f) || f.startsWith('fonts/') && f.endsWith('.woff2'));
  const optionnels = lister(dist).map((p) => relative(dist, p).split(sep).join('/')).filter((p) => p.startsWith('src/vendor/aac/'));

  if (optionnels.length) {
    const total = optionnels.reduce((a, f) => a + statSync(join(dist, f)).size, 0);
    console.log(`  (optionnels à la demande : ${optionnels.length} fichiers, ${(total/1024).toFixed(0)} Ko — chargés au 1er usage)`);
  }

  const gz = initial.reduce((a, f) => a + (f.endsWith('.woff2') ? statSync(join(dist, f)).size : gzipSync(readFileSync(join(dist, f))).length), 0);
  const total = fichiers.reduce((a, f) => a + statSync(join(dist, f)).size, 0);
  console.log(`✔ dist/ prêt : ${fichiers.length} fichiers, ${(total / 1024).toFixed(0)} Ko (hors voix HD)`);
  console.log(`✔ version ${version} · ${date} · ${h}`);
  console.log(`✔ code + styles + polices : ${(gz / 1024).toFixed(0)} Ko compressés ${gz < 300 * 1024 ? '(< 300 Ko : objectif tenu)' : '(> 300 Ko : objectif dépassé !)'}`);
  console.log(`✔ voix Lectura HD : ${voix}`);
  if (gz >= 300 * 1024) process.exitCode = 2;
}

try {
  indexPersonnages();
  if (!process.argv.includes('--index')) construire();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
