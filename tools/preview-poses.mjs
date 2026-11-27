// Démo locale, hors du build publié. Le serveur ne voit que les dessins et les fichiers nécessaires.
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { empaqueterPersonnages } from './character-catalogue.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), 'lectura-atelier-'));
process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));
cpSync(join(root, 'tests/manual/poses'), dossier, { recursive: true });
empaqueterPersonnages(join(root, 'characters'), join(dossier, 'characters'));
for (const f of ['src/modules', 'src/i18n', 'fonts', 'icons']) {
  mkdirSync(join(dossier, f), { recursive: true });
  cpSync(join(root, f), join(dossier, f), { recursive: true });
}
process.argv.splice(2, 0, dossier);
await import('./serve.mjs');
