import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planAicha, poseAicha } from '../src/modules/aicha/motion.js';
import { creerHumeur } from '../src/modules/humeur.js';
import { compilerLexique } from '../src/modules/sentiment.js';
import { autoTiming, Timeline } from '../src/modules/timeline.js';

const langue = lang => compilerLexique(JSON.parse(readFileSync(new URL(`../data/sentiments_${lang}.json`, import.meta.url))));
const dictionnaires = { fr: langue('fr'), en: langue('en') };
const preparer = (texte, lang = 'fr', segs = autoTiming(texte, texte.length * 72, 1)) => planAicha(
  new Timeline(texte, segs).segs, segs.at(-1).finMs, { texte, humeur: creerHumeur({ lexique: dictionnaires[lang], matcher: () => [] }) });
const bloc = (texte, duree = 5500, lang) => preparer(texte, lang, [{ texte, debutMs: 0, finMs: duree, expression: 'auto' }]);
const pose = (plan, t) => poseAicha(plan, t * 1000, { reduit: true });
const visages = p => p.visages.flatMap(f => [f.face, ...(f.transitions || []).map(t => t.to.face)]).filter(f => f !== 'neutre');

const demonstration = 'Je vais vous expliquer le principe. D’abord, ouvrez le menu, puis choisissez un fichier. Par exemple, on met le texte d’un côté et les images de l’autre côté. Le son grave monte lentement. À cet instant, je ne m’y attendais pas. Ouf, tout va bien.';

describe('Gestes réellement joués dans la lecture', () => {
  it('prépare, énumère et compare, sans main en permanence sur la hanche', () => {
    const plan = preparer(demonstration), corps = plan.cues.filter(c => ['explique', 'enumere', 'compare'].includes(c.kind));
    expect(corps.map(c => c.kind)).toEqual(['explique', 'enumere', 'enumere', 'explique', 'compare', 'compare']);
    for (const c of corps) {
      expect(c.hand).not.toBe(0);
      expect(plan.marches.every(m => m.end <= c.start || c.end <= m.start)).toBe(true);
      expect(plan.paroles.some(p => p.start <= c.start && p.end >= c.end)).toBe(true);
      const fin = c.start + .52 * (c.end - c.start);
      const image = poseAicha(plan, fin * 1000);
      const main = c.hand > 0 ? 'R' : 'L';
      expect(image['flex' + main]).toBeGreaterThan(34);
      expect(image['open' + main]).toBeGreaterThan(.54);
      expect([image.hancheL, image.hancheR]).toEqual([0, 0]);
      if (c.kind === 'enumere') expect(image['index' + main]).toBeGreaterThan(.72);
      expect(pose(plan, fin)['open' + main]).toBe(0);
    }
  });

  it('garde le sens même à la fin d’une question, et ne mime pas un mot cité', () => {
    const plan = bloc('Alors, si on prend deux options ?', 1600);
    expect(plan.cues.some(c => c.kind === 'compare' && c.hand)).toBe(true);
    const cite = bloc('Le mot « voici » précède le texte, et `par exemple` reste en code.');
    expect(cite.cues.some(c => c.kind === 'illustre' || c.kind === 'explique')).toBe(false);
    expect(bloc('On reprendra ensuite le calcul.').cues.some(c => c.kind === 'enumere')).toBe(false);
    expect(bloc('Je regardais la porte, puis… silence.').cues.some(c => c.kind === 'enumere')).toBe(false);
    expect(bloc('Ce texte n’explique pas la théorie.').cues.some(c => c.kind === 'explique')).toBe(false);
  });

  it('garde deux mains actives sur deux phrases rapides contiguës', () => {
    const plan = preparer('Par exemple, ouvre ton carnet. Deux options : le texte ou l’image.', 'fr', [
      { texte: 'Par exemple, ouvre ton carnet.', debutMs: 0, finMs: 1410 },
      { texte: 'Deux options : le texte ou l’image.', debutMs: 1410, finMs: 2950 },
    ]);
    const [a,b] = plan.cues.filter(c => c.kind === 'explique' || c.kind === 'compare');
    expect(a.end).toBeLessThan(b.start);
    expect(a.hand).toBe(1);
    expect(b.hand).toBe(-1);
  });

  it('utilise les positions prononcées quand le texte préparé développe un nombre', () => {
    const texte = 'À 8h30, par exemple, on part.', pos = texte.indexOf('par exemple');
    const seg = { texte, debutMs: 0, finMs: 4000, expression: 'auto' };
    const curseur = [...Array(34).fill(2), ...Array.from(texte, (_, i) => i).slice(pos)];
    const geste = p => p.cues.find(c => c.kind === 'explique');
    const simple = geste(preparer(texte, 'fr', [seg])), daté = geste(preparer(texte, 'fr', [{ ...seg, cursor: curseur }]));
    expect(daté.start - simple.start).toBeGreaterThan(1);
  });
});

