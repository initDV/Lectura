import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { lipsFixture } from './lips.mjs';
import { NOMS } from '../../src/modules/expressions.js';
import { parseSubtitles, cuesToProject, toSrt, toVtt } from '../../src/modules/subtitles.js';
import { phonemiser } from '../../src/modules/voice/g2p_fr.js';
import { autoTiming, estimateDurationMs, Timeline } from '../../src/modules/timeline.js';
import { nettoyer } from '../../src/modules/text-clean.js';
import { words, groups, questions, corrections, siwis } from '../../tests/fixtures/voice-fr.mjs';
import { robotSegments, robotDuration, robotText } from '../../tests/fixtures/robot-motion.mjs';
import { planRobot, poseRobot } from '../../src/modules/robot-motion.js';
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
fixtures.characters = JSON.parse(await readFile(new URL('../../characters/index.json', import.meta.url), 'utf8')).personnages;
fixtures.expressions = NOMS;
const { data, wav } = lipsFixture();
fixtures.lips = data;
fixtures.voice = { words: [...words, ...corrections], groups, questions, siwis };
const direction = planRobot(robotSegments, robotDuration);
const keys = [0, ...Object.values(direction).filter(Array.isArray).flatMap(([a, b]) => [a, a + (b-a)*.32, a + (b-a)*.53, b])];
fixtures.robot = { text: robotText, duration: robotDuration, segments: robotSegments, direction, poses: keys.map(ms => [ms, poseRobot(direction, ms)]) };
await writeFile(process.argv[2], JSON.stringify(fixtures));
await writeFile(join(dirname(process.argv[2]), 'lips-reference.wav'), wav);
