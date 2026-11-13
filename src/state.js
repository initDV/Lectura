// @ts-check
// Bus d'événements + état partagé de l'application (aucune dépendance).
// Événements : audio:ready audio:play audio:pause audio:end audio:error tts:sentence-start tts:sentence-end
// tts:boundary timeline:tick terminal:line character:expression license:changed net:online net:offline
// sw:update-available app:state ui:toast settings:changed

class Bus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.map = new Map();
  }
  /** S'abonne ; renvoie la fonction de désabonnement. */
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.map.get(evt)?.delete(fn);
  }
  emit(evt, data) {
    for (const fn of [...(this.map.get(evt) || [])]) {
      try {
        fn(data);
      } catch (err) {
        // Un écouteur fautif ne doit jamais bloquer les autres ni passer inaperçu.
        console.error(`[bus] écouteur de « ${evt} » en erreur`, err);
        if (evt !== 'ui:toast') this.emit('ui:toast', { type: 'error', message: `Erreur interne (${evt}) : ${err?.message || err}` });
      }
    }
  }
}

export const bus = new Bus();

/** État partagé (lecture libre, écriture par les modules concernés). */
export const store = {
  etat: 'IDLE',
  /** @type {any} */ settings: null,
  /** @type {any} */ projet: null, // projet ouvert dans l'éditeur / la scène
  /** @type {Blob|null} */ audioBlob: null, // fichier audio du projet courant
  modifie: false, // brouillon non sauvegardé
  apercu: false, // la scène est lancée en « aperçu » (sans son, vitesse du terminal)
  pro: false,
  /** @type {any} */ licence: null,
  enLigne: typeof navigator !== 'undefined' ? navigator.onLine : true,
};
