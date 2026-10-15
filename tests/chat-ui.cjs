/* =========================================================
   chat-ui.cjs — Playwright: Fase 3 da camada social
   • flag desligada = botão Chat oculto e sem tela
   • ?social=1 sem perfil: CTA "Entre na comunidade"
   • sala: envio inline (vazio/cooldown), mensagem de bot ao
     vivo (tempo real via onMessage), denúncia com motivos,
     bloqueio (some na hora) e desbloquear em "Bloqueados"
   • menor de 13: só frases prontas/emojis (sem texto livre)
   • offline ao abrir: "Tentar de novo" e retry volta à sala
   • mute do servidor: erro inline + link "Contestar bloqueio"
     (mailto com ID/apelido/punição — decisão §8.5)
   • 390x844, 360x640 e 1280x720 sem overflow; zero erros
   ========================================================= */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';
const SHOTS = path.join(ROOT, 'docs', 'captures', 'social-fase3');

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
  console.log('===== CHAT — flag desligada (?debug=1) =====');
  const off = await newPage(browser, { w: 390, h: 844 }, `?debug=1${ts}`);
  const op = off.page;
  ok(!(await op.isVisible('#btn-chat')), 'botão Chat oculto sem ?social=1');
  ok(await op.evaluate(() => document.getElementById('social-chat-open').hidden), 'atalho do chat dentro da Comunidade oculto');
  ok(!(await op.isVisible('#screen-chat')), 'tela do chat fora do fluxo');
  await off.context.close();

  /* ============ ?social=1 — SEM perfil (390x844) ============ */
  console.log('===== CHAT — convite sem perfil 390x844 =====');
  const mobile = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp = mobile.page;

  ok(await mp.isVisible('#btn-chat'), 'botão Chat visível com a flag');
  await mp.click('#btn-chat');
  await mp.waitForSelector('#chat-cta', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#chat-cta')).includes('Entre na comunidade'), 'sem perfil: CTA convida a entrar');
  ok(await mp.evaluate(() => document.getElementById('chat-room').hidden), 'sala escondida sem perfil');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'convite-390x844.png') });

  // CTA abre a Comunidade (Fase 1) e o chat se limpa
  await mp.click('#chat-cta [data-action="social"]');
  await mp.waitForSelector('#social-fora', { state: 'visible', timeout: 8000 });
  ok(true, 'CTA abre a tela Comunidade');
  await mp.click('#screen-social [data-action="menu"]');
  await mp.waitForTimeout(350);

  /* ============ com perfil: sala, envio, tempo real ============ */
  console.log('===== CHAT — sala, envio e tempo real =====');
  await mp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'Chatter', ageBand: '18+' }));
  await mp.click('#btn-chat');
  await mp.waitForSelector('#chat-room', { state: 'visible', timeout: 8000 });
  ok((await mp.textContent('#chat-online')).includes('online'), `contagem de online (${(await mp.textContent('#chat-online')).trim()})`);
  ok(await mp.isVisible('#chat-form'), 'composer de texto visível para 18+');
  ok(!(await mp.isVisible('#chat-quick')), 'frases prontas escondidas para 18+');

  // envio normal
  await mp.fill('#chat-input', 'Olá a todos!');
  await mp.click('#chat-send');
  await mp.waitForFunction(() => [...document.querySelectorAll('.chat-msg')].some((li) => li.textContent.includes('Olá a todos!')));
  ok(await mp.evaluate(() => [...document.querySelectorAll('.chat-msg')].some((li) => li.classList.contains('mine') && li.textContent.includes('Olá a todos!'))), 'minha mensagem aparece destacada (mine)');

  // vazio: erro inline
  await mp.fill('#chat-input', '');
  await mp.click('#chat-send');
  await mp.waitForSelector('#chat-send-error', { state: 'visible' });
  ok((await mp.textContent('#chat-send-error')).includes('Digite uma mensagem'), 'envio vazio: erro inline');
  await mp.fill('#chat-input', 'outra de imediato');
  await mp.click('#chat-send');
  ok((await mp.textContent('#chat-send-error')).includes('Espere um instante'), 'cooldown local: 2ª msg imediata é recusada inline');

  // após o cooldown, envia
  await mp.waitForTimeout(2100);
  await mp.fill('#chat-input', 'Segunda mensagem');
  await mp.click('#chat-send');
  await mp.waitForFunction(() => [...document.querySelectorAll('.chat-msg')].some((li) => li.textContent.includes('Segunda mensagem')));
  ok(await mp.evaluate(() => document.getElementById('chat-send-error').hidden), 'erro some quando o envio passa');

  // tempo real: mensagem de bot (intervalo do mock ≈ 5,5 s)
  await mp.waitForFunction(
    () => [...document.querySelectorAll('.chat-msg:not(.mine)')].length > 0,
    null, { timeout: 12000 },
  );
  ok(true, 'mensagem de outro jogador chega ao vivo (onMessage)');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'sala-390x844.png') });

  /* ============ denúncia ============ */
  console.log('===== CHAT — denúncia e bloqueio =====');
  const botUser = await mp.evaluate(() => document.querySelector('.chat-msg:not(.mine)').dataset.user);
  await mp.locator('.chat-msg:not(.mine) .chat-msg-act').first().click();
  await mp.waitForSelector('#modal-chat-actions', { state: 'visible' });
  ok((await mp.textContent('#chat-actions-title')).startsWith('Mensagem de'), 'modal de ações com o apelido');
  await mp.screenshot({ path: path.join(SHOTS, 'acoes-390x844.png') });
  await mp.click('#chat-report-open');
  await mp.waitForSelector('#chat-actions-reasons', { state: 'visible' });
  await mp.click('[data-reason="spam"]');
  await mp.waitForFunction(() => !!(document.querySelector('.toast') && document.querySelector('.toast').textContent.includes('Denúncia enviada')));
  ok(true, 'denúncia enviada com motivo (toasts confirma)');
  await mp.waitForFunction(() => document.getElementById('modal-chat-actions').hidden);

  /* ============ bloqueio + lista de bloqueados ============ */
  await mp.locator('.chat-msg:not(.mine) .chat-msg-act').first().click();
  await mp.waitForSelector('#modal-chat-actions', { state: 'visible' });
  await mp.click('#chat-block-go');
  await mp.waitForSelector('#chat-actions-block', { state: 'visible' });
  ok((await mp.textContent('#chat-block-nick')).length > 0, 'confirmação de bloqueio mostra o apelido');
  await mp.click('#chat-block-confirm');
  await mp.waitForFunction(() => document.getElementById('modal-chat-actions').hidden
    && document.getElementById('chat-blocked-count').textContent === '1');
  ok(await mp.evaluate((id) => ![...document.querySelectorAll('.chat-msg')].some((li) => li.dataset.user === id), botUser), 'mensagens do jogador bloqueado somem na hora');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'bloqueado-390x844.png') });

  await mp.click('#chat-blocked');
  await mp.waitForSelector('#modal-chat-blocked', { state: 'visible' });
  ok(await mp.evaluate(() => document.querySelectorAll('#chat-blocked-list li').length === 1), 'lista de bloqueados com 1 jogador');
  await mp.click('#chat-blocked-list [data-unblock]');
  await mp.waitForFunction(() => document.getElementById('chat-blocked-count').textContent === '0');
  ok(await mp.isVisible('#chat-blocked-empty'), 'desbloquear zera a lista (vazia)');
  await mp.click('#chat-blocked-close');
  await mp.waitForFunction(() => document.getElementById('modal-chat-blocked').hidden);

  /* ============ offline ao abrir ============ */
  console.log('===== CHAT — offline com "Tentar de novo" =====');
  await mp.click('#screen-chat .panel-foot [data-action="chat-close"]');
  await mp.waitForTimeout(350);
  ok(await mp.evaluate(() => document.body.dataset.screen === 'menu'), 'fechar volta ao menu');
  await mp.evaluate(() => window.OX.socialApi().__setOffline(true));
  await mp.click('#btn-chat');
  await mp.waitForSelector('#chat-retry', { state: 'visible', timeout: 8000 });
  ok(await mp.isVisible('#chat-retry'), 'offline: "Tentar de novo" aparece');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: path.join(SHOTS, 'offline-390x844.png') });
  await mp.evaluate(() => window.OX.socialApi().__setOffline(false));
  await mp.click('#chat-retry');
  await mp.waitForSelector('#chat-room', { state: 'visible', timeout: 8000 });
  ok(true, 'retry volta à sala quando a rede volta');

  // audit com a sala aberta
  const audit390 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit390.ok, `audit 390x844 sem overflow (${audit390.issues.join(' | ') || 'ok'})`);
  await mp.setViewportSize({ width: 360, height: 640 });
  await mp.waitForTimeout(300);
  const audit360 = await mp.evaluate(() => window.OX.auditLayout());
  ok(audit360.ok, `audit 360x640 sem overflow (${audit360.issues.join(' | ') || 'ok'})`);
  await mp.screenshot({ path: path.join(SHOTS, 'sala-360x640.png') });
  await mobile.context.close();

  /* ============ menor de 13: só frases prontas ============ */
  console.log('===== CHAT — menor de 13 (só frases prontas) =====');
  const kid = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const kp = kid.page;
  await kp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'KidPlayer', ageBand: 'menor13' }));
  await kp.click('#btn-chat');
  await kp.waitForSelector('#chat-quick', { state: 'visible', timeout: 8000 });
  ok(!(await kp.isVisible('#chat-form')), 'menor de 13: campo de texto livre OCULTO');
  const nChips = await kp.evaluate(() => document.querySelectorAll('#chat-quick-chips .chip-btn').length);
  ok(nChips >= 10, `${nChips} frases/emojis no catálogo`);
  await kp.click('#chat-quick-chips .chip-btn');
  await kp.waitForFunction(() => [...document.querySelectorAll('.chat-msg.mine')].length === 1);
  ok(true, 'frase pronta enviada por 1 toque');
  await kp.waitForTimeout(350);
  await kp.screenshot({ path: path.join(SHOTS, 'menor13-390x844.png') });
  await kid.context.close();

  /* ============ mute + contestação (mailto) ============ */
  console.log('===== CHAT — mute com "Contestar bloqueio" =====');
  const mt1 = await newPage(browser, { w: 390, h: 844 }, `?social=1&debug=1${ts}`);
  const mp2 = mt1.page;
  await mp2.evaluate(async () => {
    await window.OX.socialApi().__seedProfile({ nickname: 'Muted', ageBand: '18+' });
    // punição do servidor (mock): silenciado por 1 h
    window.OX.socialApi().state.profile.mutedUntil = Date.now() + 3600e3;
  });
  await mp2.click('#btn-chat');
  await mp2.waitForSelector('#chat-room', { state: 'visible', timeout: 8000 });
  await mp2.fill('#chat-input', 'teste sob silenciamento');
  await mp2.click('#chat-send');
  await mp2.waitForSelector('#chat-send-error', { state: 'visible' });
  ok((await mp2.textContent('#chat-send-error')).length > 0, 'mute: erro inline sob o campo');
  ok(await mp2.isVisible('#chat-appeal'), 'link "Contestar bloqueio" visível no erro de mute');
  const appealHref = decodeURIComponent(await mp2.getAttribute('#chat-appeal', 'href') || '');
  ok(appealHref.startsWith('mailto:'), 'contestação abre o e-mail (mailto)');
  ok(appealHref.includes('ID da conta:') && appealHref.includes('Muted') && appealHref.includes('Punição:'),
    'mailto leva ID, apelido e punição');
  await mp2.waitForTimeout(350);
  await mp2.screenshot({ path: path.join(SHOTS, 'contestacao-390x844.png') });
  // sem punição: envio passa e o link some
  await mp2.evaluate(() => { window.OX.socialApi().state.profile.mutedUntil = 0; });
  await mp2.fill('#chat-input', 'agora posso falar');
  await mp2.click('#chat-send');
  await mp2.waitForTimeout(350);
  ok(await mp2.evaluate(() => document.getElementById('chat-appeal').hidden), 'sem punição o link fica oculto');
  await mt1.context.close();

  /* ============ desktop 1280x720 ============ */
  console.log('===== CHAT — desktop 1280x720 =====');
  const desk = await newPage(browser, { w: 1280, h: 720 }, `?social=1&debug=1${ts}`);
  const dp = desk.page;
  await dp.evaluate(() => window.OX.socialApi().__seedProfile({ nickname: 'DeskTop', ageBand: '18+' }));
  await dp.click('#btn-chat');
  await dp.waitForSelector('#chat-room', { state: 'visible', timeout: 8000 });
  await dp.screenshot({ path: path.join(SHOTS, 'sala-1280x720.png') });
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
    console.log('CHAT FASE 3 OK — capturas em docs/captures/social-fase3/');
    process.exit(0);
  }
  console.log(`FALHAS: ${failures} — capturas em docs/captures/social-fase3/`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
