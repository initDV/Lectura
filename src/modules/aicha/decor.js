import { FOCALE, focale, HORIZON, smooth, SOL } from './math.js';

const ECART = 38;

export function* dalles(bas, avance) {
  const proche = Math.max(1.68, (bas - HORIZON + 3) / (SOL - HORIZON));
  const premiere = Math.floor((avance + FOCALE * (1 - 1 / proche)) / ECART);
  for (let n = premiere - 16; n <= premiere; n++) {
    const k = focale(n * ECART - avance);
    yield { n, k, y: HORIZON + (SOL - HORIZON) * k };
  }
}

export function creerDecorAicha(svg, couleurs) {
  const { mur = '#28324d', sol = '#211a33', horizon = '#5ba5c9', neon = '#c67fa6' } = couleurs || {};
  function peindre(c, box, repere, avance) {
    const { x, y, k } = repere;
    const gauche = (box.x - x) / k, haut = (box.y - y) / k, w = box.w / k, bas = haut + box.h / k;
    c.save(); c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
    c.translate(x, y); c.scale(k, k);
    c.fillStyle = mur; c.fillRect(gauche, haut, w, bas - haut);
    c.fillStyle = sol; c.fillRect(gauche, HORIZON, w, bas - HORIZON);
    const brume = c.createLinearGradient(0, haut, 0, bas);
    brume.addColorStop(0, '#0b102588'); brume.addColorStop(.48, '#171b3200'); brume.addColorStop(1, '#0a071aaa');
    c.fillStyle = brume; c.fillRect(gauche, haut, w, bas - haut);
    const ligne = (x1, y1, x2, y2, couleur, epaisseur, alpha) => {
      c.globalAlpha = alpha; c.strokeStyle = couleur; c.lineWidth = epaisseur;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    };
    const e = (bas - HORIZON) / (SOL - HORIZON);
    ligne(gauche, HORIZON, gauche + w, HORIZON, horizon, 2.8, .16);
    for (const x of [-146, -94, -59, -30, 30, 59, 94, 146]) {
      ligne(0, HORIZON, x * e, bas, horizon, .8, Math.abs(x) === 59 ? .38 : .22);
    }
    for (const r of dalles(bas, avance)) {
      const f = r.k, a = smooth(.32, .93, f);
      ligne(-208 * f, r.y, 208 * f, r.y, horizon, .94 * f, .46 * a);
      for (const side of [-1, 1]) {
        const bord = side * 59 * f;
        ligne(bord - 3.9 * f, r.y, bord + 3.9 * f, r.y, horizon, 2.3 * f, .82 * a);
        if (r.n % 3 !== 0) continue;
        const x1 = side * 83 * f, y1 = HORIZON - 162 * f, y2 = HORIZON + 56 * f;
        const op = .57 * a * (1 - smooth(1.19, 1.65, f));
        ligne(x1, y1, x1, y2, horizon, 6 * f, op * .47);
        ligne(x1, y1 + 24 * f, x1, y1 + 88 * f, side < 0 ? horizon : neon, 3.4 * f, op);
        ligne(x1, y1, side * 126 * f, y1, neon, 1.7 * f, op);
      }
    }
    c.restore();
  }

  const element = document.createElement('canvas');
  element.className = 'decor'; element.setAttribute('aria-hidden', 'true');
  const ctx = element.getContext('2d');
  let avance = 0, box, repere;
  const tracer = () => { if (box && ctx) peindre(ctx, box, repere, avance); };
  const taille = new window.ResizeObserver(([entree]) => {
    const { width: w, height: h } = entree.contentRect;
    if (w <= 4 || !h || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), vb = svg.viewBox.baseVal;
    const k = Math.min((w - 4) / vb.width, h / vb.height);
    repere = { x: (w - vb.width * k) / 2 - vb.x * k, y: (h - vb.height * k) / 2 - vb.y * k, k };
    box = { x: 0, y: 0, w, h };
    element.width = Math.round(w * dpr); element.height = Math.round(h * dpr);
    ctx.setTransform(element.width / w, 0, 0, element.height / h, 0, 0);
    tracer();
  });
  taille.observe(element);
  return { element, peindre, get avance() { return avance; },
    avancer(d) { if (avance !== d) { avance = d; tracer(); } }, dispose: () => taille.disconnect() };
}
