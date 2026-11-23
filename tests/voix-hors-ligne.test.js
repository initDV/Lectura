import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let stockage, fichiers, cache, fetchModele, cat;
const f = (fichier, taille) => ({ fichier, taille });
const v = (id, modele) => ({ id, nom: id, config: `${modele}.json`, tailleConfig: 3, parts: [f(`${modele}.onnx`, 40)], licence: 'test', attribution: '' });
const nom = (url) => new URL(url.toString()).pathname.split('/models/')[1];
const binaire = (n, tailleDeclaree = n) => new Response(new Uint8Array(n), { headers: { 'content-length': String(tailleDeclaree) } });
const marque = (nomFichier, octets) => fichiers.set(nomFichier, binaire(octets));

beforeEach(async () => {
  vi.resetModules();
  fichiers = new Map();
  cat = { moteur: { fichiers: [f('ort/engine.wasm', 20)] }, voix: [v('ls1', 'mls'), v('ls2', 'mls'), v('tom', 'tom'), v('autre', 'autre')] };
  cache = {
    match: vi.fn(async (url) => fichiers.get(nom(url))?.clone()),
    put: vi.fn(async (url, res) => fichiers.set(nom(url), res.clone())),
    delete: vi.fn(async (url) => fichiers.delete(nom(url))),
  };
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('caches', { open: async () => cache });
  vi.stubGlobal('navigator', { storage: {} });
  fetchModele = vi.fn(async (url) => nom(url) === 'index.json' ? Response.json(cat) : binaire(nom(url).endsWith('.json') ? 3 : 40));
  vi.stubGlobal('fetch', fetchModele);
  stockage = await import('../src/modules/voice/piper-store.js');
});
afterEach(() => vi.unstubAllGlobals());

describe('Stockage des voix HD', () => {
  it('compte une fois le runtime et le modèle commun à deux locuteurs, à leur taille locale', async () => {
    marque('ort/engine.wasm', 20); marque('mls.json', 6); marque('mls.onnx', 40); marque('tom.json', 3);
    const s = await stockage.etatStockage();
    expect(s.totalOctets).toBe(69);
    expect(s.moteurOctets).toBe(20);
    expect(s.modeles).toEqual([
      { noms: ['ls1', 'ls2'], octets: 46, installe: true, partiel: false },
      { noms: ['tom'], octets: 3, installe: false, partiel: true },
    ]);
    expect(s.voix.map(({ installe, partiel }) => [installe, partiel])).toEqual([[true, false], [true, false], [false, true], [false, false]]);
    expect(s.voix.find((x) => x.id === 'tom').restant).toBe(40);
    expect(fetchModele.mock.calls.map(([url]) => nom(url))).toEqual(['index.json']);
  });

  it('le moteur seul ne rend aucune voix partielle et ne déclenche aucune reprise', async () => {
    marque('ort/engine.wasm', 20);
    const s = await stockage.etatStockage();
    expect(s.modeles).toEqual([]);
    expect(s.totalOctets).toBe(20);
    expect(await stockage.supprimerPartiel('tom')).toBe(false);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(fetchModele).toHaveBeenCalledTimes(1);
  });

  it('efface le seul modèle incomplet, sans toucher aux autres voix même partielles', async () => {
    marque('ort/engine.wasm', 20); marque('mls.json', 3); marque('mls.onnx', 40);
    marque('tom.json', 4); marque('autre.json', 5);
    expect(await stockage.supprimerPartiel('tom')).toBe(true);
    expect(await stockage.supprimerPartiel('tom')).toBe(false);
    expect(await stockage.supprimerPartiel('ls2')).toBe(false);
    expect([...fichiers.keys()]).toEqual(['ort/engine.wasm', 'mls.json', 'mls.onnx', 'autre.json']);
    expect((await stockage.etatVoix()).find((x) => x.id === 'ls2').installe).toBe(true);
  });

  it('ne supprime pas une ressource également référencée par un autre modèle', async () => {
    cat.voix[2].parts.unshift(f('commun.onnx', 19)); cat.voix[3].parts.unshift(f('commun.onnx', 19));
    marque('ort/engine.wasm', 20); marque('tom.json', 3); marque('autre.json', 3); marque('commun.onnx', 19); marque('autre.onnx', 40);
    expect(await stockage.supprimerPartiel('tom')).toBe(true);
    expect(fichiers.has('tom.json')).toBe(false);
    expect(fichiers.has('commun.onnx')).toBe(true);
    expect((await stockage.etatVoix()).find((x) => x.id === 'autre').installe).toBe(true);
  });

  it('garde le fichier vérifié après annulation, puis reprend uniquement sur appel explicite', async () => {
    const abort = new AbortController(); marque('ort/engine.wasm', 20);
    const erreur = await stockage.telecharger('tom', { signal: abort.signal, onProgress: () => { if (fichiers.has('tom.json')) abort.abort(); } }).catch((e) => e);
    expect(erreur).toBeInstanceOf(Error);
    expect([...fichiers.keys()]).toEqual(['ort/engine.wasm', 'tom.json']);
    expect((await stockage.etatVoix()).find((x) => x.id === 'tom').partiel).toBe(true);
    expect(fetchModele.mock.calls.map(([url]) => nom(url))).toEqual(['index.json', 'tom.json']);
    await stockage.telecharger('tom');
    expect(fetchModele.mock.calls.map(([url]) => nom(url))).toEqual(['index.json', 'tom.json', 'tom.onnx']);
    expect((await stockage.etatVoix()).find((x) => x.id === 'tom').installe).toBe(true);
  });
});
