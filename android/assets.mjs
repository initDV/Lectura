// Build-time only. The APK contains drawings/data, never the web application or a JS runtime.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';
import { DEFAUTS } from '../src/modules/storage.js';
import { EXPRESSIONS, NEUTRE } from '../src/modules/expressions.js';
import { DIGITS, SEGMENTS, DIGIT_X, DIGIT_Y } from '../src/modules/robot-motion.js';
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
const piper = (await import(`data:text/javascript,${encodeURIComponent('export default ' + voiceScript.match(/const VOIX = (\[[\s\S]+?\]);/)[1])}`)).default;
const voices = [
  { id: 'estelle', nom: 'Estelle · F · Pocket TTS', moteur: 'pocket', modele: 'estelle' },
  { id: 'kokoro-siwis', nom: 'Siwis · F · Kokoro', moteur: 'kokoro', modele: 'kokoro-siwis' },
  ...piper.filter((v) => ['siwis', 'tom'].includes(v.id)),
  ...piper.filter((v) => !['siwis', 'tom'].includes(v.id)),
];
const versions = JSON.parse(await read('package.json'));
// Both platforms expose the full catalogue. Keep the native asset schema unchanged.
const defaults = { ...DEFAUTS, moteurVoix: 'auto', voixId: '' };
const androidStrings = (labels, overrides) => ({ ...labels, ...overrides });
await mkdir(output, { recursive: true });
await mkdir(resolve(res, 'mipmap-xxxhdpi'), { recursive: true });
await Promise.all([
  cp(new URL('characters/', root), resolve(output, 'characters'), { recursive: true }),
  cp(new URL('data/', root), resolve(output, 'data'), { recursive: true }),
  cp(new URL('android/data/prononciation.json', root), resolve(output, 'prononciation.json')),
  cp(new URL('android/data/direction.json', root), resolve(output, 'direction.json')),
  cp(new URL('icons/favicon.svg', root), resolve(output, 'favicon.svg')),
  cp(new URL('icons/192.png', root), resolve(res, 'mipmap-xxxhdpi/lectura.png')),
  cp(new URL('fonts/OFL-JetBrainsMono.txt', root), resolve(output, 'OFL-JetBrainsMono.txt')),
  cp(new URL('LICENSE', root), resolve(output, 'LICENSE')),
  cp(new URL('THIRD_PARTY_LICENSES.md', root), resolve(output, 'THIRD_PARTY_LICENSES.md')),
  put('fr.json', androidStrings(fr, {
    'apropos.confidentialite.texte': 'Tes textes, projets et lectures restent sur cet appareil. Lectura utilise Internet seulement pour télécharger les voix HD à ta demande. Aucun compte ni traceur.',
    'voix.err.aucune': 'Aucune voix locale disponible. Installe une voix dans les réglages du téléphone ou télécharge une voix Lectura HD.',
    'android.terminal.fontSystem': 'Système',
    'android.voice.auto': 'Automatique · Estelle en priorité',
    'android.voice.autoHelp': 'Sans Estelle : Siwis, Tom ou une voix système locale déjà installée.',
    'android.voice.main': 'Voix principale',
    'android.voice.backup': 'Secours Piper',
    'android.voice.use': 'Utiliser cette voix',
    'android.voice.installedSize': 'Espace après installation : {taille}',
    'android.voice.notSupported': 'Ce moteur vocal n’est pas disponible sur cet appareil.',
    'android.voice.extract': 'Vérification et installation de la voix…',
    'android.voice.sources': 'Voix locales Lectura',
    'android.voice.fallback': 'Voix prioritaire indisponible · secours : {nom}',
    'android.voice.noAudio': 'Télécharge Estelle ou choisis une voix déjà installée.',
    'voix.hd.err.tropLong': 'Texte trop long pour la synthèse ({n} caractères sur {max} maximum). Coupe-le en plusieurs projets ou importe un audio.',
  })),
  put('en.json', androidStrings(en, {
    'apropos.confidentialite.texte': 'Your text, projects and playback stay on this device. Lectura only uses the Internet to download HD voices on request. No accounts or trackers.',
    'voix.err.aucune': 'No local voice available. Install one in your phone settings or download a Lectura HD voice.',
    'android.terminal.fontSystem': 'System',
    'android.voice.auto': 'Automatic · Estelle first',
    'android.voice.autoHelp': 'Without Estelle: Siwis, Tom or an already installed local system voice.',
    'android.voice.main': 'Primary voice',
    'android.voice.backup': 'Piper fallback',
    'android.voice.use': 'Use this voice',
    'android.voice.installedSize': 'Installed size: {taille}',
    'android.voice.notSupported': 'This voice engine is not available on this device.',
    'android.voice.extract': 'Verifying and installing the voice…',
    'android.voice.sources': 'Lectura local voices',
    'android.voice.fallback': 'Preferred voice unavailable · fallback: {nom}',
    'android.voice.noAudio': 'Download Estelle or choose an already installed voice.',
    'voix.hd.err.tropLong': 'Text too long for synthesis ({n} characters; maximum {max}). Split it into projects or import audio.',
  })),
  put('robot-stage.json', { digits: DIGITS, segments: SEGMENTS, digitX: DIGIT_X, digitY: DIGIT_Y }),
  put('defaults.json', defaults),
  put('themes.json', { app: themes, terminal: THEMES }), put('expressions.json', { neutral: NEUTRE, expressions: EXPRESSIONS }),
  put('g2p.json', { ...phonemes, CLITIQUES: [...phonemes.CLITIQUES], TIRET: [...phonemes.TIRET] }),
  put('hd-voices.json', { voices }), put('icons.json', await table('src/ui/icons.js', 'TRACES')),
  put('version.json', { version: versions.version, native: process.env.LECTURA_BUILD || 'android', base: '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd' }),
]);
