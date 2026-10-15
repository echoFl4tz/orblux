/* =========================================================
   Regressão da INTERFACE DE MOEDAS (Etapa 4) — Playwright
   Afirma:
     (1) chip de saldo + botão da diária no menu (novato vê +20)
     (2) resgatar credita, some o botão e persiste no mesmo dia
     (3) modal discreto da diária no boot ao virar o dia
         (oferece 25, resgata, sequência vira 2)
     (4) Configurações → Moedas: saldo, texto "virtuais, sem
         valor monetário" e extrato local com lançamentos
     (5) loja com DOIS caminhos: "600 moedas" PRIMEIRO, Play
         depois; progresso honesto (100% / "faltam N")
     (6) compra com moedas debita, grava source:'coins' e
         mostra toast; sem saldo = toast informativo, sem
         empurrão para pagar e sem concessão
     (7) bloco "Você ganhou N moedas" no fim de jogo
     (8) 390x844 e 1280x720 sem overflow; zero erros de console
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/coins-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'etapa4');

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

  /* ============ 390x844 (mobile) ============ */
  console.log('===== MOEDAS UI — 390x844 (?debug=1) =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, tag);
  const mp = mobile.page;

  // (1) chip + diária para novato
  ok((await mp.textContent('#menu-coins')).trim() === '0', 'chip de moedas começa em 0');
  ok(await mp.isVisible('#btn-daily'), 'botão da recompensa diária visível para novato');
  const lbl = await mp.textContent('#btn-daily-label');
  ok(lbl.includes('+20'), `rótulo promete +20 (${lbl.trim()})`);
  await mp.screenshot({ path: path.join(SHOTS, 'menu-390x844.png') });

  // (2) resgate pelo botão
  await mp.click('#btn-daily');
  await mp.waitForFunction(() => document.getElementById('menu-coins').textContent.trim() === '20');
  ok(await mp.evaluate(() => window.OX.getCoins()) === 20, 'resgate credita 20 moedas');
  ok(!(await mp.isVisible('#btn-daily')), 'botão some depois de resgatar');
  const toast1 = await mp.textContent('#toasts');
  ok(toast1.includes('Recompensa diária') && toast1.includes('dia 1'), 'toast: recompensa diária, dia 1');

  // (3) vira o dia -> modal discreto no boot
  await mp.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const p = (n) => String(n).padStart(2, '0');
    window.OX.state.wallet.lastClaimDate = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    window.OX.saveWallet();
  });
  await mp.reload({ waitUntil: 'networkidle' });
  await mp.waitForFunction(() => !!window.OX);
  await mp.waitForSelector('#modal-daily:not([hidden])', { timeout: 8000 });
  const dtext = await mp.textContent('#modal-daily');
  ok(dtext.includes('25 moedas'), `modal oferece 25 moedas no dia 2 (${dtext.match(/vale \d+ moedas/)?.[0] || '—'})`);
  ok(dtext.includes('sequência'), 'modal fala em sequência (sem contagem regressiva)');
  await mp.waitForTimeout(450);                       // espera o fadeIn do modal
  await mp.screenshot({ path: path.join(SHOTS, 'modal-diaria-390x844.png') });
  await mp.click('#daily-claim');
  await mp.waitForFunction(() => window.OX.getCoins() === 45);
  ok(await mp.evaluate(() => window.OX.state.wallet.streak) === 2, 'sequência vira 2');
  ok(await mp.evaluate(() => document.getElementById('modal-daily').hidden), 'modal fecha após resgatar');

  // (4) saldo no chip + Configurações → Moedas
  await mp.evaluate(() => window.OX.addCoins(600, 'debug'));
  const balApos = await mp.evaluate(() => window.OX.getCoins());      // 45 (diárias) + 600
  const balTxt = await mp.evaluate((n) => n.toLocaleString('pt-BR'), balApos);
  ok((await mp.textContent('#menu-coins')).trim() === balTxt, `chip reflete o saldo (${balTxt})`);
  await mp.click('[data-action="settings"]');
  await mp.waitForTimeout(350);                       // visibility troca em 50% da transição
  ok(await mp.isVisible('#group-moedas'), 'grupo "Moedas" no configurações');
  ok((await mp.textContent('#set-coins')).trim() === balTxt, `saldo no settings = ${balTxt}`);
  const stTxt = await mp.textContent('#group-moedas');
  ok(stTxt.includes('virtuais, sem valor monetário'), 'avisa: virtuais, sem valor monetário');
  ok(stTxt.includes('não se compram'), 'avisa: não se compram');
  await mp.click('#extrato summary');
  const nLedger = await mp.evaluate(() => document.querySelectorAll('#set-ledger li').length);
  ok(nLedger >= 3, `extrato lista ${nLedger} lançamentos (>= 3)`);
  ok(await mp.evaluate(() => (document.querySelector('#set-ledger li')?.textContent || '').includes('+600')),
    'extrato mais recente = +600');
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(SHOTS, 'config-moedas-390x844.png') });
  await mp.click('#screen-settings [data-action="menu"]');

  // (5) loja: dois caminhos + progresso
  await mp.click('[data-action="skins"]');
  await mp.waitForSelector('.skin-card[data-id="brasa_neon"]');
  await mp.click('.skin-card[data-id="brasa_neon"]');
  await mp.waitForSelector('#shop-detail:not([hidden])');
  const btns = await mp.$$eval('#detail-actions > *', (els) => els.map((e) => e.textContent.trim()));
  const iCoin = btns.findIndex((t) => t.includes('600 moedas'));
  const iPlay = btns.findIndex((t) => t.includes('Comprar por') && !t.includes('600 moedas'));
  ok(iCoin !== -1, `botão de moedas presente (${btns.join(' | ')})`);
  ok(iPlay !== -1, 'caminho Play presente como alternativa');
  ok(iCoin !== -1 && (iPlay === -1 || iCoin < iPlay), 'caminho grátis (moedas) vem ANTES do Play');
  const prog = await mp.textContent('#detail-coins');
  ok(prog.includes('de 600') && prog.includes('já pode comprar'), `progresso: ${prog.trim()}`);
  ok((await mp.getAttribute('#coins-progress-fill', 'style') || '').includes('100%'), 'barra em 100%');
  await mp.waitForTimeout(450);
  await mp.screenshot({ path: path.join(SHOTS, 'loja-detalhe-390x844.png') });

  // (6a) compra com moedas funciona
  await mp.click('[data-shop="buy-coins"]');
  await mp.waitForFunction(() => window.OX.state.skins.owned.brasa_neon
    && window.OX.state.skins.owned.brasa_neon.source === 'coins');
  const balDepois = await mp.evaluate(() => window.OX.getCoins());
  ok(balDepois === balApos - 600, `600 debitados (${balApos} -> ${balDepois})`);
  ok((await mp.textContent('#toasts')).includes('Skin comprada'), 'toast "Skin comprada!"');
  const persist = await mp.evaluate(() => JSON.parse(localStorage.getItem('pn_skins')).owned.brasa_neon);
  ok(persist && persist.source === 'coins', 'source:coins gravado no pn_skins');
  ok(await mp.evaluate(() => document.querySelectorAll('#detail-actions [data-shop="equip"]').length === 1),
    'detalhe vira "Equipar" após comprar');

  // (6b) sem saldo: progresso honesto e sem empurrão para pagar
  await mp.click('[data-shop="back"]');
  await mp.waitForSelector('.skin-card[data-id="oceano"]');
  await mp.click('.skin-card[data-id="oceano"]');
  await mp.waitForSelector('#shop-detail:not([hidden])');
  const prog2 = await mp.textContent('#detail-coins');
  const faltaEsperada = 600 - balDepois;
  ok(prog2.includes(`faltam ${faltaEsperada}`) && prog2.includes('Ganhe jogando'),
    `progresso honesto: ${prog2.trim()}`);
  await mp.click('[data-shop="buy-coins"]');
  await mp.waitForFunction(() => (document.getElementById('toasts')?.textContent || '').includes('insuficientes'));
  ok(await mp.evaluate(() => window.OX.getCoins()) === balDepois, 'saldo intacto após tentativa sem saldo');
  ok(await mp.evaluate(() => !window.OX.state.skins.owned.oceano), 'skin NÃO concedida sem saldo');
  const toastTxt = await mp.textContent('#toasts');
  const depois = toastTxt.slice(toastTxt.indexOf('insuficientes'));
  ok(!/Play|dinheiro|R\$|compre/.test(depois), 'toast só informa quanto falta (sem empurrão para pagar)');
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(SHOTS, 'loja-faltam-390x844.png') });

  // (7) bloco do fim de jogo
  await mp.evaluate(() => {
    window.OX.screen('gameover');
    document.getElementById('go-score').textContent = '2480';
    window.OX.emit('wallet:run-coins', { coins: 42 });
  });
  await mp.waitForTimeout(350);                       // visibility troca em 50% da transição (0.2s)
  ok(await mp.isVisible('#go-coins'), 'linha "Você ganhou" aparece com o payload');
  ok((await mp.textContent('#go-coins')).includes('42'), 'valor 42 exibido');
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(SHOTS, 'fim-de-jogo-390x844.png') });
  await mp.evaluate(() => window.OX.emit('wallet:run-coins', {}));
  ok(!(await mp.isVisible('#go-coins')), 'sem payload não há linha (nada inventado)');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'sem overflow em 390px');
  await mobile.context.close();

  /* ============ 1280x720 (desktop) ============ */
  console.log('===== MOEDAS UI — 1280x720 (?debug=1) =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, tag);
  const dp = desk.page;
  ok(await dp.isVisible('#coin-chip'), 'chip no desktop');
  await dp.screenshot({ path: path.join(SHOTS, 'menu-1280x720.png') });
  await dp.evaluate(() => window.OX.addCoins(600, 'debug'));
  await dp.click('[data-action="skins"]');
  await dp.waitForSelector('.skin-card[data-id="brasa_neon"]');
  await dp.click('.skin-card[data-id="brasa_neon"]');
  await dp.waitForSelector('#shop-detail:not([hidden])');
  const btnsDesk = await dp.$$eval('#detail-actions > *', (els) => els.map((e) => e.textContent.trim()));
  ok(btnsDesk.some((t) => t.includes('600 moedas'))
    && btnsDesk.some((t) => t.includes('Comprar por') && !t.includes('600 moedas')),
    `desktop: dois caminhos (${btnsDesk.join(' | ')})`);
  ok(await dp.evaluate(() => document.documentElement.scrollWidth <= 1281), 'sem overflow em 1280px');
  await dp.waitForTimeout(450);
  await dp.screenshot({ path: path.join(SHOTS, 'loja-detalhe-1280x720.png') });
  await desk.context.close();

  await browser.close();

  /* ============ erros de console ============ */
  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'MOEDAS UI OK' : `FALHAS: ${failures}`} — capturas em docs/captures/etapa4/`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
