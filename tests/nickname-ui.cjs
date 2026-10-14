/* =========================================================
   Regressão da INTERFACE do apelido (ORBLUX) — Playwright
   Afirma, em 360x640 (sem overflow) e 390x844:
     (1) 1ª abertura mostra o modal "Escolha seu apelido"
     (2) "Pular por agora" mantém o apelido gerado JogadorNNNN
     (3) salvar "NeoPilot" persiste após recarregar
     (4) editar em Configurações atualiza menu, game over e ranking
     (5) apagar progresso volta a perguntar o apelido
     (6) sem erros no console; nenhum overflow horizontal
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/nickname-ui.cjs
   Requer: playwright-chromium (npm i -D playwright-chromium)
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';

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

async function newPage(browser, size, { seedProfile = false, profile } = {}) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, locale: 'pt-BR',
  });
  await context.addInitScript(`try {
    localStorage.setItem('pn_consent','true');
    localStorage.setItem('pn_tutorial_done','true');
    ${seedProfile ? `localStorage.setItem('pn_profile', ${JSON.stringify(JSON.stringify(profile))});` : ''}
  } catch(e){}`);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  return { context, page, errors };
}

const settled = (page, ms = 350) => page.waitForTimeout(ms);

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

(async () => {
  const chromium = loadChromium();
  const serverProc = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const SIZES = [{ w: 360, h: 640 }, { w: 390, h: 844 }];

  for (const size of SIZES) {
    console.log(`\n===== ${size.w}x${size.h} =====`);

    // ---------- 1) 1ª abertura: modal aparece + validação em tempo real ----------
    {
      const { context, page, errors } = await newPage(browser, size);
      await settled(page, 1400);
      ok(await page.locator('#modal-nickname').isVisible(), '(1) 1ª abertura mostra o modal de apelido');
      ok((await page.locator('#nick-title').textContent()).includes('Escolha'), '(1) título "Escolha seu apelido"');
      ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'nick-input'), '(1) foco automático no campo');
      ok(await noOverflow(page), '(1) sem overflow horizontal');

      await page.fill('#nick-input', 'ab');
      await settled(page, 120);
      ok((await page.locator('#nick-error').textContent()).length > 0, '(1) validação em tempo real mostra erro');
      ok(await page.locator('#nick-save').isDisabled(), '(1) Salvar desabilitado com apelido inválido');
      ok(errors.length === 0, '(1) sem erros de console' + (errors.length ? ' :: ' + errors[0] : ''));
      await context.close();
    }

    // ---------- 2) Pular mantém JogadorNNNN; 3) salvar persiste; 4) editar; 5) apagar ----------
    {
      const { context, page, errors } = await newPage(browser, size);
      await settled(page, 1400);

      // (2) pular mantém o gerado
      await page.click('#nick-skip');
      await settled(page, 250);
      ok(await page.locator('#modal-nickname').isHidden(), '(2) "Pular" fecha o modal');
      const chipSkip = await page.locator('#menu-nickname').textContent();
      ok(/^Jogador\d{4}$/.test(chipSkip), `(2) "Pular" mantém apelido gerado ("${chipSkip}")`);

      // editar via chip do menu -> salvar "NeoPilot"
      await page.click('.nick-chip');
      await settled(page, 200);
      await page.fill('#nick-input', 'NeoPilot');
      await settled(page, 120);
      await page.click('#nick-save');
      await settled(page, 250);
      ok((await page.locator('#menu-nickname').textContent()) === 'NeoPilot', '(3) salvar "NeoPilot" atualiza o menu');

      // (3) persiste após recarregar
      await page.reload({ waitUntil: 'load' });
      await settled(page, 1400);
      ok(await page.locator('#modal-nickname').isHidden(), '(3) não repete o modal após recarregar');
      ok((await page.locator('#menu-nickname').textContent()) === 'NeoPilot', '(3) apelido persiste após recarregar');

      // (4) editar nas Configurações atualiza menu, game over e ranking
      await page.click('[data-action="settings"]');
      await settled(page, 250);
      ok((await page.locator('#set-nickname').textContent()) === 'NeoPilot', '(4) Configurações mostra o apelido');
      await page.click('#screen-settings [data-action="edit-nickname"]');
      await settled(page, 200);
      await page.fill('#nick-input', 'NovoNome');
      await settled(page, 120);
      await page.click('#nick-save');
      await settled(page, 250);
      ok((await page.locator('#menu-nickname').textContent()) === 'NovoNome', '(4) edição atualiza o menu');

      // game over mostra o apelido junto ao placar
      await page.evaluate(() => {
        const OX = window.OX;
        OX.start({ tutorial: false }); OX.screen(null);
        OX.game.score = 1310; OX.game.elapsed = 40;
        OX.game.runStats = { pickups: 30, maxCombo: 3, powerups: 1 };
        OX.endRun();
      });
      await settled(page, 1000);
      const goNick = await page.locator('#go-nick').textContent();
      ok(goNick.includes('NovoNome') && goNick.includes('1.310'), `(4) game over mostra "${goNick}"`);

      // ranking exibe apelidos + destaque do jogador
      await page.evaluate(() => {
        const now = new Date().toISOString();
        window.OX.state.ranking = [
          { score: 3000, date: now, name: 'NovoNome' },
          { score: 2000, date: now, name: 'Ana' },
          { score: 1000, date: now, name: 'Zé' },
        ];
      });
      await page.click('#screen-gameover [data-action="menu"]');
      await settled(page, 300);
      await page.click('[data-action="ranking"]');
      await settled(page, 300);
      const podium = await page.locator('.podium-name').allTextContents();
      ok(podium.includes('NovoNome') && podium.includes('Ana'), `(4) pódio mostra apelidos (${podium.join(',')})`);
      ok((await page.locator('.podium-slot.mine').count()) >= 1, '(4) destaca a linha do jogador atual');

      // (5) apagar progresso volta a perguntar
      await page.click('#screen-ranking [data-action="menu"]');
      await settled(page, 250);
      await page.click('[data-action="settings"]');
      await settled(page, 250);
      await page.click('#screen-settings [data-action="reset"]');
      await settled(page, 250);
      ok(await page.locator('#modal-confirm').isVisible(), '(5) confirmação de apagar progresso abre');
      ok((await page.locator('#confirm-title').textContent()).length > 0, '(5) modal de confirmação com título');
      await page.click('[data-action="reset-confirm"]');
      await settled(page, 300);

      // recarrega a MESMA página: o reset gravou asked=false -> volta a perguntar
      await page.reload({ waitUntil: 'load' });
      await settled(page, 1400);
      ok(await page.locator('#modal-nickname').isVisible(), '(5) após apagar progresso, volta a perguntar o apelido');
      const chipAfter = await page.locator('#menu-nickname').textContent();
      ok(/^Jogador\d{4}$/.test(chipAfter), `(5) apelido foi regenerado ("${chipAfter}")`);

      ok(errors.length === 0, 'sem erros de console no fluxo completo' + (errors.length ? ' :: ' + errors.slice(0, 2).join(' | ') : ''));
      await context.close();
    }
  }

  await browser.close();
  if (serverProc) { try { process.kill(-serverProc.pid); } catch { /* já morreu */ } }

  console.log('\n' + '═'.repeat(46));
  if (failures === 0) console.log('INTERFACE DO APELIDO OK — todos os casos passaram.');
  else { console.log(`${failures} falha(s).`); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
