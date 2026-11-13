import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildMatcher, mergeDicts, autoExpression } from '../src/modules/keywords.js';

const dict = JSON.parse(fs.readFileSync(new URL('../data/keywords_fr.json', import.meta.url), 'utf8'));
const match = buildMatcher(dict);
const cats = (texte) => match(texte).filter((j) => j.cat).map((j) => [j.t, j.cat]);

describe('keywords', () => {
  it('reconstitue exactement le texte', () => {
    const texte = "Attention : sudo nmap sur le port SSH, c'est une faille !";
    expect(match(texte).map((j) => j.t).join('')).toBe(texte);
  });
  it('ne colore que les mots entiers', () => {
    expect(cats('les cdrom et le lsd')).toEqual([]);
    expect(cats('tape ls puis cd /tmp')).toEqual([['ls', 'commande'], ['cd', 'commande']]);
    expect(cats('HTTPS')).toEqual([['HTTPS', 'protocole']]); // pas « HTTP » + « S »
    expect(cats('le mot gitan')).toEqual([]);
  });
  it('gère les accents', () => {
    expect(cats('Une vulnérabilité critique')).toEqual([['vulnérabilité', 'alerte']]);
    expect(cats('VULNÉRABILITÉ')).toEqual([['VULNÉRABILITÉ', 'alerte']]);
    expect(cats('invulnérabilités')).toEqual([]);
    expect(cats('défaille')).toEqual([]); // « faille » précédé d'une lettre accentuée
  });
  it('gère les expressions multi-mots (la plus longue d\'abord)', () => {
    expect(cats('une injection SQL classique')).toEqual([['injection SQL', 'attaque']]);
    expect(cats('avec Burp   Suite')).toEqual([['Burp   Suite', 'outil']]);
    expect(cats('du SQL pur')).toEqual([['SQL', 'langage']]);
  });
  it('ignore la casse, avec priorité à la casse exacte', () => {
    expect(cats('PYTHON et python')).toEqual([['PYTHON', 'langage'], ['python', 'langage']]);
    expect(cats('ssh root@hote')).toEqual([['ssh', 'commande']]);
    expect(cats('le protocole SSH')).toEqual([['SSH', 'protocole']]);
  });
  it('respecte les règles du dictionnaire', () => {
    const strict = buildMatcher({ ...dict, regles: { sensibleCasse: true, motsEntiers: true, expressionsMultiMots: false } });
    expect(strict('python').some((j) => j.cat)).toBe(false);
    expect(strict('injection SQL').filter((j) => j.cat).map((j) => j.t)).toEqual(['SQL']);
  });
  it('tolère un dictionnaire vide et un texte vide', () => {
    const vide = buildMatcher({ categories: {} });
    expect(vide('bonjour')).toEqual([{ t: 'bonjour', cat: null }]);
    expect(match('')).toEqual([]);
  });
  it('fusionne les dictionnaires', () => {
    const m = buildMatcher(mergeDicts(dict, { categories: { perso: { couleur: '#fff', mots: ['Lectura'] }, commande: { mots: ['tar'] } } }));
    expect(m('Lectura lance tar').filter((j) => j.cat).map((j) => j.cat)).toEqual(['perso', 'commande']);
  });
  it('déduit l\'expression automatique', () => {
    expect(autoExpression('Attention au danger', match)).toBe('surpris');
    expect(autoExpression('Bravo, tu as réussi', match)).toBe('content');
    expect(autoExpression('sudo apt update', match)).toBe('concentre');
    expect(autoExpression('Bonjour à tous', match)).toBe('neutre');
  });
});

import { decouper } from '../src/modules/terminal.js';

describe('découpage des très longues lignes du terminal', () => {
  it('laisse les lignes courtes intactes', () => {
    expect(decouper('Une phrase. Une autre.')).toEqual(['Une phrase. Une autre.']);
  });
  it('conserve exactement les positions du texte', () => {
    const ligne = 'Attention, la commande analyse le réseau.  Bravo, le pare-feu a réussi ! '.repeat(40) + 'x'.repeat(1500) + ' fin';
    const morceaux = decouper(ligne);
    expect(morceaux.length).toBeGreaterThan(40);
    expect(morceaux.reduce((a, m) => a + m.length, 0) + morceaux.length - 1).toBe(ligne.length);
    let pos = 0;
    for (const m of morceaux) { expect(ligne.slice(pos, pos + m.length)).toBe(m); pos += m.length + 1; }
  });
});
