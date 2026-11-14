// @ts-check
// fixwebm.js : charge fix-webm-duration (MIT) à la demande, une seule fois. Copie locale : aucun réseau.
let promesse = null;
export function chargerFixWebm() {
  const g = /** @type {any} */ (globalThis);
  if (g.ysFixWebmDuration) return Promise.resolve(g.ysFixWebmDuration);
  if (!promesse) {
    promesse = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = new URL('./fixwebm/fix-webm-duration.js', import.meta.url).href;
      s.onload = () => (g.ysFixWebmDuration ? ok(g.ysFixWebmDuration) : ko(new Error('fix-webm-duration chargé mais introuvable')));
      s.onerror = () => { promesse = null; ko(new Error('Impossible de charger fix-webm-duration')); };
      document.head.append(s);
    });
  }
  return promesse;
}
