/* =========================================================
   Gera os PNGs da marca ORBLUX (ícones PWA + og-image)
   sem dependências: rasterização manual + zlib.
   Uso: node tools/gen-icons.mjs
   ========================================================= */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------
//  PNG mínimo (RGBA 8 bits) — encoder próprio
// ---------------------------------------------------------
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------
//  Marca: a orbe do jogo (gradiente branco→ciano→magenta)
// ---------------------------------------------------------
const CYAN = [34, 230, 255], MAGENTA = [255, 61, 240], WHITE = [255, 255, 255];

/** Desenha a orbe centrada em (cx,cy) com raio R. */
function drawOrb(set, cx, cy, R) {
  const ring1 = R * 1.35, ring2 = R * 1.8;
  const minX = Math.floor(cx - ring2 * 1.2), maxX = Math.ceil(cx + ring2 * 1.2);
  const minY = Math.floor(cy - ring2 * 1.2), maxY = Math.ceil(cy + ring2 * 1.2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // halo
      if (d > R && d < R * 1.5) set(x, y, ...CYAN, 80 * (1 - (d - R) / (R * 0.5)));
      // anéis
      for (const [ring, a, col] of [[ring2, 55, MAGENTA], [ring1, 110, CYAN]]) {
        const rd = Math.abs(d - ring);
        if (rd < 1.6) set(x, y, ...col, a);
        else if (rd < 5) set(x, y, ...col, a * 0.25);
      }
      // corpo com gradiente radial
      if (d <= R) {
        const t = d / R;
        set(x, y, Math.round(255 * Math.min(1, 0.1 + t)), Math.round(235 * (1 - t * 0.72)), Math.round(255 * (1 - t * 0.05)));
        const hd = Math.hypot(x - (cx - R * 0.34), y - (cy - R * 0.34));
        if (hd < R * 0.36) set(x, y, ...WHITE, 215 * (1 - hd / (R * 0.36)));
      }
    }
  }
}

/** Texto em fonte bitmap 5x7 (para o og-image). */
const GLYPHS = {
  O: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
};

function drawText(set, text, x, y, scale, color) {
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === '1') {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                set(x + col * scale + sx, y + row * scale + sy, ...color, 255);
              }
            }
          }
        }
      }
    }
    x += 6 * scale; // 5 colunas + 1 de espaço
  }
}

// ---------------------------------------------------------
//  Render de ícone / og-image
// ---------------------------------------------------------
function canvasBuf(width, height, painter) {
  const px = Buffer.alloc(width * height * 4);
  const set = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const na = a / 255, ia = 1 - na;
    px[i] = Math.round(r * na + px[i] * ia);
    px[i + 1] = Math.round(g * na + px[i + 1] * ia);
    px[i + 2] = Math.round(b * na + px[i + 2] * ia);
    px[i + 3] = 255;
  };
  painter(set);
  return px;
}

function bgPainter(width, height) {
  return (set) => {
    const cx = width / 2, cy = height / 2, base = Math.min(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot((x - cx) / base, (y - cy) / base);
        const glow = Math.max(0, 0.15 - d * 0.2);
        set(x, y, 10 + glow * 80, 12 + glow * 50, 34 + glow * 150);
        const grid = Math.max(16, Math.round(34 * (base / 512)));
        if (x % grid === 0 || y % grid === 0) set(x, y, 30, 54, 90, 34);
      }
    }
  };
}

mkdirSync(`${ROOT}icons`, { recursive: true });

// ---- ícone 192 / 512 (orbe grande) ----
for (const size of [192, 512]) {
  const R = size * 0.26;
  const px = canvasBuf(size, size, (set) => {
    bgPainter(size, size)(set);
    drawOrb(set, size / 2, size / 2, R);
  });
  writeFileSync(`${ROOT}icons/icon-${size}.png`, encodePNG(size, size, px));
}

// ---- maskable 512 (área segura de 20%: orbe ≤ 60% da largura) ----
{
  const size = 512;
  const R = size * 0.2; // anéis terminam em ~0.36 → dentro da área segura (0.3)
  const px = canvasBuf(size, size, (set) => {
    bgPainter(size, size)(set);
    drawOrb(set, size / 2, size / 2, R);
  });
  writeFileSync(`${ROOT}icons/icon-maskable-512.png`, encodePNG(size, size, px));
}

// ---- apple-touch-icon 180 (opaco, sem transparência) ----
{
  const size = 180;
  const px = canvasBuf(size, size, (set) => {
    bgPainter(size, size)(set);
    drawOrb(set, size / 2, size / 2, size * 0.25);
  });
  writeFileSync(`${ROOT}icons/apple-touch-icon.png`, encodePNG(size, size, px));
}

// ---- og-image 1200x630: orbe + wordmark ORBLUX ----
{
  const W = 1200, H = 630;
  const px = canvasBuf(W, H, (set) => {
    bgPainter(W, H)(set);
    drawOrb(set, W * 0.24, H * 0.5, 96);
    // ORB em ciano, LUX em magenta (fonte bitmap 5x7)
    const scale = 12;
    const textX = W * 0.4, textY = H * 0.5 - (7 * scale) / 2;
    const part1 = drawText(set, 'ORB', textX, textY, scale, CYAN);
    void part1;
    drawText(set, 'LUX', textX + 19 * scale, textY, scale, MAGENTA);
  });
  writeFileSync(`${ROOT}icons/og-image.png`, encodePNG(W, H, px));
}

console.log('✅ ícones ORBLUX gerados (192, 512, maskable, apple-touch, og-image)');
