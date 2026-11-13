// @ts-check
// rig.js : prépare le squelette du robot. Le dessin de référence (B2) range la tête et le torse dans le même groupe
// #body ; pour incliner ou hocher la tête sans retoucher le fichier SVG, on regroupe ici les pièces de la tête dans
// un <g id="head"> créé à la volée. Un SVG qui fournit déjà son propre #head est utilisé tel quel.
const NS = 'http://www.w3.org/2000/svg';

/** Ordonnée du haut d'une forme, lue dans ses attributs (pas de getBBox : le SVG n'est pas forcément affiché). */
export function hautDe(el) {
  const n = (a) => parseFloat(el.getAttribute(a) || '0');
  switch (el.localName) {
    case 'rect': return n('y');
    case 'circle': return n('cy') - n('r');
    case 'ellipse': return n('cy') - n('ry');
    case 'line': return Math.min(n('y1'), n('y2'));
    case 'path': case 'polygon': case 'polyline': {
      const m = /(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(el.getAttribute('d') || el.getAttribute('points') || '');
      return m ? +m[2] : Infinity; // premier point du tracé
    }
    case 'g': return el.firstElementChild ? hautDe(el.firstElementChild) : Infinity;
    default: return Infinity;
  }
}

/**
 * Renvoie le groupe de la tête. Sans #head dans le SVG : toutes les pièces de #body qui commencent au-dessus du cou
 * (y < limite) sont déplacées, dans le même ordre, dans un nouveau groupe placé à la fin de #body.
 * @param {SVGSVGElement} svg @param {number} [limite]
 */
export function grouperTete(svg, limite = 205) {
  const deja = svg.querySelector('#head');
  if (deja) return deja;
  const body = svg.querySelector('#body'), tete = document.createElementNS(NS, 'g');
  tete.setAttribute('id', 'head');
  if (!body) return tete;
  for (const el of [...body.children]) if (hautDe(el) < limite) tete.append(el);
  body.append(tete);
  return tete;
}

/**
 * Renvoie le groupe de l'avant-bras (pour plier le coude). Sans groupe « forearm-… » dans le SVG : les pièces du bras
 * qui commencent sous le coude (y ≥ limite), accessoire tenu en main compris, sont regroupées à la volée.
 * @param {Element} bras @param {number} [limite]
 */
export function grouperAvantBras(bras, limite = 262) {
  const deja = bras.querySelector('[id^="forearm"]');
  if (deja) return deja;
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('id', bras.id === 'arm-l' ? 'forearm-l' : 'forearm-r');
  for (const el of [...bras.children]) if (hautDe(el) >= limite) g.append(el);
  bras.append(g);
  return g;
}

/**
 * Place les bras devant le corps (le dessin de référence les met derrière). Au repos rien ne change : les bras ne
 * recouvrent pas le torse. Mais une main posée sur la hanche, le cœur ou la joue devient visible.
 */
export function brasDevant(body, ...bras) {
  if (body?.parentNode) body.after(...bras);
}
