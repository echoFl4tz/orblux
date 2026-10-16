/* =========================================================
   /dev/style (Fase A1 da direção de arte) — Playwright
   Afirma:
     (1) /dev/style responde (fallback sem extensão do dev server);
     (2) o tema (js/game/theme.js) é importado e aplicado
         (paleta, zonas e valores batem com o THEME);
     (3) a página renderiza: 10 swatches, 4 zonas, tabela de
         escala, canvas de objetos PINTADO e mock do HUD;
     (4) a página respeita prefers-reduced-motion (estático);
     (5) 360 px sem overflow; zero erros de console.
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/style-dev-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';

function loadChromium() {
  const candidates = [
    'playwright-chromium',
    'C:/Users/joseo/AppData/Local/Temp/opencode/orblux-record/node_modules/playwright-chromium',
  ];
  for (const c of candidates) {
    try { return require(c).chromium; } catch { /* tenta o próximo */ }
  }
  throw new Error('playwright-chromium não encontrado. Instale com: npm i -D playwright-chromium');
}

async function ensureServer() {
  try { const r = await fetch(URL); if (r.ok) return null; } catch { /* sobe */ }
  const proc = spawn(process.execPath, ['dev-server.mjs', '8080'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(URL); if (r.ok) return proc; } catch { /* espera */ }
  }
  throw new Error('dev server não subiu em 10s');
}

let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures++;
};

(async () => {
  const server = await ensureServer();

  // (1) rota sem extensão
  const rota = await fetch(URL + '/dev/style');
  ok(rota.ok, `/dev/style responde sem extensão (HTTP ${rota.status})`);

  const chromium = loadChromium();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  const page = await context.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));

  await page.goto(URL + '/dev/style', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.STYLE_OK === true, null, { timeout: 10000 });

  // (2) tema importado e aplicado
  const tema = await page.evaluate(() => ({
    cyan: window.THEME_REF?.color?.cyan,
    zonas: window.THEME_REF?.zones?.length,
    u: window.THEME_REF?.unit(360, 640),
    cssCyan: getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim(),
  }));
  ok(tema.cyan === '#22E4FF' && tema.zonas === 4, `THEME importado (cyan=${tema.cyan}, zonas=${tema.zonas})`);
  ok(Math.abs(tema.u - 3.6) < 0.01, `unit(360,640) = ${tema.u.toFixed(2)} px (guia: 3,6)`);
  ok(tema.cssCyan === '#22E4FF', 'CSS da página alimentado pelo THEME (--cyan)');

  // (3) render
  const render = await page.evaluate(() => {
    const cv = document.getElementById('objetos');
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let pintados = 0;
    for (let i = 3; i < d.length; i += 40) if (d[i] > 0) pintados++;
    return {
      swatches: document.querySelectorAll('.swatch').length,
      zonas: document.querySelectorAll('.zona').length,
      linhasEscala: document.querySelectorAll('#escala tr').length,
      pintados,
      hud: !!document.getElementById('hm-score') && !!document.querySelector('.hm-pause')
        && document.querySelectorAll('.hm-hearts svg').length === 3,
      alvoPause: document.querySelector('.hm-pause').getBoundingClientRect().height,
      tokens: document.querySelectorAll('#tokens .card').length,
      rotulos: document.querySelectorAll('#rotulos span').length,
    };
  });
  ok(render.swatches === 10, `paleta completa (${render.swatches}/10 swatches)`);
  ok(render.zonas === 4, `4 zonas de cor (${render.zonas})`);
  ok(render.linhasEscala >= 7, `tabela de escala com ${render.linhasEscala} linhas`);
  ok(render.pintados > 50, `canvas de objetos pintado (${render.pintados} amostras com pixels)`);
  ok(render.hud && render.alvoPause >= 44,
    `mock do HUD com 3 corações e pausa de ${Math.round(render.alvoPause)} px (>= 44)`);
  ok(render.tokens === 4 && render.rotulos === 7,
    `tokens (${render.tokens}/4 cartões) e rótulos dos objetos (${render.rotulos}/7)`);

  // (4) prefers-reduced-motion: desenho CONGELADO (1 frame só)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.STYLE_OK === true, null, { timeout: 10000 });
  const p1 = await page.evaluate(() => document.getElementById('objetos').toDataURL().length);
  await new Promise((r) => setTimeout(r, 400));
  const cong = await page.evaluate((antes) => ({
    frames: window.STYLE_FRAMES || 0,
    igual: document.getElementById('objetos').toDataURL().length === antes,
  }), p1);
  ok(cong.frames === 1 && cong.igual,
    `reduced-motion: página congela no 1º frame (${cong.frames} frame(s) em 400 ms, quadro inalterado)`);

  // (5) 360 px sem overflow + console
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(150);
  const over = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth, iw: window.innerWidth,
  }));
  ok(over.w <= over.iw + 1, `360 px sem overflow horizontal (${over.w} <= ${over.iw})`);

  console.log('===== CONSOLE =====');
  ok(erros.length === 0, `zero erros de console (${erros.length})`);
  if (erros.length) console.log(erros.join('\n'));

  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? '/dev/style OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
