/* =========================================================
   RESPONSIVO (Fase 3) — 360x640, 390x844 e 1280x720
   Para CADA tela alcançável (menu, como jogar, ranking,
   configurações, loja, pausa, fim de jogo e — com flags
   ligadas — social, chat, clãs, torneio):
     (1) sem overflow horizontal da página;
     (2) sem overflow vertical da página (tela cheia, sem
         rolagem fantasma — o conteúdo interno pode rolar);
     (3) todo botão visível cabe na largura da viewport;
     (4) HUD da partida (placar, chips, pausa, vidas) dentro
         da viewport em cada alvo;
     (5) zero erros de console.
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/responsive-ui.cjs
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
  pn_profile: JSON.stringify({ nickname: 'Teste', createdAt: '2026-01-01T00:00:00.000Z', asked: true }),
  pn_version: '3',
};

const ALL_ERRORS = [];

/** Mede overflow da página e botões fora da largura da viewport. */
const MEASURE = () => {
  const doc = document.documentElement;
  const larguraFora = [...document.querySelectorAll('.screen.active button')]
    .filter((b) => b.offsetParent !== null && b.getBoundingClientRect().width > 0)
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { t: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 22), l: Math.round(r.left), r: Math.round(r.right) };
    })
    .filter((b) => b.l < -1 || b.r > window.innerWidth + 1);
  return {
    sw: doc.scrollWidth, sh: doc.scrollHeight,
    iw: window.innerWidth, ih: window.innerHeight,
    larguraFora,
  };
};

async function newPage(browser, size, query) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, locale: 'pt-BR',
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
  await page.goto(URL + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!document.querySelector('[data-action="play"]'));
  return { context, page };
}

/** Mede uma tela e afirma os 3 critérios (1 semântica por tela). */
async function checkScreen(page, label, name) {
  await page.evaluate((n) => window.OX.screen(n), name);
  await page.waitForTimeout(140);
  const m = await page.evaluate(MEASURE);
  ok(m.sw <= m.iw + 1, `${label}: sem overflow horizontal (${m.sw} <= ${m.iw})`);
  ok(m.sh <= m.ih + 1, `${label}: sem overflow vertical (${m.sh} <= ${m.ih})`);
  ok(m.larguraFora.length === 0,
    `${label}: botões dentro da largura${m.larguraFora.length ? ` (fora: ${JSON.stringify(m.larguraFora)})` : ''}`);
}

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const tag = '?social=1&debug=1&t=' + Date.now(); // social=1 liga todas as flags em localhost

  const ALVOS = [
    { w: 360, h: 640 },
    { w: 390, h: 844 },
    { w: 1280, h: 720 },
  ];

  for (const size of ALVOS) {
    console.log(`===== RESPONSIVO — ${size.w}x${size.h} =====`);
    const { context, page } = await newPage(browser, size, tag);

    // telas do menu/social
    for (const nome of ['menu', 'howto', 'ranking', 'settings', 'skins', 'social', 'chat', 'clans', 'tournament']) {
      await checkScreen(page, `${nome} @ ${size.w}`, nome);
    }

    // partida: HUD dentro da viewport + pausa + fim de jogo
    await page.evaluate(() => { window.OX.screen('menu'); window.OX.start({ tutorial: false }); });
    await page.evaluate(() => { OX.game.player.invuln = 9999; OX.advance(1); });
    const hud = await page.evaluate(() => {
      const dentro = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1
          && r.width > 0 && r.height > 0;
      };
      return {
        score: dentro('hud-score'), wave: dentro('hud-wave'), level: dentro('hud-level'),
        pause: dentro('btn-pause'), lives: dentro('hud-lives'),
      };
    });
    ok(Object.values(hud).every((v) => v === true),
      `HUD da partida cabe na tela (${Object.entries(hud).filter(([, v]) => v).length}/5 elementos)`);

    await page.evaluate(() => document.querySelector('[data-action="pause"]').click());
    await page.waitForTimeout(140);
    await checkScreen(page, `pausa @ ${size.w}`, 'pause');

    await page.evaluate(() => { window.OX.start({ tutorial: false }); window.OX.game.player.invuln = 9999; window.OX.advance(12); window.OX.endRun(); });
    await page.waitForSelector('#screen-gameover.active');
    await page.waitForTimeout(160);
    await checkScreen(page, `fim de jogo @ ${size.w}`, 'gameover');

    await context.close();
  }

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'RESPONSIVO OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
