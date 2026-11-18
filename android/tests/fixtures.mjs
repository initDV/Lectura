import { writeFile } from 'node:fs/promises';
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
await writeFile(process.argv[2], JSON.stringify(fixtures));
