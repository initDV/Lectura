// @ts-check
// capture.js : redessine la scène (fond, personnage, terminal) sur un canvas → capture PNG et images de la vidéo.
import { creerDecor } from './scene-decor.js';

/** Convertit le décor SVG (créé par creerDecor) en Image bitmap, pour le dessiner sur un canvas.
 *  @param {{mur?:string, sol?:string, horizon?:string, neon?:string}|null} couleurs
 *  @returns {Promise<HTMLImageElement|null>} */
export async function renderDecor(couleurs) {
  try {
    const svg = creerDecor(couleurs || {});
    return await renderSvg(svg, 0);
  } catch { return null; }
}
import { renderSvg, drawSvgImage } from './svgframe.js';
import { themeOf, fontOf } from './themes.js';

/** Ajoute roundRect aux navigateurs qui ne l'ont pas (Chrome < 99, Safari < 16). */
function ensureRoundRect() {
  const proto = globalThis.CanvasRenderingContext2D?.prototype;
  if (!proto || proto.roundRect) return;
  proto.roundRect = function (x, y, w, h, r = 0) {
    r = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

/** Découpe une ligne (prompt + texte) en rangées de `cols` caractères, de préférence sur les espaces. */
export function wrapLine(str, cols) {
  const rows = [];
  let a = 0;
  while (str.length - a > cols) {
    let b = str.lastIndexOf(' ', a + cols);
    b = b <= a ? a + cols : b + 1; // pas d'espace : coupe nette
    rows.push([a, b]);
    a = b;
  }
  rows.push([a, str.length]);
  return rows;
}

const layouts = new WeakMap(); // terminal → { cols, map(ligne → rangées) }
function rowsOf(term, i, cols) {
  let c = layouts.get(term);
  if (!c || c.cols !== cols || c.lines !== term.lines) { c = { cols, lines: term.lines, map: new Map() }; layouts.set(term, c); }
  let r = c.map.get(i);
  if (!r) {
    const line = term.lines[i];
    r = wrapLine((line.tokens.length ? term.prompt : '') + line.tokens.map((t) => t.t).join(''), cols);
    c.map.set(i, r);
  }
  return r;
}

function drawTerminal(ctx, box, s, sc, tMs) {
  const { terminal: term, projet } = sc, th = themeOf(projet.terminal.theme);
  const pad = 14 * s, r = 20 * s, barH = 38 * s, x = box.x + pad * 0.4, y = box.y + pad, w = box.w - pad * 1.4, h = box.h - 2 * pad;
  const speciales = { __prompt: th.prompt, __cmd: th.cmd, __com: th.com };
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = th.bg; ctx.fill(); ctx.clip();
  ctx.fillStyle = th.bar; ctx.fillRect(x, y, w, barH);
  ctx.fillStyle = th.bord; ctx.fillRect(x, y + barH, w, Math.max(1, s));
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + (20 + i * 20) * s, y + barH / 2, 6 * s, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
  // Même règle qu'à l'écran : la taille choisie, plafonnée pour garder une trentaine de colonnes dans un terminal étroit.
  const family = fontOf(projet.terminal.police), fpx = Math.round(Math.min(projet.terminal.taille * s * 1.15, w * 0.052));
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = th.com;
  ctx.font = `500 ${Math.round(Math.min(13 * s, w * 0.036))}px ${family}`;
  ctx.fillText(sc.titreTerminal || 'lectura', x + 82 * s, y + barH / 2, w - 100 * s);
  // Corps : on dessine les dernières rangées qui tiennent, tronquées à Terminal.shown
  ctx.textAlign = 'left'; ctx.font = `${fpx}px ${family}`;
  const cw = ctx.measureText('M').width || fpx * 0.6, lh = fpx * 1.55, ipad = 16 * s;
  const cols = Math.max(8, Math.floor((w - 2 * ipad) / cw)), maxRows = Math.max(1, Math.floor((h - barH - 2 * ipad) / lh));
  const shown = Math.max(0, term.shown), li = sc.texteMasque ? -1 : term.lineAt(shown), rows = [];
  for (let i = li; i >= 0 && rows.length < maxRows; i--) {
    const line = term.lines[i], plen = line.tokens.length ? term.prompt.length : 0, vis = Math.min(shown, line.end) - line.start + plen;
    const rr = rowsOf(term, i, cols).filter(([a], k) => k === 0 || a < vis);
    for (let k = rr.length - 1; k >= 0 && rows.length < maxRows; k--) rows.push({ i, a: rr[k][0], b: rr[k][1], vis, plen });
  }
  rows.reverse();
  let cy = y + barH + ipad + lh / 2, curX = x + ipad, curY = cy;
  for (const row of rows) {
    const line = term.lines[row.i], end = Math.min(row.b, row.vis);
    if (row.a < row.plen) { ctx.font = `${fpx}px ${family}`; ctx.fillStyle = th.prompt; ctx.fillText(term.prompt.slice(row.a, Math.min(row.plen, end)), x + ipad, cy); }
    for (const tok of line.tokens) {
      const ta = tok.start - line.start + row.plen, a = Math.max(ta, row.a), b = Math.min(ta + tok.t.length, end);
      if (b <= a) continue;
      const sp = speciales[tok.cat];
      ctx.font = `${tok.cat && !sp ? '700 ' : ''}${fpx}px ${family}`;
      ctx.fillStyle = sp || (tok.cat ? term.colors[tok.cat] || th.fg : th.fg);
      ctx.fillText(tok.t.slice(a - ta, b - ta), x + ipad + (a - row.a) * cw, cy);
    }
    curX = x + ipad + Math.max(0, end - row.a) * cw; curY = cy;
    cy += lh;
  }
  if (!sc.texteMasque && (Math.floor(tMs / 500) % 2 === 0 || sc.figer)) { ctx.fillStyle = th.fg; ctx.fillRect(curX + 1, curY - fpx * 0.55, cw * 0.6, fpx * 1.1); }
  ctx.restore();
  ctx.strokeStyle = th.bord; ctx.lineWidth = Math.max(1, s); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke();
}

function cadrerPerso(svg, box, s) {
  const vb = svg?.viewBox?.baseVal;
  if (!vb?.width) return null;
  const k = Math.min((box.w * .92) / vb.width, (box.h * .94) / vb.height);
  const centre = svg.getAttribute('preserveAspectRatio') === 'xMidYMid meet';
  const x = box.x + (box.w - vb.width * k) / 2 + (centre ? 0 : 6 * s);
  const y = centre ? (box.h - vb.height * k) / 2 : box.h - vb.height * k - 10 * s;
  return { vb, k, x, y };
}

/** Même composition qu'à l'écran : personnage à gauche (38 %), terminal à droite (62 %). */
export function drawScene(ctx, W, H, sc, tMs = performance.now()) {
  ensureRoundRect();
  const s = Math.min(W, H) / 720;
  ctx.fillStyle = sc.projet.reglages.fond; ctx.fillRect(0, 0, W, H);
  const cb = { x: 0, y: 0, w: W * 0.38, h: H }, tb = { x: W * 0.38, y: 0, w: W * 0.62, h: H };
  const cadre = cadrerPerso(sc.svg, cb, s), decor = sc.decorImage;
  if (sc.peindreDecor && cadre) {
    const { vb, k, x, y } = cadre;
    sc.peindreDecor(ctx, cb, { x: x - vb.x * k, y: y - vb.y * k, k }, sc.avance);
  } else if (decor?.width && decor.height) {
    // Même cadrage que le SVG CSS : xMidYMax slice, derrière le personnage, sans marge transparente.
    const k = Math.max(cb.w / decor.width, cb.h / decor.height), w = decor.width * k, h = decor.height * k;
    ctx.save(); ctx.beginPath(); ctx.rect(cb.x, cb.y, cb.w, cb.h); ctx.clip();
    try { ctx.drawImage(decor, cb.x + (cb.w - w) / 2, cb.h - h, w, h); }
    catch { /* SVG défaillant, on garde le fond uni */ }
    finally { ctx.restore(); }
  }
  if (sc.persoImage && cadre) {
    const { vb, k, x, y } = cadre;
    ctx.save(); ctx.beginPath(); ctx.rect(cb.x, cb.y, cb.w, cb.h); ctx.clip();
    drawSvgImage(ctx, sc.persoImage, vb, x, y, vb.width * k, vb.height * k);
    ctx.restore();
  }
  drawTerminal(ctx, tb, s, sc, tMs);
}

/** Capture PNG de la scène (mêmes dessins que la vidéo). Renvoie un Blob. */
export async function capturePng(sc, { w = 1280, h = 720, decorCouleurs = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Capture impossible : ce navigateur refuse de créer l'image (mémoire insuffisante ?).");
  const [persoImage, decorImage] = await Promise.all([
    renderSvg(sc.svg), !sc.peindreDecor && decorCouleurs ? renderDecor(decorCouleurs) : null, document.fonts?.ready,
  ]);
  drawScene(ctx, w, h, { ...sc, persoImage, decorImage, figer: true });
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Capture impossible : le navigateur n\'a pas pu produire le fichier PNG.');
  return blob;
}

/** Télécharge un Blob sous le nom donné (lien <a download>, sans serveur). */
export function downloadBlob(blob, nom) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
