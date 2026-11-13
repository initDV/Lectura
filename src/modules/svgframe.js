// @ts-check
// svgframe.js : image du personnage pour le canvas (référence B5). On ne redessine PAS le personnage à la main :
// le SVG vivant est sérialisé puis dessiné tel quel, donc la capture et la vidéo montrent exactement l'écran.

/** Sérialise un SVG (avec ses transformations en cours) et le décode en image. */
export async function renderSvg(svg) {
  let xml = new XMLSerializer().serializeToString(svg);
  const vb = svg.viewBox?.baseVal;
  // Firefox refuse de dessiner sur un canvas un SVG sans largeur ni hauteur : on les déduit du viewBox.
  if (vb?.width && !/^<svg[^>]*\swidth=/.test(xml)) xml = xml.replace(/^<svg/, `<svg width="${vb.width}" height="${vb.height}"`);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  try {
    await img.decode();
  } catch {
    throw new Error("Le dessin du personnage n'a pas pu être converti en image pour la capture.");
  }
  return img;
}

/** Tient à jour une image du personnage pendant l'enregistrement vidéo (1 sérialisation toutes les 2 images). */
export class SvgFrame {
  /** @param {SVGSVGElement} svg */
  constructor(svg) { this.svg = svg; /** @type {HTMLImageElement|null} */ this.image = null; this.occupe = false; this.n = 0; this.erreur = null; }
  /** À appeler à chaque image. Ne lance jamais deux décodages en même temps. */
  update() {
    if (this.occupe || this.n++ % 2) return;
    this.occupe = true;
    renderSvg(this.svg).then((img) => { this.image = img; }, (err) => { this.erreur = err; }).finally(() => { this.occupe = false; });
  }
  /** Première image, à attendre avant de démarrer un enregistrement. */
  async pret() { this.image = await renderSvg(this.svg); return this.image; }
}
