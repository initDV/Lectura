// Voiced-tail PSOLA. Keep in sync with Android QuestionPitch (shared contour tests).
// No global resampling, gain change, silence or dependencies. All times are inside one phrase.
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'");

export function questionFermee(text) {
  const s = fold(text).replace(/^[\s«“"(]+/, '').replace(/[\s»”"')\]}]+$/, '');
  if (!/[^!?]\?$/.test(s)) return false;
  const words = s.slice(0, -1).trim();
  if (/\b(qui|que|quoi|quand|ou|pourquoi|comment|combien|quel(?:le)?s?)\b/.test(words.replace(/^est-ce (?:que\b|qu')/, '')) || /\bou bien\b/.test(words)) return false;
  return /^(?:vraiment|ah bon|d'accord|c'est vrai)$/.test(words) || /^est-ce (?:que\s|qu')/.test(words)
    || /^(?:tu|vous|il|elle|on|ils|elles|je|nous)\s+\p{L}/u.test(words)
    || /^\p{L}+-(?:t-)?(?:je|tu|il|elle|on|nous|vous|ils|elles)\b/u.test(words);
}

const frames = (ms, rate) => Math.round(ms * rate / 1000);
function period(x, at, half, lo, hi, corr) {
  let sum = 0, sq = 0;
  const n = half; // 2*half samples, decimated by two
  for (let i = at - half; i < at + half; i += 2) { const a = x[i]; sum += a; sq += a * a; }
  const xx = sq - sum * sum / n;
  if (xx < n * 0.00005) return 0;
  let best = 0.73;
  for (let lag = lo; lag <= hi; lag += 2) {
    let sy = 0, yy = 0, xy = 0;
    for (let i = at - half; i < at + half; i += 2) { const a = x[i], b = x[i - lag]; sy += b; yy += b * b; xy += a * b; }
    const r = (xy - sum * sy / n) / Math.sqrt(Math.max(1e-12, xx * (yy - sy * sy / n)));
    corr[lag] = r; best = Math.max(best, r);
  }
  for (let lag = lo + 2; lag < hi; lag += 2) {
    if (corr[lag] >= Math.max(0.74, best * 0.91) && corr[lag] > corr[lag - 2] && corr[lag] >= corr[lag + 2]) return lag;
  }
  return 0;
}

function aligned(x, previous, predicted, p, from, to) {
  const search = Math.max(2, Math.round(p * 0.22)), half = Math.max(2, Math.round(p * 0.5));
  if (previous - half < from || predicted - half - search < from || predicted + half + search >= to) return predicted;
  let best = predicted, score = -2;
  for (let k = predicted - search; k <= predicted + search; k++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = -half; i <= half; i += 2) { const a = x[previous + i], b = x[k + i]; xy += a * b; xx += a * a; yy += b * b; }
    const r = xy / Math.sqrt(Math.max(1e-12, xx * yy)) - 0.07 * Math.abs(k - predicted) / search;
    if (r > score) { best = k; score = r; }
  }
  return best;
}

function voicedTail(x, from, to, rate) {
  const step = frames(8, rate), half = frames(11, rate);
  // Wider search bounds than the accepted F0 range to detect a genuine local maximum.
  const lo = 2 * Math.floor(rate / 960), hi = 2 * Math.ceil(rate / 144), corr = new Float64Array(hi + 1);
  const start = Math.max(from + half + hi, to - frames(460, rate));
  const tail = [];
  for (let at = to - half; at >= start; at -= step) {
    const p = period(x, at, half, lo, hi, corr);
    if (!p || rate / p < 84 || rate / p > 420) {
      if (tail.length || to - at > frames(150, rate)) break;
      continue;
    }
    if (tail.length && Math.abs(Math.log(p / tail.at(-1).p)) > 0.19) break;
    tail.push({ at, p });
    if (tail.length * step >= frames(220, rate)) break;
  }
  return tail.reverse();
}

const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Never mutates the cached input. Returns it unchanged when the contour is natural or uncertain. */
export function releverFinale(x, from, to, rate, extraMs = 70) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || from < 0 || to > x.length || to - from < frames(105, rate)) return x;
  const tail = voicedTail(x, from, to, rate);
  if (tail.length < 11) return x;
  const oldPitch = rate / median(tail.slice(0, 5).map((q) => q.p));
  const lastPitch = rate / median(tail.slice(-4).map((q) => q.p));
  const middlePitch = rate / median(tail.slice(-9, -4).map((q) => q.p));
  // Preserve a speaker's own rise, including one that starts late after an initial fall.
  if (lastPitch > oldPitch * 1.06 || lastPitch > middlePitch * 1.08) return x;
  const target = oldPitch * 1.19, maxRatio = extraMs ? 1.65 : 2 ** (3 / 12);
  if (target > 420 || target / lastPitch > maxRatio * 1.06) return x;

  const begin = tail[0].at, end = tail.at(-1).at + frames(4, rate);
  const span = end - begin, extra = frames(extraMs, rate), length = span + extra;
  const step = tail[1].at - begin;
  const lagAt = (pos) => {
    const idx = Math.max(0, Math.min(tail.length - 1, (pos - begin) / step));
    const k = Math.floor(idx), a = tail[k].p, b = tail[Math.min(k + 1, tail.length - 1)].p;
    return a + (b - a) * (idx - k);
  };
  const marks = [begin];
  for (let at = begin; ;) {
    const p = Math.round(lagAt(at)), next = aligned(x, at, at + p, p, from, to);
    if (next >= end) break;
    marks.push(next); at = next;
  }
  if (marks.length < 7) return x;
  const y = new Float32Array(length), weights = new Float32Array(length);
  let i = 0;
  for (let pos = 0; pos < length; ) {
    const source = begin + pos * span / length;
    while (i + 1 < marks.length && Math.abs(marks[i + 1] - source) < Math.abs(marks[i] - source)) i++;
    const mark = marks[i], p = Math.round(lagAt(mark)), dst = Math.round(pos);
    for (let j = Math.max(-p, -dst, from - mark); j <= Math.min(p, length - 1 - dst, to - 1 - mark); j++) {
      const w = 0.5 + 0.5 * Math.cos(Math.PI * j / p);
      y[dst + j] += w * x[mark + j]; weights[dst + j] += w;
    }
    const lag = lagAt(source), natural = rate / lag;
    const u = (source - begin) / span, wanted = oldPitch * (1 + 0.19 * smooth(u / 0.88));
    const increase = Math.max(0, Math.min(maxRatio - 1, wanted / natural - 1));
    pos += lag / (1 + increase * smooth(pos / frames(32, rate)));
  }
  const fade = frames(16, rate);
  // If overlap-add did not cover the core, keep the natural recording instead of inserting holes.
  for (let k = fade; k < length - fade; k++) if (weights[k] < 0.15) return x;
  const out = new Float32Array(x.length + extra);
  out.set(x.subarray(0, begin)); out.set(x.subarray(end), end + extra);
  for (let k = 0; k < length; k++) {
    let value = y[k] / weights[k];
    if (k < fade || k >= length - fade) {
      const mix = smooth(Math.min(k, length - 1 - k) / fade);
      const original = x[begin + k - (k < fade ? 0 : extra)];
      value = weights[k] < 0.15 ? original : value * mix + original * (1 - mix);
    }
    out[begin + k] = value;
  }
  return out;
}

/** Piper Web keeps the model's edge padding, unlike the Android render. Use it only to find the tail. */
export function phrasePiper(samples, texte, rate, vitesse, peak) {
  if (!questionFermee(texte) || !Number.isFinite(vitesse) || vitesse <= 0 || !samples.length) return samples;
  if (peak === undefined) { peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v)); }
  if (!Number.isFinite(peak) || peak < 0.003) return samples;
  const floor = Math.max(0.0007, Math.min(0.005, peak * 0.008)), win = Math.floor(rate / 250);
  let end = samples.length;
  while (win > 0 && end > win) {
    let energy = 0;
    for (let i = end - win; i < end; i++) energy += samples[i] ** 2;
    if (energy >= win * floor * floor) break;
    end -= win;
  }
  while (end && Math.abs(samples[end - 1]) < 0.00006) end--;
  return releverFinale(samples, 0, end, rate, 70 / Math.max(0.5, Math.min(2, vitesse)));
}
