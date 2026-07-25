#!/usr/bin/env node
/**
 * Genereert de PWA-iconen voor Miniwolven zonder externe dependencies:
 * een minimalistische wolvenkop voor een volle maan, in nachtblauw.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

/* ---------- minimale PNG-encoder ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- tekenen ---------- */
const inPoly = (px, py, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inCircle = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

// wolvenkop: kop met twee oren, genormaliseerd 0..1
const HEAD = [
  [0.29, 0.47], [0.71, 0.47], [0.50, 0.86],
];
const EAR_L = [[0.29, 0.49], [0.30, 0.20], [0.45, 0.48]];
const EAR_R = [[0.55, 0.48], [0.70, 0.20], [0.71, 0.49]];

function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = maskable ? 0.78 : 1;                 // veilige zone voor maskable
  const off = (1 - s) / 2;
  const cornerR = maskable ? 0 : size * 0.2;     // afgeronde hoeken

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // afgeronde hoeken (alpha 0 buiten)
      if (cornerR) {
        const cx = Math.max(cornerR, Math.min(size - cornerR, x + 0.5));
        const cy = Math.max(cornerR, Math.min(size - cornerR, y + 0.5));
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > cornerR * cornerR) { px[i + 3] = 0; continue; }
      }
      // achtergrond: verticaal verloop nachtblauw
      const t = y / size;
      let r = Math.round(0x31 + (0x17 - 0x31) * t);
      let g = Math.round(0x2e + (0x15 - 0x2e) * t);
      let b = Math.round(0x81 + (0x3a - 0x81) * t);

      const nx = (x / size - off) / s, ny = (y / size - off) / s; // genormaliseerd binnen veilige zone
      if (inCircle(nx, ny, 0.60, 0.36, 0.27)) { r = 0xfe; g = 0xf3; b = 0xc7; }               // maan
      if (inPoly(nx, ny, HEAD) || inPoly(nx, ny, EAR_L) || inPoly(nx, ny, EAR_R)) {           // wolf
        r = 0x0b; g = 0x10; b = 0x20;
        if (inCircle(nx, ny, 0.41, 0.56, 0.028) || inCircle(nx, ny, 0.59, 0.56, 0.028)) {     // ogen
          r = 0xfb; g = 0xbf; b = 0x24;
        }
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return encodePNG(size, size, px);
}

writeFileSync(join(outDir, 'icon-192.png'), draw(192));
writeFileSync(join(outDir, 'icon-512.png'), draw(512));
writeFileSync(join(outDir, 'apple-touch-icon.png'), draw(180, { maskable: true }));
writeFileSync(join(outDir, 'icon-maskable-512.png'), draw(512, { maskable: true }));
console.log('Iconen weggeschreven naar', outDir);
