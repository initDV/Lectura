import { describe, it, expect } from 'vitest';
import { splitSentences, autoTiming, Timeline, segmentsValides, weight, estimateDurationMs } from '../src/modules/timeline.js';

const TEXTE = "Bonjour à tous. Aujourd'hui, on parle de sécurité !\nsudo nmap -sV 192.168.1.10\n\nFin… Merci ?";

describe('splitSentences', () => {
  it('découpe sur la ponctuation forte et les retours à la ligne, avec positions exactes', () => {
    const p = splitSentences(TEXTE);
    expect(p.map((x) => x.texte)).toEqual(['Bonjour à tous.', "Aujourd'hui, on parle de sécurité !", 'sudo nmap -sV 192.168.1.10', 'Fin…', 'Merci ?']);
    for (const x of p) expect(TEXTE.slice(x.start, x.end)).toBe(x.texte);
  });
  it('renvoie une liste vide pour un texte vide', () => expect(splitSentences('  \n ')).toEqual([]));
});

describe('autoTiming', () => {
  it('la somme des durées est égale à la durée totale', () => {
    for (const duree of [1000, 12345, 59999, 600000]) {
      const segs = autoTiming(TEXTE, duree);
      expect(segs.reduce((s, x) => s + (x.finMs - x.debutMs), 0)).toBe(duree);
      expect(segs[0].debutMs).toBe(0);
      expect(segs.at(-1).finMs).toBe(duree);
      segs.slice(1).forEach((s, i) => expect(s.debutMs).toBe(segs[i].finMs)); // segments contigus
    }
  });
  it('pondère la ponctuation', () => {
    expect(weight('abc.')).toBe(4 + 12);
    expect(weight('a, b; c')).toBe(7 + 12);
    const [a, b] = autoTiming('aaaa. aaaaaaaa.', 3600);
    expect(b.finMs - b.debutMs).toBeGreaterThan(a.finMs - a.debutMs);
  });
  it('produit des segments valides pour le texte', () => {
    expect(segmentsValides(TEXTE, autoTiming(TEXTE, 9000))).toBe(true);
    expect(segmentsValides(TEXTE + ' modifié', autoTiming('autre texte.', 9000))).toBe(false);
    expect(segmentsValides(TEXTE, [])).toBe(false);
  });
});

describe('Timeline', () => {
  const segs = autoTiming(TEXTE, 10000), tl = new Timeline(TEXTE, segs);
  it('va de 0 au texte complet', () => {
    expect(tl.charAt(0)).toBe(0);
    expect(tl.charAt(10000)).toBe(TEXTE.length);
    expect(tl.charAt(99999)).toBe(TEXTE.length);
    expect(tl.dureeMs).toBe(10000);
  });
  it('est monotone (le texte ne recule jamais quand le temps avance)', () => {
    let prev = 0;
    for (let t = 0; t <= 10000; t += 37) { const c = tl.charAt(t); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });
  it('recul (seek) : la même date donne toujours la même position', () => {
    const a = tl.charAt(7000), b = tl.charAt(2500);
    expect(b).toBeLessThan(a);
    expect(tl.charAt(7000)).toBe(a);
    expect(tl.charAt(2500)).toBe(b);
  });
  it('timeAt est l\'inverse de charAt (à un caractère près)', () => {
    for (const n of [0, 5, 20, 40, 70, TEXTE.length - 1]) expect(Math.abs(tl.charAt(tl.timeAt(n)) - n)).toBeLessThanOrEqual(1);
    expect(tl.timeAt(TEXTE.length)).toBe(10000);
  });
  it('interpole à l\'intérieur d\'un segment daté (SRT)', () => {
    const t2 = new Timeline('abcdefghij\nklm', [{ id: 1, texte: 'abcdefghij', debutMs: 1000, finMs: 2000 }, { id: 2, texte: 'klm', debutMs: 3000, finMs: 3300 }]);
    expect(t2.charAt(500)).toBe(0);
    expect(t2.charAt(1500)).toBe(5);
    expect(t2.charAt(2500)).toBe(10); // silence entre deux segments : le texte attend
    expect(t2.charAt(3150)).toBe(12);
    expect(t2.segmentAt(1500).id).toBe(1);
    expect(t2.segmentAt(500)).toBe(null);
  });
  it('estime la durée de la voix système à 14 caractères par seconde', () => {
    expect(estimateDurationMs('a'.repeat(140), 1)).toBe(10000);
    expect(estimateDurationMs('a'.repeat(140), 2)).toBe(5000);
  });
});
