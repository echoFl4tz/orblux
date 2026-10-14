/* =========================================================
   Regressão — "menu quebrado após morrer" (ORBLUX)
   Repete os fluxos de volta ao menu e afirma, a cada volta:
     (1) menu visualmente estável (diff de pixels com tolerância
         calibrada contra a animação ambiente do fundo)
     (2) nenhum elemento oculto visível (HUD, modais, tutorial) e toasts=0
     (3) game.mode==='menu' e zero entidades de partida
     (4) sem erros no console
     (5) requestAnimationFrame estável (sem vazamento)
   Roda em 390x844 (retrato) e 1280x720 (paisagem).

   Pré-requisito: dev server em http://localhost:8080
   (o teste sobe sozinho se não estiver no ar).
   Uso: node tests/menu-regression.cjs
   Requer: playwright-chromium (npm i -D playwright-chromium)
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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

const SIZES = [{ w: 390, h: 844 }, { w: 1280, h: 720 }];

const RAF_TRACK = `
  window.__rafPending = 0;
  const oRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__rafPending++; return oRaf((t) => { window.__rafPending--; return cb(t); }); };
`;
const SEED = `try {
  localStorage.setItem('pn_consent','true');
  localStorage.setItem('pn_tutorial_done','true');
  localStorage.setItem('pn_profile', JSON.stringify({ nickname:'NeoPilot', createdAt:'2026-01-01T00:00:00.000Z', asked:true }));
} catch(e){}`;

async function ensureServer() {
  try { const r = await fetch(URL); if (r.ok) return null; } catch { /* sobe */ }
  console.log('· dev server fora do ar, subindo em node dev-server.mjs 8080 …');
  const proc = spawn(process.execPath, ['dev-server.mjs', '8080'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(URL); if (r.ok) return proc; } catch { /* espera */ }
  }
  throw new Error('dev server não subiu em 10s');
}

async function newPage(browser, size) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1, locale: 'pt-BR', reducedMotion: 'no-preference',
  });
  await context.addInitScript(RAF_TRACK);
  await context.addInitScript(SEED);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  return { context, page, errors };
}

const settle = (page, ms = 450) => page.waitForTimeout(ms);
async function clickAction(page, action, scope) {
  const sel = scope ? `${scope} [data-action="${action}"]` : `[data-action="${action}"]`;
  await page.locator(sel).first().click();
  await settle(page);
}
async function die(page, score = 1240) {
  await page.evaluate((s) => {
    const OX = window.OX;
    OX.game.score = s; OX.game.elapsed = 40;
    OX.game.runStats = { pickups: 30, maxCombo: 3, powerups: 1 };
    OX.endRun();
  }, score);
  await page.waitForTimeout(950);
}

/** diff médio por canal (0..255) entre 2 screenshots, via canvas na página. */
async function diffScore(page, bufA, bufB) {
  return page.evaluate(([a, b]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d; });
    return Promise.all([load(a), load(b)]).then(([ia, ib]) => {
      const W = 90, H = 90;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(ia, 0, 0, W, H); const da = cx.getImageData(0, 0, W, H).data;
      cx.clearRect(0, 0, W, H); cx.drawImage(ib, 0, 0, W, H); const db = cx.getImageData(0, 0, W, H).data;
      let sum = 0;
      for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      return sum / (W * H * 3);
    });
  }, [bufA.toString('base64'), bufB.toString('base64')]);
}

/** Diagnóstico do estado do menu na página. */
async function diag(page) {
  return page.evaluate(() => {
    const vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none'
      && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.01;
    const g = window.OX.game;
    const leak = [];
    for (const id of ['hud', 'tutorial', 'hud-toast', 'ad-interstitial', 'ad-reward', 'modal-share', 'modal-confirm']) {
      if (vis(document.getElementById(id))) leak.push(id);
    }
    return {
      mode: g.mode,
      entities: { obs: g.obstacles.length, pick: g.pickups.length, pow: g.powerups.length, player: g.player != null },
      toasts: document.getElementById('toasts').children.length,
      visibleLeak: leak,
      activeScreens: [...document.querySelectorAll('.screen.active')].map((s) => s.id),
      raf: window.__rafPending,
      reviveHidden: document.getElementById('btn-revive').hidden,
    };
  });
}

function checkInvariants(d) {
  const fails = [];
  if (d.mode !== 'menu') fails.push(`mode=${d.mode} (esperado 'menu')`);
  if (d.entities.obs || d.entities.pick || d.entities.pow || d.entities.player) fails.push('entidades de partida presentes: ' + JSON.stringify(d.entities));
  if (d.toasts !== 0) fails.push(`toasts=${d.toasts} (esperado 0)`);
  if (d.visibleLeak.length) fails.push('elementos ocultos visíveis: ' + d.visibleLeak.join(','));
  if (!d.activeScreens.includes('screen-menu')) fails.push('screen-menu sem .active');
  if (!d.reviveHidden) fails.push('btn-revive visível no menu');
  return fails;
}

