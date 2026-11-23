// @ts-check
// piper.js : moteur « Lectura HD hors ligne » (Piper + onnxruntime-web WASM), chargé à la demande uniquement.
// Contrairement à la voix du système, il produit des échantillons audio : lip-sync réel et export vidéo possibles.
import { splitSentences, CPS_FRAPPE } from '../timeline.js';
import { t } from '../i18n.js';
import { getCatalogue, etatVoix, etatStockage, lire, urlFichier, telecharger, supprimer, supprimerPartiel, toutSupprimer } from './piper-store.js';
import { hashPhrase, getPhrase, setPhrase } from './audio-cache.js';

export const LIMITE_CARACTERES = 12000; // ≈ 14 min d'audio : au-delà, la mémoire d'un téléphone d'entrée de gamme sature
const PAUSE_PHRASE = 0.22, PAUSE_PARAGRAPHE = 0.45; // secondes de silence ajoutées

export class PiperEngine {
  id = 'piper';
  capabilities = { audioBuffer: true, boundary: false };
  #worker = null; #voixChargee = null; #cfg = null; #seq = 0; #attente = new Map();

  /** Voix installées seulement. */
  async listVoices() {
    try { return (await etatVoix()).filter((v) => v.installe).map((v) => ({ id: v.id, nom: v.nom })); } catch { return []; }
  }
  etat = etatVoix;
  stockage = etatStockage;
  download = telecharger;
  removePartial = supprimerPartiel;
  async remove(id) {
    await supprimer(id);
    // La voix en mémoire peut être un autre locuteur du même modèle.
    if (this.#voixChargee && !(await etatVoix()).some((v) => v.id === this.#voixChargee && v.installe)) this.stop();
  }
  async removeAll() { this.stop(); await toutSupprimer(); }

  #appel(msg, transfert = []) {
    return new Promise((resolve, reject) => {
      const id = ++this.#seq;
      this.#attente.set(id, { resolve, reject });
      this.#worker.postMessage({ id, ...msg }, transfert);
    });
  }

  async #charger(voixId) {
    if (this.#worker && this.#voixChargee === voixId) return;
    this.stop();
    const cat = await getCatalogue(), voix = cat.voix.find((v) => v.id === voixId);
    if (!voix || !(await etatVoix()).find((v) => v.id === voixId)?.installe) throw new Error(t('voix.hd.err.manquant'));
    const cfg = JSON.parse(new TextDecoder().decode(await lire(voix.config)));
    const total = voix.parts.reduce((a, p) => a + p.taille, 0), modele = new Uint8Array(total);
    let pos = 0;
    for (const p of voix.parts) { const b = new Uint8Array(await lire(p.fichier)); modele.set(b, pos); pos += b.length; }
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
      for (const a of this.#attente.values()) a.reject(new Error(t('voix.hd.err.moteur', { detail: e.message || 'worker' })));
      this.#attente.clear();
    };
    this.#worker = w;
    try {
      await this.#appel({ type: 'init', ortUrl: urlFichier(cat.moteur.entree), wasmBase: urlFichier(cat.moteur.dossier), modele: modele.buffer, cfg }, [modele.buffer]);
    } catch (err) { this.stop(); throw err; }
    this.#voixChargee = voixId; this.#cfg = cfg;
  }

  /**
   * Synthétise tout le texte, phrase par phrase : les dates de chaque phrase sont donc exactes.
   * @param {string} texte
   * @param {{voixId:string, vitesse?:number, cpsFrappe?:number, onProgress?:(fait:number,total:number,etape:string)=>void}} o
   * @returns {Promise<{samples:Float32Array, sampleRate:number, segments:{texte:string,debutMs:number,finMs:number}[]}>}
   */
  async synthesize(texte, { voixId, vitesse = 1, cpsFrappe = CPS_FRAPPE, onProgress } = /** @type {any} */ ({})) {
    if (texte.length > LIMITE_CARACTERES) throw new Error(t('voix.hd.err.tropLong', { max: LIMITE_CARACTERES, n: texte.length }));
    const phrases = splitSentences(texte);
    if (!phrases.length) throw new Error(t('scene.err.vide'));
    onProgress?.(0, 1, t('voix.hd.chargement'));

    // 1. Phase cache : hash + lookup pour chaque phrase « parle » (sans charger le worker).
    const enCache = await Promise.all(phrases.map(async (p) => {
      if (p.type !== 'parle') return null;
      const id = await hashPhrase(p.texte, voixId, vitesse);
      return { id, entree: await getPhrase(id) };
    }));
    const toutEnCache = phrases.every((p, i) => p.type !== 'parle' || enCache[i]?.entree);

    // 2. Chargement du worker seulement si nécessaire ; sr vient du cache si tout y est, sinon de la config.
    let sr;
    if (toutEnCache) {
      sr = enCache.find((c) => c?.entree)?.entree.sampleRate || 22050;
    } else {
      await this.#charger(voixId);
      sr = this.#cfg.audio?.sample_rate || 22050;
    }

    // 3. Assemblage / synthèse phrase par phrase (synthèse uniquement pour les non-cachées).
    const cat = await getCatalogue();
    const voixCat = cat.voix.find((v) => v.id === voixId);
    const blocs = [], segments = [];
    let n = 0;
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i];
      onProgress?.(i, phrases.length, toutEnCache
        ? t('voix.hd.cache', { i: i + 1, n: phrases.length })
        : t('voix.hd.synthesePhrase', { i: i + 1, n: phrases.length }));
      let son;
      if (p.type !== 'parle') {
        son = new Float32Array(Math.round((sr * p.texte.length) / (cpsFrappe * vitesse)));
      } else if (enCache[i].entree) {
        son = enCache[i].entree.samples;
      } else {
        const r = await this.#appel({ type: 'synth', texte: p.texte, vitesse, speakerId: voixCat?.speakerId });
        son = r.samples.length ? r.samples : new Float32Array(Math.round(sr * 0.3));
        setPhrase(enCache[i].id, son, sr).catch(() => {});
      }
      const suite = phrases[i + 1], paragraphe = suite && /\n/.test(texte.slice(p.end, suite.start));
      const silence = new Float32Array(Math.round(sr * (suite ? (paragraphe ? PAUSE_PARAGRAPHE : PAUSE_PHRASE) : 0.15) / Math.max(0.5, vitesse)));
      const debut = n;
      blocs.push(son, silence); n += son.length + silence.length;
      segments.push({ texte: p.texte, type: p.type, debutMs: Math.round((debut / sr) * 1000), finMs: Math.round((n / sr) * 1000) });
    }

    // 4. Normalisation douce.
    const samples = new Float32Array(n);
    let pos = 0, crete = 0;
    for (const b of blocs) { samples.set(b, pos); pos += b.length; }
    for (let i = 0; i < n; i++) { const a = Math.abs(samples[i]); if (a > crete) crete = a; }
    if (crete > 0.001) { const g = Math.min(4, 0.9 / crete); for (let i = 0; i < n; i++) samples[i] *= g; }
    onProgress?.(phrases.length, phrases.length, t('voix.hd.pret'));
    return { samples, sampleRate: sr, segments };
  }

  speak() { throw new Error('La voix Lectura HD passe par synthesize().'); }
  pause() {}
  resume() {}
  /** Libère le modèle (≈ 150 Mo de mémoire). */
  stop() {
    this.#worker?.terminate();
    this.#worker = null; this.#voixChargee = null; this.#cfg = null;
    for (const a of this.#attente.values()) a.reject(new Error(t('voix.hd.annule')));
    this.#attente.clear();
  }
}
