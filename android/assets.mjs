// Build-time only. The APK contains drawings/data, never the web application or a JS runtime.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';
import { DEFAUTS } from '../src/modules/storage.js';
import { EXPRESSIONS, NEUTRE } from '../src/modules/expressions.js';
import { THEMES } from '../src/modules/themes.js';
import * as phonemes from '../src/modules/voice/g2p_lexique.js';

const output = resolve(process.argv[2]);
const res = resolve(process.argv[3]);
const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const put = (p, object) => writeFile(resolve(output, p), JSON.stringify(object));
const table = async (file, name) => {
  const source = (await read(file)).match(new RegExp(`^const ${name} = (\\{[\\s\\S]*?^\\});`, 'm'))?.[1];
  if (!source) throw Error(`Table ${name} introuvable dans ${file}`);
  return (await import(`data:text/javascript,${encodeURIComponent(`export default ${source}`)}`)).default;
};
const themes = {};
for (const [, key, block] of (await read('src/ui/styles/themes.css')).matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/g)) {
  themes[key] = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const voiceScript = await read('tools/fetch_voice.mjs');
const voices = (await import(`data:text/javascript,${encodeURIComponent('export default ' + voiceScript.match(/const VOIX = (\[[\s\S]+?\]);/)[1])}`)).default;
const versions = JSON.parse(await read('package.json'));
// Android uses the full catalogue; the web originals keep their own access rules.
const characterIndex = JSON.parse(await read('characters/index.json'));
const defaults = { ...DEFAUTS };
delete defaults.licence;
delete defaults.idInstallation;
const androidStrings = (labels, overrides) => ({
  ...Object.fromEntries(Object.entries(labels).filter(([key]) => !/^(?:pro\.|nav\.pro$|scene\.persoPro$|reglages\.terminal\.pro$|persos\.emotions\.aidePro$|voix\.enLigne$)/.test(key))),
  ...overrides,
});
const expressions = Object.fromEntries(Object.entries(EXPRESSIONS).map(([id, pose]) => {
  const data = { ...pose };
  delete data.pro;
  delete data.base;
  return [id, data];
}));
await mkdir(output, { recursive: true });
await mkdir(resolve(res, 'mipmap-xxxhdpi'), { recursive: true });
await Promise.all([
  cp(new URL('characters/', root), resolve(output, 'characters'), { recursive: true, filter: (path) => !path.endsWith('.json') || path.endsWith('/index.json') })
    .then(() => Promise.all(characterIndex.personnages.map(async (id) => {
      const rig = JSON.parse(await read(`characters/${id}.json`));
      delete rig.pro;
      if (rig.role === 'pro') delete rig.role;
      await put(`characters/${id}.json`, rig);
    }))),
  cp(new URL('data/', root), resolve(output, 'data'), { recursive: true, filter: (path) => !path.endsWith('/keywords_fr_pro.json') })
    .then(() => cp(new URL('data/keywords_fr_pro.json', root), resolve(output, 'data/keywords_fr_extended.json'))),
  cp(new URL('icons/favicon.svg', root), resolve(output, 'favicon.svg')),
  cp(new URL('icons/192.png', root), resolve(res, 'mipmap-xxxhdpi/lectura.png')),
  cp(new URL('fonts/OFL-JetBrainsMono.txt', root), resolve(output, 'OFL-JetBrainsMono.txt')),
  cp(new URL('LICENSE', root), resolve(output, 'LICENSE')),
  cp(new URL('THIRD_PARTY_LICENSES.md', root), resolve(output, 'THIRD_PARTY_LICENSES.md')),
  put('fr.json', androidStrings(fr, {
    'persos.emotions.aide': fr['persos.emotions.aidePro'],
    'apropos.confidentialite.texte': 'Tes textes, projets et lectures restent sur cet appareil. Lectura utilise Internet seulement pour télécharger les voix HD à ta demande. Aucun compte ni traceur.',
    'voix.err.aucune': 'Aucune voix locale disponible. Installe une voix dans les réglages du téléphone ou télécharge une voix Lectura HD.',
    'android.terminal.fontSystem': 'Système',
  })),
  put('en.json', androidStrings(en, {
    'persos.emotions.aide': en['persos.emotions.aidePro'],
    'apropos.confidentialite.texte': 'Your text, projects and playback stay on this device. Lectura only uses the Internet to download HD voices on request. No accounts or trackers.',
    'voix.err.aucune': 'No local voice available. Install one in your phone settings or download a Lectura HD voice.',
    'android.terminal.fontSystem': 'System',
  })),
  put('defaults.json', defaults),
  put('themes.json', { app: themes, terminal: THEMES }), put('expressions.json', { neutral: NEUTRE, expressions }),
  put('g2p.json', { ...phonemes, CLITIQUES: [...phonemes.CLITIQUES], TIRET: [...phonemes.TIRET] }),
  put('hd-voices.json', { voices }), put('icons.json', await table('src/ui/icons.js', 'TRACES')),
  put('version.json', { version: versions.version, native: process.env.LECTURA_BUILD || 'android', base: '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd' }),
]);
