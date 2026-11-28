// Une même projection pour le canvas de la scène, le PNG et la vidéo.
import { logError } from '../errors.js';
import { compilerPlanches, indexPlanche, opacitePlanche } from './calage.js';
import { ID_RESEAU, memePoseReseau, peindreReseau, poserReseau } from './reseau-local.js';
import { ID_CONDENSATION } from './scenarios.js';
import { memePoseCondensation, peindreCondensation, poserCondensation } from './condensation.js';
import { memePoseGeste, peindreGeste, poserGeste } from './gestes.js';

const dessinsAnimes = new Map([
  [ID_RESEAU, { poser: (e, ms, r) => poserReseau(e.reseau, ms, r), peindre: peindreReseau, meme: memePoseReseau }],
  [ID_CONDENSATION, { poser: (e, ms, r) => poserCondensation(e.gestes, ms, r), peindre: peindreCondensation, meme: memePoseCondensation }],
]);

let catalogue;
function chargerPlanches() {
  return catalogue ??= fetch(new URL('./planches.json', import.meta.url)).then((res) => {
    if (!res.ok) throw new Error(`Atlas : ${res.status}`);
    return res.json();
  }).then(compilerPlanches).catch((err) => { catalogue = null; throw err; });
}

const largeur = 420, hauteur = 332;
const axe = new Path2D('M94 302h-14m246 0h14m-130 17v6m0-43v-6');

function fondProjection(ctx) {
  const faisceau = ctx.createLinearGradient(0, 40, 0, 302);
  faisceau.addColorStop(0, '#6eebff00');
  faisceau.addColorStop(.8, '#67d4fa10');
  faisceau.addColorStop(1, '#67e3fa28');
  ctx.fillStyle = faisceau;
  ctx.beginPath(); ctx.moveTo(35, 40); ctx.lineTo(383, 40); ctx.lineTo(270, 302); ctx.lineTo(150, 302); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(210, 302); ctx.scale(1, .217);
  const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 117);
  halo.addColorStop(0, '#5df7dd77');
  halo.addColorStop(.48, '#477cc344'); halo.addColorStop(1, '#477cc300');
  ctx.fillStyle = halo; ctx.fillRect(-117, -117, 234, 234);
  ctx.restore();
  for (const [rx, ry, couleur] of [[107, 21, '#77bcdf5e'], [82, 15, '#9ddcf27a'], [48, 8, '#9efae4bb']]) {
    ctx.strokeStyle = couleur; ctx.beginPath(); ctx.ellipse(210, 302, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#a1f7e9a0'; ctx.stroke(axe);
}

function tracer(ctx, box, fiche, dessin, alpha, modele, pose) {
  const k = Math.min(box.w * .96 / largeur, box.h * .95 / hauteur);
  ctx.save();
  ctx.translate(box.x + (box.w - largeur * k) / 2, box.y + (box.h - hauteur * k) / 2);
  ctx.scale(k, k); ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.globalAlpha *= .62; fondProjection(ctx); ctx.restore();
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.translate(9, 11); ctx.scale(402 / 420, 402 / 420);
  if (modele) modele.peindre(ctx, pose);
  else peindreGeste(ctx, dessin, pose);
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#e6fcff';
  ctx.font = `650 ${modele ? 29 : 27}px system-ui, sans-serif`;
  ctx.fillText(fiche.nom, 210, 273, 393);
  ctx.restore();
}

export function creerProjection(zone, reduire) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Atlas : canvas indisponible');
  canvas.setAttribute('role', 'img');
  zone.append(canvas);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const images = new Map();
  let planifier, chargement, timeline, plan = [], cadre, peindre = null, w = 0, h = 0;
  const observer = new window.ResizeObserver(([{ contentRect }]) => { w = contentRect.width; h = contentRect.height; });
  observer.observe(zone);

  function charger() {
    if (!chargement) chargement = chargerPlanches().then((fn) => { planifier = fn; }, (err) => {
      chargement = null; logError('atlas', err);
    });
  }
  function bitmap(fiche) {
    let entree = images.get(fiche);
    if (entree) images.delete(fiche);
    else {
      entree = { image: null };
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fiche.svg);
      img.decode().then(() => { entree.image = img; }, (err) => logError('atlas', err));
    }
    images.set(fiche, entree);
    if (images.size > 6) images.delete(images.keys().next().value);
    return entree.image;
  }
  return {
    charger,
    get peindre() { return peindre; },
    image(repères, ms = 0) {
      if (repères && planifier && timeline !== repères) {
        timeline = repères;
        plan = planifier(timeline.segs);
      }
      const i = repères ? indexPlanche(plan, ms) : -1, evenement = plan[i];
      const reduit = reduire || media.matches;
      const alpha = opacitePlanche(evenement, ms, reduit);
      const fiche = alpha ? evenement.fiche : null;
      const modele = fiche && dessinsAnimes.get(fiche.id);
      const dessin = fiche && !modele ? bitmap(fiche) : null;
      const suivant = repères && plan[i + 1];
      if (suivant && !dessinsAnimes.has(suivant.fiche.id) && suivant.debut - ms < 2000 && !images.has(suivant.fiche)) bitmap(suivant.fiche);
      if ((!dessin && !modele) || !w || !h) {
        cadre = null; peindre = null; // sans planche prête, le même texte reprend la place de la projection
        return;
      }
      const pose = modele ? modele.poser(evenement, ms, reduit) : poserGeste(evenement.gestes, ms, reduit);
      const dpr = Math.min(2, window.devicePixelRatio || 1), memePose = modele?.meme ?? memePoseGeste;
      if (cadre?.fiche === fiche && cadre.dessin === dessin && cadre.alpha === alpha &&
        cadre.w === w && cadre.h === h && cadre.dpr === dpr && memePose(cadre.pose, pose)) return;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (cadre?.fiche !== fiche) {
        canvas.dataset.planche = fiche.id;
        canvas.setAttribute('aria-label', `${fiche.nom}. ${fiche.description}`);
      }
      cadre = { fiche, dessin, alpha, pose, w, h, dpr };
      peindre = (contexte, box) => tracer(contexte, box, fiche, dessin, alpha, modele, pose);
      peindre(ctx, { x: 0, y: 0, w, h });
    },
    dispose() { observer.disconnect(); },
  };
}
