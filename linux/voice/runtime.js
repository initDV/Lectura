// Same words, closed-question contour, and edge trimming as Lectura's Web voice.
// Hosted in QuickJS on the native synthesis thread; the ONNX tensors stay in C++.
import { phonemiser, phonemesEnIds } from '../../src/modules/voice/g2p_fr.js';
import { phrasePiper } from '../../src/modules/voice/question-pitch.js';
import { rognerBordsSiwis } from '../../src/modules/voice/piper-edges.js';
import config from './siwis.onnx.json';

export function ids(text) {
  const phones = phonemiser(text, true);
  return JSON.stringify(phones ? phonemesEnIds(phones, config.phoneme_id_map) : []);
}

export function prosody(buffer, text, rate, speed, peak) {
  const samples = new Float32Array(buffer);
  return rognerBordsSiwis(phrasePiper(samples, text, rate, speed, peak), rate, peak).buffer;
}
