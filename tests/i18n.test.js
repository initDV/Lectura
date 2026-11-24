import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';

const fichiers = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? fichiers(p) : p.endsWith('.js') && !p.includes('/i18n/') ? [p] : [];
});
const PREFIXES = /^(net|maj|commun|err|stockage|accueil|tuto|editeur|voix|expr|scene|touche|nav|reglages|apropos|aide|menu|persos)\.[A-Za-z0-9.]+$/;

describe('dictionnaires', () => {
  it('toutes les clés écrites en dur dans le code existent en français', () => {
    const manquantes = new Set();
    for (const f of fichiers('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'([a-z]+(?:\.[A-Za-z0-9]+)+)'/g)) {
        if (PREFIXES.test(m[1]) && !(m[1] in fr)) manquantes.add(`${m[1]} (${f})`);
      }
    }
    expect([...manquantes]).toEqual([]);
  });
  it('l’anglais a exactement les mêmes clés que le français', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it('les variables {x} sont les mêmes dans les deux langues', () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    const ecarts = Object.keys(fr).filter((k) => vars(fr[k]) !== vars(en[k] || ''));
    expect(ecarts).toEqual([]);
  });
  it('aucun texte vide', () => {
    expect(Object.entries(fr).filter(([, v]) => !String(v).trim())).toEqual([]);
  });
});
