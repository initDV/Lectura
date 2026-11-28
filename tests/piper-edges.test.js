import { describe, it, expect } from 'vitest';
import { rognerBordsSiwis } from '../src/modules/voice/piper-edges.js';

describe('marges de Siwis Piper', () => {
  it('rogne aux bords, sans déplacer ni couper la pause intérieure', () => {
    const signal = new Float32Array(6600);
    signal.fill(.018, 800, 1000); // consonne plus faible qu'une voyelle
    signal.fill(.4, 1000, 2300);
    signal.fill(.25, 4500, 5300);
    const before = signal.slice();
    const voice = rognerBordsSiwis(signal, 22050, .4);
    expect(voice.length).toBe(4500);
    expect(voice[0]).toBeGreaterThan(0);
    expect(voice[0]).toBeLessThan(.018);
    expect(voice[200]).toBeCloseTo(.4);
    expect(voice.slice(1500, 3700).every(v => v === 0)).toBe(true);
    expect(voice.at(-1)).toBeLessThan(.02);
    expect(signal).toEqual(before);
  });
  it('ne recadre pas le silence ni les impulsions isolées', () => {
    const signal = new Float32Array(2000);
    expect(rognerBordsSiwis(signal, 22050, 0)).toBe(signal);
    signal[1000] = .9;
    expect(rognerBordsSiwis(signal, 22050, .9)).toBe(signal);
  });
});
