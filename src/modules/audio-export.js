// @ts-check
// audio-export.js : extrait la piste audio d'un enregistrement vidéo (WebM ou MP4) et l'encode en MP3.
// lamejs est chargé à la demande : pas de poids au démarrage, uniquement au premier clic « MP3 ».
import { chargerLamejs } from '../vendor/lamejs.js';

/** Convertit un Float32Array (-1..1) en Int16Array PCM. */
function floatVersInt16(floats) {
  const out = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    const s = Math.max(-1, Math.min(1, floats[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Décode un blob vidéo (WebM/MP4) pour en extraire l'AudioBuffer. */
async function decoderAudio(videoBlob) {
  const data = await videoBlob.arrayBuffer();
  const Ctx = window.AudioContext || (/** @type {any} */ (window).webkitAudioContext);
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(data);
  } finally {
    ctx.close?.();
  }
}

/** Encode un AudioBuffer en MP3 (Blob audio/mpeg) via lamejs. */
export async function encoderMp3(audioBuffer) {
  const lamejs = await chargerLamejs();
  const Mp3Encoder = lamejs.Mp3Encoder;
  if (typeof Mp3Encoder !== 'function') throw new Error("lamejs n'expose pas Mp3Encoder");
  const canaux = Math.min(2, audioBuffer.numberOfChannels);
  const taux = audioBuffer.sampleRate;
  const bitrate = canaux === 2 ? 192 : 128;
  const encodeur = new Mp3Encoder(canaux, taux, bitrate);
  const bloc = 1152;
  const gauche = floatVersInt16(audioBuffer.getChannelData(0));
  const droite = canaux === 2 ? floatVersInt16(audioBuffer.getChannelData(1)) : null;
  const morceaux = [];
  for (let i = 0; i < gauche.length; i += bloc) {
    const l = gauche.subarray(i, i + bloc);
    const r = droite ? droite.subarray(i, i + bloc) : null;
    const buf = canaux === 2 ? encodeur.encodeBuffer(l, r) : encodeur.encodeBuffer(l);
    if (buf.length > 0) morceaux.push(new Uint8Array(buf));
  }
  const fin = encodeur.flush();
  if (fin.length > 0) morceaux.push(new Uint8Array(fin));
  return new Blob(morceaux, { type: 'audio/mpeg' });
}

/**
 * Prend un blob vidéo (WebM ou MP4) et renvoie un blob MP3 de sa piste audio.
 * @param {Blob} videoBlob
 * @returns {Promise<Blob>}
 */
export async function videoVersMp3(videoBlob) {
  const audioBuffer = await decoderAudio(videoBlob);
  return encoderMp3(audioBuffer);
}
