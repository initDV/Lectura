// Planche pilote : les gestes sont datés dans la source, et le même tracé sert à la scène et aux exports.
export const ID_RESEAU = 'reseau-local';
const variantes = (liste) => liste.split('|').map((s) => s.split(' '));
const ROUTEUR = variantes('routeur|routeurs|router|routers|point d acces|access point');
const APPAREIL = variantes('appareil|appareils|ordinateur|ordinateurs|telephone|telephones|device|devices|computer|computers|phone|phones');
const LIEN = variantes('relie|relient|relier|relies|connecte|connectent|connecter|connectes|raccorde|raccordent|raccordes|links|link|linked|connects|connect|connected');
const CIRCULATION = 'donnees circulent|paquet circule|paquets circulent|data flows|data travels|packet travels|packets travel';
const ECHANGE = variantes(`${CIRCULATION}|echangent des donnees|echange des donnees|echanger des donnees|echange de donnees|echanges de donnees|envoie des donnees|envoient des donnees|envoie un message|envoient des messages|transmet des donnees|transmettent des donnees|envoie un paquet|transfere des donnees|exchange data|exchanges data|sends data|send data|sends a packet|sends a message|transfer data|transfers data`);
const FLUX = variantes(CIRCULATION);

/** `trouver` utilise les mêmes bornes de mots et exclusions de citations que le choix d'une planche. */
export function repererReseau(s, trouver) {
  const routeur = trouver(ROUTEUR), liens = trouver(LIEN), echange = trouver(ECHANGE);
  const dureeParlee = Math.max(0, Math.min(s.finMs, s.speechEndMs ?? s.finMs) - s.debutMs);
  // Pour un fichier sans repères mot à mot, interpolation locale, comme pour la révélation du texte.
  const date = (pos) => s.debutMs + dureeParlee * pos / s.texte.length;
  let signal;
  if (echange && dureeParlee > 0) {
    const debut = date(echange[0]);
    const fin = Math.min(s.finMs, debut + 1460, Math.max(debut + 900, date(echange[1]) + 230));
    if (fin > debut) signal = { debut, fin };
  }
  return {
    routeur: routeur ? date(routeur[0]) : undefined,
    liens: liens ? date(liens[0]) : undefined,
    signal,
    // Uniquement après une planche réseau, sans blanc, et si le propos reste spécifique.
    suite: Boolean((liens || signal) && (routeur || trouver(APPAREIL) || trouver(FLUX))),
  };
}

export function calerReseau({ debut, fin, reseau }) {
  const duree = fin - debut, echange = reseau.signaux[0]?.debut ?? fin;
  const routeur = Math.min(reseau.routeur ?? debut, reseau.liens ?? fin, echange);
  const liens = Math.min(reseau.liens ?? routeur + Math.min(340, duree * .24), echange);
  return {
    routeur: [routeur, routeur + Math.min(360, liens - routeur)],
    liens: [liens, liens + Math.min(680, duree * .4, echange - liens)],
    signaux: reseau.signaux,
  };
}

const borner = (x) => Math.max(0, Math.min(1, x));
const doux = (x) => { const t = borner(x); return t * t * (3 - 2 * t); };
const apparition = (ms, [debut, fin]) => ms < debut ? 0 : fin === debut ? 1 : doux((ms - debut) / (fin - debut));

export function poserReseau(plan, ms, reduit) {
  const flux = plan.signaux.find(({ debut, fin }) => debut <= ms && ms < fin);
  return {
    routeur: reduit ? 1 : apparition(ms, plan.routeur),
    liens: reduit ? 1 : apparition(ms, plan.liens),
    trajet: Boolean(flux),
    signal: flux && !reduit ? (ms - flux.debut) / (flux.fin - flux.debut) : null,
  };
}

export function memePoseReseau(a, b) {
  return a?.routeur === b?.routeur && a?.liens === b?.liens && a?.trajet === b?.trajet && a?.signal === b?.signal;
}

// Coordonnées du dessin : 420 × 248, comme les planches SVG. Des traits plus épais restent nets en portrait.
function chemin(points) {
  let longueur = 0;
  const etapes = points.map(([x, y], i) => {
    if (i) longueur += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
    return [x, y, longueur];
  });
  return { etapes, longueur };
}
const points = [
  [[172, 120], [131, 69], [106, 69]],
  [[248, 120], [289, 69], [314, 69]],
  [[161, 147], [124, 183], [92, 183]],
  [[260, 147], [297, 184], [314, 184]],
];
const cables = points.map(chemin), trajet = chemin([...points[0].slice().reverse(), ...points[1]]);

function position({ etapes, longueur }, u) {
  const d = longueur * borner(u);
  const i = etapes.findIndex((p, j) => j > 0 && p[2] >= d);
  const [x, y, a] = etapes[i - 1], [X, Y, b] = etapes[i];
  const k = (d - a) / (b - a);
  return [x + (X - x) * k, y + (Y - y) * k];
}

function trait(ctx, cable, fin = 1, debut = 0) {
  if (fin <= debut) return;
  ctx.beginPath(); ctx.moveTo(...position(cable, debut));
  for (const [x, y, d] of cable.etapes) if (d > debut * cable.longueur && d < fin * cable.longueur) ctx.lineTo(x, y);
  ctx.lineTo(...position(cable, fin)); ctx.stroke();
}

