import { writeFile } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { NOMS_PRO } from '../../src/modules/expressions.js';
import { parseSubtitles, cuesToProject, toSrt, toVtt } from '../../src/modules/subtitles.js';
import { phonemiser } from '../../src/modules/voice/g2p_fr.js';
import { autoTiming, estimateDurationMs, Timeline } from '../../src/modules/timeline.js';
import { nettoyer } from '../../src/modules/text-clean.js';
const texts = [
  'Bonjour, je suis Lectura !',
  'Les enfants aiment les histoires.',
  "Aujourd'hui, c’est déjà l'été. Quelqu’un arrive !",
  '98,5 % de 10 000 euros, 071 et 192.168.1.10.',
  'La CPU, SSH, DNS, HTTP, Linux, exact, accueillant, grenouille et renseignement.',
  'Dois-je apprendre à lire ? Oui, tout à fait…',
  '### Bonjour !\n$ echo test\n# commentaire\n**Merci** beaucoup. [Lectura](https://example.com).',
  'À l’école : chantez, ils mangent, vieux pont, c’est récent. Deux oiseaux !',
];
const fixtures = { phrases: texts.map(t=>[t, phonemiser(t)]), timeline: texts.map(t=>{
  const text = nettoyer(t), duration=estimateDurationMs(text,1.25,28), segs=autoTiming(text,duration,.5), clock=new Timeline(text,segs);
  return {t, text, duration, segs, positions:[0,100,200,300,500,1000,duration-1,duration].map(ms=>[ms,clock.charAt(ms)])};
})};
const vtt = 'WEBVTT\n\n00:00.500 --> 00:02.000 line:50%\n<i>Bonjour</i>, Lectura.\n\n00:02.500 --> 00:04.000\nDeuxième ligne.\n';
const cues = cuesToProject(parseSubtitles(vtt));
fixtures.subtitles = { vtt, text: cues.texte, srt: toSrt(cues.segments), exported: toVtt(cues.segments) };
fixtures.proExpressions = NOMS_PRO.length;
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const payload = Buffer.from(JSON.stringify({ installId:'lectura-ci', issuedAt:'2026-01-01T00:00:00Z' }));
fixtures.licence = {
  public: publicKey.export({format:'jwk'}),
  key: `${payload.toString('base64url')}.${sign('sha256', payload, {key: privateKey, dsaEncoding: 'ieee-p1363'}).toString('base64url')}`,
};
await writeFile(process.argv[2], JSON.stringify(fixtures));
