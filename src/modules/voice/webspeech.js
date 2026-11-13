// @ts-check
// webspeech.js : voix intégrée niveau A = Web Speech API (0 Mo, voix du système). Code de référence C4.
// Pas de flux audio : le lip-sync est simulé et la voix ne peut pas être incluse dans la vidéo exportée.
export class WebSpeechEngine {
  id = 'webspeech'; capabilities = { audioBuffer: false, boundary: true };
  /** @type {SpeechSynthesisUtterance|null} */ current = null; // référence gardée : sinon Chrome peut perdre les événements

  get disponible() { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; }

  /** Voix de la langue demandée ('fr' par défaut), voix locales (hors ligne) en premier. */
  listVoices(langue = 'fr') {
    if (!this.disponible) return Promise.resolve([]);
    const re = new RegExp(`^${langue}`, 'i');
    const get = () => speechSynthesis.getVoices().filter((v) => re.test(v.lang)).sort((a, b) => Number(b.localService) - Number(a.localService));
    return new Promise((res) => {
      const v = get(); if (v.length) return res(v);
      const fin = () => { speechSynthesis.removeEventListener?.('voiceschanged', fin); clearTimeout(t); res(get()); };
      speechSynthesis.addEventListener?.('voiceschanged', fin);   // les voix se chargent de façon asynchrone
      const t = setTimeout(fin, 1500);                              // repli
    });
  }

  speak(text, { voice, rate = 1, pitch = 1, volume = 1, onStart, onBoundary, onEnd, onError } = {}) {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice; u.lang = voice?.lang || 'fr-FR'; u.rate = rate; u.pitch = pitch; u.volume = volume;
    u.onstart = () => onStart?.();
    u.onboundary = (e) => onBoundary?.(e.charIndex);
    u.onend = () => { if (this.current === u) this.current = null; onEnd?.(); };
    u.onerror = (e) => { if (this.current === u) this.current = null; onError?.(e.error); };
    this.current = u;
    speechSynthesis.speak(u);
  }
  pause() { speechSynthesis.pause(); } resume() { speechSynthesis.resume(); }
  stop() { this.current = null; if (this.disponible) speechSynthesis.cancel(); }
}
