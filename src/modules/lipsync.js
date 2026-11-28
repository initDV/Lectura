// @ts-check
// Lip-sync (amplitude → 4 niveaux) + analyse 3 bandes.
export class LipSync {
  constructor(audioCtx, sourceNode) {
    this.an = audioCtx.createAnalyser();
    this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.6;
    sourceNode.connect(this.an);                    // ne pas connecter l'analyseur à la sortie, la source l'est déjà
    this.td = new Uint8Array(this.an.fftSize);
    this.fd = new Uint8Array(this.an.frequencyBinCount);
    this.env = 0; this.peak = 0.05; this.level = 0;
    this.rate = audioCtx.sampleRate;
  }
  read() {
    this.an.getByteTimeDomainData(this.td);
    let sum = 0;
    for (let i = 0; i < this.td.length; i++) { const x = (this.td[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / this.td.length);
    this.env = rms > this.env ? rms : this.env * 0.85 + rms * 0.15;     // attaque rapide, relâchement lent
    this.peak = Math.max(this.peak * 0.9995, this.env, 0.03);            // normalisation adaptative
    const n = this.env / this.peak;
    const up = [0.12, 0.40, 0.70], down = [0.08, 0.34, 0.64];            // hystérésis anti-tremblement
    let l = this.level;
    while (l < 3 && n > up[l]) l++;
    while (l > 0 && n < down[l - 1]) l--;
    this.level = l;
    return { level: l, n };
  }
  bands() { // énergie graves / médiums / aigus
    this.an.getByteFrequencyData(this.fd);
    const hz = (i) => (i * this.rate) / this.an.fftSize;
    let lo = 0, mi = 0, hi = 0, nl = 0, nm = 0, nh = 0;
    for (let i = 1; i < this.fd.length; i++) {
      const f = hz(i), v = this.fd[i] / 255;
      if (f < 500) { lo += v; nl++; } else if (f < 2000) { mi += v; nm++; } else if (f < 6000) { hi += v; nh++; }
    }
    return { low: lo / (nl || 1), mid: mi / (nm || 1), high: hi / (nh || 1) }; // aigus dominants = "s/f" → visière large et fine
  }
  reset() { this.env = 0; this.level = 0; }
}

/** Forme de bouche d'après les 3 bandes. 'large' = sifflantes (s, f, ch), 'rond' = voyelles graves (o, ou). */
export function mouthShape({ low, mid, high }) {
  if (high > 0.18 && high > mid * 1.15 && high > low * 0.9) return 'large';
  if (low > 0.3 && low > mid * 1.6 && high < 0.08) return 'rond';
  return 'normal';
}

/**
 * Voix intégrée niveau A (Web Speech, sans flux audio) : lip-sync simulé.
 * Oscillation entre 6 et 9 Hz, bouche fermée sur les silences (espace, ponctuation).
 * @param {number} tMs temps courant @param {boolean} parle @param {string} [car] caractère en cours de lecture
 */
export function simulatedViseme(tMs, parle, car = 'a') {
  if (!parle || /[\s.,;:!?…()«»"-]/.test(car)) return 0;
  const t = tMs / 1000;
  const hz = 7.5 + 1.5 * Math.sin(t * 2.1); // 6 à 9 Hz
  const ouverture = Math.abs(Math.sin(Math.PI * hz * t)) * (0.65 + 0.35 * Math.sin(t * 3.7 + 1));
  return ouverture > 0.72 ? 3 : ouverture > 0.4 ? 2 : ouverture > 0.12 ? 1 : 0;
}
