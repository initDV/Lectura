// @ts-check
// Piper hors ligne, chargé à la demande. Une seule inférence, y compris pendant le préchauffage.
import { splitSentences, CPS_FRAPPE } from '../timeline.js';
import { t } from '../i18n.js';
import { getCatalogue, etatVoix, etatStockage, lire, urlFichier, telecharger, supprimer, supprimerPartiel, toutSupprimer } from './piper-store.js';
import { hashPhrase, getPhrase, setPhrase } from './audio-cache.js';

export const LIMITE_CARACTERES = 12000;
const PAUSE_PHRASE = 0.22, PAUSE_PARAGRAPHE = 0.45;
function pauseApres(p, suite, paragraphe, siwis) {
  if (!suite) return .15;
  if (paragraphe) return PAUSE_PARAGRAPHE;
  if (!siwis || p.type !== 'parle') return PAUSE_PHRASE;
  const marques = p.texte.match(/([.!?…]+)[\s»”'’"\])}]*$/u)?.[1] || '';
  return marques.includes('?') ? .36 : /…|\.\.\./.test(marques) ? .48 : marques.includes('!') ? .32 : marques.includes('.') ? .30 : PAUSE_PHRASE;
}
const MAX_WARM_CHARS = 320, MAX_WARM_PHRASES = 3;

export class PiperEngine {
  id = 'piper';
  capabilities = { audioBuffer: true, boundary: false };
  #worker = null; #voixChargee = null; #cfg = null; #seq = 0; #attente = new Map();
  #queue = Promise.resolve(); #generation = 0;

  async listVoices() {
    try { return (await etatVoix()).filter((v) => v.installe).map((v) => ({ id: v.id, nom: v.nom })); } catch { return []; }
  }
  etat = etatVoix;
  stockage = etatStockage;
  download = telecharger;
  removePartial = supprimerPartiel;
  async remove(id) { this.stop(); await this.#programmer(() => supprimer(id)); }
  async removeAll() { this.stop(); await this.#programmer(toutSupprimer); }

  #programmer(action, signal, interrompre = false) {
    const generation = this.#generation;
    const verifier = () => {
      signal?.throwIfAborted();
      if (generation !== this.#generation) throw new Error(t('voix.hd.annule'));
    };
    const travail = this.#queue.then(async () => {
      verifier();
      // Un préchauffage finit au plus sa phrase en cours, pour la mettre en cache et garder le modèle.
      // Une lecture explicitement annulée (Arrêter, changement de texte, scène fermée) libère le worker.
      const annuler = () => this.#liberer();
      if (interrompre) signal?.addEventListener('abort', annuler);
      try { return await action(verifier); }
      finally { if (interrompre) signal?.removeEventListener('abort', annuler); }
    });
    this.#queue = travail.then(() => {}, () => {});
    return travail;
  }

  #appel(msg, transfert = []) {
    return new Promise((resolve, reject) => {
      const id = ++this.#seq;
      this.#attente.set(id, { resolve, reject });
      try { this.#worker.postMessage({ id, ...msg }, transfert); }
      catch (err) { this.#attente.delete(id); reject(err); }
    });
  }

  async #charger(voixId, verifier) {
    if (this.#worker && this.#voixChargee?.id === voixId) return;
    this.#liberer();
    const cat = await getCatalogue(), voix = cat.voix.find((v) => v.id === voixId);
    verifier();
    if (!voix || !(await etatVoix()).find((v) => v.id === voixId)?.installe) throw new Error(t('voix.hd.err.manquant'));
    verifier();
    const cfg = JSON.parse(new TextDecoder().decode(await lire(voix.config)));
    verifier();
    const total = voix.parts.reduce((a, p) => a + p.taille, 0), modele = new Uint8Array(total);
    let pos = 0;
    for (const p of voix.parts) { const b = new Uint8Array(await lire(p.fichier)); verifier(); modele.set(b, pos); pos += b.length; }
    if (pos !== total) throw new Error(t('voix.hd.err.corrompu', { fichier: voix.id }));
    let w;
    try { w = new Worker(new URL('./piper-worker.js', import.meta.url), { type: 'module' }); } catch { throw new Error(t('voix.hd.err.worker')); }
    w.onmessage = (e) => {
      const a = this.#attente.get(e.data.id);
      if (!a) return;
      this.#attente.delete(e.data.id);
      if (e.data.ok) a.resolve(e.data); else a.reject(new Error(t('voix.hd.err.moteur', { detail: e.data.erreur })));
    };
    w.onerror = (e) => {
      if (w === this.#worker) this.#liberer(new Error(t('voix.hd.err.moteur', { detail: e.message || 'worker' })));
    };
    this.#worker = w;
    try {
      await this.#appel({ type: 'init', ortUrl: urlFichier(cat.moteur.entree), wasmBase: urlFichier(cat.moteur.dossier), modele: modele.buffer, cfg }, [modele.buffer]);
    } catch (err) { this.#liberer(); throw err; }
    // On conserve le modèle si seul le préchauffage a été interrompu après l'initialisation.
    this.#voixChargee = voix; this.#cfg = cfg;
    verifier();
  }

  async #phrase(texte, voixId, vitesse, verifier) {
    const id = await hashPhrase(texte, voixId, vitesse);
    verifier();
    const cache = await getPhrase(id);
    verifier();
    if (cache) return cache;
    await this.#charger(voixId, verifier);
    verifier();
    const sampleRate = this.#cfg.audio?.sample_rate || 22050;
    const { samples, peak } = await this.#appel({ type: 'synth', texte, vitesse, speakerId: this.#voixChargee.speakerId, prosodie: voixId === 'siwis' });
    const son = samples.length ? samples : new Float32Array(Math.round(sampleRate * 0.3));
    await setPhrase(id, son, sampleRate, peak);
    verifier();
    return { samples: son, sampleRate, peak };
  }

  /** Prépare jusqu'à trois phrases entières, sans fabriquer ni conserver un WAV partiel. */
  async prewarm(texte, { voixId, vitesse = 1, signal }) {
    if (!voixId || !texte.trim() || texte.length > LIMITE_CARACTERES) return;
    const phrases = splitSentences(texte).filter((p) => p.type === 'parle').slice(0, MAX_WARM_PHRASES);
    return this.#programmer(async (verifier) => {
      let chars = 0;
      for (const p of phrases) {
        if ((chars += p.texte.length) > MAX_WARM_CHARS) break;
        verifier();
        await this.#phrase(p.texte, voixId, vitesse, verifier);
      }
    }, signal);
  }

  /** Un seul WAV normalisé et une seule horloge : lecture, lèvres, sauts et export. */
  async synthesize(texte, { voixId, vitesse = 1, cpsFrappe = CPS_FRAPPE, onProgress = null, signal = null }) {
    if (texte.length > LIMITE_CARACTERES) throw new Error(t('voix.hd.err.tropLong', { max: LIMITE_CARACTERES, n: texte.length }));
    const phrases = splitSentences(texte);
    if (!phrases.length) throw new Error(t('scene.err.vide'));
    return this.#programmer(async (verifier) => {
      onProgress?.(0, 1, t('voix.hd.chargement'));
      // Connaître la fréquence de la première phrase pour dater aussi les commandes qui la précèdent.
      const premiere = phrases.find((p) => p.type === 'parle');
      const premier = premiere ? await this.#phrase(premiere.texte, voixId, vitesse, verifier) : null;
      const sr = premier?.sampleRate || 22050;
      let n = 0, crete = 0;
      const blocs = [], segments = [];
      for (let i = 0; i < phrases.length; i++) {
        verifier();
        const p = phrases[i];
        onProgress?.(i, phrases.length, t('voix.hd.synthesePhrase', { i: i + 1, n: phrases.length }));
        const debut = n;
        if (p.type === 'parle') {
          const entree = p === premiere ? premier : await this.#phrase(p.texte, voixId, vitesse, verifier);
          if (entree.sampleRate !== sr) throw new Error(t('voix.hd.err.corrompu', { fichier: voixId }));
          blocs.push([n, entree.samples]); n += entree.samples.length;
          crete = Math.max(crete, entree.peak); // Même gain global avant/après le traitement local.
        } else n += Math.round((sr * p.texte.length) / (cpsFrappe * vitesse));
        const speechEndMs = Math.round(n * 1000 / sr);
        const suite = phrases[i + 1], paragraphe = suite && /\n/.test(texte.slice(p.end, suite.start));
        n += Math.round(sr * pauseApres(p, suite, paragraphe, voixId === 'siwis') / Math.max(0.5, vitesse));
        segments.push({ texte: p.texte, type: p.type, debutMs: Math.round(debut * 1000 / sr), speechEndMs, finMs: Math.round(n * 1000 / sr) });
      }
      const samples = new Float32Array(n), gain = crete > 0.001 ? Math.min(4, 0.9 / crete) : 1;
      for (const [debut, son] of blocs) {
        if (gain === 1) samples.set(son, debut);
        else for (let i = 0; i < son.length; i++) samples[debut + i] = son[i] * gain;
      }
      onProgress?.(phrases.length, phrases.length, t('voix.hd.pret'));
      return { samples, sampleRate: sr, segments };
    }, signal, true);
  }

  speak() { throw new Error('La voix Lectura HD passe par synthesize().'); }
  pause() {}
  resume() {}
  #liberer(err = new Error(t('voix.hd.annule'))) {
    this.#worker?.terminate();
    this.#worker = null; this.#voixChargee = null; this.#cfg = null;
    for (const a of this.#attente.values()) a.reject(err);
    this.#attente.clear();
  }
  stop() { this.#generation++; this.#liberer(); }
}
