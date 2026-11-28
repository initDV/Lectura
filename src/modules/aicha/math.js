export const bound = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const interp = (a, b, u) => a + (b - a) * u;

export const FOCALE = 186;
export const HORIZON = 134;
export const SOL = 231;
export const focale = (z) => FOCALE / (FOCALE - z);

export function smooth(a, b, t) {
  const u = bound((t - a) / (b - a));
  return u * u * (3 - 2 * u);
}

// Piste disjointe, triée par début.
export function windowAt(windows, t, debut = t) {
  let lo = -1, hi = windows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (windows[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const w = windows[lo];
  return w && debut < w.end ? w : null;
}
