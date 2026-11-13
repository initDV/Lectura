import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compilerLexique, analyser, normaliser } from '../src/modules/sentiment.js';
import { EXPRESSIONS } from '../src/modules/expressions.js';

const lire = (l) => JSON.parse(readFileSync(new URL(`../data/sentiments_${l}.json`, import.meta.url), 'utf8'));
const fr = compilerLexique(lire('fr')), en = compilerLexique(lire('en'));
const emo = (t, lex = fr) => analyser(t, lex).emotion;

describe('lexiques des sentiments', () => {
  it('chaque émotion du lexique est une expression du robot, chaque geste est connu', () => {
    for (const l of ['fr', 'en']) {
      const d = lire(l);
      for (const nom of Object.keys(d.emotions)) expect(EXPRESSIONS[nom], `${l} : ${nom}`).toBeTruthy();
      for (const e of Object.values(d.emojis)) expect(EXPRESSIONS[e], `${l} : émoji ${e}`).toBeTruthy();
      for (const g of Object.values(d.gestes)) expect(['coucou', 'hoche', 'secoue', 'sursaut', 'bras']).toContain(g);
    }
  });
  it('normaliser garde la longueur du texte', () => {
    const t = 'Ça RÉUSSIT très bien, cœur 😂 !';
    expect(normaliser(t)).toHaveLength(t.length);
    expect(normaliser('Été GÉNIAL')).toBe('ete genial');
  });
});

describe('analyser (français)', () => {
  it('reconnaît les émotions simples', () => {
    expect(emo('Bravo, tu as réussi ton premier scan !')).toBe('content');
    expect(emo("Attention : c'est dangereux.")).toMatch(/surpris|peur/);
    expect(emo('Oups, une erreur.')).toBe('gene');
    expect(emo("J'en ai marre de ce problème.")).toBe('colere');
    expect(emo('Haha, trop drôle')).toBe('rire');
    expect(emo('Quel dommage, il a échoué.')).toBe('triste');
    expect(emo("C'est bizarre, je me demande pourquoi.")).toBe('sceptique');
    expect(emo('Je suis épuisé.')).toBe('fatigue');
    expect(emo('Je suis fier de toi.')).toBe('fier');
    expect(emo("C'est génial !")).toBe('enthousiaste');
  });
  it('ignore les accents, la casse et accepte les terminaisons', () => {
    expect(emo('GENIAL, ca marche')).toBe('enthousiaste');
    expect(emo('Elles sont contentes.')).toBe('content');
    expect(emo('Le contenu du fichier est affiché.')).toBe('neutre');
  });
  it('donne la position du mot déclencheur', () => {
    const t = 'Et là, bravo à tous.', r = analyser(t, fr);
    expect(r.moments).toHaveLength(1);
    expect(t.slice(r.moments[0].pos, r.moments[0].fin)).toBe('bravo');
  });
  it('gère la négation', () => {
    expect(emo('Je ne suis pas content.')).toBe('triste');
    expect(emo("Ce n'est pas facile.")).toBe('triste');
    expect(emo("Je n'aime pas ça.")).toBe('triste');
    expect(emo("Ce n'est pas grave.")).toBe('content');
    expect(emo('Ça ne marche pas.')).toBe('triste');
    expect(emo("Ne t'inquiète pas, c'est facile.")).toBe('tendre'); // la négation ne traverse pas la virgule
    expect(analyser("Ne t'inquiète pas, c'est facile.", fr).second).toBe('content');
  });
  it('les expressions de plusieurs mots passent avant les mots seuls', () => {
    expect(emo('Pas de panique.')).toBe('tendre');
    expect(emo('Quelle panique !')).toBe('peur');
  });
  it('les intensifs, les majuscules et « ! » renforcent, « un peu » atténue', () => {
    const f = (t) => analyser(t, fr).force;
    expect(f('Je suis très content.')).toBeGreaterThan(f('Je suis content.'));
    expect(f('Je suis content !')).toBeGreaterThan(f('Je suis content.'));
    expect(f('Je suis CONTENT.')).toBeGreaterThan(f('Je suis content.'));
    expect(f('Je suis un peu content.')).toBeLessThan(f('Je suis content.'));
    expect(f('Bravo, bravo, excellent, parfait, génial !!!')).toBeLessThanOrEqual(1.25);
  });
  it('mélange deux émotions proches', () => {
    const r = analyser('Incroyable, on a réussi !', fr);
    expect(r.emotion).toBe('enthousiaste');
    expect(r.second).toBe('content');
    expect(r.poids).toBeGreaterThan(0);
    expect(r.poids).toBeLessThanOrEqual(0.45);
  });
  it('ponctuation seule et émojis', () => {
    expect(emo('Tu viens ?')).toBe('sceptique');
    expect(emo('Il arrive demain ?!')).toBe('surpris');
    expect(emo('Il arrive demain.')).toBe('neutre');
    expect(emo('Regarde ça 😂')).toBe('rire');
  });
  it('un mot peut ne porter qu\'un geste', () => {
    const r = analyser('Non, merci.', fr);
    expect(r.moments[0]).toMatchObject({ mot: 'Non', emotion: '', geste: 'secoue' });
    expect(analyser('Bonjour à tous.', fr).moments[0].geste).toBe('coucou');
    expect(emo('Non.')).toBe('neutre');
  });
});

describe('analyser (anglais)', () => {
  it('reconnaît les émotions et la négation', () => {
    expect(emo('Well done, it works!', en)).toBe('content');
    expect(emo('I am not happy.', en)).toBe('triste');
    expect(emo("Don't worry.", en)).toBe('tendre');
    expect(emo('Oops, my bad.', en)).toBe('gene');
    expect(emo('This is awesome!', en)).toBe('enthousiaste');
  });
});
