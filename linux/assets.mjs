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
await build({
  entryPoints: [resolve(root, 'linux/motion/runtime.js')], outfile: resolve(out, 'motion.js'),
  bundle: true, format: 'iife', globalName: 'LecturaMotion', platform: 'neutral', target: 'es2022', minify: true,
});
