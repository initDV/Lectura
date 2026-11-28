import { phonemiser } from '../voice/g2p_fr.js';
import { typeLigne } from '../timeline.js';
import { bound, interp, smooth, windowAt } from './math.js';

// Largeur, ouverture, rond, mâchoire, morsure, langue.
export const REPOS_BOUCHE = Object.freeze([1, 0, 0, 0, 0, 0]);
const formes = {
  X: REPOS_BOUCHE, M: [.96, 0, 0, .04, 0, 0], K: [.94, .92, .16, .32, 0, 0],
  A: [1.02, 3.42, .10, 1.64, 0, .12], E: [1.08, 2.06, .01, .96, 0, 0], I: [1.17, 1.04, 0, .39, 0, 0],
  O: [.69, 2.72, .79, 1.28, 0, 0], U: [.52, 1.58, 1, .54, 0, 0], F: [.91, .78, 0, .28, 1, 0],
  L: [1, 1.75, .05, .68, 0, 1], S: [1.03, .83, .21, .26, 0, 0],
};
const regles = [
  [/^[aɑæɐ]$/, 'A', 1.8], [/^[ɛeəɜɚɪ]$/, 'E', 1.65], [/^[ij]$/, 'I', 1.65],
  [/^[oɔœøɒ]$/, 'O', 1.8], [/^[uüyʊwɥ]$/, 'U', 1.7],
  [/^[mbp]$/, 'M', .94], [/^[fv]$/, 'F', 1.04], [/^[lnɲ]$/, 'L', .99],
  [/^[szʃʒ]$/, 'S', 1.04], [/^[.!?…]$/, 'X', .99], [/^[,;:]$/, 'X', 1.55],
];
const anglais = (s) => s.toLowerCase().replace(/oo|ou/g, 'u').replace(/ee|ea/g, 'i').replace(/ph/g, 'f').replace(/sh|ch/g, 'ʃ');

export function planBouche(segments, langue, siwis = false) {
  const windows = [];
  for (const s of segments) {
    if (typeLigne(s.texte) !== 'parle') continue;
    const start = s.debutMs, end = Math.min(s.speechEndMs ?? s.finMs, s.finMs);
    if (end <= start) continue;
    const texte = langue === 'en' ? anglais(s.texte) : phonemiser(s.texte, siwis);
    let total = 0;
    const phones = [];
    for (const p of texte) {
      if (!/[\p{L}.!?…,;:]/u.test(p)) continue;
      const [, forme, poids] = regles.find(([test]) => test.test(p)) || [null, 'K', .9];
      phones.push({ start: total, end: total + poids, value: formes[forme] });
      total += poids;
    }
    if (!phones.length) continue;
    for (const p of phones) {
      p.start = start + (end - start) * (p.start / total);
      p.end = start + (end - start) * (p.end / total);
    }
    windows.push({ start, end, phones });
  }
  return windows;
}

function fondre(a, b, u) { return a.map((v, i) => interp(v, b[i], u)); }

export function boucheA(ms, plan, gain = 1) {
  if (gain <= 0) return REPOS_BOUCHE;
  const phrase = windowAt(plan, ms), son = phrase && windowAt(phrase.phones, ms);
  if (!son) return REPOS_BOUCHE;
  const { start, end } = son, dur = end - start;
  const avant = windowAt(phrase.phones, start - .0001), apres = windowAt(phrase.phones, end);
  const entree = Math.min(22, dur * .27, (avant ? avant.end - avant.start : dur) * .34);
  const sortie = Math.min(22, dur * .27, (apres ? apres.end - apres.start : dur) * .34);
  const forme = ms - start < entree ? fondre(avant?.value || REPOS_BOUCHE, son.value, smooth(start - entree, start + entree, ms))
    : end - ms < sortie ? fondre(son.value, apres?.value || REPOS_BOUCHE, smooth(end - sortie, end + sortie, ms)) : son.value;
  const fen = Math.min(37, (phrase.end - phrase.start) * .22);
  return fondre(REPOS_BOUCHE, forme, bound(gain) * smooth(phrase.start, phrase.start + fen, ms) * (1 - smooth(phrase.end - fen, phrase.end, ms)));
}

export function enveloppeAudio(channels, rate) {
  const count = channels[0]?.length || 0, step = Math.max(1, Math.round(rate * 16 / 1000));
  const rms = new Float32Array(Math.ceil(count / step));
  let peak = 0;
  for (let i = 0; i < rms.length; i++) {
    const start = i * step, end = Math.min(count, start + step);
    for (const channel of channels) {
      let sum = 0;
      for (let j = start; j < end; j++) sum += channel[j] ** 2;
      rms[i] = Math.max(rms[i], Math.sqrt(sum / (end - start)));
    }
    peak = Math.max(peak, rms[i]);
  }
  const seuil = bound(peak * .06, .0018, .018), haut = Math.max(seuil * 2, peak * .37);
  return (ms) => {
    if (ms < 0 || ms * rate / 1000 >= count) return 0;
    const u = bound(ms * rate / (1000 * step) - .5, 0, rms.length - 1), i = Math.floor(u);
    return smooth(seuil, haut, interp(rms[i], rms[i + 1] ?? rms[i], u - i));
  };
}

export async function analyserAudioAicha(blob, audio, signal) {
  if (!audio.ctx || audio.dureeMs > 60_000 || blob.size > 10 * 1024 ** 2) return null;
  try {
    const data = await blob.arrayBuffer();
    signal?.throwIfAborted();
    const buffer = await audio.ctx.decodeAudioData(data);
    signal?.throwIfAborted();
    return enveloppeAudio(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)), buffer.sampleRate);
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
