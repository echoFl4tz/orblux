/* =========================================================
   clans-ui.cjs — Playwright: Fase 4 da camada social
   • flag desligada = botão Clãs oculto e sem tela
   • sem perfil: convite "Entre na comunidade"
   • fora: busca com filtros, criar inativo sem moedas e
     ativo com saldo; formulário com erros inline; emblema
     do elenco fechado; débito de 500 moedas após criar
   • dentro: pedidos (aceitar/recusar), cargos (vice/
     rebaixar/expulsar com confirmação), editar emblema,
     sair com aviso de espera de 24 h
   • entrada: clã aberto (entra), solicitação (pedido
     enviado), só convite (botão inativo); menor de 13 não
     cria; offline com "Tentar de novo"
   • 390x844 e 1280x720 sem overflow; zero erros de console
   ========================================================= */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'social-fase4');

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
  console.log('===== CLÃS — flag desligada (?debug=1) =====');
  const off = await newPage(browser, { w: 390, h: 844 }, `?debug=1${ts}`);
  ok(!(await off.page.isVisible('#btn-clans')), 'botão Clãs oculto sem ?social=1');
  ok(await off.page.evaluate(() => document.getElementById('social-clans-open').hidden), 'atalho do clã dentro da Comunidade oculto');
  ok(!(await off.page.isVisible('#screen-clans')), 'tela dos clãs fora do fluxo');
  await off.context.close();

  /* ============ sem perfil: convite (390x844) ============ */
  console.log('===== CLÃS — convite sem perfil =====');
  const mob = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp = mob.page;
  ok(await mp.isVisible('#btn-clans'), 'botão Clãs visível com a flag');
  await mp.click('#btn-clans');
  await mp.waitForSelector('#clans-cta', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#clans-cta')).includes('Entre na comunidade'), 'sem perfil: CTA convida a entrar');
  await mp.click('#clans-cta [data-action="social"]');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'CTA abre a tela Comunidade');
  await mp.click('#screen-social [data-action="menu"]');
  await mp.waitForTimeout(350);

  /* ============ fora: busca + criar sem moedas ============ */
  console.log('===== CLÃS — busca e custo em moedas =====');
  await mp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'Chefe', ageBand: '18+' }));
  await mp.click('#btn-clans');
  await mp.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  const totalRows = await mp.evaluate(() => document.querySelectorAll('#clans-list .clan-row').length);
  ok(totalRows >= 12, `${totalRows} clãs na lista`);
  ok(await mp.isVisible('#clans-list .clan-tipo-badge'), 'tipo de entrada visível nas linhas');
  // busca filtra e limpa
  await mp.fill('#clans-search', 'orbit');
  await mp.waitForFunction(() => document.querySelectorAll('#clans-list .clan-row').length < 12);
  const filtrados = await mp.evaluate(() => document.querySelectorAll('#clans-list .clan-row').length);
  ok(filtrados >= 1 && filtrados < totalRows, `busca filtra (${filtrados} resultado(s))`);
  await mp.fill('#clans-search', '');
  await mp.waitForFunction((n) => document.querySelectorAll('#clans-list .clan-row').length === n, totalRows);
  ok(true, 'limpar busca restaura a lista');
  // sem moedas: criar inativo com aviso "ganhe jogando" (sem push de pagamento)
  ok(await mp.isDisabled('#clans-create-open'), 'sem saldo: botão Criar inativo');
  ok((await mp.textContent('#clans-create-hint')).includes('ganhe jogando'), 'aviso diz "ganhe jogando" (nunca empurra compra)');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'busca-390x844.png') });

  /* ============ criar clã com moedas + emblema ============ */
  console.log('===== CLÃS — criar com 500 moedas e emblema =====');
  await mp.evaluate(() => window.OX.addCoins(600));
  ok(await mp.evaluate(() => !document.getElementById('clans-create-open').disabled), 'wallet:changed reativa o botão Criar');
  await mp.click('#clans-create-open');
  await mp.waitForSelector('#modal-clan-create', { state: 'visible' });
  await mp.click('#clan-form-submit');   // vazio ⇒ erros inline
  await mp.waitForSelector('#clan-nome-err', { state: 'visible' });
  ok((await mp.textContent('#clan-nome-err')).length > 0 && (await mp.textContent('#clan-tag-err')).length > 0, 'nome e tag vazios: erros inline');
  await mp.fill('#clan-nome', 'Galeria Teste');
  await mp.fill('#clan-tag-input', 'GLT');
  await mp.fill('#clan-desc-input', 'Clã de validação da Fase 4.');
  await mp.click('#clan-icons .clan-pick:nth-child(3)');
  await mp.click('#clan-cores .clan-pick-cores:nth-child(4)');
  await mp.click('#clan-molduras .clan-pick:nth-child(2)');
  ok(await mp.evaluate(() => document.querySelector('#clan-cores .clan-pick-cores:nth-child(4)').getAttribute('aria-checked') === 'true'), 'cor escolhida marcada (radiogroup)');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'criar-390x844.png') });
  await mp.click('#clan-form-submit');
  await mp.waitForSelector('#clans-dentro', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#clans-nome')) === 'Galeria Teste', 'meu clã renderiza o nome');
  ok((await mp.textContent('#clans-tag')) === '[GLT]', 'tag no cabeçalho');
  ok(await mp.evaluate(() => document.getElementById('clans-emblema').dataset.moldura === '1'
    && getComputedStyle(document.getElementById('clans-emblema')).color === 'rgb(255, 107, 214)'), 'emblema escolhido no cabeçalho (moldura 1, cor da paleta)');
  ok(await mp.evaluate(() => window.OX.getCoins() === 100), 'débito local de 500 moedas após a criação (600 → 100)');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'meu-cla-390x844.png') });

  /* ============ gestão: pedidos, cargos, edição ============ */
  console.log('===== CLÃS — pedidos, cargos e edição =====');
  await mp.evaluate(async () => {
    const api = window.OX.socialApi();
    await api.clans.__botJoin();
    await api.clans.__botRequest();
  });
  await mp.click('#screen-clans .panel-foot [data-action="clans-close"]');
  await mp.waitForTimeout(350);
  await mp.click('#btn-clans');
  await mp.waitForSelector('#clans-dentro', { state: 'visible', timeout: 8000 });
  ok(await mp.evaluate(() => document.querySelectorAll('#clans-requests .clan-row').length === 1), '1 pedido de entrada na fila');
  ok(await mp.isVisible('#clans-requests-wrap'), 'lider vê a seção de pedidos');
  ok(await mp.evaluate(() => document.querySelectorAll('#clans-members .clan-row').length === 2), '2 membros (eu + bot)');
  await mp.click('#clans-requests [data-req-act="accept"]');
  await mp.waitForFunction(() => document.querySelectorAll('#clans-members .clan-row').length === 3
    && document.getElementById('clans-req-count').textContent === '0');
  ok(true, 'aceitar pedido: membro entra e fila esvazia');
  await mp.click('#clans-members [data-mem-act="promote"]');
  await mp.waitForFunction(() => [...document.querySelectorAll('#clans-members .clan-papel')].some((el) => el.textContent === 'Vice'));
  ok(true, 'promover: membro vira vice');
  await mp.click('#clans-members [data-mem-act="demote"]');
  await mp.waitForFunction(() => ![...document.querySelectorAll('#clans-members .clan-papel')].some((el) => el.textContent === 'Vice'));
  ok(true, 'rebaixar: vice volta a membro');
  await mp.click('#clans-members [data-mem-act="kick"]');
  await mp.waitForSelector('#modal-clan-confirm', { state: 'visible' });
  await mp.click('#clan-confirm-ok');
  await mp.waitForFunction(() => document.querySelectorAll('#clans-members .clan-row').length === 2);
  ok(true, 'expulsar exige confirmação e remove o membro');
  // editar emblema (líder)
  await mp.click('#clans-edit-open');
  await mp.waitForSelector('#modal-clan-create', { state: 'visible' });
  ok(await mp.isDisabled('#clan-tag-input'), 'editar: tag fica travada');
  await mp.click('#clan-cores .clan-pick-cores:nth-child(6)');
  await mp.click('#clan-form-submit');
  await mp.waitForFunction(() => getComputedStyle(document.getElementById('clans-emblema')).color === 'rgb(255, 143, 94)');
  ok(true, 'líder salva emblema novo no cabeçalho');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'gestao-390x844.png') });

  /* ============ sair: espera de 24 h ============ */
  console.log('===== CLÃS — sair do clã =====');
  await mp.click('#clans-leave');
  await mp.waitForSelector('#modal-clan-confirm', { state: 'visible' });
  await mp.click('#clan-confirm-ok');
  await mp.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  ok(await mp.isVisible('#clans-wait'), 'aviso de espera de 24 h após sair');
  ok(await mp.isDisabled('#clans-create-open'), 'criar inativo durante a espera');

  /* ============ offline com "Tentar de novo" ============ */
  console.log('===== CLÃS — offline =====');
  await mp.click('#screen-clans .panel-foot [data-action="clans-close"]');
  await mp.waitForTimeout(350);
  await mp.evaluate(() => window.OX.socialApi().__setOffline(true));
  await mp.click('#btn-clans');
  await mp.waitForSelector('#clans-retry', { state: 'visible', timeout: 8000 });
  ok(true, 'offline: "Tentar de novo" aparece');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'offline-390x844.png') });
  await mp.evaluate(() => window.OX.socialApi().__setOffline(false));
  await mp.click('#clans-retry');
  await mp.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'retry volta à lista quando a rede volta');
  await mob.context.close();

  /* ============ entrada em clã existente (perfil novo) ============ */
  console.log('===== CLÃS — entrar, solicitar e convite =====');
  const ent = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const ep = ent.page;
  await ep.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'Entrante', ageBand: '18+' }));
  await ep.click('#btn-clans');
  await ep.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  const conviteBtn = ep.locator('#clans-list .clan-row', { hasText: 'Só convite' }).first().locator('button');
  ok(await conviteBtn.isDisabled(), 'clã só convite: botão inativo');
  const solicBtn = ep.locator('#clans-list .clan-row', { hasText: 'Solicitação' }).first();
  await solicBtn.locator('button').click();
  await ep.waitForFunction(() => [...document.querySelectorAll('#clans-list .clan-row')]
    .some((li) => li.textContent.includes('Pedido enviado')));
  ok(true, 'solicitação: botão vira "Pedido enviado"');
  const abrirBtn = ep.locator('#clans-list .clan-row', { hasText: 'Aberto' }).first();
  await abrirBtn.locator('button').click();
  await ep.waitForSelector('#clans-dentro', { state: 'visible', timeout: 8000 });
  const dentroCount = Number(await ep.textContent('#clans-count'));
  ok(dentroCount >= 2, `clã aberto: entrei e a contagem inclui os membros (${dentroCount})`);
  ok(await ep.evaluate(() => document.getElementById('clans-members').textContent.includes('(você)')), 'meu nick marcado com "(você)" na lista');
  await ent.context.close();

  /* ============ menor de 13: não cria clã ============ */
  console.log('===== CLÃS — menor de 13 =====');
  const kid = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const kp = kid.page;
  await kp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'KidClan', ageBand: 'menor13' }));
  await kp.click('#btn-clans');
  await kp.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  ok(await kp.isDisabled('#clans-create-open'), 'menor de 13: criar clã inativo');
  ok((await kp.textContent('#clans-create-hint')).includes('convite'), 'motivo explicado (só por convite)');
  await kid.context.close();

  /* ============ desktop 1280x720 ============ */
  console.log('===== CLÃS — desktop 1280x720 =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, `?social=1&debug=1${ts}`);
  const dp = desk.page;
  await dp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'DeskTop', ageBand: '18+' }));
  await dp.click('#btn-clans');
  await dp.waitForSelector('#clans-fora', { state: 'visible', timeout: 8000 });
  await dp.screenshot({ path: path.join(SHOTS, 'lista-1280x720.png') });
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
    console.log('CLÃS FASE 4 OK — capturas em docs/captures/social-fase4/');
    process.exit(0);
  }
  console.log(`FALHAS: ${failures} — capturas em docs/captures/social-fase4/`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
