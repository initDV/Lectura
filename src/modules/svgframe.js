// @ts-check
// svgframe.js : image du personnage pour le canvas (référence B5). On ne redessine PAS le personnage à la main :
// le SVG vivant est sérialisé puis dessiné tel quel, donc la capture et la vidéo montrent exactement l'écran.

/** Marge (unités du viewBox) ajoutée autour du dessin : un bras levé ou un sursaut dépasse du cadre 240 x 600. */
export const MARGE = 70;

/** Sérialise un SVG (avec ses transformations en cours) et le décode en image, cadre élargi de MARGE de chaque côté. */
export async function renderSvg(svg) {
  let xml = new XMLSerializer().serializeToString(svg);
  const vb = svg.viewBox?.baseVal, w = (vb?.width || 240) + 2 * MARGE, h = (vb?.height || 600) + 2 * MARGE;
  // Largeur et hauteur explicites : Firefox refuse de dessiner sur un canvas un SVG qui n'en a pas.
  const tete = /^<svg[^>]*>/.exec(xml)?.[0] || '';
  const neuve = tete.replace(/\s(viewBox|width|height)="[^"]*"/g, '')
    .replace(/^<svg/, `<svg viewBox="${(vb?.x || 0) - MARGE} ${(vb?.y || 0) - MARGE} ${w} ${h}" width="${w}" height="${h}"`);
  xml = neuve + xml.slice(tete.length);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  try {
    await img.decode();
  } catch {
    throw new Error("Le dessin du personnage n'a pas pu être converti en image pour la capture.");
  }
  return img;
}

/** Dessine l'image rendue par renderSvg comme si le viewBox d'origine occupait le rectangle (x, y, w, h). */
export function drawSvgImage(ctx, img, vb, x, y, w, h) {
  const kx = w / vb.width, ky = h / vb.height;
  ctx.drawImage(img, x - MARGE * kx, y - MARGE * ky, w + 2 * MARGE * kx, h + 2 * MARGE * ky);
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
