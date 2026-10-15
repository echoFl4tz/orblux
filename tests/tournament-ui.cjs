/* =========================================================
   tournament-ui.cjs — Playwright: Fase 5 da camada social
   • flag desligada = botão Torneio e Corrida do Dia ocultos
   • sem perfil: convites ("Entre na comunidade")
   • Corrida do Dia: semente vem do servidor, o MESMO percurso
     para todos (game:over carrega a semente usada) e o recorde
     do dia é rastreado; semente de outro dia é recusada (unit.)
   • Torneio: sem clã ⇒ CTA; com clã ⇒ grupo da liga (8 + o
     seu), contribuição por partida, recompensa de temporada
     resgatável UMA vez em moedas (só jogando), offline com
     "Tentar de novo"
   • 390x844 e 1280x720 sem overflow; zero erros de console
   ========================================================= */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'social-fase5');

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
  console.log('===== TORNEIO — flag desligada (?debug=1) =====');
  const off = await newPage(browser, { w: 390, h: 844 }, `?debug=1${ts}`);
  ok(!(await off.page.isVisible('#btn-tournament')), 'botão Torneio oculto sem ?social=1');
  ok(await off.page.evaluate(() => document.getElementById('daily-race').hidden), 'Corrida do Dia oculta sem flag');
  ok(!(await off.page.isVisible('#screen-tournament')), 'tela do torneio fora do fluxo');
  await off.context.close();

  /* ============ sem perfil: convites (390x844) ============ */
  console.log('===== TORNEIO — convites sem perfil =====');
  const mob = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp = mob.page;
  ok(await mp.isVisible('#btn-tournament'), 'botão Torneio visível com a flag');
  await mp.click('#btn-tournament');
  await mp.waitForSelector('#tournament-cta', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#tournament-cta')).includes('Entre na comunidade'), 'sem perfil: CTA convida a entrar');
  await mp.click('#tournament-cta [data-action="social"]');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'CTA abre a tela Comunidade');
  await mp.click('#screen-social [data-action="menu"]');
  await mp.waitForTimeout(350);
  // corrida do dia sem perfil também convida
  await mp.click('#screen-menu [data-action="ranking"]');
  await mp.waitForSelector('#screen-ranking.active', { timeout: 8000 });
  await mp.waitForSelector('#daily-cta', { state: 'visible', timeout: 8000 });
  ok(true, 'Corrida do Dia sem perfil: CTA na tela de Ranking');
  await mp.click('#screen-ranking [data-action="menu"]');
  await mp.waitForTimeout(350);

  /* ============ Corrida do Dia: semente do servidor ============ */
  console.log('===== CORRIDA DO DIA — semente do servidor =====');
  await mp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'Corredor', ageBand: '18+' }));
  await mp.click('#screen-menu [data-action="ranking"]');
  await mp.waitForSelector('#screen-ranking.active', { timeout: 8000 });
  await mp.waitForFunction(() => !document.getElementById('daily-play').disabled, null, { timeout: 8000 });
  ok((await mp.textContent('#daily-date')).includes('Hoje:'), 'data de hoje na cartela');
  ok((await mp.textContent('#daily-best')).includes('primeiro recorde'), 'sem corrida ainda: incentiva o 1º recorde');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'diaria-390x844.png') });
  const esperada = await mp.evaluate(() => window.OX.socialApi().tournaments.daily().then((d) => d.seed));
  await mp.evaluate(async () => {
    window.__over = null;
    const ev = await import('/js/core/events.js');   // mesmo barramento do jogo
    ev.on('game:over', (d) => { window.__over = d; });
  });
  await mp.click('#daily-play');
  await mp.waitForFunction(() => document.body.dataset.screen === 'playing', null, { timeout: 8000 });
  ok(true, 'botão Jogar Corrida do Dia inicia a partida');
  await mp.waitForTimeout(400);
  await mp.evaluate(async () => {
    const m = await import('/js/game/game.js');
    m.forceGameOver();
  });
  await mp.waitForFunction(() => !!window.__over, null, { timeout: 8000 });
  const seedOver = await mp.evaluate(() => window.__over.seed);
  ok(seedOver === esperada, `game:over carrega a semente do dia (${seedOver})`);
  await mp.click('#screen-gameover [data-action="menu"]');
  await mp.waitForTimeout(500);
  // recorde do dia rastreado pelo servidor
  await mp.evaluate(async () => {
    const d = await window.OX.socialApi().tournaments.daily();
    await window.OX.socialApi().ranking.submitRun({
      score: 1234, seconds: 40, pickups: 6, comboMax: 3, level: 4, seed: d.seed, version: '1.0.0',
    });
  });
  await mp.click('#screen-menu [data-action="ranking"]');
  await mp.waitForSelector('#screen-ranking.active', { timeout: 8000 });
  await mp.waitForFunction(() => document.getElementById('daily-best').textContent.includes('1.234'), null, { timeout: 8000 });
  ok(true, 'recorde do dia aparece na cartela (1.234 pts)');

  /* ============ torneio sem clã ============ */
  console.log('===== TORNEIO — sem clã =====');
  await mp.click('#screen-ranking [data-action="menu"]');
  await mp.waitForTimeout(350);
  await mp.click('#btn-tournament');
  await mp.waitForSelector('#tournament-noclan', { state: 'visible', timeout: 8000 });
  ok(true, 'sem clã: tela pede para entrar em um');
  await mp.click('#tournament-noclan [data-action="clans"]');
  await mp.waitForSelector('#screen-clans.active', { timeout: 8000 });
  ok(true, 'CTA "Ver clãs" abre a tela de clãs');
  await mp.click('#screen-clans .panel-foot [data-action="clans-close"]');
  await mp.waitForTimeout(350);

  /* ============ torneio com clã ============ */
  console.log('===== TORNEIO — grupo, contribuição e recompensa =====');
  await mp.evaluate(() => window.OX.socialApi().clans.create({ nome: 'Time Teste', tag: 'TST', tipo: 'aberto' }));
  await mp.click('#btn-tournament');
  await mp.waitForSelector('#tournament-temporada', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#tournament-liga')).startsWith('Liga '), 'liga no cabeçalho');
  ok(await mp.evaluate(() => document.querySelectorAll('#tournament-group .tourn-row').length >= 9), 'grupo com 8 clãs + o seu');
  ok(await mp.evaluate(() => document.querySelector('#tournament-group .tourn-row.mine b').textContent.includes('Time Teste')), 'meu clã destacado na classificação');
  ok((await mp.textContent('#tournament-contrib')).includes('1.234'), 'corrida do dia já conta na contribuição (1.234 pts)');
  ok(await mp.isVisible('#tournament-rewards-empty'), 'nenhuma recompensa ainda: avisa que a 1ª fecha na segunda');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'torneio-390x844.png') });
  // partida válida vira contribuição
  await mp.evaluate(() => window.OX.socialApi().ranking.submitRun({
    score: 1500, seconds: 60, pickups: 8, comboMax: 4, level: 5, version: '1.0.0',
  }));
  await mp.click('#screen-tournament [data-action="tournament-close"]');
  await mp.waitForTimeout(350);
  await mp.click('#btn-tournament');
  await mp.waitForFunction(() => document.getElementById('tournament-contrib').textContent.includes('1.500'), null, { timeout: 8000 });
  ok(true, 'partida válida vira contribuição (1.500 pts)');
  // fim de temporada → resgate de moedas (uma vez só)
  const moedasAntes = await mp.evaluate(() => window.OX.getCoins());
  await mp.evaluate(() => window.OX.socialApi().tournaments.__rollover());
  await mp.click('#screen-tournament [data-action="tournament-close"]');
  await mp.waitForTimeout(350);
  await mp.click('#btn-tournament');
  await mp.waitForSelector('#tournament-rewards [data-claim-season]', { state: 'visible', timeout: 8000 });
  ok(true, 'temporada encerrada: recompensa pronta para resgatar');
  await mp.click('#tournament-rewards [data-claim-season]');
  await mp.waitForFunction(() => document.querySelector('#tournament-rewards .clan-papel')
    && document.querySelector('#tournament-rewards .clan-papel').textContent === 'Coletada', null, { timeout: 8000 });
  const moedasDepois = await mp.evaluate(() => window.OX.getCoins());
  ok(moedasDepois > moedasAntes, `resgate credita a carteira local (${moedasAntes} → ${moedasDepois})`);
  ok(await mp.evaluate(() => !document.querySelector('#tournament-rewards [data-claim-season]')), 'resgate é único (botão some)');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'resgate-390x844.png') });

  /* ============ offline ============ */
  console.log('===== TORNEIO — offline =====');
  await mp.click('#screen-tournament [data-action="tournament-close"]');
  await mp.waitForTimeout(350);
  await mp.evaluate(() => window.OX.socialApi().__setOffline(true));
  await mp.click('#btn-tournament');
  await mp.waitForSelector('#tournament-retry', { state: 'visible', timeout: 8000 });
  ok(true, 'offline: "Tentar de novo" aparece');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'offline-390x844.png') });
  await mp.evaluate(() => window.OX.socialApi().__setOffline(false));
  await mp.click('#tournament-retry');
  await mp.waitForSelector('#tournament-temporada', { state: 'visible', timeout: 8000 });
  ok(true, 'retry volta à temporada quando a rede volta');
  await mob.context.close();

  /* ============ desktop 1280x720 ============ */
  console.log('===== TORNEIO — desktop 1280x720 =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, `?social=1&debug=1${ts}`);
  const dp = desk.page;
  await dp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'DeskTop', ageBand: '18+' }));
  await dp.click('#screen-menu [data-action="ranking"]');
  await dp.waitForFunction(() => !document.getElementById('daily-play').disabled, null, { timeout: 8000 });
  await dp.screenshot({ path: path.join(SHOTS, 'diaria-1280x720.png') });
  const auditRank = await dp.evaluate(() => window.OX.auditLayout());
  ok(auditRank.ok, `audit ranking 1280x720 sem overflow (${auditRank.issues.join(' | ') || 'ok'})`);
  await dp.click('#screen-ranking [data-action="menu"]');
  await dp.waitForTimeout(350);
  await dp.evaluate(() => window.OX.socialApi().clans.create({ nome: 'Time Desktop', tag: 'DSK', tipo: 'aberto' }));
  await dp.click('#btn-tournament');
  await dp.waitForSelector('#tournament-temporada', { state: 'visible', timeout: 8000 });
  await dp.screenshot({ path: path.join(SHOTS, 'torneio-1280x720.png') });
  const auditTourn = await dp.evaluate(() => window.OX.auditLayout());
  ok(auditTourn.ok, `audit torneio 1280x720 sem overflow (${auditTourn.issues.join(' | ') || 'ok'})`);
  await desk.context.close();

  /* ============ console ============ */
  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.slice(0, 10));

  await browser.close();
  if (server) try { process.kill(server.pid); } catch { /* já morreu */ }

  console.log('\n' + '='.repeat(50));
  if (failures === 0) {
    console.log('TORNEIO FASE 5 OK — capturas em docs/captures/social-fase5/');
    process.exit(0);
  }
  console.log(`FALHAS: ${failures} — capturas em docs/captures/social-fase5/`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
