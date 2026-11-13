// @ts-check
// queue.js : file de phrases pour la voix du système (Web Speech).
// Pièges gérés : Chrome coupe les phrases longues (~15 s) → morceaux ≤ 200 caractères enchaînés ;
// pause/reprise peu fiables sur Android → pause = arrêt, reprise = relance au début du mot en cours ;
// événements « boundary » absents sur Android → position estimée (14 caractères/s × vitesse, auto-corrigée).
import { bus } from '../../state.js';
import { splitSentences, CPS_VOIX } from '../timeline.js';

/** Découpe le texte en morceaux ≤ max caractères (phrases, puis virgules, puis espaces), avec positions. */
export function chunkText(texte, max = 200) {
  const out = [];
  for (const ph of splitSentences(texte)) {
    let a = ph.start;
    while (ph.end - a > max) {
      const fen = texte.slice(a, a + max);
      let cut = Math.max(fen.lastIndexOf(', '), fen.lastIndexOf('; '), fen.lastIndexOf(': '));
      if (cut < max * 0.4) cut = fen.lastIndexOf(' ');
      cut = cut <= 0 ? max : cut + 1;
      out.push({ texte: texte.slice(a, a + cut), start: a, end: a + cut });
      a += cut;
      while (a < ph.end && /\s/.test(texte[a])) a++;
    }
    if (ph.end > a) out.push({ texte: texte.slice(a, ph.end), start: a, end: ph.end });
  }
  return out;
}

const now = () => performance.now();

export class SpeechQueue {
  /** @param {any} engine @param {string} texte @param {{voice?:any, rate?:number, pitch?:number, volume?:number}} opts */
  constructor(engine, texte, opts = {}, { onEnd, onError } = {}) {
    this.engine = engine; this.texte = texte; this.total = texte.length;
    this.chunks = chunkText(texte);
    this.opts = { rate: 1, pitch: 1, volume: 1, ...opts };
    this.onEnd = onEnd; this.onError = onError;
    this.i = 0; this.pos = 0; this.playing = false; this.ended = false; this.gen = 0;
    this.cps = CPS_VOIX * this.opts.rate;
    this.anchor = { c: 0, t: 0 }; this.cap = Infinity; this.lastEvent = 0; this.started = false; this.timer = 0;
  }

  play() {
    if (this.playing) return;
    if (this.ended) { this.pos = 0; this.ended = false; }
    this.playing = true;
    this.speakFrom(this.pos);
  }

  pause() {
    if (!this.playing) return;
    this.pos = this.charPos();
    this.playing = false; this.gen++;
    clearTimeout(this.timer);
    this.engine.stop();
  }

  stop() { this.playing = false; this.gen++; clearTimeout(this.timer); this.engine.stop(); }

  /** Va au caractère n (recul / avance). Si la lecture est en cours, elle reprend à cet endroit. */
  seekChar(n) {
    this.pos = Math.max(0, Math.min(this.total, Math.floor(n)));
    this.ended = false;
    if (!this.playing) return;
    this.gen++;
    this.engine.stop();
    const gen = this.gen;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (gen === this.gen && this.playing) this.speakFrom(this.pos); }, 90); // laisse cancel() se terminer
  }

  setRate(r) { this.cps *= r / this.opts.rate; this.opts.rate = r; if (this.playing) this.seekChar(this.charPos()); }
  setVolume(v) { this.opts.volume = v; } // appliqué à la phrase suivante

  speakFrom(pos) {
    const gen = ++this.gen, i = this.chunks.findIndex((c) => c.end > pos);
    if (i < 0) return this.finish();
    const c = this.chunks[i];
    let o = Math.max(0, pos - c.start);
    while (o > 0 && !/\s/.test(c.texte[o - 1])) o--; // reprise au début du mot
    const base = c.start + o, t0 = now();
    this.i = i; this.pos = base; this.anchor = { c: base, t: t0 }; this.cap = c.end; this.lastEvent = t0; this.started = false;
    let premier = null;
    bus.emit('tts:sentence-start', { index: i, texte: c.texte });
    this.engine.speak(c.texte.slice(o), {
      ...this.opts,
      onStart: () => { if (gen !== this.gen) return; this.started = true; this.lastEvent = now(); this.anchor = { c: base, t: now() }; },
      onBoundary: (ci) => {
        if (gen !== this.gen) return;
        const t = now(), abs = base + ci;
        this.started = true; this.lastEvent = t;
        if (!premier) premier = { c: abs, t };
        else if (t - premier.t > 600) this.cps = Math.max(5, Math.min(45, this.cps * 0.6 + ((abs - premier.c) / ((t - premier.t) / 1000)) * 0.4));
        this.anchor = { c: Math.max(abs, Math.min(this.pos, abs + 14)), t }; // jamais de recul visible
        this.cap = abs + 16; // on n'avance pas beaucoup plus loin que le mot réellement prononcé
        bus.emit('tts:boundary', { char: abs });
      },
      onEnd: () => {
        if (gen !== this.gen) return;
        const dt = (now() - t0) / 1000;
        if (!premier && dt > 0.4) this.cps = Math.max(5, Math.min(45, this.cps * 0.5 + ((c.end - base) / dt) * 0.5)); // Android : auto-correction
        bus.emit('tts:sentence-end', { index: i });
        this.pos = c.end;
        if (i + 1 < this.chunks.length) this.speakFrom(this.chunks[i + 1].start);
        else this.finish();
      },
      onError: (code) => {
        if (gen !== this.gen || code === 'interrupted' || code === 'canceled') return;
        this.playing = false;
        this.onError?.(code);
      },
    });
  }

  finish() {
    this.playing = false; this.ended = true; this.pos = this.total;
    this.onEnd?.();
  }

  /** Position courante (en caractères du texte). À appeler à chaque image ; surveille aussi les blocages. */
  charPos() {
    if (!this.playing) return this.pos;
    const c = this.chunks[this.i], t = now();
    if (!c) return this.pos;
    if (this.started) {
      const est = this.anchor.c + (this.cps * (t - this.anchor.t)) / 1000;
      this.pos = Math.max(this.pos, Math.min(c.end, this.cap, est));
    }
    // Chien de garde : la synthèse n'a pas démarré ou ne répond plus → erreur explicite (jamais de blocage muet).
    const limite = this.started ? 6000 + ((c.end - c.start) / this.cps) * 3000 : 6000; // 3 × la durée prévue du morceau + 6 s
    if (t - this.lastEvent > limite) {
      this.stop();
      this.onError?.(this.started ? 'bloquee' : 'non-demarree');
    }
    return this.pos;
  }

  /** Vrai si un mot est en train d'être prononcé (pour le lip-sync simulé). */
  get speaking() { return this.playing && this.started; }
}
