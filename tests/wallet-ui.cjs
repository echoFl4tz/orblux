/* =========================================================
   Regressão da CARTEIRA (Etapa 1 — moedas) — Playwright
   Afirma:
     (1) zero erros de console em 390x844 e 1280x720
     (2) OX.addCoins existe SÓ em ?debug=1 e grava a carteira
     (3) saldo persiste após recarregar (pn_wallet + checksum)
     (4) modal de reset tem texto EXPLÍCITO sobre moedas/skins
         e a caixa "manter" desligada por padrão
     (5) manter => saldo sobrevive ao reset; padrão => zera
     (6) sem overflow nos dois viewports
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/wallet-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'etapa1');

function loadChromium() {
  const candidates = [
    'playwright-chromium',
    // fallback de conveniência desta máquina de dev
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
  pn_version: '3',   // migra para v4 no boot e cria a carteira
};

const ALL_ERRORS = [];

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

(async () => {
  const server = await ensureServer();
  fs.mkdirSync(SHOTS, { recursive: true });
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const tag = `?debug=1&t=${Date.now()}`;

  /* ============ 390x844 (mobile) ============ */
  console.log('===== CARTEIRA — 390x844 (?debug=1) =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, tag);
  const mp = mobile.page;

  // (2) debug tool existe e grava a carteira
  const add = await mp.evaluate(() => (window.OX ? window.OX.addCoins(150, 'debug') : null));
  ok(add && add.ok && add.coins === 150, 'OX.addCoins(150) retorna ok e saldo 150');
  const file = await mp.evaluate(() => JSON.parse(localStorage.getItem('pn_wallet') || 'null'));
  ok(file && file.v === 4, 'pn_wallet gravado com versão 4');
  ok(file && /^[0-9a-f]{8}$/.test(file.c) && file.d.coins === 150, 'checksum 8 hex e saldo 150 no arquivo');

  // (3) persiste após recarregar
  await mp.reload({ waitUntil: 'networkidle' });
  await mp.waitForFunction(() => !!window.OX);
  ok(await mp.evaluate(() => window.OX.getCoins()) === 150, 'saldo persiste após recarregar (150)');

  // (4) modal de reset com texto explícito + caixa desligada
  await mp.click('[data-action="settings"]');
  await mp.click('#screen-settings [data-action="reset"]');
  await mp.waitForSelector('#modal-confirm:not([hidden])');
  const modalText = await mp.textContent('#modal-confirm');
  ok(/moedas e as skins compradas com moedas também serão apagadas/i.test(modalText),
    'modal avisa que moedas e skins com moedas são apagadas');
  ok(/compradas com dinheiro na Play Store serão mantidas/i.test(modalText),
    'modal avisa que skins de dinheiro são mantidas');
  const box = await mp.evaluate(() => {
    const el = document.getElementById('reset-keep-coins');
    return el ? { exists: true, checked: el.checked } : { exists: false };
  });
  ok(box.exists && box.checked === false, 'caixa "manter moedas" existe e começa DESLIGADA');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'modal sem overflow em 390px');
  await mp.waitForTimeout(450);                        // espera o fadeIn do modal terminar
  await mp.screenshot({ path: path.join(SHOTS, 'modal-reset-390x844.png') });

  // (5a) manter => saldo sobrevive
  await mp.click('#reset-keep-coins');
  await mp.click('[data-action="reset-confirm"]');
  await mp.waitForSelector('#modal-confirm[hidden]', { state: 'attached' }).catch(() => {});
  ok(await mp.evaluate(() => window.OX.getCoins()) === 150, 'manter marcado: saldo sobrevive ao reset (150)');
  const toast1 = await mp.evaluate(() => document.getElementById('toasts')?.textContent || '');
  ok(toast1.includes('Suas moedas foram mantidas'), 'toast confirma "Suas moedas foram mantidas"');

  // (5b) padrão => zera
  await mp.click('#screen-settings [data-action="reset"]');   // continuamos na tela de configurações
  await mp.waitForSelector('#modal-confirm:not([hidden])');
  const box2 = await mp.evaluate(() => document.getElementById('reset-keep-coins').checked);
  ok(box2 === false, 'ao reabrir, a caixa volta desligada (padrão)');
  await mp.click('[data-action="reset-confirm"]');
  ok(await mp.evaluate(() => window.OX.getCoins()) === 0, 'padrão: moedas zeradas após reset');
  const file2 = await mp.evaluate(() => JSON.parse(localStorage.getItem('pn_wallet') || 'null'));
  ok(file2 && file2.d.coins === 0, 'arquivo da carteira zerado (com checksum válido)');

  // (6) menu sem overflow
  await mp.click('#screen-settings [data-action="menu"]');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'menu sem overflow em 390px');
  await mp.screenshot({ path: path.join(SHOTS, 'menu-390x844.png') });
  await mobile.context.close();

  /* ============ 1280x720 (desktop) ============ */
  console.log('===== CARTEIRA — 1280x720 (?debug=1) =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, tag);
  const dp = desk.page;
  await dp.evaluate(() => window.OX.addCoins(80, 'debug'));
  ok(await dp.evaluate(() => window.OX.getCoins()) === 80, 'saldo 80 no desktop');
  await dp.click('[data-action="settings"]');
  await dp.click('#screen-settings [data-action="reset"]');
  await dp.waitForSelector('#modal-confirm:not([hidden])');
  ok(await dp.evaluate(() => document.documentElement.scrollWidth <= 1281), 'modal sem overflow em 1280px');
  await dp.waitForTimeout(450);                        // espera o fadeIn do modal terminar
  await dp.screenshot({ path: path.join(SHOTS, 'modal-reset-1280x720.png') });
  await dp.click('[data-action="reset-cancel"]');
  await dp.click('#screen-settings [data-action="menu"]');
  await dp.screenshot({ path: path.join(SHOTS, 'menu-1280x720.png') });
  await desk.context.close();

  /* ============ sem ?debug=1: sem ferramentas de economia ============ */
  console.log('===== CARTEIRA — produção (sem ?debug=1) =====');
  const prod = await newPage(browser, { w: 390, h: 844 }, '');
  const eco = await prod.page.evaluate(() => ({
    hasOX: typeof window.OX !== 'undefined',          // API legada de QA continua no localhost
    hasCoins: !!(window.OX && window.OX.addCoins),    // economia exige ?debug=1
  }));
  ok(eco.hasOX && !eco.hasCoins,
    'sem ?debug=1: OX sem addCoins/getCoins (não se ganha moedas fora do flag)');
  await prod.context.close();

  await browser.close();

  /* ============ erros de console ============ */
  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'CARTEIRA UI OK' : `FALHAS: ${failures}`} — capturas em docs/captures/etapa1/`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
