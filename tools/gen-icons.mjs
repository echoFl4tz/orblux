/* =========================================================
   Gera os PNGs do projeto (ícones PWA + imagem de preview)
   sem nenhuma dependência: rasterização manual + zlib.
   Uso: node tools/gen-icons.mjs
   ========================================================= */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------
//  PNG mínimo (RGBA, 8 bits) — encoder próprio
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
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // cor RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------
//  Desenho: orbe neon em fundo escuro com grade
// ---------------------------------------------------------
function renderArt(width, height, { orbScale = 1 } = {}) {
  const px = Buffer.alloc(width * height * 4);
  const cx = width / 2, cy = height / 2;
  const base = Math.min(width, height);
  const R = base * 0.19 * orbScale;          // raio da orbe
  const ring1 = R * 1.42, ring2 = R * 1.85;

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const na = a / 255, ia = 1 - na;
    px[i] = Math.round(r * na + px[i] * ia);
    px[i + 1] = Math.round(g * na + px[i + 1] * ia);
    px[i + 2] = Math.round(b * na + px[i + 2] * ia);
    px[i + 3] = 255;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // fundo com brilho radial suave
      const dx = (x - cx) / base, dy = (y - cy) / base;
      const d = Math.sqrt(dx * dx + dy * dy);
      const bg = Math.max(0, 0.16 - d * 0.22);
      set(x, y, 12 + bg * 90, 14 + bg * 60, 40 + bg * 160);

      // grade discreta
      const grid = 32 * (base / 512);
      if (x % Math.round(grid) === 0 || y % Math.round(grid) === 0) {
        set(x, y, 34, 60, 96, 40);
      }

      // anéis neon
      for (const [ring, alpha, col] of [[ring2, 60, [255, 61, 240]], [ring1, 110, [34, 230, 255]]]) {
        const rd = Math.abs(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - ring);
        if (rd < base * 0.006) set(x, y, col[0], col[1], col[2], alpha);
        else if (rd < base * 0.02) set(x, y, col[0], col[1], col[2], alpha * 0.28);
      }

      // orbe com gradiente radial ciano → magenta
      const odx = x - cx, ody = y - cy;
      const od = Math.sqrt(odx * odx + ody * ody);
      if (od <= R) {
        const t = od / R;
        const r = Math.round(255 * Math.min(1, 0.15 + t * 0.95));
        const g = Math.round(230 * (1 - t * 0.75));
        const b = Math.round(255 * (1 - t * 0.1));
        set(x, y, r, g, b);
        // brilho interno
        const hd = Math.sqrt((x - (cx - R * 0.32)) ** 2 + (y - (cy - R * 0.32)) ** 2);
        if (hd < R * 0.34) set(x, y, 255, 255, 255, 200 * (1 - hd / (R * 0.34)));
      }
      // halo
      else if (od < R * 1.35) {
        const a = 90 * (1 - (od - R) / (R * 0.35));
        set(x, y, 34, 230, 255, a);
      }
    }
  }
  return px;
}

// ---------------------------------------------------------
//  Geração
// ---------------------------------------------------------
mkdirSync(`${ROOT}icons`, { recursive: true });

const icon192 = encodePNG(192, 192, renderArt(192, 192));
writeFileSync(`${ROOT}icons/icon-192.png`, icon192);

const icon512 = encodePNG(512, 512, renderArt(512, 512));
writeFileSync(`${ROOT}icons/icon-512.png`, icon512);

const og = encodePNG(1200, 630, renderArt(1200, 630, { orbScale: 2.1 }));
writeFileSync(`${ROOT}icons/og-image.png`, og);

console.log('✅ icons/icon-192.png, icons/icon-512.png e icons/og-image.png gerados');