let geometrie;
function formes() {
  const path = (d) => new Path2D(d);
  return geometrie ??= {
    appareils: [
      // Écran, ordinateur portable, téléphone, tablette. Le branchement rejoint chaque contour.
      ['M26 32h74q6 0 6 6v42q0 6-6 6H26q-6 0-6-6V38q0-6 6-6Z', 'M46 97h34m-17 0V86M33 46h44m-44 9h24', 93, 74],
      ['M321 34h71q7 0 7 7v43h-85V41q0-7 7-7ZM314 84h85l10 9q2 3-3 3H307q-4 0-2-3Z', 'M328 47h41m-41 9h22m0 33h14', 386, 72],
      ['M49 145h34q9 0 9 9v65q0 9-9 9H49q-9 0-9-9v-65q0-9 9-9Z', 'M60 156h12m-21 12h30m-30 9h18m-8 40h10', 79, 202],
      ['M322 155h72q8 0 8 8v49q0 8-8 8h-72q-8 0-8-8v-49q0-8 8-8Z', 'M327 169h44m-44 9h26m-26 24h30', 389, 201],
    ].map(([a, b, x, y]) => ({ silhouette: path(a), details: path(b), voyant: [x, y] })),
    dessus: path('M147 122 210 95 273 122 210 149Z'),
    gauche: path('M147 122 210 149v28l-63-27Z'),
    droite: path('M210 149 273 122v28l-63 27Z'),
    fentes: path('M230 152l6-3m3 0 6-3m3 0 6-3'),
    ondes: path('M188 80q22-19 44 0m-36 9q14-12 28 0m-20 8q6-5 12 0'),
  };
}

function point(ctx, x, y, r, couleur) {
  ctx.fillStyle = couleur; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export function peindreReseau(ctx, pose) {
  const f = formes(), { routeur, liens, signal } = pose;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#142f475e'; ctx.beginPath(); ctx.ellipse(210, 126, 182, 88, 0, 0, Math.PI * 2); ctx.fill();
  if (routeur > 0) {
    ctx.save(); ctx.globalAlpha *= routeur * .62;
    const halo = ctx.createRadialGradient(210, 127, 9, 210, 127, 108);
    halo.addColorStop(0, '#4bd5e142'); halo.addColorStop(1, '#4bd5e100');
    ctx.fillStyle = halo; ctx.fillRect(102, 19, 216, 216);
    ctx.restore();
  }
  const allumes = cables.map((_, i) => doux((liens - i * .09) / (1 - i * .09)));
  cables.forEach((cable, i) => {
    ctx.strokeStyle = '#48738bb3'; ctx.lineWidth = 2.6; ctx.setLineDash([3, 7]); trait(ctx, cable); ctx.setLineDash([]);
    ctx.strokeStyle = '#86dfeb'; ctx.lineWidth = 3.2; trait(ctx, cable, allumes[i]);
  });
  if (pose.trajet) {
    ctx.lineWidth = 4; ctx.strokeStyle = '#a2f7ca'; trait(ctx, trajet);
    if (signal === null) { // En mouvements réduits, une flèche fixe remplace le point mobile.
      ctx.beginPath(); ctx.moveTo(299, 64); ctx.lineTo(306, 69); ctx.lineTo(299, 74); ctx.stroke();
    } else {
      const a = Math.max(0, signal - .15);
      ctx.lineWidth = 10; ctx.strokeStyle = '#7affb34d'; trait(ctx, trajet, signal, a);
      ctx.lineWidth = 4; ctx.strokeStyle = '#e7ffbf'; trait(ctx, trajet, signal, a);
      const [x, y] = position(trajet, signal);
      point(ctx, x, y, 9, '#6affca48'); point(ctx, x, y, 4.8, '#f1ffe0');
    }
  }
  const verre = ctx.createLinearGradient(40, 37, 210, 226);
  verre.addColorStop(0, '#24536b'); verre.addColorStop(.53, '#1b3653'); verre.addColorStop(1, '#101d36');
  f.appareils.forEach(({ silhouette, details, voyant }, i) => {
    ctx.save(); ctx.globalAlpha *= .43 + .57 * allumes[i];
    ctx.fillStyle = verre; ctx.fill(silhouette);
    ctx.lineWidth = 2.8; ctx.strokeStyle = '#a1e9f1'; ctx.stroke(silhouette);
    ctx.lineWidth = 2.4; ctx.strokeStyle = '#83b8cb'; ctx.stroke(details);
    if (allumes[i] > .82) point(ctx, ...voyant, 2.8, '#99f7cb');
    ctx.restore();
  });
  ctx.globalAlpha *= .54 + .46 * routeur;
  ctx.lineWidth = 2.6;
  ctx.fillStyle = '#3c3461'; ctx.strokeStyle = '#a991ec'; ctx.fill(f.gauche); ctx.stroke(f.gauche);
  ctx.fillStyle = '#25264e'; ctx.fill(f.droite); ctx.stroke(f.droite);
  ctx.strokeStyle = '#aee9ff'; ctx.fillStyle = verre; ctx.fill(f.dessus); ctx.stroke(f.dessus);
  ctx.strokeStyle = '#9ba7df'; ctx.stroke(f.fentes);
  const relais = signal !== null && signal >= .33 && signal <= .68;
  ctx.lineWidth = 3.1; ctx.strokeStyle = relais ? '#d5ffd3' : '#9cf8ee'; ctx.stroke(f.ondes);
  for (let i = 0; i < 3; i++) {
    point(ctx, 163 + i * 13, 143 + i * 5, 3.1 + (relais ? .6 : 0), routeur > .5 ? '#9effcb' : '#6499a6');
  }
  ctx.restore();
}
