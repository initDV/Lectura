// tools/fetch_voice.mjs : télécharge les voix Piper depuis HuggingFace vers models/.
// Lancé UNIQUEMENT dans GitHub Actions (pas en local) pour éviter 350 Mo sur ton PC.
// Les fichiers sont ensuite copiés dans dist/ et servis depuis ton propre domaine : pas de CORS.
import { mkdir, writeFile, stat, rename } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR';

const MODELES = {
  siwis: `${HF}/siwis/medium/fr_FR-siwis-medium`,
  tom: `${HF}/tom/medium/fr_FR-tom-medium`,
  gilles: `${HF}/gilles/low/fr_FR-gilles-low`,
  upmc: `${HF}/upmc/medium/fr_FR-upmc-medium`,
  mls: `${HF}/mls/medium/fr_FR-mls-medium`,
};

const VOIX = [
  { id: 'siwis',  nom: 'Siwis · F · douce',       modele: 'siwis' },
  { id: 'upmc',   nom: 'UPMC · F · posée',        modele: 'upmc' },
  { id: 'mls_f1', nom: 'MLS 1 · F · claire',      modele: 'mls', speakerId: 0 },
  { id: 'mls_f2', nom: 'MLS 2 · F · chaleureuse', modele: 'mls', speakerId: 1 },
  { id: 'mls_f3', nom: 'MLS 3 · F · neutre',      modele: 'mls', speakerId: 2 },
  { id: 'tom',    nom: 'Tom · M · grave',         modele: 'tom' },
  { id: 'gilles', nom: 'Gilles · M · posé',       modele: 'gilles' },
  { id: 'mls_m1', nom: 'MLS 4 · M · clair',       modele: 'mls', speakerId: 3 },
  { id: 'mls_m2', nom: 'MLS 5 · M · jeune',       modele: 'mls', speakerId: 4 },
  { id: 'mls_m3', nom: 'MLS 6 · M · chaleureux',  modele: 'mls', speakerId: 5 },
];

async function telecharger(url, dest) {
  if (existsSync(dest)) {
    const s = await stat(dest);
    if (s.size > 1024 * 1024) { console.log(`  ✓ déjà là : ${dest} (${(s.size/1048576).toFixed(1)} Mo)`); return s.size; }
  }
  console.log(`  ↓ ${url}`);
  const tmp = dest + '.part';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Erreur ${res.status} sur ${url}`);
  await pipeline(res.body, createWriteStream(tmp));
  await rename(tmp, dest);
  const s = await stat(dest);
  console.log(`  ✓ ${dest} (${(s.size/1048576).toFixed(1)} Mo)`);
  return s.size;
}

async function main() {
  await mkdir('models', { recursive: true });
  await mkdir('models/ort', { recursive: true });

  // Copie du runtime onnxruntime-web (WASM + API) depuis node_modules.
  const { copyFile } = await import('node:fs/promises');
  const ort = [
    ['node_modules/onnxruntime-web/dist/ort.min.mjs', 'models/ort/ort.min.mjs'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'models/ort/ort-wasm-simd-threaded.mjs'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'models/ort/ort-wasm-simd-threaded.wasm'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', 'models/ort/ort-wasm-simd-threaded.jsep.mjs'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', 'models/ort/ort-wasm-simd-threaded.jsep.wasm'],
  ];
  for (const [src, dst] of ort) {
    try { await copyFile(src, dst); console.log(`  ✓ ${dst}`); }
    catch (e) { console.warn(`  ⚠ ${dst} (${e.code})`); }
  }
  // 1. Télécharger chaque modèle unique UNE seule fois
  const tailles = {};
  for (const [id, base] of Object.entries(MODELES)) {
    const onnx = join('models', `${id}.onnx`);
    const cfg = join('models', `${id}.onnx.json`);
    tailles[id] = await telecharger(`${base}.onnx`, onnx);
    await telecharger(`${base}.onnx.json`, cfg);
  }
  // 2. Générer index.json avec URLs RELATIVES
  const moteur = { entree: 'ort/ort.min.mjs', dossier: 'ort/', fichiers: [] };
  const voix = VOIX.map((v) => ({
    id: v.id,
    nom: v.nom,
    config: `${v.modele}.onnx.json`,
    tailleConfig: 6000,
    parts: [{ fichier: `${v.modele}.onnx`, taille: tailles[v.modele] }],
    speakerId: v.speakerId ?? null,
    licence: 'MIT (Piper)',
    attribution: 'rhasspy/piper-voices',
  }));
  await writeFile('models/index.json', JSON.stringify({ moteur, voix }, null, 2));
  const total = Object.values(tailles).reduce((a, b) => a + b, 0);
  console.log(`✔ models/index.json généré : ${voix.length} voix, ${(total/1048576).toFixed(0)} Mo téléchargés.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
