/* =========================================================
   PERFORMANCE (Fase 1 — ritmo e sensação) — Playwright
   Afirma:
     (1) 55+ FPS durante a partida com CPU throttle 4x
         (1280x720, partículas/spawns ativos, arrasto dirigindo o jogo)
     (2) reinício "Jogar de novo" em < 400 ms (clique -> jogando)
     (3) o loop realmente avançou durante a medição (sanidade)
     (4) zero erros de console
   Ambiente: HEADED (GPU real + Emulation.setCPUThrottlingRate 4).
   O headed é o caminho de deploy em todo aparelho (canvas2d acelerado
   por GPU); o headless usa SwiftShader com raster de software NO MAIN
   THREAD — arquitetura que nenhum aparelho real usa e que pune qualquer
   jogo de canvas (mesmo vazio, teto ~45 FPS). Throttle 4x no main thread
   + GPU fraca (aqui: Intel HD 4400, de 2013) = cenário de "celular de
   entrada". A qualidade adaptativa do jogo (resScale) deve assentar
   em ≤0,55 durante o warmup de 9 s dirigido.
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/perf-ui.cjs
   Requer: playwright-chromium (npm i -D playwright-chromium)
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

const SEED = {
  pn_consent: '1',
  pn_tutorial_done: '1',
  pn_profile: JSON.stringify({ nickname: 'Perf', createdAt: '2026-01-01T00:00:00.000Z', asked: true }),
};

const ALL_ERRORS = [];

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  const browser = await chromium.launch({ headless: false }); // GPU real (ver cabeçalho)

  console.log('===== PERFORMANCE — 1280x720, headed GPU, CPU throttle 4x =====');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'pt-BR',
  });
  await context.addInitScript((data) => {
    if (!sessionStorage.getItem('pn_test_seeded')) {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      sessionStorage.setItem('pn_test_seeded', '1');
    }
  }, SEED);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') ALL_ERRORS.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => ALL_ERRORS.push(`[pageerror] ${e.message}`));

  await page.goto(`${URL}/?debug=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!document.querySelector('[data-action="play"]'));
  await page.click('[data-action="play"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'playing' && window.OX?.game?.mode === 'playing');

  // ---- (1) FPS com CPU throttle 4x ----
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // invulnerável: a varredura não pode morrer e interromper a medição
  await page.evaluate(() => { window.OX.game.player.invuln = 99999; });

  // aquecimento de 9 s COM o jogo dirigido sob throttle: a qualidade
  // adaptativa (resScale) assenta sob a carga real da medição
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 0; i < 45; i++) {
    await page.mouse.move(640 + Math.sin(i / 7) * 400, 360 + Math.cos(i / 11) * 140);
    await new Promise((r) => setTimeout(r, 200));
  }

  const elapsedAntes = await page.evaluate(() => window.OX.game.elapsed);
  // contador de rAF roda na página enquanto o Node dirige o arrasto
  const fpsP = page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      const dt = performance.now() - t0;
      if (dt < 3000) requestAnimationFrame(tick);
      else resolve(frames / (dt / 1000));
    };
    requestAnimationFrame(tick);
  }));

  await page.mouse.move(640, 400);
  await page.mouse.down();                      // arrasto ativo (input exige pointerdown)
  const fim = Date.now() + 3000;
  let i = 0;
  while (Date.now() < fim) {
    const x = 640 + Math.sin(i / 7) * 400;
    const y = 360 + Math.cos(i / 11) * 140;
    await page.mouse.move(x, y);
    i++;
    await new Promise((r) => setTimeout(r, 45));
  }
  await page.mouse.up();
  const fps = await fpsP;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const fpsInfo = await page.evaluate(() => ({
    escala: window.OX.game.resScale,
    backing: `${window.OX.game.canvas.width}x${window.OX.game.canvas.height}`,
  }));
  ok(fps >= 55, `FPS médio com throttle 4x: ${fps.toFixed(1)} (mínimo 55; escala ${fpsInfo.escala}, ${fpsInfo.backing})`);
  const elapsedDepois = await page.evaluate(() => window.OX.game.elapsed);
  ok(elapsedDepois - elapsedAntes > 2.4,
    `loop avançou durante a medição (${(elapsedDepois - elapsedAntes).toFixed(1)} s de jogo)`);
  const movendo = await page.evaluate(() => window.OX.game.moved);
  ok(movendo, 'jogador estava em movimento durante a medição (arrasto dirigiu o jogo)');

  // ---- (2) reinício "Jogar de novo" < 400 ms ----
  await page.evaluate(() => window.OX.endRun());
  await page.waitForSelector('#screen-gameover.active');
  const msReplay = await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    document.querySelector('[data-action="replay"]').click();
    const check = () => {
      if (document.body.dataset.screen === 'playing' && window.OX.game.mode === 'playing') {
        resolve(performance.now() - t0);
      } else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
  ok(msReplay < 400, `reinício em ${msReplay.toFixed(0)} ms (máx 400)`);
  ok(await page.evaluate(() => !document.getElementById('hud').hidden), 'HUD visível logo após reiniciar');

  await context.close();
  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'PERF OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
