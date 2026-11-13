#!/usr/bin/env node
// Génère les icônes PNG SANS dépendance : mini-rasteriseur (formes simples) + encodeur PNG (zlib de Node).
// Usage : node tools/generate_icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0x0b, 0x0f, 0x14], BODY = [0x3a, 0x3f, 0x4b], ACCENT = [0x4f, 0xd8, 0xe8], PLATE = [0x13, 0x1a, 0x22];

// --- Formes (coordonnées du repère personnage 300x400) ---
const rrect = (x, y, w, h, r) => (px, py) => {
  const dx = Math.max(x + r - px, 0, px - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r));
  return px >= x && px <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r;
};
const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const rotated = (shape, deg, cx, cy) => {
  const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (px, py) => shape(cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c);
};
// Buste de professor_1 (bras au repos : -35° / +35° autour des épaules)
const SHAPES = [
  [rotated(rrect(60, 105, 55, 34, 17), -35, 115, 122), BODY],
  [rotated(rrect(185, 105, 55, 34, 17), 35, 185, 122), BODY],
  [rrect(115, 95, 70, 130, 22), BODY],
  [circle(150, 55, 42), BODY],
  [rrect(124, 47, 52, 14, 7), ACCENT],
];

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4), SS = 4;
  const view = maskable ? 330 : 250; // zone du repère personnage visible (plus large = marge de sécurité)
  const ox = 150 - view / 2, oy = 118 - view / 2, k = view / size;
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
  <rect width="64" height="64" rx="13" fill="#0b0f14"/>
  <circle cx="32" cy="32" r="28" fill="#131a22"/>
  <rect x="21" y="38" width="22" height="26" rx="7" fill="#3a3f4b"/>
  <circle cx="32" cy="26" r="14" fill="#3a3f4b"/>
  <rect x="23" y="23" width="18" height="5" rx="2.5" fill="#4fd8e8"/>
</svg>
`);
console.log('✔ icons/favicon.svg');
