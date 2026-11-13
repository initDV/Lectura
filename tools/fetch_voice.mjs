#!/usr/bin/env node
// tools/fetch_voice.mjs : prépare le dossier models/ (voix Lectura HD), servi depuis NOTRE site (aucun CDN à l'exécution).
//   node tools/fetch_voice.mjs            télécharge la voix par défaut + copie le moteur ONNX
//   node tools/fetch_voice.mjs --moteur   copie seulement le moteur (aucun téléchargement de modèle)
//   node tools/fetch_voice.mjs --depuis /chemin/dossier   utilise des fichiers .onnx déjà téléchargés
// En pratique c'est GitHub Actions qui lance ce script : la connexion du développeur n'est pas utilisée.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, statSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(racine, 'models'), args = process.argv.slice(2);
const PART = 8 * 1024 * 1024; // morceaux de 8 Mio : reprise possible sur une connexion instable, et < 25 Mio (limite Cloudflare Pages)
const REV = '6b9cfaacb4fb2e02a9621227e3c1a48bec9710c3'; // révision figée du dépôt rhasspy/piper-voices
const HF = `https://huggingface.co/rhasspy/piper-voices/resolve/${REV}`;

/** Voix retenues : seules celles dont la licence autorise la redistribution ET l'usage commercial de l'audio produit. */
const VOIX = [{
  id: 'fr_FR-siwis-medium', nom: 'Siwis · voix féminine (français)', langue: 'fr', chemin: 'fr/fr_FR/siwis/medium',
  licence: 'CC-BY-4.0', attribution: 'Voix Piper « fr_FR-siwis-medium » (rhasspy/piper-voices), entraînée sur le corpus SIWIS French Speech Synthesis Database (Université d’Édimbourg, CC BY 4.0).',
  sha256: 'b1d946fd68d0347155fa59bce0a018924abbef3c1561181db45ca463d83963ef',
}];
const ORT = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const mo = (n) => `${(n / 1048576).toFixed(1)} Mo`;

async function telecharger(url) {
  process.stdout.write(`  ↓ ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${url}`);
  const total = +res.headers.get('content-length') || 0, morceaux = [];
  let recu = 0, dernier = 0;
  for await (const m of res.body) {
    morceaux.push(m); recu += m.length;
    if (total && recu - dernier > 5 * 1048576) { dernier = recu; process.stdout.write(`    ${mo(recu)} / ${mo(total)}\n`); }
  }
  return Buffer.concat(morceaux);
}

function copierMoteur() {
  const src = join(racine, 'node_modules', 'onnxruntime-web', 'dist');
  if (!existsSync(src)) throw new Error('onnxruntime-web est absent : lance d\'abord « npm install ».');
  mkdirSync(join(dest, 'ort'), { recursive: true });
  const fichiers = ORT.map((f) => {
    copyFileSync(join(src, f), join(dest, 'ort', f));
    const buf = readFileSync(join(dest, 'ort', f));
    return { fichier: `ort/${f}`, taille: buf.length, sha256: sha(buf) };
  });
  const version = JSON.parse(readFileSync(join(racine, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8')).version;
  console.log(`✔ moteur onnxruntime-web ${version} copié (${mo(fichiers.reduce((a, f) => a + f.taille, 0))})`);
  return { nom: 'onnxruntime-web', version, licence: 'MIT', entree: 'ort/ort.wasm.min.mjs', dossier: 'ort/', fichiers };
}

async function preparerVoix(v, depuis) {
  const local = depuis && join(depuis, `${v.id}.onnx`);
  const modele = local && existsSync(local) ? readFileSync(local) : await telecharger(`${HF}/${v.chemin}/${v.id}.onnx`);
  const empreinte = sha(modele);
  if (empreinte !== v.sha256) throw new Error(`Empreinte inattendue pour ${v.id}.onnx : ${empreinte}. Fichier corrompu ou modifié : rien n'est installé.`);
  const cfgLocal = depuis && join(depuis, `${v.id}.onnx.json`);
  const cfg = cfgLocal && existsSync(cfgLocal) ? readFileSync(cfgLocal) : await telecharger(`${HF}/${v.chemin}/${v.id}.onnx.json`);
  JSON.parse(cfg.toString('utf8')); // doit être un JSON valide
  for (const f of readdirSync(dest)) if (f.startsWith(`${v.id}.`)) rmSync(join(dest, f));
  writeFileSync(join(dest, `${v.id}.onnx.json`), cfg);
  const parts = [];
  for (let i = 0, k = 0; i < modele.length; i += PART, k++) {
    const bloc = modele.subarray(i, Math.min(modele.length, i + PART)), fichier = `${v.id}.onnx.part${String(k).padStart(2, '0')}`;
    writeFileSync(join(dest, fichier), bloc);
    parts.push({ fichier, taille: bloc.length, sha256: sha(bloc) });
  }
  console.log(`✔ ${v.id} : ${mo(modele.length)} en ${parts.length} morceaux (licence ${v.licence})`);
  return { id: v.id, nom: v.nom, langue: v.langue, licence: v.licence, attribution: v.attribution, source: `${HF}/${v.chemin}/`,
    config: `${v.id}.onnx.json`, tailleConfig: cfg.length, sha256: v.sha256, parts };
}

try {
  mkdirSync(dest, { recursive: true });
  const moteur = copierMoteur();
  const i = args.indexOf('--depuis'), depuis = i >= 0 ? args[i + 1] : null;
  const index = join(dest, 'index.json');
  let voix = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')).voix || [] : [];
  if (!args.includes('--moteur')) { voix = []; for (const v of VOIX) voix.push(await preparerVoix(v, depuis)); }
  writeFileSync(index, `${JSON.stringify({ genere: new Date().toISOString(), moteur, voix }, null, 1)}\n`);
  const total = readdirSync(dest, { recursive: true }).reduce((a, f) => { const s = statSync(join(dest, String(f))); return a + (s.isFile() ? s.size : 0); }, 0);
  console.log(`✔ models/index.json écrit : ${voix.length} voix, ${mo(total)} au total. Le dossier models/ n'est pas versionné (.gitignore).`);
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
