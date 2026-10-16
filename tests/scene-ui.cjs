/* =========================================================
   CENÁRIO (Fase A2 da direção de arte) — Playwright
   Afirma:
     (1) o jogo nasce na zona 0 (ciano) com anéis e sprite de
         poeira construídos;
     (2) a cor do fundo muda de FRIA (azul, zona 0) para QUENTE
         (âmbar, zona 3) quando o nível sobe para 10 — amostragem
         mediana em 6 pontos das bordas do canvas;
     (3) a troca usa crossfade (bgPrev ativo) e libera a memória
         ao terminar (bgPrev null, zoneFadeT -1);
     (4) com "reduzir movimento" do sistema a troca também roda;
     (5) zero erros de console.
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/scene-ui.cjs
   ========================================================= */

const { spawn } = require('node:child_process');
const path = require('node:path');

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

/** Mediana da cor de fundo em 6 pontos das bordas (resiste a objetos
 *  passageiros/estrelas brancas cruzando um dos pontos). */
const AMOSTRAR = () => {
  const cv = document.getElementById('game-canvas');
  const ctx = cv.getContext('2d');
  const g = window.OX.game;
  const kx = cv.width / g.W, ky = cv.height / g.H;
  const pts = [[10, 10], [g.W - 30, 10], [10, g.H * 0.42],
    [g.W - 30, g.H * 0.42], [10, g.H - 30], [g.W - 30, g.H - 30]];
  const amostras = pts.map(([x, y]) => {
    const d = ctx.getImageData(Math.round(x * kx), Math.round(y * ky), 8, 8).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    return [r / 64, gg / 64, b / 64];
  });
  const med = (i) => amostras.map((m) => m[i]).sort((a, z) => a - z)[3];
  return { r: Math.round(med(0)), g: Math.round(med(1)), b: Math.round(med(2)) };
};

async function newPage(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'pt-BR',
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
  await page.goto(URL + '/?debug=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!(window.OX && window.OX.game));
  return { context, page };
}

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  const browser = await chromium.launch();

  /* ============ zona 0 no boot ============ */
  console.log('===== CENÁRIO — zona de cor por nível =====');
  const a = await newPage(browser, false);
  const ap = a.page;
  const boot = await ap.evaluate(() => ({
    zona: OX.game.zoneIndex, aneis: OX.game.rings.length,
    poeira: !!OX.game.dustSprite, estrelas: OX.game.stars.length,
  }));
  ok(boot.zona === 0, `boot na zona 0 (ciano) — zoneIndex=${boot.zona}`);
  ok(boot.aneis === 5 && boot.poeira && boot.estrelas >= 24,
    `camadas construídas (anéis=${boot.aneis}, poeira=${boot.poeira}, estrelas=${boot.estrelas})`);

  // fundo frio (azul) no menu: azul > vermelho com folga
  const frio = await ap.evaluate(AMOSTRAR);
  ok(frio.b > frio.r * 1.5, `fundo zona 0 frio (azul) — rgb(${frio.r}, ${frio.g}, ${frio.b})`);

  /* ============ troca para a zona 3 (âmbar) no nível 10 ============ */
  await ap.evaluate(() => {
    OX.start({ tutorial: false });
    OX.game.player.invuln = 9999;
  });
  await ap.evaluate(() => { OX.game.score = 9500; OX.advance(0.2); }); // nível 10
  const troca = await ap.evaluate(() => ({
    zona: OX.game.zoneIndex, fade: OX.game.zoneFadeT,
    anterior: !!OX.game.bgPrev, grade: OX.game.gridColor,
  }));
  ok(troca.zona === 3 && troca.fade >= 0 && troca.anterior,
    `nível 10 troca para a zona 3 com crossfade (zoneIndex=${troca.zona}, fade=${(troca.fade || 0).toFixed(2)}s, bgPrev=${troca.anterior})`);
  ok(troca.grade === '#FFA63D', `grade da zona âmbar (${troca.grade})`);

  // espera o crossfade de 1,5 s terminar (e o flash de nível sumir)
  await ap.evaluate(() => OX.advance(2.2));
  const depois = await ap.evaluate(() => ({
    zona: OX.game.zoneIndex, fade: OX.game.zoneFadeT, anterior: OX.game.bgPrev,
  }));
  ok(depois.fade === -1 && depois.anterior === null,
    'crossfade termina e libera o fundo anterior (memória de volta a 1 canvas)');

  const quente = await ap.evaluate(AMOSTRAR);
  ok(quente.r > quente.b, `fundo zona 3 quente (âmbar) — rgb(${quente.r}, ${quente.g}, ${quente.b})`);
  const dist = Math.abs(quente.r - frio.r) + Math.abs(quente.g - frio.g) + Math.abs(quente.b - frio.b);
  ok(dist > 20, `cor mudou de verdade (distância ${dist} > 20)`);
  await a.context.close();

  /* ============ movimento reduzido do sistema ============ */
  console.log('===== CENÁRIO — com "reduzir movimento" =====');
  const b = await newPage(browser, true);
  const bp = b.page;
  ok(await bp.evaluate(() => OX.state.settings.reduceMotion === true), 'sistema reduz nasce reduzido');
  await bp.evaluate(() => {
    OX.start({ tutorial: false });
    OX.game.player.invuln = 9999;
    OX.game.score = 9500;
    OX.advance(0.2);
  });
  ok(await bp.evaluate(() => OX.game.zoneIndex === 3), 'troca de zona roda com movimento reduzido');
  const off1 = await bp.evaluate(() => OX.game.bgOffset);
  await bp.evaluate(() => OX.advance(1));
  const off2 = await bp.evaluate(() => OX.game.bgOffset);
  ok(off2 > off1 && off2 - off1 < 100,
    `paralaxe roda a 30% (não congela): +${(off2 - off1).toFixed(0)} px em 1 s`);
  await b.context.close();

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'CENÁRIO OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
