import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { empaqueterPersonnages } from '../tools/character-catalogue.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage : node linux/assets.mjs <destination>');
const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
empaqueterPersonnages(resolve(root, 'characters'), resolve(out, 'characters'));
cpSync(resolve(root, 'icons/192.png'), resolve(out, 'lectura.png'));
for (const [entry, name, globalName] of [
  ['motion/runtime.js', 'motion.js', 'LecturaMotion'],
  ['voice/runtime.js', 'siwis.js', 'LecturaSiwis'],
]) {
  await build({
    entryPoints: [resolve(root, 'linux', entry)], outfile: resolve(out, name),
    bundle: true, format: 'iife', globalName, platform: 'neutral', target: 'es2022', minify: true,
  });
}
