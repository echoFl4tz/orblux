/* =========================================================
   Baixa as fontes (subset "latin") do Google Fonts para
   /assets/fonts e gera o @font-face local (LGPD + performance).
   Uso: node tools/fetch-fonts.mjs
   ========================================================= */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 2 famílias apenas: display (títulos/números) + sans (textos)
const FAMILIES = [
  { css: 'family=Orbitron:wght@500..900', local: 'Orblux Display', file: 'orblux-display' },
  { css: 'family=Inter:wght@400..800', local: 'Orblux Sans', file: 'orblux-sans' },
];

mkdirSync(`${ROOT}assets/fonts`, { recursive: true });

let out = `/* =========================================================
   Fontes AUTO-HOSPEDADAS (subset latin) — não remover.
   Gerado por tools/fetch-fonts.mjs. 2 famílias, font-display: swap.
   =========================================================\n`;

for (const fam of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?${fam.css}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

  // pega o bloco @font-face do subset "latin" (último bloco do CSS do Google)
  const blocks = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map((m) => m[0]);
  const latin = blocks.find((b) => /U\+0000-00FF/.test(b));
  if (!latin) throw new Error(`subset latin não encontrado para ${fam.local}`);

  const src = latin.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!src) throw new Error(`woff2 não encontrado para ${fam.local}`);

  const woff2 = Buffer.from(await (await fetch(src, { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(`${ROOT}assets/fonts/${fam.file}.woff2`, woff2);

  const weightRange = latin.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() || '400 800';
  out += `
@font-face {
  font-family: '${fam.local}';
  font-style: normal;
  font-weight: ${weightRange};
  font-display: swap;
  src: url('../assets/fonts/${fam.file}.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`;
  console.log(`✅ ${fam.file}.woff2 (${Math.round(woff2.length / 1024)} KB)`);
}

// o CSS gerado fica em /css/fonts.css (paths relativos a /css)
writeFileSync(`${ROOT}css/fonts.css`, out);
console.log('✅ css/fonts.css gerado');
