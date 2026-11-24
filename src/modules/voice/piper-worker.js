// @ts-check
// piper-worker.js : synthèse Piper (VITS) hors du fil principal. onnxruntime-web (MIT) est chargé depuis
// notre propre origine (models/ort/), jamais depuis un CDN. La phonétisation est faite par g2p_fr.js (maison).
import { phonemiser, phonemesEnIds } from './g2p_fr.js';
import { phrasePiper } from './question-pitch.js';

let ort = null, session = null, config = null;

async function init({ ortUrl, wasmBase, modele, cfg }) {
  ort = await import(ortUrl);
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.wasm.numThreads = 1; // pas de SharedArrayBuffer sur GitHub Pages (pas d'en-têtes COOP/COEP)
  ort.env.wasm.proxy = false;
  config = cfg;
  session = await ort.InferenceSession.create(new Uint8Array(modele), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function synth({ texte, vitesse, speakerId, prosodie }) {
  const phonemes = phonemiser(texte, prosodie);
  if (!phonemes) return { samples: new Float32Array(0), phonemes, peak: 0 };
  const ids = phonemesEnIds(phonemes, config.phoneme_id_map);
  const inf = config.inference || {};
  const entrees = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / (vitesse || 1), inf.noise_w ?? 0.8]), [3]),
  };
  if ((config.num_speakers || 1) > 1) {
    const sid = speakerId ?? config.default_speaker_id ?? 0;
    entrees.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(sid)]), [1]);
  }
  const sortie = await session.run(entrees);
  const t = sortie.output || Object.values(sortie)[0];
  const samples = new Float32Array(t.data);
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  if (!Number.isFinite(peak)) throw new Error('Signal vocal non fini.');
  return { samples: prosodie ? phrasePiper(samples, texte, config.audio?.sample_rate || 22050, vitesse, peak) : samples, phonemes, peak };
}

self.onmessage = async (e) => {
  const { id, type, ...rest } = e.data;
  try {
    if (type === 'init') { await init(rest); self.postMessage({ id, ok: true }); }
    else if (type === 'synth') {
      if (!session) throw new Error('Voix non initialisée.');
      const r = await synth(rest);
      self.postMessage({ id, ok: true, ...r }, [r.samples.buffer]);
    } else if (type === 'fermer') { await session?.release?.(); session = null; self.postMessage({ id, ok: true }); }
  } catch (err) {
    self.postMessage({ id, ok: false, erreur: String(err?.message || err) });
  }
};
