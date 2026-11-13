// @ts-check
// svgcanvas.js : dessine un personnage SVG (formes simples) sur un canvas, en lisant l'arbre SVG animé.
// Sert à l'export PNG / vidéo des personnages à accessoires ; professor_1 utilise drawCharacter (recorder.js).

const paths = new WeakMap(); // cache des Path2D par élément
const num = (el, a, d = 0) => { const v = parseFloat(el.getAttribute(a)); return Number.isFinite(v) ? v : d; };

/** Ajoute roundRect aux vieux navigateurs (Chrome < 99, Safari < 16). */
export function ensureRoundRect() {
  const proto = globalThis.CanvasRenderingContext2D?.prototype;
  if (!proto || proto.roundRect) return;
  proto.roundRect = function (x, y, w, h, r = 0) {
    r = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

function applyTransform(ctx, t) {
  if (!t) return;
  for (const m of t.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const a = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (m[1] === 'translate') ctx.translate(a[0] || 0, a[1] || 0);
    else if (m[1] === 'scale') ctx.scale(a[0] ?? 1, a[1] ?? a[0] ?? 1);
    else if (a.length >= 3) { ctx.translate(a[1], a[2]); ctx.rotate((a[0] * Math.PI) / 180); ctx.translate(-a[1], -a[2]); }
    else ctx.rotate(((a[0] || 0) * Math.PI) / 180);
  }
}

function shape(ctx, el) {
  switch (el.localName) {
    case 'rect': {
      const w = num(el, 'width'), h = num(el, 'height');
      ctx.beginPath(); ctx.roundRect(num(el, 'x'), num(el, 'y'), w, h, Math.min(num(el, 'rx', num(el, 'ry')), w / 2, h / 2));
      return null;
    }
    case 'circle': ctx.beginPath(); ctx.arc(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), 0, Math.PI * 2); return null;
    case 'ellipse': ctx.beginPath(); ctx.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), 0, 0, Math.PI * 2); return null;
    case 'line': ctx.beginPath(); ctx.moveTo(num(el, 'x1'), num(el, 'y1')); ctx.lineTo(num(el, 'x2'), num(el, 'y2')); return null;
    case 'polygon': case 'polyline': {
      const p = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number);
      ctx.beginPath();
      for (let i = 0; i + 1 < p.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[i], p[i + 1]);
      if (el.localName === 'polygon') ctx.closePath();
      return null;
    }
    case 'path': {
      const d = el.getAttribute('d') || '';
      let c = paths.get(el);
      if (!c || c.d !== d) { c = { d, p: new Path2D(d) }; paths.set(el, c); }
      return c.p;
    }
    default: return undefined;
  }
}

function node(ctx, el, st, root) {
  const tag = el.localName;
  if (tag === 'defs' || tag === 'title' || tag === 'desc') return;
  if (el.style?.display === 'none' || el.getAttribute('display') === 'none') return;
  st = { ...st };
  for (const [a, k] of [['fill', 'fill'], ['stroke', 'stroke'], ['stroke-width', 'sw'], ['stroke-linecap', 'cap'], ['stroke-linejoin', 'join']]) {
    const v = el.getAttribute(a);
    if (v !== null) st[k] = v;
  }
  ctx.save();
  applyTransform(ctx, el.getAttribute('transform'));
  const alpha = ctx.globalAlpha * num(el, 'opacity', 1);
  ctx.globalAlpha = alpha;
  if (tag === 'g' || tag === 'svg') {
    for (const c of el.children) node(ctx, c, st, root);
  } else if (tag === 'use') {
    const id = (el.getAttribute('href') || '').slice(1), cible = id && root.querySelector(`[id="${id.replace(/"/g, '')}"]`);
    if (cible) { ctx.translate(num(el, 'x'), num(el, 'y')); node(ctx, cible, st, root); }
  } else {
    const p = shape(ctx, el);
    if (p !== undefined) {
      if (st.fill && st.fill !== 'none') {
        ctx.globalAlpha = alpha * num(el, 'fill-opacity', 1); ctx.fillStyle = st.fill;
        if (p) ctx.fill(p); else ctx.fill();
      }
      if (st.stroke && st.stroke !== 'none') {
        ctx.globalAlpha = alpha * num(el, 'stroke-opacity', 1); ctx.strokeStyle = st.stroke;
        ctx.lineWidth = parseFloat(st.sw) || 1; ctx.lineCap = st.cap || 'butt'; ctx.lineJoin = st.join || 'miter';
        if (p) ctx.stroke(p); else ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Dessine le SVG (repère 300x400) à la position (x, y) avec l'échelle k. */
export function drawSvg(ctx, svg, x, y, k) {
  ensureRoundRect();
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  node(ctx, svg, { fill: '#000', stroke: 'none', sw: '1', cap: 'butt', join: 'miter' }, svg);
  ctx.restore();
}