const FLOWS = [
  { id: 'a', run: async (p) => { await clickAction(p, 'play'); await die(p); await clickAction(p, 'menu', '#screen-gameover'); } },
  { id: 'b', run: async (p) => { await clickAction(p, 'play'); await die(p, 900); await clickAction(p, 'replay', '#screen-gameover'); await die(p, 1240); await clickAction(p, 'menu', '#screen-gameover'); } },
  { id: 'c', run: async (p) => {
    await clickAction(p, 'play'); await die(p, 800);
    await clickAction(p, 'revive', '#screen-gameover'); await p.waitForTimeout(5300);
    await p.locator('#btn-claim-reward').click(); await settle(p);
    await die(p, 1500); await clickAction(p, 'menu', '#screen-gameover');
  } },
  { id: 'd', run: async (p) => { await clickAction(p, 'play'); await p.evaluate(() => window.OX.advance(4)); await clickAction(p, 'pause', '#hud'); await clickAction(p, 'menu', '#screen-pause'); } },
  { id: 'e', run: async (p) => { await clickAction(p, 'play'); await die(p); await clickAction(p, 'share-score', '#screen-gameover'); await clickAction(p, 'close-share', '#modal-share'); await clickAction(p, 'menu', '#screen-gameover'); } },
  { id: 'f', run: async (p) => { await clickAction(p, 'play'); await die(p); await clickAction(p, 'menu', '#screen-gameover'); await clickAction(p, 'howto'); await clickAction(p, 'menu', '#screen-howto'); } },
];

(async () => {
  const chromium = loadChromium();
  const serverProc = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  for (const size of SIZES) {
    console.log(`\n===== ${size.w}x${size.h} =====`);

    // baseline + calibração do ruído da animação ambiente (2 frames do menu)
    const base = await newPage(browser, size);
    await base.page.waitForTimeout(1800);
    const b1 = await base.page.screenshot();
    await base.page.waitForTimeout(650);
    const b2 = await base.page.screenshot();
    const noise = await diffScore(base.page, b1, b2);
    const baseDiag = await diag(base.page);
    const baseRaf = baseDiag.raf;
    const tol = noise * 2.5 + 3; // tolerância ancorada na animação ambiente real
    console.log(`· baseline: ruído ambiente=${noise.toFixed(2)}  tolerância=${tol.toFixed(2)}  raf=${baseRaf}`);
    await base.context.close();

    const assertClean = async (page, errors, tag) => {
      await page.waitForTimeout(700);
      const d = await diag(page);
      const fails = checkInvariants(d);
      const cur = await page.screenshot();
      const diff = await diffScore(page, b1, cur);
      if (diff > tol) fails.push(`diff visual ${diff.toFixed(2)} > tolerância ${tol.toFixed(2)}`);
      if (d.raf > baseRaf + 1) fails.push(`raf ${d.raf} > baseline ${baseRaf}+1 (vazamento)`);
      if (errors.length) fails.push('erros no console: ' + errors.slice(0, 3).join(' | '));
      if (fails.length) { failures++; console.log(`  ✗ ${tag}: ${fails.join(' ;; ')}`); }
      else console.log(`  ✓ ${tag} (diff=${diff.toFixed(2)})`);
    };

    // 5x ciclo jogar → morrer → menu
    {
      const { context, page, errors } = await newPage(browser, size);
      await page.waitForTimeout(1500);
      for (let i = 1; i <= 5; i++) {
        errors.length = 0;
        await clickAction(page, 'play'); await die(page, 1000 * i);
        await clickAction(page, 'menu', '#screen-gameover');
        await assertClean(page, errors, `repetição ${i}/5 (jogar→morrer→menu)`);
      }
      await context.close();
    }

    // fluxos b..f (o 'a' já coberto pelas repetições, mas roda junto p/ completude)
    for (const f of FLOWS) {
      const { context, page, errors } = await newPage(browser, size);
      await page.waitForTimeout(1500);
      await f.run(page);
      await assertClean(page, errors, `fluxo ${f.id}`);
      await context.close();
    }
  }

  await browser.close();
  if (serverProc) { try { process.kill(-serverProc.pid); } catch { /* já morreu */ } }

  console.log('\n' + '═'.repeat(46));
  if (failures === 0) console.log('REGRESSÃO OK — todos os fluxos de volta ao menu passaram.');
  else { console.log(`${failures} falha(s) de regressão.`); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
