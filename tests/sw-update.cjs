/* =========================================================
   sw-update.cjs — Playwright: atualização e offline do SW
   • o service worker registra e assume a página
   • navegação vem da REDE mesmo com uma cópia velha de
     index.html no cache (regressão do bug: menu sem Chat)
   • offline: a navegação cai no cache e o jogo carrega
   ========================================================= */
'use strict';

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

(async () => {
  const server = await ensureServer();
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[console] ${m.text()}`); });

  console.log('===== SW — registro e controle =====');
  await page.goto(`${URL}/?social=1&debug=1&t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
    null, { timeout: 15000 },
  );
  ok(true, 'service worker registra e assume a página');
  const ver = await page.evaluate(async () => (await caches.keys()).find((k) => k.startsWith('orblux-')) || null);
  ok(ver === 'orblux-v4', `cache de versão atual (${ver})`);

  console.log('===== SW — navegação é rede-primeiro =====');
  // injeta uma cópia "antiga" no cache: a recarga NÃO pode servi-la
  await page.evaluate(async (v) => {
    const c = await caches.open(v);
    await c.put('./index.html', new Response(
      '<!doctype html><html><head></head><body><p id="sentinel">versao antiga</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ));
  }, ver);
  await page.reload({ waitUntil: 'networkidle' });
  ok(await page.evaluate(() => !document.getElementById('sentinel')), 'HTML vem da rede mesmo com cópia velha no cache');
  ok(await page.evaluate(() => !!document.getElementById('btn-chat')), 'HTML novo servido (tem #btn-chat)');
  // a put da navegação (await) já regravou o cache com o HTML bom
  await page.waitForFunction(async (v) => {
    const c = await caches.open(v);
    const r = await c.match('./index.html');
    return !!(r && (await r.clone().text()).includes('btn-chat'));
  }, ver, { timeout: 10000 });

  console.log('===== SW — offline cai no cache =====');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body && document.body.dataset.screen !== undefined, null, { timeout: 15000 });
  ok(await page.evaluate(() => !!document.getElementById('btn-chat')), 'offline: página carrega do cache (jogo segue de pé)');
  await context.setOffline(false);

  console.log('===== CONSOLE =====');
  ok(errs.length === 0, `zero erros (${errs.length})`);
  if (errs.length) console.log(errs.slice(0, 6));

  await browser.close();
  if (server) try { process.kill(server.pid); } catch { /* já morreu */ }

  console.log('\n' + '='.repeat(50));
  if (failures === 0) { console.log('SW OK — rede-primeiro + offline no cache'); process.exit(0); }
  console.log(`FALHAS: ${failures}`);
  process.exit(1);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
