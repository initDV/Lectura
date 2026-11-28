// Une illustration en coupe : la vapeur reste invisible et les gouttes sont à l'extérieur du verre.
import { doux, progressionGeste } from './gestes.js';

export function poserCondensation(gestes, ms, reduit) {
  if (reduit && gestes?.[0]?.survol) return { froid: 1, gouttes: 1, fusion: 0, glisse: 0 };
  const etape = (index) => doux(progressionGeste(gestes?.find(g => g.geste.index === index), ms, reduit));
  const glisse = etape(3), fusion = glisse > 0 ? 1 : etape(2);
  const gouttes = fusion > 0 ? 1 : etape(1), froid = gouttes > 0 ? 1 : etape(0);
  return { froid, gouttes, fusion, glisse };
}

export function memePoseCondensation(a, b) {
  return a?.froid === b?.froid && a?.gouttes === b?.gouttes && a?.fusion === b?.fusion && a?.glisse === b?.glisse;
}

const gouttesFixes = [[85, 9, 4.9, 0], [111, 16, 4.1, .13], [163, 15, 5.4, .32], [181, 9, 4.6, .51]];
export const DESSIN_CONDENSATION = { gouttesFixes, formes: {
  verre: 'M171 57 186 191Q190 207 240 209Q290 207 294 191L309 57',
  eau: 'M179 125C185 148 295 148 301 125L293 190Q290 201 240 204Q190 201 187 190Z',
  reflets: 'M183 75l9 82m1 12 2 16m7 12q17 6 38 6',
  paroi: 'M309 59 294 191Q293 198 285 201',
  fleche: 'M117 136h38m-9-7 9 7-9 7',
  traitFroid: 'M333 82l-10 13',
} };
let geometrie;
function formes() {
  return geometrie ??= Object.fromEntries(Object.entries(DESSIN_CONDENSATION.formes).map(([nom, d]) => [nom, new Path2D(d)]));
}

const bord = (y) => 309 - (y - 59) * 15 / 132;

function goutte(ctx, x, y, r, allumage = 1) {
  if (r < .1) return;
  ctx.save(); ctx.globalAlpha *= allumage; ctx.translate(x, y); ctx.scale(r, r);
  ctx.beginPath(); ctx.moveTo(0, -1.28);
  ctx.bezierCurveTo(.27, -.77, .87, -.17, .87, .31);
  ctx.bezierCurveTo(.87, 1.4, -.87, 1.4, -.87, .31);
  ctx.bezierCurveTo(-.87, -.17, -.27, -.77, 0, -1.28); ctx.closePath();
  ctx.fillStyle = '#7ad5f1'; ctx.strokeStyle = '#c4f5ff'; ctx.lineWidth = .16; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#eefcff'; ctx.beginPath(); ctx.ellipse(-.29, .09, .16, .30, .32, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function peindreCondensation(ctx, { froid, gouttes, fusion, glisse }) {
  const f = formes();
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const halo = ctx.createRadialGradient(244, 127, 25, 244, 127, 131);
  halo.addColorStop(0, '#499ec252'); halo.addColorStop(1, '#499ec200');
  ctx.fillStyle = halo; ctx.fillRect(109, 2, 262, 247);
  ctx.fillStyle = '#89b7cb30'; ctx.beginPath(); ctx.ellipse(243, 209, 86, 10, 0, 0, Math.PI * 2); ctx.fill();
  const verre = ctx.createLinearGradient(174, 90, 314, 169);
  verre.addColorStop(0, '#22485b'); verre.addColorStop(.43, '#152f45'); verre.addColorStop(1, '#30617d');
  ctx.fillStyle = verre; ctx.fill(f.verre);
  ctx.fillStyle = '#328ed04f'; ctx.fill(f.eau);
  ctx.strokeStyle = '#87e4fb72'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.ellipse(240, 125, 61, 11, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#90c6d9'; ctx.lineWidth = 2.8; ctx.stroke(f.verre);
  ctx.fillStyle = '#173847'; ctx.strokeStyle = '#a8dce8';
  ctx.beginPath(); ctx.ellipse(240, 57, 69, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#b2e8fa70'; ctx.lineWidth = 2.4; ctx.stroke(f.reflets);
  ctx.save(); ctx.globalAlpha *= .2 + .8 * froid;
  ctx.lineWidth = 8; ctx.strokeStyle = '#72d4ef38'; ctx.stroke(f.paroi);
  ctx.lineWidth = 3.6; ctx.strokeStyle = '#a8f0ff'; ctx.stroke(f.paroi);
  ctx.lineWidth = 1.6; ctx.strokeStyle = '#97d6eb'; ctx.stroke(f.traitFroid);
  ctx.restore();

  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  ctx.fillStyle = '#d7edf7'; ctx.font = '650 22px system-ui, sans-serif'; ctx.fillText('Air humide', 81, 99, 147);
  ctx.fillStyle = '#a3bdcf'; ctx.font = '500 17px system-ui, sans-serif'; ctx.fillText('Vapeur invisible', 81, 122, 147);
  ctx.lineWidth = 2.7; ctx.strokeStyle = froid > .65 ? '#a2eddc' : '#629faf'; ctx.stroke(f.fleche);
  ctx.fillStyle = froid > .65 ? '#bbedff' : '#90b2c4'; ctx.font = '650 19px system-ui, sans-serif'; ctx.fillText('Paroi froide', 358, 75, 103);

  for (const [y, x, r, retard] of gouttesFixes) {
    const u = doux((gouttes - retard) / (1 - retard));
    goutte(ctx, bord(y) + x, y, r * u);
  }
  const yPetite = 104 + 32 * fusion, yGrosse = 137 + 63 * glisse;
  const r1 = 6.1 * doux((gouttes - .17) / .83), r2 = 7.2 * doux((gouttes - .29) / .71);
  if (glisse > 0) {
    ctx.beginPath(); ctx.moveTo(bord(137) + 7, 137); ctx.lineTo(bord(yGrosse) + 8, yGrosse);
    ctx.strokeStyle = '#86dcf861'; ctx.lineWidth = 2.7; ctx.stroke();
  }
  goutte(ctx, bord(yPetite) + 8, yPetite, r1 * (1 - fusion * .63), 1 - fusion);
  goutte(ctx, bord(yGrosse) + 8, yGrosse, r2 + fusion * 2.9);
  ctx.restore();
}
