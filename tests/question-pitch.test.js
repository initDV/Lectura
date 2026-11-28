import { describe, it, expect } from 'vitest';
import { phrasePiper, questionFermee, releverFinale } from '../src/modules/voice/question-pitch.js';
import { questions } from './fixtures/voice-fr.mjs';

const signal = (sr, f0, pente) => {
  const x = new Float32Array(sr), from = Math.round(sr * 0.1), to = Math.round(sr * 0.74);
  let phase = 0;
  for (let i = from; i < to; i++) {
    phase += 2 * Math.PI * (f0 + pente * (i - from) / (to - from)) / sr;
    x[i] = 0.22 * Math.sin(phase) + 0.05 * Math.sin(2 * phase) + 0.03 * Math.sin(4 * phase);
  }
  return { x, from, to };
};
const count = (x, a, b) => x.subarray(a, b).reduce((n, v, i) => n + (i && v >= 0 && x[a + i - 1] < 0 ? 1 : 0), 0);

describe('intonation conditionnelle de Siwis', () => {
  it.each(questions)('détermine si « %s » est une question fermée sûre', (phrase, attendu) => expect(questionFermee(phrase)).toBe(attendu));
  it.each([22050, 24000])('relève un noyau plat et ajoute exactement 70 ms de voix à %d Hz', (sr) => {
    const { x, from, to } = signal(sr, 150, 0), brut = x.slice();
    const y = releverFinale(x, from, to, sr), extra = Math.round(sr * 0.07);
    expect(y.length - x.length).toBe(extra);
    expect(y.subarray(0, Math.floor(sr * 0.51))).toEqual(x.subarray(0, Math.floor(sr * 0.51)));
    expect(y.subarray(to + extra)).toEqual(x.subarray(to));
    expect(x).toEqual(brut);
    expect(y.every(Number.isFinite)).toBe(true);
    expect(y.reduce((a, b) => Math.max(a, Math.abs(b)), 0)).toBeLessThanOrEqual(0.3);
    const a = Math.round(sr * 0.66), b = Math.round(sr * 0.718);
    expect(count(y, a + extra, b + extra)).toBeGreaterThan(count(x, a, b));
    expect(releverFinale(x, from, to, sr, 0).length).toBe(x.length);
  });
  it('conserve le signal entier si la finale monte déjà, même si la question est fermée', () => {
    const { x } = signal(22050, 106, 105);
    expect(phrasePiper(x, 'Vraiment ?', 22050, 1)).toBe(x);
  });
  it('ne tente pas de remodeler un souffle, un échantillon court ou une question ouverte', () => {
    const { x } = signal(22050, 150, 0);
    expect(phrasePiper(x, 'Pourquoi, tu viens ?', 22050, 1)).toBe(x);
    const bruit = new Float32Array(22050);
    let rng = 1234;
    for (let i = 0; i < bruit.length; i++) { rng = (Math.imul(1664525, rng) + 1013904223) >>> 0; bruit[i] = (rng / 2 ** 32 - 0.5) * 0.2; }
    expect(phrasePiper(bruit, 'Tu viens ?', 22050, 1)).toBe(bruit);
    const court = bruit.slice(0, 600);
    expect(phrasePiper(court, 'Vraiment ?', 22050, 1)).toBe(court);
  });
});
