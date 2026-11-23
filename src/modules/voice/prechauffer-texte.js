// Prépare seulement un petit préfixe sur le même worker que la lecture, jamais un second WAV.
import { getEngine } from './engine.js';

let timer = null, actif = null;

export function prechaufferTexte(texte, voixId, { vitesse = 1, debounceMs = 2000 } = {}) {
  annulerPrechauffage();
  if (!voixId || texte.length < 30 || texte.length > 12000) return;
  const a = new AbortController(); actif = a;
  timer = setTimeout(async () => {
    timer = null;
    try {
      const moteur = await getEngine('piper');
      if (!a.signal.aborted) await moteur.prewarm(texte, { voixId, vitesse, signal: a.signal });
    } catch { /* Optionnel : le lancement explicite reste responsable des erreurs. */ }
    finally { if (actif === a) actif = null; }
  }, debounceMs);
}

export function annulerPrechauffage() {
  clearTimeout(timer); timer = null;
  actif?.abort(); actif = null;
}
