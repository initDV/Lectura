// @ts-check
// lamejs.js : charge lame.min.js (encodeur MP3, LGPL) à la demande, une seule fois.
// Le bundle est UMD/global : on l'injecte via <script> et on lit globalThis.lamejs.
let promesse = null;

/** @returns {Promise<any>} */
export function chargerLamejs() {
  if (promesse) return promesse;
  promesse = new Promise((resoudre, rejeter) => {
    const g = /** @type {any} */ (globalThis);
    if (g.lamejs && g.lamejs.Mp3Encoder) return resoudre(g.lamejs);
    const s = document.createElement('script');
    s.src = new URL('./lamejs/lame.min.js', import.meta.url).href;
    s.async = true;
    s.onload = () => {
      if (g.lamejs && g.lamejs.Mp3Encoder) resoudre(g.lamejs);
      else rejeter(new Error('lamejs chargé mais Mp3Encoder introuvable'));
    };
    s.onerror = () => rejeter(new Error('Impossible de charger lamejs'));
    document.head.append(s);
  });
  return promesse;
}
