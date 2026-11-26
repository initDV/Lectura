import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const racine = fileURLToPath(new URL('../', import.meta.url));
const liste = ['aicha', 'charlotte', 'doriane', 'monique', 'prisca', 'robot_lectura', 'robot_rouge'];

it('livre exactement le même catalogue en PWA et dans les assets natifs, même en présence d’un dessin non indexé', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lectura-catalogue-'));
  const bytes = (p) => readFileSync(join(dossier, p));
  const lire = (p) => JSON.parse(bytes(p));
  const node = (...args) => execFileSync(process.execPath, args, { cwd: dossier, encoding: 'utf8' });
  try {
    for (const fichier of ['tools/build.mjs', 'tools/character-catalogue.mjs', 'tools/fetch_voice.mjs', 'android/assets.mjs', 'android/data',
      'package.json', 'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'THIRD_PARTY_LICENSES.md', 'src', 'characters',
      'data', 'icons', 'fonts', 'app', 'privacy', 'robots.txt', 'sitemap.xml', 'google121a4ae782cb28f.html']) {
      const dest = join(dossier, fichier);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(racine, fichier), dest, { recursive: true });
    }
    const index = bytes('characters/index.json');
    expect(JSON.parse(index).personnages).toEqual(liste);
    const figurant = { ...lire('characters/aicha.json'), id: 'figurant', nom: 'Figurant', svg: 'figurant.svg' };
    writeFileSync(join(dossier, 'characters/figurant.json'), JSON.stringify(figurant));
    cpSync(join(dossier, 'characters/aicha.svg'), join(dossier, 'characters/figurant.svg'));
    mkdirSync(join(dossier, 'assets/characters'), { recursive: true });
    writeFileSync(join(dossier, 'assets/characters/ancien.svg'), '<svg/>'); // stale native staging directory

    const sortie = node('tools/build.mjs');
    expect(Number(sortie.match(/polices : (\d+) o gzip/)[1])).toBeLessThan(307200);
    node('android/assets.mjs', 'assets', 'res');
    expect(bytes('characters/index.json').equals(index)).toBe(true);
    const attendus = ['index.json'];
    for (const id of liste) {
      const nom = `${id}.json`, def = lire(`characters/${nom}`);
      attendus.push(...[nom, def.svg, def.svgScene].filter(Boolean));
    }
    attendus.sort();
    expect(attendus).toHaveLength(16);
    expect(attendus).toContain('robot_lectura_scene.svg');
    for (const dest of ['dist/characters', 'assets/characters']) {
      expect(readdirSync(join(dossier, dest)).sort()).toEqual(attendus);
      for (const f of attendus) expect(bytes(`${dest}/${f}`).equals(bytes(`characters/${f}`)), `${dest}/${f}`).toBe(true);
    }
    const precache = JSON.parse(bytes('dist/sw.js').toString().match(/const SHELL = (\[[^\]]*\]);/)[1]);
    expect(precache.filter((url) => url.startsWith('./characters/')).map((url) => url.slice('./characters/'.length)).sort()).toEqual(attendus);
    expect(precache).toContain('./src/modules/aicha/stage.js');
    expect(readdirSync(join(dossier, 'assets'))).not.toContain('src');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
