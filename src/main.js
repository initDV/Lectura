// @ts-check
// main.js : point d'entrée. Tout échec de démarrage est affiché en clair (jamais d'écran figé).
import { demarrer } from './app.js';

demarrer().catch((err) => {
  console.error('[lectura] démarrage impossible', err);
  const p = document.querySelector('#app .boot') || document.getElementById('app');
  if (p) {
    p.className = 'boot boot-error';
    p.textContent = `Lectura n'a pas pu démarrer : ${err?.message || err}. Recharge la page ; si le problème continue, vide le cache du site.`;
  }
});
