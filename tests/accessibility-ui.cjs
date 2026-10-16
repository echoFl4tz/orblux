/* =========================================================
   ACESSIBILIDADE (Fase 5) — Playwright
     (1) 1ª visita com "reduzir movimento" LIGADO no sistema
         (emulateMedia) => o jogo já nasce com movimento
         reduzido (canvas + CSS), sem precisar abrir ajustes;
     (2) o interruptor "Reduzir movimento" liga/desliga na hora
         (classe .reduce-motion no body + jogo) e persiste;
     (3) com movimento reduzido a partida funciona igual (onda,
         quase-colidir, dano) e o fim de jogo mostra a pontuação
         FINAL na hora (sem contagem animada);
     (4) navegação por teclado: Tab foca com contorno visível;
     (5) aria nos controles do HUD e toasts como live region;
     (6) safe-area (env(safe-area-inset-*)) presente nas regras
         de HUD/telas/toasts;
     (7) zero erros de console.
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/accessibility-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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
  pn_version: '4',
};

const ALL_ERRORS = [];

async function newPage(browser, size, query, reducedMotion) {
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
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('console', (m) => { if (m.type() === 'error') ALL_ERRORS.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => ALL_ERRORS.push(`[pageerror] ${e.message}`));
  await page.goto(URL + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!(window.OX && window.OX.game));
  return { context, page };
}

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const tag = '?debug=1&t=' + Date.now();

  /* ============ (1) sistema pede menos movimento ============ */
  console.log('===== A11Y — sistema com "reduzir movimento" =====');
  const a = await newPage(browser, { w: 390, h: 844 }, tag, true);
  const ap = a.page;
  ok(await ap.evaluate(() => OX.state.settings.reduceMotion === true),
    '1ª visita nasce com movimento reduzido (prefers-reduced-motion do sistema)');
  ok(await ap.evaluate(() => document.body.classList.contains('reduce-motion')),
    'classe .reduce-motion aplicada no body (CSS desliga animações)');
  ok(await ap.evaluate(() => OX.game.reduceMotion === true), 'jogo (canvas) nasce com movimento reduzido');

  /* ============ (2) interruptor liga/desliga e persiste ============ */
  console.log('===== A11Y — interruptor dos ajustes =====');
  await ap.evaluate(() => OX.screen('settings'));
  await ap.waitForTimeout(150);
  ok(await ap.evaluate(() => document.getElementById('set-reduce').checked), 'interruptor mostra ligado');
  await ap.evaluate(() => document.getElementById('set-reduce').click()); // desliga
  await ap.waitForTimeout(80);
  ok(await ap.evaluate(() => !document.body.classList.contains('reduce-motion')
    && OX.state.settings.reduceMotion === false && OX.game.reduceMotion === false),
    'desligar remove a classe e o movimento reduzido do jogo');
  await ap.evaluate(() => document.getElementById('set-reduce').click()); // religa
  await ap.waitForTimeout(80);
  const persistido = await ap.evaluate(() => JSON.parse(localStorage.getItem('pn_settings') || '{}'));
  ok(await ap.evaluate(() => document.body.classList.contains('reduce-motion') && OX.game.reduceMotion === true)
    && persistido.reduceMotion === true, 'religar aplica na hora e persiste em pn_settings');

  /* ============ (3) partida + fim de jogo com menos movimento ============ */
  console.log('===== A11Y — partida com movimento reduzido =====');
  await ap.evaluate(() => {
    OX.screen('menu');
    OX.start({ tutorial: false });
    OX.game.player.invuln = 9999;
  });
  // onda: pula para a virada (determinística) e o faixa aparece sem varredura
  await ap.evaluate(() => { OX.game.elapsed = 19.9; OX.advance(0.2); });
  ok(await ap.evaluate(() => OX.game.wave === 2), 'onda avança com movimento reduzido');
  // quase-colidir: paga o bônus normalmente
  await ap.evaluate(() => {
    const g = OX.game;
    g.obstacles.length = 0;
    // obstáculo colado: fora da hitbox, dentro da folga do "quase"
    const o = { type: 'drone', x: g.player.x, y: g.player.y, r: 14 * g.S, vy: 0, t: 0, swayAmp: 0, swayFreq: 0, baseX: 0 };
    o.baseX = o.x = g.player.x + g.player.r + o.r * 0.85 + 8 * g.S;
    g.obstacles.push(o);
  });
  const nmDepois = await ap.evaluate(() => { OX.advance(0.1); return { score: OX.game.score, near: OX.game.runStats.nearMiss }; });
  ok(nmDepois.near === 1, 'quase-colidir paga o bônus com movimento reduzido');
  // dano: leva hit de propósito (sem escudo/invulnerabilidade);
  // baseX = x do player (drone ancora o sway em baseX, como no smoke)
  await ap.evaluate(() => {
    const g = OX.game;
    g.player.invuln = 0;
    g.obstacles.length = 0;
    const x = g.player.x;
    g.obstacles.push({ type: 'drone', x, y: g.player.y, r: 14 * g.S, vy: 0, t: 0, swayAmp: 0, swayFreq: 0, baseX: x });
  });
  await ap.evaluate(() => OX.advance(0.1));
  ok(await ap.evaluate(() => OX.game.lives === 2), 'dano funciona com movimento reduzido (3 -> 2 vidas)');
  // fim de jogo: pontuação FINAL na hora (sem contagem animada)
  await ap.evaluate(() => {
    const g = OX.game;
    g.lives = 1;
    g.player.invuln = 0;
    g.obstacles.length = 0;
    const x = g.player.x;
    g.obstacles.push({ type: 'drone', x, y: g.player.y, r: 14 * g.S, vy: 0, t: 0, swayAmp: 0, swayFreq: 0, baseX: x });
  });
  await ap.evaluate(() => OX.advance(0.1));
  await ap.waitForSelector('#screen-gameover.active');
  const goImediato = await ap.evaluate(() => ({
    texto: document.getElementById('go-score').textContent.replace(/\D/g, ''),
    alvo: OX.state.stats.best,
  }));
  ok(Number(goImediato.texto) > 0 && Number(goImediato.texto) === goImediato.alvo,
    `fim de jogo mostra a pontuação final na hora (${goImediato.texto})`);
  await a.context.close();

  /* ============ (4)(5) teclado, aria e safe-area (sem reduced) ============ */
  console.log('===== A11Y — teclado, aria e safe-area =====');
  const b = await newPage(browser, { w: 390, h: 844 }, tag, false);
  const bp = b.page;
  await bp.keyboard.press('Tab');
  const foco = await bp.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, outline: cs.outlineStyle, largura: cs.outlineWidth };
  });
  ok(foco && foco.outline === 'solid' && parseFloat(foco.largura) >= 2,
    `Tab foca com contorno visível (${foco ? `${foco.tag} outline ${foco.largura}` : 'sem foco'})`);
  const aria = await bp.evaluate(() => ({
    pause: document.getElementById('btn-pause')?.getAttribute('aria-label'),
    lives: document.getElementById('hud-lives')?.getAttribute('aria-label'),
    wave: document.getElementById('hud-wave')?.getAttribute('aria-label'),
    toasts: document.getElementById('toasts')?.getAttribute('aria-live'),
  }));
  ok(aria.pause === 'Pausar jogo' && !!aria.lives && !!aria.wave && aria.toasts === 'polite',
    `aria nos controles (pausa="${aria.pause}", vidas=${!!aria.lives}, onda=${!!aria.wave}, toasts=${aria.toasts})`);
  // safe-area: regras do CSS usam env(safe-area-inset-*) nas áreas críticas
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const usoSafe = (css.match(/env\(safe-area-inset-/g) || []).length;
  ok(usoSafe >= 10 && /\.hud[\s\S]{0,400}?env\(safe-area-inset-/.test(css),
    `safe-area presente no CSS (${usoSafe} usos, incluindo no HUD)`);
  await b.context.close();

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'ACESSIBILIDADE OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
