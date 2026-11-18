// Oracles from the unchanged web source. Both platforms import the same generated WAV.
import { LipSync } from '../../src/modules/lipsync.js';
import { SpeechSource } from '../../src/modules/player.js';
import { SpeechQueue } from '../../src/modules/voice/queue.js';
import { autoTiming, estimateDurationMs, Timeline, typeLigne } from '../../src/modules/timeline.js';
import { dessiner, formeDe } from '../../src/modules/mouth.js';
import { poseDe } from '../../src/modules/expressions.js';

const text = 'Bonjour, ouvre la porte ! Émile écoute.\n$ echo test\nVoilà.';
const speed = 1.25, cps = 28;
const rate = 48000, lengthMs = 6000;

function speechTrace(withBoundaries) {
  let clock = 0, hooks;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const engine = { speak(_, options) { hooks = options; }, stop() {} };
  const queue = new SpeechQueue(engine, text, { rate: speed, cpsFrappe: cps });
  const duration = estimateDurationMs(text, speed, cps);
  const source = new SpeechSource(queue, duration);
  const timeline = new Timeline(text, autoTiming(text, duration, 14 / cps));
  const events = new Map([[0, ['play']], [101, ['start']], [1840, ['end']], [1937, ['start']], [2865, ['end']], [3220, ['pause']]]);
  if (withBoundaries) for (const [t, i] of [[130, 0], [585, 9], [810, 15], [1210, 18], [1945, 0], [2360, 6]]) events.set(t, ['range', i]);
  try {
    Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });
    return [...new Set([...events.keys(), ...Array.from({ length: 195 }, (_, i) => 17 * i)])].sort((a, b) => a - b).map(t => {
      clock = t;
      const [action = '', index = 0] = events.get(t) || [];
      if (action === 'play') source.play();
      if (action === 'pause') source.pause();
      if (action === 'start') hooks.onStart();
      if (action === 'end') hooks.onEnd();
      if (action === 'range') hooks.onBoundary(index);
      const pos = source.charPos(), segment = timeline.segmentAtChar(pos);
      const level = source.playing && segment && typeLigne(segment.texte) === 'parle' ? source.viseme(t) : 0;
      return [t, action, index, pos, level, text[pos] || ''];
    });
  } finally {
    source.dispose();
    Object.defineProperty(globalThis, 'performance', descriptor);
  }
}

export function lipsFixture() {
  const pcm = new Int16Array(rate * lengthMs / 1000);
  for (let i = 0; i < pcm.length; i++) {
    const ms = i * 1000 / rate;
    // An onset near the start, alternating levels and silence, e.g. between words.
    const amplitude = ms < 4 || ms % 700 >= 540 ? 0 : [12000, 1500, 6000, 720][Math.floor(ms / 175) % 4];
    pcm[i] = Math.round(amplitude * Math.sin(2 * Math.PI * 440 * i / rate));
  }
  const wav = Buffer.alloc(44 + 2 * pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2 * pcm.length, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(pcm[i], 44 + 2 * i);

  const timeline = new Timeline(text, autoTiming(text, lengthMs));
  let offset = 0;
  const analyser = { get frequencyBinCount() { return this.fftSize / 2; }, getByteTimeDomainData(out) {
    for (let i = 0; i < out.length; i++) {
      const s = pcm[offset - out.length + i] || 0;
      out[i] = Math.floor((s / 32768 + 1) * 128);
    }
  } };
  const lip = new LipSync({ sampleRate: rate, createAnalyser: () => analyser }, { connect() {} });
  const audio = [0, 2, 4, 6, 10, ...Array.from({ length: 287 }, (_, i) => (i + 1) * 16 * speed)].map(ms => {
    offset = Math.floor(ms * rate / 1000);
    const pos = timeline.charAt(ms), segment = timeline.segmentAtChar(pos);
    return [ms, pos, segment && typeLigne(segment.texte) === 'parle' ? lip.read().level : 0];
  });
  const paths = ['', 'b', 'o', 'i', 'e', 'u', 'f', 'r'].map((letter, i) => {
    const level = i % 4, expr = i < 4 ? 'neutre' : 'content';
    const shape = letter ? formeDe(letter) : {};
    const pose = poseDe(expr);
    // Wend's original pivots and mouth size, with character.js's active (not unused Wend) model.
    return { letter, level, expr, paths: dessiner(100 + pose.gx * .2, 84 + pose.my, 9.5 * pose.w / 48,
      Math.max([5, 9, 14, 19][level], pose.h) * 8 / 19,
      { arrondi: Math.max(pose.rond || 0, shape.arrondi || 0), etirement: shape.etirement || 0, courbure: pose.sourire || 0 }) };
  });
  return { data: { text, speed, cps, audio, paths, speech: [speechTrace(true), speechTrace(false)] }, wav };
}
