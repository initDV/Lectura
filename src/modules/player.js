// @ts-check
// player.js : trois « sources » de lecture avec la même interface, pour que la scène ne s'occupe pas du détail :
//   FileSource   = fichier audio importé OU voix Lectura HD (WAV généré) → temps audio exact, lip-sync réel
//   SpeechSource = voix du système (Web Speech) → position en caractères, lip-sync simulé, pas de flux audio
//   SilentSource = aperçu sans son → horloge interne à la vitesse du terminal
// Interface : dureeMs, playing, timeMs(), charPos?(), play(), pause(), seek(ms), setRate(r), setVolume(v),
//             setMuted(m), viseme(now), bands?(), stream, dispose(), onEnd, onError
import { bus } from '../state.js';
import { simulatedViseme } from './lipsync.js';
import { t } from './i18n.js';

export class FileSource {
  /** @param {import('./audio.js').AudioEngine} audio */
  constructor(audio) {
    this.kind = 'fichier'; this.audio = audio; this.onEnd = null; this.onError = null;
    this.off = [bus.on('audio:end', () => this.onEnd?.()), bus.on('audio:error', (e) => this.onError?.(e))];
  }
  get dureeMs() { return this.audio.dureeMs; }
  get playing() { return this.audio.playing; }
  get stream() { return this.audio.stream; }
  timeMs() { return this.audio.timeMs; }
  play() { return this.audio.play(); }
  pause() { this.audio.pause(); this.audio.lip?.reset(); }
  seek(ms) { this.audio.seek(ms); }
  setRate(r) { this.audio.setRate(r); }
  setVolume(v) { this.audio.setVolume(v); }
  setMuted(m) { this.audio.setMuted(m); }
  viseme() { return this.audio.lip ? this.audio.lip.read().level : 0; }
  bands() { return this.audio.lip ? this.audio.lip.bands() : null; }
  dispose() { this.off.forEach((f) => f()); }
}

export class SpeechSource {
  /** @param {import('./voice/queue.js').SpeechQueue} queue @param {number} dureeMs durée estimée */
  constructor(queue, dureeMs) {
    this.kind = 'voix-systeme'; this.queue = queue; this.dureeMs = Math.max(1, dureeMs); this.stream = null;
    this.onEnd = null; this.onError = null; this.volume = 1; this.muet = false;
    queue.onEnd = () => this.onEnd?.();
    queue.onError = (code) => this.onError?.(new Error(
      code === 'non-demarree' ? t('voix.err.nonDemarree') : code === 'bloquee' ? t('voix.err.bloquee') : t('voix.err.lecture', { code })));
  }
  get playing() { return this.queue.playing; }
  charPos() { return this.queue.charPos(); }
  timeMs() { return (this.queue.charPos() / Math.max(1, this.queue.total)) * this.dureeMs; }
  play() { this.queue.play(); }
  pause() { this.queue.pause(); }
  seek(ms) { this.queue.seekChar((ms / this.dureeMs) * this.queue.total); }
  setRate(r) { this.queue.setRate(this.baseRate * r); }
  get baseRate() { if (!this._base) this._base = this.queue.opts.rate; return this._base; }
  setVolume(v) { this.volume = v; this.queue.setVolume(this.muet ? 0 : v); }
  setMuted(m) { this.muet = m; this.queue.setVolume(m ? 0 : this.volume); if (this.queue.playing) this.queue.seekChar(this.queue.charPos()); }
  viseme(now) { return simulatedViseme(now, this.queue.speaking, this.queue.texte[Math.floor(this.queue.pos)] || ' '); }
  dispose() { this.queue.stop(); }
}

export class SilentSource {
  /** @param {number} dureeMs @param {string} texte */
  constructor(dureeMs, texte = '') {
    this.kind = 'apercu'; this.dureeMs = Math.max(1, dureeMs); this.texte = texte; this.stream = null;
    this.onEnd = null; this.onError = null; this.base = 0; this.t0 = 0; this.rate = 1; this.playing = false;
  }
  timeMs() {
    if (!this.playing) return this.base;
    const t = this.base + (performance.now() - this.t0) * this.rate;
    if (t >= this.dureeMs) { this.base = this.dureeMs; this.playing = false; queueMicrotask(() => this.onEnd?.()); return this.dureeMs; }
    return t;
  }
  play() { if (this.base >= this.dureeMs) this.base = 0; this.t0 = performance.now(); this.playing = true; }
  pause() { this.base = this.timeMs(); this.playing = false; }
  seek(ms) { this.base = Math.max(0, Math.min(this.dureeMs, ms)); this.t0 = performance.now(); }
  setRate(r) { this.base = this.timeMs(); this.t0 = performance.now(); this.rate = r; }
  setVolume() {} setMuted() {}
  viseme(now) { return simulatedViseme(now, this.playing, this.texte[Math.floor((this.timeMs() / this.dureeMs) * this.texte.length)] || ' '); }
  dispose() { this.playing = false; }
}

/** Prolonge la source par une courte fin muette, sans modifier ni recopier le fichier audio. */
export class WithOutro {
  constructor(source, dureeMs, now = () => performance.now()) {
    this.source = source; this.dureeMs = dureeMs; this.finAudio = source.dureeMs; this.now = now;
    this.kind = source.kind; this.rate = 1; this.position = null; this.mark = 0; this.active = false; this.ended = false;
    this.onEnd = null; this.onError = null;
    source.onEnd = () => { if (this.active && this.position === null) this.#placer(this.finAudio); };
    source.onError = (e) => { this.active = false; this.onError?.(e); };
    if (source.charPos) this.charPos = () => this.position === null ? source.charPos() : source.queue.total;
  }
  #placer(ms) { this.position = ms; this.mark = this.now(); }
  get playing() { return this.active && (this.position !== null || this.source.playing); }
  get stream() { return this.source.stream; }
  timeMs() {
    if (this.position === null) return this.source.timeMs();
    if (!this.active) return this.position;
    const t = this.position + (this.now() - this.mark) * this.rate;
    if (t < this.dureeMs) return t;
    this.#placer(this.dureeMs); this.active = false; this.ended = true;
    queueMicrotask(() => { if (this.ended) this.onEnd?.(); });
    return this.dureeMs;
  }
  play() {
    if (this.ended) this.seek(0);
    if (this.active) return;
    this.active = true; this.mark = this.now();
    if (this.position === null) return this.source.play();
  }
  pause() {
    if (this.position === null) {
      this.source.pause();
      if (this.source.timeMs() >= this.finAudio) this.#placer(this.finAudio);
    } else this.#placer(this.timeMs());
    this.active = false;
  }
  seek(ms) {
    const t = Math.max(0, Math.min(this.dureeMs, ms));
    this.ended = false;
    if (t >= this.finAudio) { this.source.pause(); this.#placer(t); return; }
    const fromOutro = this.position !== null;
    this.position = null;
    this.source.seek(t);
    if (fromOutro && this.active) {
      Promise.resolve(this.source.play()).catch((e) => { if (this.active && this.position === null) { this.active = false; this.onError?.(e); } });
    }
  }
  setRate(r) { if (this.position !== null) this.#placer(this.timeMs()); this.rate = r; this.source.setRate(r); }
  setVolume(v) { this.source.setVolume(v); }
  setMuted(m) { this.source.setMuted(m); }
  viseme(now) { return this.position === null ? this.source.viseme(now) : 0; }
  bands() { return this.position === null ? this.source.bands?.() : null; }
  dispose() { this.active = false; this.ended = false; this.source.dispose(); }
}
