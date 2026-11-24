// @ts-check
// Chargement des personnages : characters/index.json → fiches JSON → SVG nettoyé et vérifié.
// Ajouter un personnage = déposer un SVG + un JSON (voir docs/ADD_CHARACTER.md), sans toucher au code.

const NS = 'http://www.w3.org/2000/svg';
const BALISES = new Set(['svg', 'g', 'defs', 'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'use', 'title', 'desc']);
const ATTRIBUTS = new Set(['id', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'd', 'points', 'fill',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'viewBox',
  'role', 'aria-label', 'display']);
const PIECES = ['#body', '#arm-l', '#arm-r', '#mouth', '#eye-l', '#eye-r', '#brow-l', '#brow-r'];
const BASE = 'characters/';
let cache = null;

async function fetchOk(url, quoi) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Impossible de charger ${quoi} (${url}). Vérifie la connexion pour la première visite.`);
  }
  if (!res.ok) throw new Error(`Fichier introuvable : ${url} (${quoi}, erreur ${res.status}).`);
  return res;
}

/** Liste des fiches de personnages (mise en mémoire après le premier appel). */
export async function loadCharacters() {
  if (cache) return cache;
  const index = await (await fetchOk(`${BASE}index.json`, 'la liste des personnages')).json();
  const ids = Array.isArray(index.personnages) ? index.personnages : [];
  const fiches = await Promise.all(
    ids.map(async (id) => {
      try {
        const def = await (await fetchOk(`${BASE}${id}.json`, `le personnage « ${id} »`)).json();
        if (!def.id || !def.svg) throw new Error(`Fiche ${id}.json incomplète : "id" et "svg" sont obligatoires.`);
        return { nom: def.id, ...def };
      } catch (err) {
        console.error(err); // un personnage défectueux n'empêche pas les autres de fonctionner
        return { id, nom: id, erreur: err.message, svg: '' };
      }
    }),
  );
  cache = fiches;
  return fiches;
}

/** Recopie un arbre SVG en ne gardant que des formes simples (aucun script, lien externe ou style en ligne). */
function nettoyer(src, mode) {
  if (!BALISES.has(src.localName)) return null;
  const el = document.createElementNS(NS, src.localName);
  for (const a of src.attributes) {
    if (ATTRIBUTS.has(a.name)) el.setAttribute(a.name, a.value);
    else if (a.name === 'href' && a.value.startsWith('#')) el.setAttribute('href', a.value);
    else if (a.name === 'style') {
      // style="display:none" est interdit par la CSP : on le convertit (CSSOM en direct, attribut pour une vignette)
      for (const decl of a.value.split(';')) {
        const [prop, val] = decl.split(':').map((x) => x && x.trim());
        if (prop !== 'display' || !val) continue;
        if (mode === 'vignette') el.setAttribute('display', val);
        else el.style.display = val;
      }
    }
  }
  for (const child of src.childNodes) {
    if (child.nodeType === 1) {
      const c = nettoyer(child, mode);
      if (c) el.append(c);
    } else if (child.nodeType === 3 && (src.localName === 'title' || src.localName === 'desc')) el.append(child.data);
  }
  return el;
}

async function lireSvg(def, mode) {
  if (def.erreur) throw new Error(def.erreur);
  const txt = await (await fetchOk(BASE + (mode === 'direct' && def.svgScene ? def.svgScene : def.svg), `le dessin de « ${def.nom} »`)).text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') {
    throw new Error(`Le fichier ${def.svg} n'est pas un SVG valide.`);
  }
  const svg = nettoyer(doc.documentElement, mode);
  for (const sel of PIECES) {
    if (!svg.querySelector(sel)) throw new Error(`Personnage « ${def.nom} » incomplet : la pièce ${sel} manque dans ${def.svg}.`);
  }
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 240 600');
  return svg;
}

/** SVG prêt à être inséré dans la page et animé par Character. */
export async function loadCharacterSvg(def) {
  const svg = await lireSvg(def, 'direct');
  svg.setAttribute('aria-label', def.nom);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  return svg;
}

/** Vignette (data URL) du personnage au repos, pour les listes de choix. */
export async function thumbnailUrl(def) {
  const svg = await lireSvg(def, 'vignette');
  svg.setAttribute('xmlns', NS);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

export async function getCharacter(id) {
  const liste = await loadCharacters();
  return liste.find((c) => c.id === id) || null;
}
