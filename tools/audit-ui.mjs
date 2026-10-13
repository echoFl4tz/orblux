/* =========================================================
   Auditoria de UI — ORBLUX
   Verifica: sem emojis na interface, atributos aria essenciais,
   tokens do design system e peso dos assets (< 150 KB).
   Uso: node tools/audit-ui.mjs
   ========================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/u;

let fails = 0;
const check = (cond, label) => {
  if (cond) console.log(`  ✅ ${label}`);
  else { fails++; console.log(`  ❌ ${label}`); }
};

// ---------------------------------------------------------
// 1) Sem emojis na interface (share.js: permitido — texto de compartilhamento)
// ---------------------------------------------------------
console.log('\n— Emojis na interface —');
const interfaceFiles = [
  'index.html', 'css/style.css',
  'js/ui/hud.js', 'js/ui/missions.js', 'js/ui/achievements.js', 'js/ui/toasts.js',
  'js/ui/screens.js', 'js/ui/ranking.js', 'js/game/tutorial.js', 'js/monetization/ads.js',
  'js/main.js', 'js/game/game.js', 'js/game/entities.js',
];
for (const f of interfaceFiles) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  const m = text.match(EMOJI);
  check(!m, `${f} sem emoji${m ? ` (achou: ${m[0]})` : ''}`);
}

// ---------------------------------------------------------
// 2) Acessibilidade básica no HTML
// ---------------------------------------------------------
console.log('\n— Acessibilidade (HTML) —');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
check(/id="toasts"[^>]*aria-live="polite"/.test(html), 'toasts com aria-live="polite"');
check(/id="tutorial-text"[^>]*aria-live="polite"/.test(html), 'tutorial com aria-live="polite"');
check(/id="modal-confirm"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html), 'modal-confirm é dialog aria-modal');
check(/id="modal-share"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html), 'modal-share é dialog aria-modal');
check(/aria-label="Pausar jogo"/.test(html), 'botão só-ícone com aria-label (pausa)');
check((html.match(/aria-label="Fechar"/g) || []).length >= 4, 'botões só-ícone com aria-label (fechar)');
check(/<canvas[^>]*aria-label/.test(html), 'canvas com aria-label');
check(/<html lang="pt-BR">/.test(html), 'lang pt-BR');
// nenhum <img> — todos os ícones são SVG inline
check(!/<img\b/i.test(html), 'sem <img> (ícones em SVG inline)');

// ---------------------------------------------------------
// 3) Design system: tokens e componentes presentes
// ---------------------------------------------------------
console.log('\n— Design system (CSS) —');
const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
for (const token of ['--primary: #22e6ff', '--secondary: #ff3df0', '--reward: #ffe45e',
  '--success: #4dff9e', '--danger: #ff4d6d', '--font-display', '--font-sans',
  '--r-sm', '--r-md', '--r-lg', 'clamp(', 'font-variant-numeric: tabular-nums']) {
  check(css.includes(token), `token presente: ${token}`);
}
check(/prefers-reduced-motion/.test(css) && /\.reduce-motion/.test(css), 'movimento reduzido (mídia + classe)');
check(/focus-visible/.test(css), 'estados focus-visible estilizados');
check(/env\(safe-area-inset/.test(css), 'safe-area insets');
check(/dvh/.test(css), 'usa 100dvh/dvh (não só vh)');
check(/scrollbar-width|::-webkit-scrollbar/.test(css), 'scrollbar estilizada');
check(/backdrop-filter/.test(css) && /@supports not/.test(css), 'vidro com fallback sólido');

// ---------------------------------------------------------
// 4) Fontes auto-hospedadas (sem Google Fonts remoto)
// ---------------------------------------------------------
console.log('\n— Fontes —');
check(!/fonts\.googleapis|fonts\.gstatic/.test(html), 'sem requisição remota ao Google Fonts');
check(/css\/fonts\.css/.test(html), 'liga css/fonts.css local');
check(/font-display:\s*swap/.test(readFileSync(join(ROOT, 'css/fonts.css'), 'utf8')), 'font-display: swap');

// ---------------------------------------------------------
// 5) Peso dos assets (CSS + fontes + ícones vetoriais < 150 KB)
// ---------------------------------------------------------
console.log('\n— Peso (CSS + fontes + ícones vetoriais) —');
const kb = (f) => readFileSync(join(ROOT, f)).length / 1024;
const parts = {
  'css/style.css': kb('css/style.css'),
  'css/fonts.css': kb('css/fonts.css'),
  'assets/fonts/orblux-display.woff2': kb('assets/fonts/orblux-display.woff2'),
  'assets/fonts/orblux-sans.woff2': kb('assets/fonts/orblux-sans.woff2'),
  'favicon.svg': kb('favicon.svg'),
  'logo.svg': kb('logo.svg'),
};
let total = 0;
for (const [f, size] of Object.entries(parts)) {
  total += size;
  console.log(`     ${f}: ${size.toFixed(1)} KB`);
}
check(total < 150, `total ${total.toFixed(1)} KB < 150 KB`);

// ---------------------------------------------------------
console.log(fails === 0 ? '\nAUDIT OK — nenhuma falha' : `\nAUDIT: ${fails} falha(s)`);
process.exit(fails === 0 ? 0 : 1);
