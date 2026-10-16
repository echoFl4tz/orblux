/* =========================================================
   Regressão da ECONOMIA na interface (Etapa 2) — Playwright
   Afirma:
     (1) missões do dia têm dificuldade e o chip mostra os
         valores NOVOS em moedas (25/40/60) — nunca "+100"
     (2) concluir missão CREDITA moedas de verdade e mostra
         toast com o valor em moedas
     (3) partida começa com pontuação 0 (fim do bônus de missão)
     (4) OX.economy publicado em ?debug=1
     (5) 390x844 e 1280x720 sem overflow; zero erros de console
     (6) preços em moedas do catálogo ao vivo (600/1500/3500/6000)
     (7) moedas da PARTIDA ligadas: >= 10 s credita e mostra o ganho,
         partida curta não paga (nunca "ganhou 0") + barras de
         progresso do fim de jogo (próxima skin e missões)
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/economy-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'etapa2');

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
  const tag = `?debug=1&t=${Date.now()}`;

  /* ============ 390x844 ============ */
  console.log('===== ECONOMIA — 390x844 (?debug=1) =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, tag);
  const mp = mobile.page;

  // (4) constantes publicadas
  const eco = await mp.evaluate(() => (window.OX && OX.economy ? {
    facil: OX.economy.MISSION_COINS.facil,
    medio: OX.economy.MISSION_COINS.medio,
    dificil: OX.economy.MISSION_COINS.dificil,
    cap: OX.economy.CAP_POR_PARTIDA,
    pickup: OX.economy.COINS_PICKUP,
  } : null));
  ok(eco && eco.facil === 25 && eco.medio === 40 && eco.dificil === 60, 'OX.economy publicado (25/40/60)');
  ok(eco && eco.cap === 120 && eco.pickup === false, 'teto 120 e pulsos não pagam moedas avulsas');

  // (1) missões do dia com dificuldade e chips NOVOS
  const missions = await mp.evaluate(() => OX.state.missions.list.map((m) => ({ id: m.id, d: m.d })));
  ok(missions.length === 3, '3 missões do dia');
  ok(missions.every((m) => ['facil', 'medio', 'dificil'].includes(m.d)), 'todas com dificuldade definida');
  const chips = await mp.evaluate(() => [...document.querySelectorAll('.mission-reward')].map((n) => n.textContent.trim()));
  const esperado = missions.map((m) => ({ facil: 25, medio: 40, dificil: 60 }[m.d]));
  ok(chips.length === 3 && chips.every((t, i) => t === `+${esperado[i]}`), `chips mostram moedas (${chips.join(', ')})`);
  ok(!chips.includes('+100'), 'nenhum chip de bônus legado (+100)');

  // (2) concluir TODAS credita moedas de verdade
  const before = await mp.evaluate(() => OX.getCoins());
  await mp.evaluate(() => {
    for (const m of OX.state.missions.list) {
      OX.emit('mission:live', { field: m.field, value: m.target, mode: m.mode });
    }
  });
  const after = await mp.evaluate(() => OX.getCoins());
  const total = esperado.reduce((a, b) => a + b, 0);
  ok(after - before === total, `concluir 3 missões credita ${total} moedas (${before} -> ${after})`);
  const toasts = await mp.evaluate(() => document.getElementById('toasts')?.textContent || '');
  ok(toasts.includes('Missão concluída') && toasts.includes('moedas'), 'toast diz "Missão concluída! ... N moedas"');
  const stored = await mp.evaluate(() => JSON.parse(localStorage.getItem('pn_wallet')).d.coins);
  ok(stored === after, 'saldo persistido no pn_wallet');

  // (6) preços em moedas do catálogo vivem na página (nunca em dinheiro)
  const precos = await mp.evaluate(async () => {
    const m = await import('/js/game/skins.js');
    const pagas = m.SKINS.filter((s) => s.tier !== 'free');
    return {
      total: pagas.length,
      A: pagas.filter((s) => s.coinPrice === 600).length,
      B: pagas.filter((s) => s.coinPrice === 1500).length,
      C: pagas.filter((s) => s.coinPrice === 3500).length,
      L: pagas.filter((s) => s.coinPrice === 6000).length,
      classic: m.SKINS.find((s) => s.id === 'classic').coinPrice,
      inteiros: pagas.every((s) => Number.isInteger(s.coinPrice) && s.coinPrice > 0),
    };
  });
  ok(precos && precos.total === 20 && precos.A === 8 && precos.B === 8
    && precos.C === 3 && precos.L === 1 && precos.inteiros,
    'catálogo vivo: 20 pagas — 8×600, 8×1.500, 3×3.500, 1×6.000');
  ok(precos.classic === null, 'Clássica sem preço de moedas (grátis)');

  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'menu sem overflow em 390px');
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(SHOTS, 'missoes-moedas-390x844.png') });

  // (3) partida começa com pontuação 0 (sem bônus legado)
  await mp.evaluate(() => OX.start({ tutorial: false }));
  ok(await mp.evaluate(() => OX.game.score) === 0, 'partida começa com 0 pontos (sem bônus de missão)');

  // (7) moedas da PARTIDA ligadas (ECONOMIA.md): 12 s paga e mostra o ganho
  await mp.evaluate(() => { OX.game.player.invuln = 999; OX.advance(12); OX.endRun(); });
  await mp.waitForSelector('#screen-gameover.active');
  const goCoins = await mp.evaluate(() => {
    const box = document.getElementById('go-coins');
    return {
      hidden: box.hidden,
      val: Number((document.getElementById('go-coins-value').textContent || '0').replace(/\D/g, '')),
    };
  });
  ok(!goCoins.hidden && goCoins.val > 0, `partida de 12 s credita moedas e mostra o ganho (${goCoins.val})`);
  const prog = await mp.evaluate(() => ({
    hidden: document.getElementById('go-progress').hidden,
    skin: document.getElementById('go-prog-skin').hidden,
    skinLabel: document.getElementById('go-prog-skin-label').textContent,
    misFrac: document.getElementById('go-prog-missions-frac').textContent,
  }));
  ok(!prog.hidden && !prog.skin && /Próxima skin/.test(prog.skinLabel),
    `barra da próxima skin (${prog.skinLabel})`);
  ok(/\/3$/.test(prog.misFrac), `barra das missões do dia (${prog.misFrac})`);
  // partida curta (< 10 s) não paga e NUNCA mostra "Você ganhou 0 moedas"
  await mp.evaluate(() => { OX.start({ tutorial: false }); OX.advance(5); OX.endRun(); });
  await mp.waitForTimeout(200);
  ok(await mp.evaluate(() => document.getElementById('go-coins').hidden),
    'partida de 5 s não paga (sem bloco "ganhou 0 moedas")');
  await mobile.context.close();

  /* ============ 1280x720 ============ */
  console.log('===== ECONOMIA — 1280x720 (?debug=1) =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, tag);
  const dp = desk.page;
  const chipsDesk = await dp.evaluate(() => [...document.querySelectorAll('.mission-reward')].map((n) => n.textContent.trim()));
  ok(chipsDesk.length === 3 && !chipsDesk.includes('+100'), `chips no desktop (${chipsDesk.join(', ')})`);
  ok(await dp.evaluate(() => document.documentElement.scrollWidth <= 1281), 'menu sem overflow em 1280px');
  await dp.waitForTimeout(300);
  await dp.screenshot({ path: path.join(SHOTS, 'missoes-moedas-1280x720.png') });
  await desk.context.close();

  await browser.close();

  /* ============ erros de console ============ */
  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'ECONOMIA UI OK' : `FALHAS: ${failures}`} — capturas em docs/captures/etapa2/`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
