import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEngine } from '../src/modules/voice/engine.js';
import { PiperEngine } from '../src/modules/voice/piper.js';
import { getPhrase, hashPhrase, setPhrase, viderCache } from '../src/modules/voice/audio-cache.js';
import { Timeline } from '../src/modules/timeline.js';

vi.mock('../src/modules/voice/piper-store.js', () => {
  const voix = ['siwis', 'tom'].map((id) => ({ id, installe: true, config: `${id}.json`, parts: [{ fichier: `${id}.onnx`, taille: 12 }] }));
  return {
    getCatalogue: async () => ({ voix, moteur: { entree: 'ort.mjs', dossier: 'ort/' } }),
    etatVoix: async () => voix,
    lire: async (f) => f.endsWith('.json') ? new TextEncoder().encode('{"audio":{"sample_rate":22050}}').buffer : new ArrayBuffer(12),
    urlFichier: (f) => f, etatStockage: () => {}, telecharger: () => {}, supprimer: () => {}, supprimerPartiel: () => {}, toutSupprimer: () => {},
  };
});

const pending = [], workers = [], requetes = [];
class WorkerTest {
  constructor() { workers.push(this); }
  postMessage(msg) {
    if (msg.type === 'init') return queueMicrotask(() => this.onmessage({ data: { id: msg.id, ok: true } }));
    requetes.push(msg); pending.push({ worker: this, msg });
  }
  terminate() { this.terminated = true; }
}
async function attendrePhrase(texte, numero = 0) {
  await vi.waitFor(() => expect(pending[numero]?.msg.texte).toBe(texte));
  const { worker, msg } = pending[numero];
  const samples = new Float32Array(2205).fill(0.2);
  worker.onmessage({ data: { id: msg.id, ok: true, samples, peak: 0.4 } });
}

beforeEach(async () => {
  vi.stubGlobal('Worker', WorkerTest);
  vi.stubGlobal('crypto', webcrypto);
  pending.length = 0; workers.length = 0; requetes.length = 0;
  await viderCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('préparation Piper bornée et réutilisable', () => {
  it('partage bien la même instance entre préchauffage et lecture', async () => {
    const [a, b] = await Promise.all([getEngine('piper'), getEngine('piper')]);
    expect(a).toBe(b);
  });

  it('une lecture lancée pendant le préchauffage reprend la phrase en cours, sans double inférence', async () => {
    const moteur = new PiperEngine(), contrôle = new AbortController();
    const début = 'Tu viens ce soir ?', suite = 'Les yeux de monsieur brillent.', texte = `${début}\n$ ligne muette\n${suite}`;
    const warm = moteur.prewarm(texte, { voixId: 'siwis', vitesse: 1, signal: contrôle.signal }).catch((err) => err.name);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    contrôle.abort();
    const rendre = moteur.synthesize(texte, { voixId: 'siwis', vitesse: 1 });
    await attendrePhrase(début);
    expect(await warm).toBe('AbortError');
    await attendrePhrase(suite, 1);
    const rendu = await rendre;
    expect(requetes.map((m) => [m.texte, m.prosodie])).toEqual([[début, true], [suite, true]]);
    expect(workers).toHaveLength(1);
    expect(rendu.sampleRate).toBe(22050);
    const [a, b, c] = rendu.segments;
    expect(a.speechEndMs).toBe(100);
    expect(a.finMs).toBe(b.debutMs);
    expect(b.finMs).toBe(c.debutMs);
    expect(c.finMs).toBe(Math.round(1000 * rendu.samples.length / 22050));
    expect(rendu.samples[0]).toBeCloseTo(0.45); // Gain calculé sur le pic avant traitement.
    expect(rendu.samples.subarray(Math.ceil(b.debutMs * 22.05), Math.floor(b.finMs * 22.05)).every((x) => x === 0)).toBe(true);
    const timeline = new Timeline(texte, rendu.segments);
    expect(timeline.charAt(c.debutMs)).toBe(texte.indexOf(suite));
    moteur.stop();
  });

  it('prépare au plus trois phrases entières, ignore les lignes muettes et évite la phrase trop longue', async () => {
    const moteur = new PiperEngine(), opts = { voixId: 'siwis', vitesse: 1 };
    await moteur.prewarm(`${'bonjour '.repeat(50)}! Salut.`, opts);
    expect(workers).toHaveLength(0);
    const clips = ['Tu viens ce soir ?', 'Vraiment ?', 'Siwis raconte la suite.', 'Pas encore cette phrase.'];
    const job = moteur.prewarm(`# Silence\n${clips.join(' ')}`, opts);
    for (let n = 0; n < 3; n++) await attendrePhrase(clips[n], n);
    await job;
    expect(requetes.map((r) => r.texte)).toEqual(clips.slice(0, 3));
    moteur.stop();
  });

  it('annule une lecture explicite, ignore les réponses tardives et peut changer de voix', async () => {
    const moteur = new PiperEngine(), a = new AbortController();
    const demande = moteur.synthesize('Vraiment ?', { voixId: 'siwis', signal: a.signal }).catch((e) => e);
    await vi.waitFor(() => expect(requetes).toHaveLength(1));
    a.abort();
    expect(await demande).toBeInstanceOf(Error);
    expect(workers[0].terminated).toBe(true);
    const nouveau = moteur.synthesize('Vraiment ?', { voixId: 'tom' });
    await attendrePhrase('Vraiment ?', 0); // Réponse de la synthèse annulée.
    await attendrePhrase('Vraiment ?', 1);
    expect((await nouveau).samples.length).toBeGreaterThan(2205);
    expect(requetes[1].prosodie).toBe(false);
    moteur.stop();
  });

  it('ignore l’ancienne clé d’une phrase et limite le cache RAM même sans IndexedDB', async () => {
    const ancien = Buffer.from(await crypto.subtle.digest('SHA-1', new TextEncoder().encode('siwis|1.000|Vraiment ?'))).toString('hex');
    expect(await hashPhrase('Vraiment ?', 'siwis', 1)).not.toBe(ancien);
    const bloc = 1024 * 1024;
    await setPhrase('1', new Float32Array(bloc), 22050, 0);
    await setPhrase('2', new Float32Array(bloc), 22050, 0);
    await getPhrase('1');
    await setPhrase('3', new Float32Array(bloc), 22050, 0);
    expect(await getPhrase('2')).toBeNull();
    expect((await getPhrase('1')).samples.length).toBe(bloc);
    await viderCache();
    expect(await getPhrase('1')).toBeNull();
  });
});
