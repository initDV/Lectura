// @ts-check
// audio.js : UN SEUL AudioContext, repris au premier geste, fermé proprement en quittant la scène.
// Lecture par <audio> + MediaElementAudioSourceNode : pas de décodage complet en mémoire (gros fichiers).
//   <audio> → master ─┬→ volume → haut-parleurs
//                     ├→ analyseur (lip-sync)
//                     └→ MediaStreamDestination (piste son de la vidéo exportée, insensible au volume/muet)
import { bus } from '../state.js';
import { LipSync } from './lipsync.js';

export const MSG_FORMAT = 'Format non lu par ce navigateur. Convertis en mp3 ou wav.';
export const FORMATS_AUDIO = '.mp3,.wav,.ogg,.oga,.m4a,.aac,.webm,audio/*';

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */ this.ctx = null;
    /** @type {HTMLAudioElement|null} */ this.el = null;
    /** @type {LipSync|null} */ this.lip = null;
    this.url = ''; this.lecture = 0; this.dureeMs = 0; this.volume = 1; this.muet = false;
    /** @type {any} */ this.dest = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) throw new Error("Ce navigateur ne gère pas l'audio (Web Audio API absente). Utilise Chrome, Edge ou Firefox récents.");
    const ctx = new AC(), el = new Audio();
    el.preload = 'auto';
    /** @type {any} */ (el).preservesPitch = true;
    const src = ctx.createMediaElementSource(el), master = ctx.createGain(), vol = ctx.createGain();
    src.connect(master); master.connect(vol); vol.connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.dest) master.connect(this.dest);
    this.lip = new LipSync(ctx, master);
    el.addEventListener('play', () => bus.emit('audio:play'));
    el.addEventListener('pause', () => { if (!el.ended) bus.emit('audio:pause'); });
    el.addEventListener('ended', () => bus.emit('audio:end'));
    el.addEventListener('error', () => { if (this.pret) bus.emit('audio:error', new Error(MSG_FORMAT)); });
    this.ctx = ctx; this.el = el; this.vol = vol; this.pret = false;
    this.applyVolume();
  }

  /** Charge un fichier audio (Blob). Rejette avec un message clair si le format n'est pas lisible. */
  async load(blob, signal) {
    signal?.throwIfAborted();
    this.init();
    const el = /** @type {HTMLAudioElement} */ (this.el);
    this.pret = false;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    await new Promise((res, rej) => {
      const fin = (fn, v) => {
        clearTimeout(delai); el.onloadedmetadata = null; el.onerror = null;
        signal?.removeEventListener('abort', annuler); fn(v);
      };
      const annuler = () => fin(rej, signal.reason);
      signal?.addEventListener('abort', annuler, { once: true });
      const delai = setTimeout(() => fin(rej, new Error(MSG_FORMAT)), 20000);
      el.onloadedmetadata = () => fin(res);
      el.onerror = () => fin(rej, new Error(MSG_FORMAT));
      el.src = this.url;
      el.load();
    });
    signal?.throwIfAborted();
    if (!Number.isFinite(el.duration)) await this.fixDuration(el); // WebM/Ogg enregistrés sans durée
    signal?.throwIfAborted();
    if (!Number.isFinite(el.duration) || el.duration <= 0) throw new Error(MSG_FORMAT);
    this.dureeMs = el.duration * 1000;
    this.pret = true;
    bus.emit('audio:ready', { dureeMs: this.dureeMs });
    return this.dureeMs;
  }

  fixDuration(el) {
    return new Promise((res) => {
      const fin = () => { el.removeEventListener('durationchange', test); clearTimeout(delai); el.currentTime = 0; res(undefined); };
      const test = () => { if (Number.isFinite(el.duration)) fin(); };
      const delai = setTimeout(fin, 4000);
      el.addEventListener('durationchange', test);
      el.currentTime = 1e7; // force le navigateur à parcourir le fichier pour trouver la fin
    });
  }

  async play() {
    const { ctx, el } = this, lecteur = ++this.lecture;
    if (!ctx || !el) return;
    if (ctx.state !== 'running') await ctx.resume();
    if (lecteur !== this.lecture) return;
    try {
      await el.play();
    } catch (err) {
      if (err?.name === 'AbortError') return; // pause demandée pendant le démarrage
      if (err?.name === 'NotAllowedError') throw new Error('Le navigateur exige un geste pour démarrer le son : appuie sur Lecture.');
      throw new Error(MSG_FORMAT);
    }
  }
  pause() { this.lecture++; this.el?.pause(); }
  seek(ms) { if (this.el) this.el.currentTime = Math.max(0, Math.min(this.dureeMs, ms)) / 1000; }
  get timeMs() { return this.el ? this.el.currentTime * 1000 : 0; }
  get playing() { return !!this.el && !this.el.paused && !this.el.ended; }
  setRate(r) { if (this.el) this.el.playbackRate = r; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyVolume(); }
  setMuted(m) { this.muet = !!m; this.applyVolume(); }
  applyVolume() { if (this.vol) this.vol.gain.value = this.muet ? 0 : this.volume; }
  /** Flux audio à ajouter à la vidéo exportée (null si non géré). */
  get stream() { return this.dest ? this.dest.stream : null; }

  /** Fermeture propre (quand on quitte la scène). */
  async close() {
    this.lecture++;
    const { ctx, el } = this;
    this.ctx = null; this.el = null; this.lip = null; this.pret = false;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = ''; }
    if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => {});
  }
}

/** Échantillons mono (Float32, -1..1) → fichier WAV 16 bits (Blob). Sert à la voix Lectura HD. */
export function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
