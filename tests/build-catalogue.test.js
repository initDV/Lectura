import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { VISAGES } from '../src/modules/aicha/visages.js';

const racine = fileURLToPath(new URL('../', import.meta.url));
const liste = ['aicha', 'charlotte', 'doriane', 'monique', 'prisca', 'robot_lectura', 'robot_rouge'];

it('livre exactement le même catalogue en PWA et dans les assets natifs, même en présence d’un dessin non indexé', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lectura-catalogue-'));
  const bytes = (p) => readFileSync(join(dossier, p));
  const lire = (p) => JSON.parse(bytes(p));
  const node = (...args) => execFileSync(process.execPath, args, { cwd: dossier, encoding: 'utf8' });
  try {
    for (const fichier of ['tools/build.mjs', 'tools/character-catalogue.mjs', 'tools/fetch_voice.mjs', 'android/assets.mjs', 'android/atlas-assets.mjs', 'android/data',
      'android/AndroidManifest.xml', 'package.json', 'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'THIRD_PARTY_LICENSES.md', 'src', 'characters',
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
    const nativeVersion = bytes('android/AndroidManifest.xml').toString().match(/android:versionName="([^"]+)"/)[1];
    expect(lire('assets/version.json').version).toBe(nativeVersion);
    const landing = bytes('dist/app/index.html').toString(), base = `https://github.com/initDV/Lectura/releases/download/v${nativeVersion}/`;
    expect([...landing.matchAll(/https:\/\/github\.com\/initDV\/Lectura\/releases\/download\/[^"]+/g)].map(([href]) => href)).toEqual([
      `${base}Lectura.apk`, `${base}Lectura.apk`, `${base}Lectura-v${nativeVersion}-android.zip`,
    ]);
    expect(bytes('dist/src/version.js').toString()).toContain(`VERSION = '${lire('package.json').version}'`);
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
    expect(precache).toEqual(expect.arrayContaining(['./src/modules/aicha/stage.js', './src/modules/aicha/visages.js', './src/modules/aicha/humeurs.js',
      './data/fond-atlas.svg', './src/modules/atlas/calage.js', './src/modules/atlas/projection.js', './src/modules/atlas/planches.json',
      './src/modules/atlas/reseau-local.js', './src/modules/atlas/scenarios.js', './src/modules/atlas/gestes.js', './src/modules/atlas/condensation.js']));
    expect(readdirSync(join(dossier, 'dist'))).not.toContain('atlas');
    const planches = lire('src/modules/atlas/planches.json');
    const atlas = lire('assets/atlas/index.json');
    expect(atlas.fiches.map(({ id }) => id)).toEqual(planches.map(({ id }) => id));
    expect(new Set(readdirSync(join(dossier, 'assets/atlas')))).toEqual(new Set(['index.json', ...planches.map(({ id }) => `${id}.svg`)]));
    for (const { id, svg } of planches) expect(bytes(`assets/atlas/${id}.svg`).toString(), id).toBe(svg);
    expect(atlas.fiches.every(p => !p.svg && p.expressions.length > 0)).toBe(true);
    expect(atlas.fiches.find(p => p.id === atlas.reseau.id)).toBeDefined();
    expect(lire('assets/expressions.json').visages).toEqual(VISAGES);
    const visages = 'src/modules/aicha/visages.js';
    const source = bytes(visages).toString(), web = bytes(`dist/${visages}`).toString();
    expect(web.trimStart()).toBe(source.slice(source.indexOf('export const VISAGES')));
    expect(web.split('\n')).toHaveLength(source.split('\n').length);
    expect(precache.filter(url => url.endsWith('.css'))).toEqual(['./src/ui/styles/app.css']);
    for (const page of ['index.html', 'offline.html']) {
      expect([...bytes(`dist/${page}`).toString().matchAll(/rel="stylesheet" href="([^"]+)"/g)].map(m => m[1])).toEqual(['src/ui/styles/app.css']);
    }
    expect(bytes('dist/src/ui/styles/app.css').toString()).toContain('../../../fonts/jetbrains-mono-latin.woff2');
    for (const f of ['src/vendor/lamejs/lame.min.js', 'src/vendor/fixwebm/fix-webm-duration.js', 'fonts/jetbrains-mono-latin.woff2']) {
      expect(precache).toContain(`./${f}`);
      expect(bytes(`dist/${f}`).equals(bytes(f))).toBe(true);
    }
    expect(readdirSync(join(dossier, 'assets'))).not.toContain('src');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
