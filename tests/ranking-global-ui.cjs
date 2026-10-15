/* =========================================================
   ranking-global-ui.cjs — Playwright: Fase 2 da camada social
   • flag desligada = sem seletor e sem bloco global
   • ?social=1: seletor Local/Global, CTA "Entre na comunidade",
     lista do servidor (mock), paginação, offline com
     "Tentar de novo" (ranking local intacto)
   • partida curta (< 10 s) NÃO vai ao servidor; emit de fim de
     jogo longo chega ao mock via submitRunGlobal
   • 390x844, 360x640 e 1280x720 sem overflow; zero erros
   ========================================================= */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'social-fase2');

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
  const ts = `&t=${Date.now()}`;

  /* ============ flag DESLIGADA (produção) ============ */
  console.log('===== RANKING GLOBAL — flag desligada (?debug=1) =====');
  const off = await newPage(browser, { w: 390, h: 844 }, `?debug=1${ts}`);
  const op = off.page;
  ok(!(await op.isVisible('#ranking-scopes')), 'seletor Local/Global oculto sem ?social=1');
  await op.click('[data-action="ranking"]');
  await op.waitForTimeout(350);
  ok(!(await op.isVisible('#ranking-scopes')), 'seletor continua oculto na tela Ranking');
  ok(!(await op.isVisible('#ranking-global')), 'bloco global inexistente na produção');
  ok(await op.isVisible('#ranking-list') || await op.isVisible('#ranking-empty'), 'ranking local segue intacto');
  await off.context.close();

  /* ============ ?social=1 — 390x844 ============ */
  console.log('===== RANKING GLOBAL — fluxo 390x844 (?social=1) =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp = mobile.page;

  ok(await mp.evaluate(() => !document.getElementById('ranking-scopes').hidden), 'seletor desoculto com a flag (init)');
  await mp.click('[data-action="ranking"]');
  await mp.waitForTimeout(350);
  ok(await mp.isVisible('#ranking-scopes'), 'seletor visível na tela Ranking');
  ok(await mp.evaluate(() => document.querySelector('[data-rank-scope="local"]').classList.contains('active')), 'Local ativo por padrão');
  await mp.click('[data-rank-scope="global"]');
  await mp.waitForSelector('#ranking-global-cta', { state: 'visible' });
  ok((await mp.textContent('#ranking-global-cta')).includes('Entre na comunidade'), 'sem perfil: CTA convida a entrar');
  ok(await mp.getAttribute('[data-rank-scope="global"]', 'aria-pressed') === 'true', 'chip Global com aria-pressed');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'global-cta-390x844.png') });

  // CTA abre a tela Comunidade
  await mp.click('#ranking-global-cta [data-action="social"]');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'CTA abre a tela Comunidade');
  await mp.click('#screen-social [data-action="menu"]');
  await mp.waitForTimeout(350);

  // volta ao ranking: escopo Global persiste e o CTA continua
  await mp.click('[data-action="ranking"]');
  await mp.waitForSelector('#ranking-global-cta', { state: 'visible' });
  ok(true, 'reabrir mantém o escopo Global (sem perfil, CTA)');

  // cria perfil social (mock) e recarrega a lista
  await mp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'GlobalTester', ageBand: '18+' }));
  await mp.click('[data-rank-scope="local"]');
  await mp.click('[data-rank-scope="global"]');
  await mp.waitForSelector('#ranking-global-list li', { state: 'visible', timeout: 8000 });
  const nRows = await mp.evaluate(() => document.querySelectorAll('#ranking-global-list li').length);
  ok(nRows === 10, `primeira página com ${nRows} linhas (limite 10)`);
  const ordenado = await mp.evaluate(() => {
    const sc = [...document.querySelectorAll('#ranking-global-list li b')]
      .map((b) => Number(b.textContent.replace(/\D/g, '')) || 0);
    return sc.every((v, i) => i === 0 || sc[i - 1] >= v);
  });
  ok(ordenado, 'linhas em ordem decrescente de pontuação');
  ok(await mp.evaluate(() => document.getElementById('ranking-global-cta').hidden), 'CTA some com perfil');
  const myTxt = await mp.textContent('#ranking-global-my');
  ok(myTxt.includes('ainda não pontuaram'), `minha posição antes de pontuar (${myTxt.trim()})`);
  ok(await mp.isVisible('#ranking-global-more'), '"Carregar mais" visível (total > 10)');
  await mp.screenshot({ path: path.join(SHOTS, 'global-lista-390x844.png') });

  // paginação
  await mp.click('#ranking-global-more');
  await mp.waitForFunction(() => document.querySelectorAll('#ranking-global-list li').length === 20);
  ok(true, 'paginar adiciona mais 10 linhas (20 no total)');

  // offline: erro com "Tentar de novo" e ranking local intacto
  await mp.evaluate(() => window.OX.socialApi().__setOffline(true));
  await mp.click('[data-rank-scope="local"]');
  ok(await mp.isVisible('#ranking-list') || await mp.isVisible('#ranking-empty'), 'offline: ranking local segue funcionando');
  await mp.click('[data-rank-scope="global"]');
  await mp.waitForFunction(() => (document.getElementById('ranking-global-status').textContent || '').includes('Não foi possível'));
  ok(await mp.isVisible('#ranking-global-retry'), 'offline: "Tentar de novo" aparece');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'global-offline-390x844.png') });
  await mp.click('#ranking-global-retry');
  await mp.waitForTimeout(500);
  ok(await mp.isVisible('#ranking-global-retry'), 'retry ainda offline: erro de novo, sem travar');

  // volta online: o "Tentar de novo" (ainda visível) recarrega do zero
  await mp.evaluate(() => window.OX.socialApi().__setOffline(false));
  await mp.click('#ranking-global-retry');
  await mp.waitForFunction(() => document.querySelectorAll('#ranking-global-list li').length > 0);
  ok(!(await mp.isVisible('#ranking-global-retry')), 'online: retry some após recarregar');

  // fim de partida: curta NÃO envia; longa chega ao servidor (mock)
  await mp.evaluate(() => window.OX.screen('menu'));
  await mp.evaluate(() => { window.OX.start({ tutorial: false }); window.OX.advance(2); window.OX.endRun(); });
  await mp.waitForTimeout(600);
  ok(await mp.evaluate(() => window.OX.socialApi().state.runs.length === 0), 'partida de 2 s NÃO vai ao servidor (< 10 s)');
  await mp.evaluate(() => window.OX.emit('game:over', {
    score: 199999, elapsed: 42, pickups: 3, maxCombo: 2, level: 2, powerups: 0, revived: false,
  }));
  await mp.waitForFunction(() => window.OX.socialApi().state.runs.length === 1);
  ok(true, 'partida válida chega ao servidor via submitRunGlobal');
  ok(await mp.evaluate(() => window.OX.socialApi().state.runs[0].score === 199999), 'pontuação enviada sem adulteração');

  // refresh (via botão do menu: dispara screen:ranking) mostra minha pontuação
  await mp.evaluate(() => window.OX.screen('menu'));
  await mp.click('[data-action="ranking"]');
  await mp.waitForFunction(() => (document.getElementById('ranking-global-my').textContent || '').startsWith('Sua posição:'));
  ok(true, 'após pontuar, "Sua posição: N" aparece');
  const minha = await mp.evaluate(() => {
    const li = [...document.querySelectorAll('#ranking-global-list li')].find((x) => x.classList.contains('mine'));
    return li ? li.textContent : '';
  });
  ok(minha.includes('GlobalTester'), `minha linha destacada na lista (${minha.trim().slice(0, 40)}…)`);

  // layout
  const audit390 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit390.ok, `audit 390x844 sem overflow (${audit390.issues.join(' | ') || 'ok'})`);
  await mp.setViewportSize({ width: 360, height: 640 });
  await mp.waitForTimeout(300);
  const audit360 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit360.ok, `audit 360x640 sem overflow (${audit360.issues.join(' | ') || 'ok'})`);
  await mp.screenshot({ path: path.join(SHOTS, 'global-360x640.png') });

  /* ============ desktop 1280x720 ============ */
  console.log('===== RANKING GLOBAL — desktop 1280x720 =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, `?social=1&debug=1${ts}`);
  const dp = desk.page;
  await dp.click('[data-action="ranking"]');
  await dp.waitForTimeout(350);
  await dp.click('[data-rank-scope="global"]');
  await dp.waitForSelector('#ranking-global-cta', { state: 'visible' });
  await dp.screenshot({ path: path.join(SHOTS, 'global-1280x720.png') });
  const auditDesk = await dp.evaluate(() => window.OX.auditLayout());
  ok(auditDesk.ok, `audit 1280x720 sem overflow (${auditDesk.issues.join(' | ') || 'ok'})`);
  await desk.context.close();

  /* ============ console ============ */
  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.slice(0, 10));

  await browser.close();
  if (server) try { process.kill(server.pid); } catch { /* já morreu */ }

  console.log('\n' + '='.repeat(50));
  if (failures === 0) {
    console.log('RANKING GLOBAL FASE 2 OK — capturas em docs/captures/social-fase2/');
    process.exit(0);
  }
  console.log(`FALHAS: ${failures} — capturas em docs/captures/social-fase2/`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
