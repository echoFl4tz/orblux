/* =========================================================
   PERFORMANCE — FPS por qualidade (A5, guia §11) — Playwright
   Afirma:
     (1) 55+ FPS em CADA tier de qualidade durante a partida
         (tier Alto/Baixo travado via OX.game.qualLock; throttle 4x)
     (2) reinício "Jogar de novo" em < 400 ms (clique -> jogando)
     (3) o loop realmente avançou durante a medição (sanidade)
     (4) zero erros de console
   §11 manda medir cada nível isolado: Alto (220 part., 4 camadas,
   bloom 1/4, vinheta), Médio (120, 3, bloom 1/6, vinheta) e Baixo
   (40, 2, sem bloom, sem vinheta). A trava qualLock congela a
   escala do tier e desliga a adaptação automática durante a medição.
   Ambiente: HEADED (GPU real + Emulation.setCPUThrottlingRate 4) —
   ver cabeçalho da Fase 1: headless = SwiftShader software no main
   thread (arquitetura que nenhum aparelho real usa). Máquina fraca
   compartilhada pode perder o renderer sob pressão de memória; nesse
   caso a suíte refaz a medição UMA vez e relata — os números
   publicados são sempre medidos, nunca inventados.
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

// tiers do §11: escala que cai em cada faixa de tierForRes
const TIERS = [
  [0.9, 'tier Alto'],
  [0.7, 'tier Médio'],
  [0.55, 'tier Baixo'],
];

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  // Janela em segundo plano/oculta leva o Chromium a cortar o rAF
  // para ~1 Hz (CalculateNativeWinOcclusion) — a medição precisa da
  // janela viva mesmo quando coberta por outras janelas do desktop.
  const abrirBrowser = () => chromium.launch({
    headless: false, // GPU real (ver cabeçalho)
    args: [
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
  });
  let browser = await abrirBrowser();

  console.log('===== PERFORMANCE — 1280x720, headed GPU, CPU throttle 4x =====');

  let pronto = false;
  for (let tentativa = 1; tentativa <= 2 && !pronto; tentativa++) {
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

    try {
      await page.goto(`${URL}/?debug=1`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!document.querySelector('[data-action="play"]'));
      await page.click('[data-action="play"]');
      await page.waitForFunction(() => document.body.dataset.screen === 'playing' && window.OX?.game?.mode === 'playing');

      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // invulnerável: a varredura não pode morrer e interromper a medição
      await page.evaluate(() => { window.OX.game.player.invuln = 99999; });

      // aquecimento de 9 s COM o jogo dirigido sob throttle: o
      // adaptativo assenta sob a carga real antes de medir os tiers
      await page.mouse.move(640, 400);
      await page.mouse.down();
      for (let i = 0; i < 45; i++) {
        await page.mouse.move(640 + Math.sin(i / 7) * 400, 360 + Math.cos(i / 11) * 140);
        await new Promise((r) => setTimeout(r, 200));
      }

      const elapsedAntes = await page.evaluate(() => window.OX.game.elapsed);

      // ---- (1) FPS por qualidade: cada tier travado e medido ----
      for (const [escala, label] of TIERS) {
        await page.evaluate((v) => { window.OX.game.qualLock = v; }, escala);
        await page.waitForTimeout(1300);            // assenta escala + fundo
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
        await page.mouse.down();                    // arrasto ativo durante a medição
        const fim = Date.now() + 3000;
        let i = 0;
        while (Date.now() < fim) {
          await page.mouse.move(640 + Math.sin(i / 7) * 400, 360 + Math.cos(i / 11) * 140);
          i++;
          await new Promise((r) => setTimeout(r, 45));
        }
        await page.mouse.up();
        const fps = await fpsP;
        const info = await page.evaluate(() => ({
          escala: window.OX.game.resScale,
          backing: `${window.OX.game.canvas.width}x${window.OX.game.canvas.height}`,
          bloom: window.OX.game.bloomFrac,
        }));
        ok(fps >= 55, `${label}: FPS ${fps.toFixed(1)} (mín 55; escala ${info.escala}, ${info.backing}, bloom ${info.bloom})`);
      }
      await page.evaluate(() => { window.OX.game.qualLock = null; });

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
      pronto = true;
    } catch (e) {
      await context.close().catch(() => { /* já morreu */ });
      if (tentativa === 1) {
        const msg = String(e && e.message || e).split('\n')[0];
        console.log(`  ! medição perdida (${msg}); refazendo UMA vez (ambiente)`);
        ALL_ERRORS.length = 0;   // erros da tentativa 1 vieram do renderer morto
        await browser.close().catch(() => { /* já morreu */ });
        browser = await abrirBrowser();
      } else {
        throw e;
      }
    }
  }

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'PERF OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
