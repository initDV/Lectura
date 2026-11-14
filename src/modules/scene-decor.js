// @ts-check
// scene-decor.js : décor de fond coloré (salle tech en perspective). SVG séparé, derrière le robot.
const NS = 'http://www.w3.org/2000/svg';

// Palette : les couleurs principales viennent des réglages. Dégradés multicouches adoucis.
const DEFAUT = { mur: '#28324d', sol: '#211a33', horizon: '#5ba5c9', neon: '#c67fa6' };

/** Assombrit une couleur hex d'un facteur (0..1) pour les dégradés. */
function assombrir(hex, f = 0.35) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Éclaircit une couleur hex d'un facteur (0..1). */
function eclaircir(hex, f = 0.25) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * f));
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

export function creerDecor(couleurs = {}) {
  const src = { ...DEFAUT, ...(couleurs || {}) };
  const C = {
    murHaut: eclaircir(src.mur, 0.12), murMid: src.mur, murBas: assombrir(src.mur, 0.30),
    solHaut: eclaircir(src.sol, 0.05), solMid: src.sol, solBas: assombrir(src.sol, 0.45),
    horizon: src.horizon,
    fuite: '#5c7fb8', grille: '#7a6aa0',
    neon: src.neon,
    panneauG: src.horizon, panneauD: '#d99164',
    panneauBg: assombrir(src.mur, 0.10),
  };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 600');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'decor');

  let html = '';

  // ── DEFS : tous les dégradés
  html += `<defs>
    <linearGradient id="gradMur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.murHaut}"/>
      <stop offset="45%" stop-color="${C.murMid}"/>
      <stop offset="100%" stop-color="${C.murBas}"/>
    </linearGradient>
    <linearGradient id="gradSol" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.solHaut}"/>
      <stop offset="35%" stop-color="${C.solMid}"/>
      <stop offset="100%" stop-color="${C.solBas}"/>
    </linearGradient>
    <radialGradient id="haloNeon" cx="50%" cy="0%" r="75%">
      <stop offset="0%" stop-color="${C.neon}" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="${C.neon}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${C.neon}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gradHorizon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.horizon}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${C.horizon}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${C.horizon}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gradPanneauG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.panneauG}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${C.panneauG}" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="gradPanneauD" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.panneauD}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${C.panneauD}" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="gradNeon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.neon}" stop-opacity="0"/>
      <stop offset="20%" stop-color="${C.neon}" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="${eclaircir(C.neon, 0.3)}" stop-opacity="1"/>
      <stop offset="80%" stop-color="${C.neon}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${C.neon}" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  // ── MUR (dégradé 3 stops)
  html += `<rect x="0" y="0" width="240" height="360" fill="url(#gradMur)"/>`;
  // ── SOL (dégradé 3 stops)
  html += `<rect x="0" y="360" width="240" height="240" fill="url(#gradSol)"/>`;

  // ── Halo du néon (large, doux)
  html += `<rect x="0" y="40" width="240" height="200" fill="url(#haloNeon)"/>`;

  // ── Horizon : double trait (glow + ligne fine)
  html += `<rect x="0" y="355" width="240" height="10" fill="url(#gradHorizon)"/>`;
  html += `<line x1="0" y1="360" x2="240" y2="360" stroke="${C.horizon}" stroke-width="0.8" opacity="0.7"/>`;

  // ── Lignes de fuite mur (fines et douces)
  html += `<line x1="120" y1="360" x2="-80" y2="0" stroke="${C.fuite}" stroke-width="0.7" opacity="0.30"/>`;
  html += `<line x1="120" y1="360" x2="320" y2="0" stroke="${C.fuite}" stroke-width="0.7" opacity="0.30"/>`;
  html += `<line x1="120" y1="360" x2="120" y2="0" stroke="${C.fuite}" stroke-width="0.5" opacity="0.18"/>`;

  // ── Lignes de fuite sol (dégradé d'opacité via masque simple)
  for (const x2 of [-80, 0, 40, 80, 120, 160, 200, 240, 320]) {
    html += `<line x1="120" y1="360" x2="${x2}" y2="600" stroke="${C.grille}" stroke-width="0.7" opacity="0.30"/>`;
  }
  // ── Horizontales du sol : plus la ligne est loin, plus elle s'estompe
  const ys = [380, 410, 445, 485, 535, 595];
  ys.forEach((y, i) => {
    const f = (y - 360) / 240;
    const w = 240 + 500 * f;
    const op = 0.38 - i * 0.04;
    html += `<line x1="${120 - w / 2}" y1="${y}" x2="${120 + w / 2}" y2="${y}" stroke="${C.grille}" stroke-width="0.7" opacity="${Math.max(0.12, op)}"/>`;
  });

  // ── Panneaux muraux avec dégradé vertical
  // Gauche (cyan)
  html += `<rect x="10" y="170" width="48" height="62" rx="3" fill="url(#gradPanneauG)" stroke="${C.panneauG}" stroke-width="0.8" opacity="0.85"/>`;
  html += `<line x1="18" y1="185" x2="50" y2="185" stroke="${C.panneauG}" stroke-width="0.6" opacity="0.65"/>`;
  html += `<line x1="18" y1="199" x2="50" y2="199" stroke="${C.panneauG}" stroke-width="0.6" opacity="0.65"/>`;
  html += `<line x1="18" y1="213" x2="50" y2="213" stroke="${C.panneauG}" stroke-width="0.6" opacity="0.65"/>`;

  // Droite (orange doux)
  html += `<rect x="182" y="170" width="48" height="62" rx="3" fill="url(#gradPanneauD)" stroke="${C.panneauD}" stroke-width="0.8" opacity="0.85"/>`;
  html += `<circle cx="206" cy="196" r="11" fill="none" stroke="${C.panneauD}" stroke-width="0.9" opacity="0.75"/>`;
  html += `<circle cx="206" cy="196" r="4" fill="${C.panneauD}" opacity="0.85"/>`;
  html += `<line x1="192" y1="220" x2="220" y2="220" stroke="${C.panneauD}" stroke-width="0.6" opacity="0.6"/>`;

  // ── Néon : dégradé horizontal (extrémités qui s'effacent)
  html += `<rect x="50" y="78" width="140" height="16" fill="${C.neon}" opacity="0.10"/>`;
  html += `<rect x="50" y="82" width="140" height="3" fill="url(#gradNeon)" opacity="0.95"/>`;

  svg.innerHTML = html;
  return svg;
}
