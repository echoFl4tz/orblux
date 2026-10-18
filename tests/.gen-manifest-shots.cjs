/* Gera os screenshots do manifest (Parte 2): menu paisagem + partida retrato. */
const path = require('node:path');

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
const chromium = loadChromium();

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8080';

(async () => {
  const browser = await chromium.launch();
  try {
    // 1280x720 — menu em paisagem (form_factor wide)
    const p1 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await p1.goto(URL, { waitUntil: 'networkidle' });
    await p1.click('[data-consent="declined"]').catch(() => {});
    await p1.waitForTimeout(1400);
    await p1.screenshot({ path: path.join(ROOT, 'icons', 'screen-1280x720.png') });

    // 390x844 — partida com HUD em retrato (form_factor narrow)
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p2.goto(URL, { waitUntil: 'networkidle' });
    await p2.click('[data-consent="declined"]').catch(() => {});
    await p2.evaluate(() => {
      window.OX.screen('menu');
      window.OX.start({ tutorial: false });
      OX.game.player.invuln = 9999;
      OX.advance(7);
    });
    await p2.waitForTimeout(700);
    await p2.screenshot({ path: path.join(ROOT, 'icons', 'screen-390x844.png') });

    console.log('screenshots ok');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
