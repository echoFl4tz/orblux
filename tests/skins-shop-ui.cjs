/* =========================================================
   Regressão da LOJA DE SKINS (ORBLUX) — Playwright
   Afirma:
     (1) grade com 21 skins + pacote, selo "Novo" e estados corretos
     (2) compra completa: confirmar -> resultado -> equipar agora
     (3) cancelar compra e silencioso (sem erro, sem skin)
     (4) personalização persiste e "Restaurar padrão" funciona
     (5) posse/equip persistem após recarregar
      (5b) "Equipar" do DETALHE equipa (regressão: botão com data-id)
     (6) pacote Coleção Completa concede as 20 pagas
     (7) "Restaurar compras" recupera pelo provedor
     (8) loja indisponível (vitrine): sem preço, compra desabilitada
     (9) loja NUNCA aparece durante a partida
     (10) 360x640 e 390x844 sem overflow; zero erros de console
     (11) mock sem ?precosdemo=1 nunca mostra valor fixo em reais
   Pré-requisito: dev server em http://localhost:8080 (sobe se preciso).
   Uso: node tests/skins-shop-ui.cjs
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

const SEED_BASE = {
  pn_consent: '1',
  pn_tutorial_done: '1',
  pn_profile: JSON.stringify({ nickname: 'Teste', createdAt: '2026-01-01T00:00:00.000Z', asked: true }),
  pn_version: '3',
};

const ALL_ERRORS = [];

async function newPage(browser, size, query, seedSkins = true) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, locale: 'pt-BR',
  });
  await context.addInitScript((data) => {
    // semeia APENAS na primeira navegação (o init script roda de novo no reload)
    if (!sessionStorage.getItem('pn_test_seeded')) {
      for (const [k, v] of Object.entries(data.base)) localStorage.setItem(k, v);
      if (data.seedSkins) {
        localStorage.setItem('pn_skins', JSON.stringify({
          equipped: 'classic',
          owned: { brasa_neon: 1700000000000, oceano: 1700000000001 },
          custom: {},
          seen: {},
        }));
        localStorage.setItem('pn_mock_purchases', JSON.stringify(['skin_brasa_neon', 'skin_oceano']));
      }
      sessionStorage.setItem('pn_test_seeded', '1');
    }
  }, { base: SEED_BASE, seedSkins });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') ALL_ERRORS.push(m.text()); });
  page.on('pageerror', (e) => ALL_ERRORS.push('pageerror: ' + e.message));
  await page.goto(`${URL}/?debug=1${query || ''}`, { waitUntil: 'load' });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  return { context, page };
}

const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const skinsState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pn_skins') || '{}'));

(async () => {
  const chromium = loadChromium();
  const serverProc = await ensureServer();
  const browser = await chromium.launch({ headless: true });

  // ===== Fluxo principal (390x844, mock da Play) =====
  console.log('\n===== LOJA — fluxo principal (390x844) =====');
  const { context: ctx1, page } = await newPage(browser, { w: 390, h: 844 }, '&precosdemo=1');
  await page.waitForSelector('#screen-menu.active');
  ok(await page.locator('#skins-badge').isVisible(), '(1) selo "Novo" aparece antes da 1ª visita');

  await page.click('#btn-skins');
  await page.waitForSelector('#shop-grid .skin-card');
  await page.waitForTimeout(400);
  ok((await page.locator('#shop-grid .skin-card').count()) === 22, '(1) grade tem 21 skins + pacote');
  ok((await page.locator('[data-id="supernova"]').getAttribute('aria-label')).includes('R$ 9,99'),
    '(1) preço vem do provedor (localizedPrice)');
  ok(await noOverflow(page), '(10) sem overflow horizontal na grade');

  // (2) compra completa
  await page.click('[data-id="supernova"]');
  await page.waitForSelector('#shop-detail:not([hidden])');
  await page.waitForSelector('#detail-custom', { state: 'hidden' });
  await page.click('#detail-actions .btn-primary'); // Comprar por R$ 9,99
  await page.waitForSelector('#modal-buy:not([hidden])');
  ok((await page.locator('#buy-preco').textContent()) === 'R$ 9,99', '(2) modal confirma com preço do Play');
  await page.click('#buy-confirm');
  await page.waitForSelector('#modal-buy-result:not([hidden])');
  ok((await page.locator('#buyr-title').textContent()) === 'Skin liberada', '(2) resultado: skin liberada');
  await page.click('#buyr-actions .btn-primary'); // Equipar agora
  await page.waitForTimeout(300);
  let st = await skinsState(page);
  ok(!!st.owned.supernova, '(2) posse gravada após confirmação do provedor');
  ok(st.equipped === 'supernova', '(2) "Equipar agora" equipa na hora');

  // (4) personalização na skin comprada
  await page.waitForSelector('#detail-custom:not([hidden])');
  ok((await page.locator('#custom-paletas .swatch').count()) >= 2, '(4) vocabulário curado de paletas visível');
  await page.click('#custom-paletas .swatch:nth-child(2)');
  await page.waitForTimeout(250);
  st = await skinsState(page);
  ok(!!(st.custom && st.custom.supernova), '(4) personalização persiste em pn_skins');
  await page.click('[data-shop="custom-reset"]');
  await page.waitForTimeout(200);
  st = await skinsState(page);
  ok(!(st.custom && st.custom.supernova), '(4) "Restaurar padrão da skin" limpa a custom');

  // (5) persistência após recarregar
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#screen-menu.active');
  ok(!(await page.locator('#skins-badge').isVisible()), '(5) selo "Novo" some após a visita');
  await page.click('#btn-skins');
  await page.waitForSelector('#shop-grid .skin-card');
  st = await skinsState(page);
  ok(!!st.owned.supernova && st.equipped === 'supernova', '(5) posse e skin equipada persistem após reload');

  // (5b) equipar pelo botão do DETALHE — regressão: o botão saía sem data-id
  // e o handler lia el.dataset.id = undefined => equipSkin(undefined) falhava
  // em silêncio (skin comprada nunca equipava).
  await page.click('[data-id="oceano"]');
  await page.waitForSelector('#shop-detail:not([hidden])');
  await page.click('#detail-actions [data-shop="equip"]');
  await page.waitForTimeout(300);
  st = await skinsState(page);
  ok(st.equipped === 'oceano', '(5b) "Equipar" do detalhe equipa a skin possuída');
  ok((await page.locator('#detail-actions .chip-success').textContent()).includes('Equipada'),
    '(5b) detalhe troca o botão pelo chip "Equipada"');
  ok((await page.locator('[data-id="oceano"] .skin-card-state').textContent()).includes('Equipada'),
    '(5b) card da grade marca "Equipada"');
  await page.click('#shop-detail [data-shop="back"]');
  await page.waitForSelector('#shop-grid .skin-card', { state: 'visible' });

  // (6) pacote Coleção Completa
  await page.click('[data-shop="bundle"]');
  await page.waitForSelector('#modal-buy:not([hidden])');
  await page.click('#buy-confirm');
  await page.waitForTimeout(500);
  st = await skinsState(page);
  const paid = Object.keys(st.owned).length;
  ok(paid === 20, `(6) pacote concede as 20 pagas (tem ${paid})`);
  await page.click('[data-val="minhas"]');
  await page.waitForTimeout(200);
  ok((await page.locator('#shop-grid .skin-card').count()) === 21, '(6) filtro Minhas mostra 20 + clássica');

  // (7) restaurar compras
  await page.click('[data-shop="restore"]');
  await page.waitForTimeout(900);
  const toastTxt = ((await page.locator('.toast').allInnerTexts()).join(' '));
  ok(/restauradas/i.test(toastTxt), '(7) restaurar compras recupera pelo provedor');

  // (9) loja nunca durante a partida
  await page.click('#screen-skins [data-action="menu"]');
  await page.waitForSelector('#screen-menu.active');
  await page.click('#screen-menu [data-action="play"]');
  await page.waitForTimeout(600);
  const shopActive = await page.evaluate(() =>
    document.getElementById('screen-skins').classList.contains('active'));
  ok(!shopActive && (await page.locator('[data-shop]:visible').count()) === 0,
    '(9) nenhuma loja/compra visível durante a partida');
  await ctx1.close();

  // ===== Cancelamento silencioso =====
  console.log('\n===== LOJA — cancelamento (mock=cancel) =====');
  const { context: ctx2, page: p2 } = await newPage(browser, { w: 390, h: 844 }, '&mock=cancel&precosdemo=1');
  await p2.waitForSelector('#screen-menu.active');
  await p2.click('#btn-skins');
  await p2.waitForSelector('#shop-grid .skin-card');
  await p2.click('[data-id="supernova"]');
  await p2.waitForSelector('#shop-detail:not([hidden])');
  await p2.click('#detail-actions .btn-primary');
  await p2.waitForSelector('#modal-buy:not([hidden])');
  await p2.click('#buy-confirm');
  await p2.waitForTimeout(700);
  ok(await p2.locator('#modal-buy').isHidden(), '(3) modal de compra fecha ao cancelar');
  ok(await p2.locator('#modal-buy-result').isHidden(), '(3) cancelar é silencioso (sem modal de erro)');
  const st2 = await skinsState(p2);
  ok(!st2.owned.supernova, '(3) cancelamento não libera a skin');
  await ctx2.close();

  // ===== Loja indisponível (vitrine) =====
  console.log('\n===== LOJA — indisponível (?nomock=1) =====');
  const { context: ctx3, page: p3 } = await newPage(browser, { w: 390, h: 844 }, '&nomock=1');
  await p3.waitForSelector('#screen-menu.active');
  await p3.click('#btn-skins');
  await p3.waitForSelector('#shop-grid .skin-card');
  ok(await p3.locator('#shop-store-chip').isVisible(), '(8) chip "Sem compras em dinheiro" aparece');
  ok((await p3.locator('[data-id="supernova"] .skin-card-state').textContent()).includes('moedas'),
    '(8) card mostra o preço em MOEDAS mesmo sem provedor (loja não parece fechada)');
  await p3.click('[data-id="supernova"]');
  await p3.waitForSelector('#shop-detail:not([hidden])');
  ok(await p3.locator('#detail-actions .btn-primary').isDisabled(), '(8) botão de compra desabilitado');
  await p3.click('[data-shop="restore"]');
  await p3.waitForTimeout(600);
  ok(/indisponível/i.test((await p3.locator('.toast').allInnerTexts()).join(' ')),
    '(8) restaurar avisa sem falhar');
  ok(await noOverflow(p3), '(10) 390x844 sem overflow na vitrine');
  await ctx3.close();

  // ===== 360x640 =====
  console.log('\n===== LOJA — 360x640 =====');
  const { context: ctx4, page: p4 } = await newPage(browser, { w: 360, h: 640 });
  await p4.waitForSelector('#screen-menu.active');
  await p4.click('#btn-skins');
  await p4.waitForSelector('#shop-grid .skin-card');
  ok(await noOverflow(p4), '(10) 360x640 sem overflow na grade');
  await p4.click('[data-id="brasa_neon"]');
  await p4.waitForSelector('#shop-detail:not([hidden])');
  ok(await noOverflow(p4), '(10) 360x640 sem overflow no detalhe');
  await ctx4.close();

  // ===== Mock honesto: sem ?precosdemo=1 nunca há valor fixo =====
  console.log('\n===== LOJA — mock sem preços (?debug=1 puro) =====');
  const { context: ctx5, page: p5 } = await newPage(browser, { w: 390, h: 844 });
  await p5.waitForSelector('#screen-menu.active');
  await p5.click('#btn-skins');
  await p5.waitForSelector('#shop-grid .skin-card');
  ok((await p5.locator('[data-id="supernova"] .skin-card-state').textContent()).includes('moedas'),
    '(11) mock sem preços: card mostra MOEDAS (nunca valor fixo em reais)');
  const textoGrade = await p5.locator('#shop-grid').innerText();
  ok(!/R\$\s*\d/.test(textoGrade), '(11) nenhum "R$ + número" na grade');
  ok(!/desconto|urgente|últim/i.test(textoGrade), '(11) card do pacote sem linguagem de desconto/urgência');
  await ctx5.close();

  ok(ALL_ERRORS.length === 0, `(10) zero erros de console (${ALL_ERRORS.length ? ALL_ERRORS.join(' | ') : 'nenhum'})`);

  await browser.close();
  if (serverProc) { try { process.kill(serverProc.pid); } catch { /* já morto */ } }

  if (failures === 0) console.log('LOJA DE SKINS OK — todos os casos passaram.');
  else { console.log(`${failures} falha(s).`); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
