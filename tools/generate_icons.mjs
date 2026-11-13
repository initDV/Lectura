#!/usr/bin/env node
// Génère les icônes PNG SANS dépendance : mini-rasteriseur (formes simples) + encodeur PNG (zlib de Node).
// Usage : node tools/generate_icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0x0d, 0x0d, 0x12], PLATE = [0x13, 0x13, 0x1a], TRAIT = [0x9b, 0x45, 0xe0], FOND = [0x1c, 0x18, 0x30];
const YEUX = [0x3d, 0xdc, 0x84], BOUCHE = [0x38, 0xbd, 0xf8], BARRE = [0x8b, 0x3f, 0xc9];

// --- Formes (coordonnées du repère du robot, viewBox 240x600) ---
const rrect = (x, y, w, h, r) => (px, py) => {
  const dx = Math.max(x + r - px, 0, px - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r));
  return px >= x && px <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r;
};
const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
// Buste de robot_lectura. Un contour = forme extérieure (trait) + forme intérieure (remplissage) ; trait épaissi à 5 pour rester lisible en petit.
const contour = (ext, int) => [[ext, TRAIT], [int, FOND]];
const SHAPES = [
  ...contour(rrect(59.5, 219.5, 122, 137, 32.5), rrect(64.5, 224.5, 112, 127, 27.5)),
  [rrect(85, 259, 72, 12, 6), BARRE],
  [rrect(117.5, 24, 5, 50, 2.5), TRAIT], [circle(120, 20, 9), TRAIT],
  ...contour(circle(120, 136, 68.5), circle(120, 136, 63.5)),
  ...contour(rrect(71.5, 112.5, 41, 33, 14.5), rrect(76.5, 117.5, 31, 23, 9.5)),
  ...contour(rrect(127.5, 112.5, 41, 33, 14.5), rrect(132.5, 117.5, 31, 23, 9.5)),
  [rrect(112, 126.5, 16, 5, 2.5), TRAIT],
  [circle(92, 129, 11), YEUX], [circle(148, 129, 11), YEUX],
  [rrect(96, 161.5, 48, 8, 4), BOUCHE],
];

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  const view = maskable ? 360 : 270; // zone du repère personnage visible (plus large = marge de sécurité)
  const ox = 120 - view / 2, oy = 128 - view / 2, k = view / size;
  const corner = maskable ? 0 : size * 0.2;
  const plate = rrect(0, 0, size, size, corner), disc = circle(size / 2, size / 2, size * (maskable ? 0.36 : 0.44));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          if (!plate(fx, fy)) continue;
          let col = disc(fx, fy) ? PLATE : BG;
          const cx = ox + fx * k, cy = oy + fy * k;
          if (disc(fx, fy)) for (const [shape, c] of SHAPES) if (shape(cx, cy)) col = c;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS, i = (y * size + x) * 4, cov = a / 255;
      px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
    }
  }
  return px;
}

// --- Encodeur PNG minimal (RGBA 8 bits) ---
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync('icons', { recursive: true });
const out = [['icons/192.png', 192, {}], ['icons/512.png', 512, {}], ['icons/maskable-512.png', 512, { maskable: true }],
  ['icons/apple-touch-icon.png', 180, { maskable: true }]];
for (const [file, size, opt] of out) {
  fs.writeFileSync(file, png(size, render(size, opt)));
  console.log(`✔ ${file} (${size}x${size}, ${fs.statSync(file).size} octets)`);
}
fs.writeFileSync('icons/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="13" fill="#0d0d12"/>
  <line x1="32" y1="8" x2="32" y2="15" stroke="#9b45e0" stroke-width="2"/>
  <circle cx="32" cy="6.5" r="2.6" fill="#9b45e0"/>
  <circle cx="32" cy="34" r="19" fill="#1c1830" stroke="#9b45e0" stroke-width="2"/>
  <rect x="18.5" y="27.5" width="11" height="9" rx="4" fill="none" stroke="#9b45e0" stroke-width="2"/>
  <rect x="34.5" y="27.5" width="11" height="9" rx="4" fill="none" stroke="#9b45e0" stroke-width="2"/>
  <line x1="29.5" y1="32" x2="34.5" y2="32" stroke="#9b45e0" stroke-width="2"/>
  <circle cx="24" cy="32" r="3.2" fill="#3ddc84"/>
  <circle cx="40" cy="32" r="3.2" fill="#3ddc84"/>
  <rect x="25" y="42" width="14" height="2.6" rx="1.3" fill="#38bdf8"/>
</svg>
`);
console.log('✔ icons/favicon.svg');
