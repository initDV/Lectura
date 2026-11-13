import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPRESSIONS, NEUTRE, NOMS_BASE, NOMS_PRO, poseDe, approcher, expressionJouable, gesteDe } from '../src/modules/expressions.js';
import { creerHumeur } from '../src/modules/humeur.js';
import { compilerLexique } from '../src/modules/sentiment.js';

describe('expressions', () => {
  it('4 expressions gratuites, les autres Pro avec un repli gratuit', () => {
    expect(NOMS_BASE).toEqual(['neutre', 'content', 'concentre', 'surpris']);
    expect(NOMS_PRO.length).toBeGreaterThanOrEqual(10);
    for (const n of NOMS_PRO) expect(NOMS_BASE, n).toContain(EXPRESSIONS[n].base);
  });
  it('chaque expression n\'utilise que des réglages connus', () => {
    const permis = new Set([...Object.keys(NEUTRE), 'pro', 'base', 'geste']);
    for (const [n, x] of Object.entries(EXPRESSIONS)) for (const k of Object.keys(x)) expect(permis.has(k), `${n}.${k}`).toBe(true);
  });
  it('garde les valeurs de référence B3', () => {
    expect(poseDe('content').h).toBe(8);
    expect(poseDe('concentre')).toMatchObject({ r: 8, browL: 5, browR: 5 });
    expect(poseDe('surpris')).toMatchObject({ r: 14, browL: -5, browR: -5, h: 12 });
    expect(poseDe('neutre')).toEqual({ ...NEUTRE });
  });
  it('la force dose l\'expression, le mélange combine deux expressions', () => {
    expect(poseDe('surpris', 0)).toEqual({ ...NEUTRE });
    expect(poseDe('surpris', 0.5).r).toBeCloseTo(12.5);
    const m = poseDe('surpris', 1, 'content', 0.5);
    expect(m.h).toBeCloseTo(10);            // entre 12 (surpris) et 8 (content)
    expect(m.w).toBeCloseTo((34 + 56) / 2);
    expect(poseDe('inconnue')).toEqual({ ...NEUTRE });
  });
  it('les poses restent dans les limites du dessin', () => {
    for (const n of Object.keys(EXPRESSIONS)) {
      const p = poseDe(n, 1.25);
      expect(p.r).toBeLessThanOrEqual(15); expect(p.lid).toBeGreaterThanOrEqual(0.15); expect(p.w).toBeLessThanOrEqual(64);
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('approcher fond une pose dans une autre', () => {
    const p = { ...NEUTRE }, c = poseDe('colere');
    approcher(p, c, 0.5);
    expect(p.rot).toBeCloseTo(c.rot / 2);
    approcher(p, c, 1);
    expect(p).toEqual(c);
  });
  it('sans licence, une expression Pro est remplacée par son expression de base', () => {
    expect(expressionJouable('colere', false)).toBe('concentre');
    expect(expressionJouable('colere', true)).toBe('colere');
    expect(expressionJouable('rire', false)).toBe('content');
    expect(expressionJouable('nimporte')).toBe('neutre');
    expect(gesteDe('surpris')).toBe('sursaut');
  });
});

describe('humeur', () => {
  const lexique = compilerLexique(JSON.parse(readFileSync(new URL('../data/sentiments_fr.json', import.meta.url), 'utf8')));
  const matcher = (t) => [{ t, cat: /nmap/.test(t) ? 'commande' : null }];
  const seg = (texte, expression = 'auto', id = texte) => ({ id, texte, expression });

  it('l\'expression imposée passe avant tout', () => {
    const h = creerHumeur({ lexique, matcher, pro: true });
    expect(h.etat(seg('Bravo !', 'triste'), 3)).toMatchObject({ expr: 'triste', force: 1 });
    expect(creerHumeur({ lexique, matcher, pro: false }).etat(seg('Bravo !', 'triste'), 3).expr).toBe('concentre');
  });
  it('commandes et commentaires : concentré', () => {
    const h = creerHumeur({ lexique, matcher, pro: true });
    expect(h.etat(seg('$ rm -rf bravo'), 5).expr).toBe('concentre');
    expect(h.etat(seg('# génial'), 5)).toMatchObject({ expr: 'concentre', force: 0.6 });
  });
  it('annonce l\'émotion puis réagit au mot déclencheur', () => {
    const h = creerHumeur({ lexique, matcher, pro: true }), s = seg('Et là, bravo à tous.');
    const avant = h.etat(s, 2), apres = h.etat(s, 8);
    expect(avant).toMatchObject({ expr: 'content', rang: 0 });
    expect(apres).toMatchObject({ expr: 'content', rang: 1, geste: 'hoche' });
    expect(avant.force).toBeLessThan(apres.force * 0.5);
  });
  it('garde un peu de l\'émotion précédente (expression combinée)', () => {
    const h = creerHumeur({ lexique, matcher, pro: true }), s = seg("J'en ai marre de ce bug.");
    expect(h.etat(s, 5)).toMatchObject({ expr: 'colere', mix: '' });
    expect(h.etat(s, 23)).toMatchObject({ expr: 'gene', mix: 'colere', rang: 2 });
    expect(h.etat(s, 23).poids).toBeGreaterThan(0);
  });
  it('version gratuite : seulement les 4 expressions de base', () => {
    const h = creerHumeur({ lexique, matcher, pro: false });
    for (const t of ["J'en ai marre de ce bug.", 'Haha, trop drôle', 'Quel dommage.', 'Au secours !', 'Incroyable, on a réussi !']) {
      const s = seg(t), e = h.etat(s, t.length);
      expect(['neutre', 'content', 'concentre', 'surpris'], t).toContain(e.expr);
      if (e.mix) expect(['neutre', 'content', 'concentre', 'surpris'], t).toContain(e.mix);
    }
  });
  it('un mot sans émotion ne déclenche qu\'un geste', () => {
    const h = creerHumeur({ lexique, matcher, pro: true }), s = seg('Non, on continue.');
    expect(h.etat(s, 4)).toMatchObject({ expr: 'neutre', rang: 1, geste: 'secoue' });
  });
  it('émotions automatiques coupées : retour aux mots-clés du terminal', () => {
    const h = creerHumeur({ lexique, matcher, pro: true, actif: false });
    expect(h.etat(seg('Bravo à tous, quelle joie.'), 30).expr).toBe('content'); // règle historique « bravo → content »
    expect(h.etat(seg("J'en ai marre."), 30).expr).toBe('neutre');
    expect(h.etat(seg('On lance nmap maintenant.'), 30).expr).toBe('concentre');
  });
});
