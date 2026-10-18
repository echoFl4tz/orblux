/* =========================================================
   Capturas antes/depois do redesign (Parte 2 final)
   Uso: node tests/.gen-final-shots.cjs <baseURL> <pastaSaida>
   6 telas × 3 viewports (360x640, 390x844, 1280x720):
   menu, HUD, fim de jogo sem recorde, fim de jogo com recorde,
   ranking, skins e configurações.
   ========================================================= */
'use strict';
const path = require('node:path');
const fs = require('node:fs');

function loadChromium() {
  const candidates = [
    'playwright-chromium',
    'C:/Users/joseo/AppData/Local/Temp/opencode/orblux-record/node_modules/playwright-chromium',
  ];
  for (const c of candidates) {
    try { return require(c).chromium; } catch { /* tenta o próximo */ }
  }
  throw new Error('playwright-chromium não encontrado');
}

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = process.argv[3] || path.join(__dirname, '..', 'docs', 'captures', 'design-final');
const VIEWPORTS = [
  { w: 360, h: 640, tag: '360x640' },
  { w: 390, h: 844, tag: '390x844' },
  { w: 1280, h: 720, tag: '1280x720' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chromium = loadChromium();
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, locale: 'pt-BR' });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.click('[data-consent="declined"]').catch(() => {});
    await page.waitForTimeout(1600);                    // splash + cascata do menu
    const shot = (nome) => page.screenshot({ path: path.join(OUT, `${nome}-${vp.tag}.png`) });

    await shot('01-menu');

    // partida com HUD
    await page.evaluate(() => {
      OX.screen('menu');
      OX.start({ tutorial: false });
      OX.screen(null);
      OX.game.player.invuln = 9999;
      OX.advance(9);
    });
    await page.waitForTimeout(500);
    await shot('02-hud');

    // fim de jogo SEM recorde (best altíssimo → "Faltaram N pontos")
    await page.evaluate(() => { OX.state.stats.best = 999999; OX.endRun(); });
    await page.waitForTimeout(1000);                    // count-up de 600ms
    await shot('03-fim-sem-recorde');

    // fim de jogo COM recorde (best baixo → selo + "+N sobre o anterior")
    await page.evaluate(() => {
      OX.state.stats.best = 10;
      OX.screen('menu');
      OX.start({ tutorial: false });
      OX.game.player.invuln = 9999;
      OX.advance(7);
      OX.endRun();
    });
    await page.waitForTimeout(1300);
    await shot('04-fim-com-recorde');

    await page.evaluate(() => OX.screen('ranking'));
    await page.waitForTimeout(500);
    await shot('05-ranking');

    await page.evaluate(() => OX.screen('skins'));
    await page.waitForTimeout(500);
    await shot('06-skins');

    await page.evaluate(() => OX.screen('settings'));
    await page.waitForTimeout(500);
    await shot('07-config');

    await page.close();
    console.log(`ok ${vp.tag}`);
  }
  await browser.close();
  console.log('capturas em', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
