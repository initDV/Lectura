import { describe, it, expect } from 'vitest';
import { phonemiser, motEnPhonemes, phonemesEnIds } from '../src/modules/voice/g2p_fr.js';
import { words, groups } from './fixtures/voice-fr.mjs';
import { entierEnMots, nombresEnMots } from '../src/modules/voice/nombres.js';

const nu = (s) => s.replace(/[ˈ-]/g, '');

describe('nombres en mots', () => {
  it('écrit les entiers usuels', () => {
    expect(entierEnMots(0)).toBe('zéro');
    expect(entierEnMots(21)).toBe('vingt et un');
    expect(entierEnMots(71)).toBe('soixante et onze');
    expect(entierEnMots(80)).toBe('quatre-vingts');
    expect(entierEnMots(99)).toBe('quatre-vingt-dix-neuf');
    expect(entierEnMots(200)).toBe('deux cents');
    expect(entierEnMots(1984)).toBe('mille neuf cent quatre-vingt-quatre');
    expect(entierEnMots(2000000)).toBe('deux millions');
  });
  it('lit une adresse IP avec « point »', () => {
    expect(nombresEnMots('10.0.0.1').replace(/\s+/g, ' ').trim()).toBe('dix point zéro point zéro point un');
  });
});

describe('phonétisation française', () => {
  it('convertit des mots courants', () => {
    expect(nu(motEnPhonemes('bonjour'))).toBe('bɔ̃ʒuʁ');
    expect(nu(motEnPhonemes('attention'))).toBe('atɑ̃sjɔ̃');
    expect(nu(motEnPhonemes('sécurité'))).toBe('sekyʁite');
    expect(nu(motEnPhonemes('ordinateur'))).toBe('ɔʁdinatœʁ');
    expect(nu(motEnPhonemes('utilisent'))).toBe('ytiliz');
    expect(nu(motEnPhonemes('différent'))).toBe('difeʁɑ̃');
  });
  it('place un accent tonique sur la dernière voyelle', () => {
    expect(motEnPhonemes('serveur')).toBe('sɛʁvˈœʁ');
  });
  it('épelle les sigles', () => {
    expect(nu(motEnPhonemes('DNS'))).toBe('de ɛn ɛs');
  });
  it('garde la ponctuation et fait les liaisons simples', () => {
    const p = phonemiser('Les amis arrivent, bravo !');
    expect(p).toContain('le-z');
    expect(p).toMatch(/,/);
    expect(p.endsWith('!')).toBe(true);
  });
  it('ne produit jamais de chaîne vide pour un texte prononçable', () => {
    for (const s of ['sudo nmap -sV 192.168.1.10', 'HTTPS', '100 %', 'a@b.com']) expect(phonemiser(s).length).toBeGreaterThan(2);
  });
  it.each(words)('conserve les phonèmes de %s', (texte, attendu) => expect(nu(phonemiser(texte))).toBe(attendu));
  it.each(groups)('désambiguïse le groupe %s', (texte, attendu) => expect(nu(phonemiser(texte))).toContain(attendu));
  it('utilise le son /ɥ/ du modèle et se replie sur /y/ si absent', () => {
    const carte = { '^': [1], $: [2], _: [0], y: [37] };
    expect(phonemesEnIds('ɥ', { ...carte, 'ɥ': [69] })).toEqual([1, 0, 69, 0, 2]);
    expect(phonemesEnIds('ɥ', carte)).toEqual([1, 0, 37, 0, 2]);
  });
  it('encode en identifiants Piper avec début, fin et séparateurs', () => {
    const carte = { '^': [1], $: [2], _: [0], a: [14], b: [15] };
    expect(phonemesEnIds('ab', carte)).toEqual([1, 0, 14, 0, 15, 0, 2]);
    expect(phonemesEnIds('a?b', carte)).toEqual([1, 0, 14, 0, 15, 0, 2]);
  });
});
