// @ts-check
// svg.js : une seule fonction, `ecrire`, qui évite de réécrire dans le SVG ce qui n'a pas changé.
//
// Mesuré sur un personnage humain (node tools/mesures/character.mjs) : 55 % des écritures
// remettaient la même valeur. Sur un téléphone, chacune de ces écritures peut coûter un recalcul
// de géométrie, soixante fois par seconde, pour un résultat identique à l'image précédente.
//
// La comparaison se fait sur la chaîne lue dans le DOM : c'est une lecture de champ, sans mise en
// page, donc très en dessous du coût de l'écriture qu'elle évite.
/**
 * @param {Element} el
 * @param {string} nom
 * @param {string|number} valeur
 */
export function ecrire(el, nom, valeur) {
  if (!el) return;
  const v = String(valeur);
  if (el.getAttribute(nom) !== v) el.setAttribute(nom, v);
}

/** Même chose pour un style en ligne (plus rare : les animations passent par transform/opacity). */
export function ecrireStyle(el, propriete, valeur) {
  if (!el) return;
  const v = String(valeur);
  if (el.style.getPropertyValue(propriete) !== v) el.style.setProperty(propriete, v);
}