describe('Mots clés et contexte sans grimaces automatiques', () => {
  it.each(['Le son grave monte lentement.', 'Le mot « triste » est un adjectif.', '« Triste » désigne une émotion ici.',
    'Ensuite, on déplace le curseur.', 'Je ne suis pas inquiète.', 'Ce chapitre présente un problème de géométrie.',
    'Ce n’est pas une bonne nouvelle.', 'Nous parlons de la colère.', 'Le mot triste est un adjectif.'])(
    'reste neutre sur « %s »', texte => {
      const plan = bloc(texte);
      expect(visages(plan)).toEqual([]);
      expect(poseAicha(plan, 2000).smile).toBe(0);
    });

  it.each([
    ['Il y a un grave problème.', 'inquiet'], ['Ne t’inquiète pas, je reste avec toi.', 'rassurant'], ['Ce n’est pas grave.', 'rassurant'],
    ['Ouf, on l’a échappé belle.', 'soulage'], ['Je ne m’y attendais pas.', 'surpris'],
    ['Pourquoi la porte est ouverte ?', 'curieux'], ['Tu viens demain ?', 'pensif'],
    ['Elle a dit : « je suis triste » avant de partir.', 'triste'], ['Je ne suis pas content du résultat.', 'triste'],
    ['Je ne suis pas seulement heureuse, je suis fière.', 'content', 'fier'],
    ['Je ne suis pas triste mais j’ai peur.', 'peur'], ['Tu as fait ça ?!', 'surpris'],
  ])('joue « %s » selon la situation', (texte, ...attendu) => expect(visages(bloc(texte))).toEqual(attendu));

  it('attend le mot qui change le sens, y compris après une coupure de synthèse', () => {
    const a = 'Je regardais la porte,', b = ' et puis je suis devenue triste.';
    const plan = preparer(a + b, 'fr', [
      { texte: a, debutMs: 0, finMs: 1900, speechEndMs: 1760 },
      { texte: b.trim(), debutMs: 1900, finMs: 4400, speechEndMs: 4200 },
    ]);
    const [f] = plan.visages, [t] = f.transitions;
    expect(f.start).toBe(0);
    expect(t.to.face).toBe('triste');
    expect(pose(plan, t.pivot - .1).smile).toBe(0);
    expect(pose(plan, t.pivot + .24).smile).toBeLessThan(-.4);
    expect(pose(plan, t.pivot - .1).smile).toBe(0);
  });

  it('garde la même logique en anglais', () => {
    const t = 'For example, try both choices. I did not see that coming. What a relief!';
    expect(visages(preparer(t, 'en'))).toEqual(['surpris', 'soulage']);
    for (const s of ['I am not sad.', 'This is not good news.', 'The happy path of the test.', 'A great circle is the shortest route.']) {
      expect(visages(bloc(s, 4300, 'en'))).toEqual([]);
    }
    expect(preparer(t, 'en').cues.some(c => c.kind === 'explique' && c.hand)).toBe(true);
  });
});
