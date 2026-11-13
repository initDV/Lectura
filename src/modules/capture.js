// @ts-check
// capture.js : redessine la scène (fond, personnage, terminal) sur un canvas → capture PNG et images de la vidéo.
import { drawCharacter } from './recorder.js';
import { drawSvg, ensureRoundRect } from './svgcanvas.js';
import { themeOf, fontOf } from './themes.js';

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
  const pad = 14 * s, r = 14 * s, barH = 34 * s, x = box.x + pad, y = box.y + pad, w = box.w - 2 * pad, h = box.h - 2 * pad;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = th.bg; ctx.fill(); ctx.clip();
  ctx.fillStyle = th.bar; ctx.fillRect(x, y, w, barH);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + (18 + i * 20) * s, y + barH / 2, 6 * s, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
  const family = fontOf(projet.terminal.police), fpx = Math.round(projet.terminal.taille * s * 1.15);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#8b98a5';
  ctx.font = `500 ${Math.round(12.5 * s)}px ${family}`;
  ctx.fillText(sc.titreTerminal || 'lectura', x + w / 2, y + barH / 2, w - 160 * s);
  // Corps : on dessine les dernières rangées qui tiennent, tronquées à Terminal.shown
  ctx.textAlign = 'left'; ctx.font = `${fpx}px ${family}`;
  const cw = ctx.measureText('M').width || fpx * 0.6, lh = fpx * 1.55, ipad = 16 * s;
  const cols = Math.max(8, Math.floor((w - 2 * ipad) / cw)), maxRows = Math.max(1, Math.floor((h - barH - 2 * ipad) / lh));
  const shown = Math.max(0, term.shown), li = term.lineAt(shown), rows = [];
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
      ctx.font = `${tok.cat ? '700 ' : ''}${fpx}px ${family}`;
      ctx.fillStyle = tok.cat ? term.colors[tok.cat] || th.fg : th.fg;
      ctx.fillText(tok.t.slice(a - ta, b - ta), x + ipad + (a - row.a) * cw, cy);
    }
    curX = x + ipad + Math.max(0, end - row.a) * cw; curY = cy;
    cy += lh;
  }
  if (Math.floor(tMs / 500) % 2 === 0 || sc.figer) { ctx.fillStyle = th.fg; ctx.fillRect(curX + 1, curY - fpx * 0.55, cw * 0.6, fpx * 1.1); }
  ctx.restore();
  ctx.strokeStyle = '#26313d'; ctx.lineWidth = Math.max(1, s); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke();
}

/**
 * Dessine toute la scène. sc = { projet, character, def, svg, terminal, pro, titreTerminal, figer }
 * Paysage : personnage à gauche (35 %), terminal à droite (65 %). Portrait : personnage en haut, terminal en bas.
 */
export function drawScene(ctx, W, H, sc, tMs = performance.now()) {
  ensureRoundRect();
  const paysage = W >= H, s = paysage ? H / 720 : W / 720;
  ctx.fillStyle = sc.projet.reglages.fond; ctx.fillRect(0, 0, W, H);
  const cb = paysage ? { x: 0, y: 0, w: W * 0.35, h: H } : { x: 0, y: 0, w: W, h: H * 0.35 };
  const tb = paysage ? { x: W * 0.35, y: 0, w: W * 0.65, h: H } : { x: 0, y: H * 0.35, w: W, h: H * 0.65 };
  const k = Math.min(cb.w / 300, cb.h / 400) * 0.96, cx = cb.x + (cb.w - 300 * k) / 2, cy = cb.y + cb.h - 400 * k;
  if (sc.def?.renduCanvas === 'pose') drawCharacter(ctx, cx, cy, k, sc.character.getPose(), sc.def.couleurCorps, sc.def.couleurAccent);
  else drawSvg(ctx, sc.svg, cx, cy, k);
  drawTerminal(ctx, tb, s, sc, tMs);
  if (!sc.pro) { // filigrane (retiré par Pro)
    ctx.font = `600 ${Math.round(15 * s)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(230,237,243,0.5)'; ctx.fillText('Lectura', W - 22 * s, H - 20 * s);
  }
}

/** Capture PNG de la scène (mêmes dessins que la vidéo). Renvoie un Blob. */
export async function capturePng(sc, { w = 1280, h = 720 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Capture impossible : ce navigateur refuse de créer l'image (mémoire insuffisante ?).");
  await document.fonts?.ready;
  drawScene(ctx, w, h, { ...sc, figer: true });
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
