/* =========================================================
   social-entry-ui.cjs — Playwright: Fase 1 da camada social
   • flag SOCIAL_ENABLED desligada = botão e grupo ocultos
   • ?social=1 (só localhost) liga a Comunidade
   • fluxo completo: idade → termos → apelido/país → código →
     perfil; sair; recuperar por código; apagar conta
   • 390x844, 1280x720 e 360x640 sem overflow; zero erros
   ========================================================= */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'social-fase1');

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
  console.log('===== SOCIAL — flag desligada (?debug=1 sem ?social=1) =====');
  const off = await newPage(browser, { w: 390, h: 844 }, `?debug=1${ts}`);
  const op = off.page;
  ok(!(await op.isVisible('#btn-social')), 'botão Comunidade oculto sem ?social=1');
  await op.click('[data-action="settings"]');
  await op.waitForTimeout(350);
  ok(!(await op.isVisible('#group-social')), 'grupo Comunidade oculto em Configurações');
  ok(!(await op.isVisible('#screen-social')), 'tela Comunidade não existe na produção');
  await off.context.close();

  /* ============ flag LIGADA — 390x844 ============ */
  console.log('===== SOCIAL — fluxo completo 390x844 (?social=1) =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp = mobile.page;

  ok(await mp.isVisible('#btn-social'), 'botão Comunidade visível com ?social=1');
  await mp.click('#btn-social');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'tela Comunidade abre no passo "fora"');
  ok((await mp.textContent('#social-fora')).includes('opcional'), 'introdução diz que entrar é opcional');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'comunidade-fora-390x844.png') });

  // passo idade
  await mp.click('#social-start');
  await mp.waitForSelector('#social-idade', { state: 'visible' });
  ok(await mp.evaluate(() => document.getElementById('social-age-next').disabled), 'Continuar bloqueado antes da escolha');
  await mp.click('[data-age="13a17"]');
  ok(await mp.getAttribute('[data-age="13a17"]', 'aria-checked') === 'true', 'idade 13-17 marcada (aria-checked)');
  const nota = await mp.textContent('#social-age-note');
  ok(nota.includes('supervisão') && await mp.isVisible('#social-age-note'), `nota de menor visível (${nota.slice(0, 30)}…)`);
  await mp.screenshot({ path: path.join(SHOTS, 'idade-390x844.png') });
  await mp.click('#social-age-next');

  // passo termos
  await mp.waitForSelector('#social-termos', { state: 'visible' });
  ok((await mp.textContent('#social-termos')).includes('Termos de Uso da Comunidade'), 'passo de termos cita os Termos');
  ok(await mp.getAttribute('#social-termos a', 'target') === '_blank', 'link dos termos abre em nova aba');
  ok(await mp.evaluate(() => document.getElementById('social-terms-next').disabled), 'aceite bloqueado antes do checkbox');
  await mp.click('#social-terms-check');
  ok(await mp.evaluate(() => !document.getElementById('social-terms-next').disabled), 'aceite libera após o checkbox');
  await mp.click('#social-terms-next');

  // passo perfil
  await mp.waitForSelector('#social-perfil', { state: 'visible' });
  ok((await mp.inputValue('#social-nick')) === 'Teste', 'apelido pré-preenchido com o do dispositivo');
  await mp.fill('#social-nick', 'NeonTester');
  await mp.selectOption('#social-country', 'PT');
  await mp.click('#social-enter');

  // código de recuperação (uma vez)
  await mp.waitForSelector('#social-codigo', { state: 'visible', timeout: 8000 });
  const codeExibido = (await mp.textContent('#social-code-value')).trim();
  ok(/^[A-Z2-9]{12}$/.test(codeExibido), `código de 12 caracteres sem 0/O/1/I (${codeExibido})`);
  const codeMock = await mp.evaluate(() => window.OX.socialApi().state.recoveryCode);
  ok(codeExibido === codeMock, 'código exibido é o do "servidor" (mock)');
  await mp.screenshot({ path: path.join(SHOTS, 'codigo-390x844.png') });
  await mp.click('#social-code-ok');

  // perfil dentro
  await mp.waitForSelector('#social-dentro', { state: 'visible' });
  ok((await mp.textContent('#social-nick-out')).trim() === 'NeonTester', 'apelido social salvo');
  ok((await mp.textContent('#social-age-out')).includes('13 a 17'), 'faixa de idade registrada');
  ok((await mp.textContent('#social-country-out')).includes('Portugal'), 'país registrado');
  ok(!(await mp.isVisible('#social-code-view')), 'código recolhido por padrão (privacidade)');
  await mp.screenshot({ path: path.join(SHOTS, 'perfil-dentro-390x844.png') });

  // revelar/ocultar código
  await mp.click('#social-show-code');
  await mp.waitForSelector('#social-code-view', { state: 'visible' });
  ok((await mp.textContent('#social-code-view')).trim() === codeMock, 'revelar mostra o mesmo código');
  ok(await mp.getAttribute('#social-show-code', 'aria-expanded') === 'true', 'aria-expanded vira true');
  await mp.click('#social-show-code');
  ok(!(await mp.isVisible('#social-code-view')), 'ocultar recolhe o código');

  // status em Configurações
  await mp.click('#screen-social [data-action="menu"]');
  await mp.waitForTimeout(350);
  await mp.click('[data-action="settings"]');
  await mp.waitForTimeout(350);
  ok((await mp.textContent('#social-status')).includes('Na comunidade como NeonTester'), 'status no Configurações: dentro');
  await mp.screenshot({ path: path.join(SHOTS, 'config-comunidade-390x844.png') });
  await mp.click('#screen-settings [data-action="menu"]');
  await mp.waitForTimeout(350);

  // sair
  await mp.click('#btn-social');
  await mp.waitForSelector('#social-dentro', { state: 'visible' });
  await mp.click('#social-signout');
  await mp.waitForSelector('#social-fora', { state: 'visible' });
  ok(true, 'sair volta para o passo "fora"');

  // recuperar: código errado fica inline; certo entra
  await mp.click('#social-recover-open');
  await mp.waitForSelector('#social-recuperar', { state: 'visible' });
  await mp.fill('#social-recover-input', 'XXXXXXXXXXXX');
  await mp.click('#social-recover-go');
  await mp.waitForFunction(() => (document.getElementById('social-recover-error').textContent || '').trim().length > 0);
  ok(await mp.isVisible('#social-recuperar'), 'código errado: erro inline, sem sair do passo');
  await mp.fill('#social-recover-input', codeMock);
  await mp.click('#social-recover-go');
  await mp.waitForSelector('#social-dentro', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#social-nick-out')).trim() === 'NeonTester', 'recuperar por código devolve o perfil');

  // apagar conta: modal de confirmação e exclusão final
  await mp.click('#social-delete');
  await mp.waitForSelector('#modal-social-delete', { state: 'visible' });
  ok((await mp.textContent('#modal-social-delete')).includes('não pode ser desfeito'), 'modal explica que é irreversível');
  await mp.screenshot({ path: path.join(SHOTS, 'apagar-conta-390x844.png') });
  await mp.click('#sd-cancel');
  ok(!(await mp.isVisible('#modal-social-delete')), 'cancelar fecha o modal sem apagar');
  await mp.click('#social-delete');
  await mp.waitForSelector('#modal-social-delete', { state: 'visible' });
  await mp.click('#sd-confirm');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(await mp.evaluate(async () => (await window.OX.socialApi().profile.get()) === null), 'conta apagada no "servidor" (mock)');
  await mp.click('#social-start');
  await mp.waitForSelector('#social-idade', { state: 'visible' });
  ok(await mp.evaluate(() => document.getElementById('social-age-next').disabled), 'após apagar, formulário começa do zero');

  // layout 390x844 e 360x640
  const audit390 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit390.ok, `audit 390x844 sem overflow (${audit390.issues.join(' | ') || 'ok'})`);
  await mp.setViewportSize({ width: 360, height: 640 });
  await mp.waitForTimeout(300);
  const audit360 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit360.ok, `audit 360x640 sem overflow (${audit360.issues.join(' | ') || 'ok'})`);
  await mp.screenshot({ path: path.join(SHOTS, 'comunidade-360x640.png') });

  /* ============ desktop 1280x720 ============ */
  console.log('===== SOCIAL — desktop 1280x720 =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, `?social=1&debug=1${ts}`);
  const dp = desk.page;
  await dp.screenshot({ path: path.join(SHOTS, 'menu-1280x720.png') });
  await dp.click('#btn-social');
  await dp.waitForSelector('#social-fora', { state: 'visible' });
  await dp.screenshot({ path: path.join(SHOTS, 'comunidade-fora-1280x720.png') });
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
    console.log('SOCIAL FASE 1 OK — capturas em docs/captures/social-fase1/');
    process.exit(0);
  }
  console.log(`FALHAS: ${failures} — capturas em docs/captures/social-fase1/`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
