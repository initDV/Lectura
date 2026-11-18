// Build-time only. The APK contains drawings/data, never the web application or a JS runtime.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';
import { DEFAUTS } from '../src/modules/storage.js';
import { EXPRESSIONS, NEUTRE } from '../src/modules/expressions.js';
import { THEMES } from '../src/modules/themes.js';
import * as phonemes from '../src/modules/voice/g2p_lexique.js';
import { PUB } from '../src/modules/license-key.js';

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
await mkdir(output, { recursive: true });
await mkdir(resolve(res, 'mipmap-xxxhdpi'), { recursive: true });
await Promise.all([
  cp(new URL('characters/', root), resolve(output, 'characters'), { recursive: true }),
  cp(new URL('data/', root), resolve(output, 'data'), { recursive: true }),
  cp(new URL('icons/favicon.svg', root), resolve(output, 'favicon.svg')),
  cp(new URL('icons/192.png', root), resolve(res, 'mipmap-xxxhdpi/lectura.png')),
  cp(new URL('fonts/OFL-JetBrainsMono.txt', root), resolve(output, 'OFL-JetBrainsMono.txt')),
  cp(new URL('LICENSE', root), resolve(output, 'LICENSE')),
  cp(new URL('THIRD_PARTY_LICENSES.md', root), resolve(output, 'THIRD_PARTY_LICENSES.md')),
  put('fr.json', fr), put('en.json', en), put('defaults.json', DEFAUTS), put('license-key.json', PUB),
  put('themes.json', { app: themes, terminal: THEMES }), put('expressions.json', { neutral: NEUTRE, expressions: EXPRESSIONS }),
  put('g2p.json', { ...phonemes, CLITIQUES: [...phonemes.CLITIQUES], TIRET: [...phonemes.TIRET] }),
  put('hd-voices.json', { voices }), put('icons.json', await table('src/ui/icons.js', 'TRACES')),
  put('version.json', { version: versions.version, native: process.env.LECTURA_BUILD || 'android', base: '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd' }),
]);
