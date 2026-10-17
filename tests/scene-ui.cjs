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

  /* ============ objetos (A3): barreira/drone danger+hachura, aviso, power-ups ============ */
  console.log('===== OBJETOS — perigo e recompensa (A3) =====');
  const c = await newPage(browser, false);
  const cp = c.page;

  // leitura de linha no lado da página (uma vez); media() fica no Node
  await cp.evaluate(() => {
    window.__LINHA = (x, y, larg) => {
      const cv = document.getElementById('game-canvas');
      const ctx = cv.getContext('2d');
      const g = window.OX.game;
      const kx = cv.width / g.W, ky = cv.height / g.H;
      const d = ctx.getImageData(Math.round(x * kx), Math.round(y * ky),
        Math.max(1, Math.round(larg * kx)), Math.max(1, Math.round(2 * ky))).data;
      const lin = [];
      for (let i = 0; i < d.length; i += 4) lin.push([d[i], d[i + 1], d[i + 2]]);
      return lin;
    };
  });
  const media = (lin) => {
    const n = lin.length || 1;
    return lin.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
      .map((v) => Math.round(v / n));
  };

  // barreira parada no caminho (vy 0) para amostrar o corpo
  await cp.evaluate(() => {
    OX.start({ tutorial: false });
    OX.game.player.invuln = 9999;
    const S = OX.game.S, W = OX.game.W;
    OX.game.obstacles.length = 0;
    OX.game.obstacles.push({ type: 'bar', x: W / 2 - 110, y: 60, w: 220, h: 13 * S, vy: 0, halfW: 110 });
  });
  await cp.waitForTimeout(150);

  const bar = await cp.evaluate(() => {
    const b = OX.game.obstacles[0];
    return { x: b.x, y: b.y, w: b.w, vh: (b.h / 13) * 21 };
  });
  const corpo = media(await cp.evaluate(({ x, y, w, vh }) =>
    window.__LINHA(x + 12, y + vh * 0.35, w - 24), bar));
  ok(corpo[0] > 140 && corpo[1] < 110 && corpo[2] < 140,
    `barreira em danger (rgb ${corpo.join(',')} — não o laranja antigo)`);

  const escuro = await cp.evaluate(({ x, y, w, vh }) => {
    const lin = window.__LINHA(x + 12, y + vh * 0.35, w - 24);
    const corpo = lin.reduce((s, p) => Math.max(s, p[1]), 0);   // nível do corpo
    return lin.filter((p) => p[1] < corpo - 12).length;          // hachura escura
  }, bar);
  ok(escuro >= 2, `hachura diagonal no corpo (${escuro} pixels escuros na linha)`);

  const antes1 = await cp.evaluate(({ x, y, w, vh }) =>
    JSON.stringify(window.__LINHA(x + 12, y + vh * 0.35, w - 24).map((p) => p[0])), bar);
  await cp.waitForTimeout(250);   // hachura desliza 20 px/s; gap longe do
  const depois1 = await cp.evaluate(({ x, y, w, vh }) =>   // período de 400 ms
    JSON.stringify(window.__LINHA(x + 12, y + vh * 0.35, w - 24).map((p) => p[0])), bar);
  ok(antes1 !== depois1, 'hachura anima (20 px/s) — corpo muda entre quadros');

  // aviso de barreira: aparece quando ela ainda está acima da tela…
  // (limpa antes: a barreira estática de cima tem vy 0 e "avisa" direto)
  await cp.evaluate(() => { OX.game.obstacles.length = 0; });
  await cp.waitForTimeout(80);
  const linhaBase = media(await cp.evaluate(() => window.__LINHA(OX.game.W / 2 - 40, 8, 80)));
  await cp.evaluate(() => {
    const S = OX.game.S, W = OX.game.W;
    OX.game.obstacles.length = 0;
    OX.game.obstacles.push({ type: 'bar', x: W / 2 - 80, y: -20, w: 160, h: 13 * S, vy: 260 * S, halfW: 80 });
  });
  await cp.waitForTimeout(60);
  const linhaAviso = media(await cp.evaluate(() => window.__LINHA(OX.game.W / 2 - 40, 8, 80)));
  ok(linhaBase[0] < 30 && linhaAviso[0] > 40,
    `aviso danger no topo antes de entrar (r ${linhaBase[0]} → ${linhaAviso[0]})`);

  // …e some depois que ela entra (~350 ms)
  await cp.evaluate(() => { OX.game.obstacles.length = 0; OX.advance(0.6); });
  await cp.waitForTimeout(60);
  const linhaDepois = media(await cp.evaluate(() => window.__LINHA(OX.game.W / 2 - 40, 8, 80)));
  ok(linhaDepois[0] < 35, `aviso some após a entrada (r ${linhaDepois[0]} < 35)`);

  // power-ups: hexágono "power" (não mais estrela dourada no x2) —
  // empurra, espera um quadro do rAF e varre a linha central pegando
  // o pixel mais verde (borda/ícone)
  for (const kind of ['x2', 'shield']) {
    await cp.evaluate((k) => {
      const S = OX.game.S, W = OX.game.W, H = OX.game.H;
      OX.game.powerups.length = 0;
      OX.game.powerups.push({ kind: k, x: W / 2, y: H / 2, r: 14 * S, vy: 0, t: 0 });
    }, kind);
    await cp.waitForTimeout(80);            // um rAF desenha o power-up
    const melhor = await cp.evaluate(() => {
      const S = OX.game.S, W = OX.game.W, H = OX.game.H;
      const R = 14 * S * 1.3;
      const lin = window.__LINHA(W / 2 - R - 3, H / 2 - 1, R * 2 + 6);
      return lin.reduce((melhor, p) => (p[1] > melhor[1] ? p : melhor), [0, 0, 0]);
    });
    ok(melhor[1] > 150 && melhor[0] < 130,
      `power-up ${kind} em hexágono "power" (rgb ${melhor.join(',')})`);
  }

  // escudo do orbe: bolha 0,25 + borda 0,7 acendem na hora. Amostra o
  // ponto ESQUERDO do anel (banda fora do corpo) e discrimina pelo
  // EXCESSO DE VERDE (g − r): o traço power (61,255,162) mantém a
  // diferença contra qualquer fundo, ao contrário de um limiar fixo.
  // Aura branca (g − r ≈ 6) e halo ciano (b ≈ 255) ficam de fora.
  await cp.evaluate(() => { OX.game.player.shield = false; });
  await cp.waitForTimeout(60);
  const anelBase = await cp.evaluate(() => {
    const p = OX.game.player;
    const rs = p.r * 1.25 + 8;
    return window.__LINHA(p.x - rs - 2, p.y - 1, 6)
      .filter((q) => q[1] - q[0] > 75 && q[1] > 95 && q[2] < 225).length;
  });
  await cp.evaluate(() => { OX.game.player.shield = true; });
  await cp.waitForTimeout(60);
  const anelEscudo = await cp.evaluate(() => {
    const p = OX.game.player;
    const rs = p.r * 1.25 + 8;
    return window.__LINHA(p.x - rs - 2, p.y - 1, 6)
      .filter((q) => q[1] - q[0] > 75 && q[1] > 95 && q[2] < 225).length;
  });
  ok(anelBase <= 2 && anelEscudo >= 3,
    `bolha do escudo acende (pixels do power: ${anelBase} -> ${anelEscudo})`);

  // ===== HUD + FEEDBACK (A4) =====
  // sem interferência do jogo: sem coletas, combo zerado, sem dano
  await cp.evaluate(() => {
    OX.game.pickups.length = 0;
    OX.game.combo = 0; OX.game.comboTimer = 0; OX.game.multiplier = 1;
    OX.game.player.invuln = 9999;
  });

  // glow do placar na cor da zona (§10) aplicado pelo hud.js
  const zonaCss = await cp.evaluate(() =>
    document.getElementById('hud-score').style.getPropertyValue('--zona').trim());
  ok(/^#[0-9a-fA-F]{6}$/.test(zonaCss), `placar com glow da zona (${zonaCss || 'vazio'})`);

  // quebra de combo: contador estilhaça em fragmentos por 350 ms (§9)
  await cp.evaluate(() => OX.emit('game:combo', { combo: 3, multiplier: 3, frac: 1 }));
  await cp.waitForTimeout(60);
  await cp.evaluate(() => OX.emit('game:combo', { combo: 0, multiplier: 1, frac: 0 }));
  await cp.waitForTimeout(60);
  const estilhaco = await cp.evaluate(() =>
    document.getElementById('hud-combo-wrap').classList.contains('estilhaco'));
  ok(estilhaco, 'quebra de combo estilhaça o contador (classe estilhaco)');
  await cp.waitForTimeout(400);
  const estilhacoFora = await cp.evaluate(() =>
    !document.getElementById('hud-combo-wrap').classList.contains('estilhaco'));
  ok(estilhacoFora, 'estilhaço do combo some em ~350 ms');

  // vinheta de dano: borda danger acende no canto e some (§9)
  const cantoNormal = await cp.evaluate(() => window.__LINHA(3, 3, 5)[0]);
  await cp.evaluate(() => { OX.game.danoT = 0.35; });
  await cp.waitForTimeout(80);
  const cantoDano = await cp.evaluate(() => window.__LINHA(3, 3, 5)[0]);
  await cp.evaluate(() => { OX.game.danoT = 0; });
  ok(cantoDano[0] > cantoNormal[0] + 30,
    `vinheta de dano nas bordas (r ${cantoNormal[0]} -> ${cantoDano[0]})`);

  // combo quebrado por tempo: fundo escurece 15% por 350 ms (§9)
  await cp.evaluate(() => { OX.game.combo = 3; OX.game.comboTimer = 0.02; });
  await cp.waitForTimeout(60);
  const comboBreakT = await cp.evaluate(() => OX.game.comboBreakT);
  ok(comboBreakT > 0.15 && comboBreakT <= 0.35,
    `fundo escurece ao quebrar o combo (comboBreakT=${comboBreakT.toFixed(2)})`);
  await cp.evaluate(() => { OX.game.comboBreakT = 0; OX.game.combo = 0; OX.game.comboTimer = 0; });

  // ===== TIER DE QUALIDADE (A5) =====
  // §11: bloom em 1/4 (Alto), 1/6 (Médio), desligado (Baixo)
  await cp.evaluate(() => { OX.game.qualLock = 0.9; });
  await cp.waitForTimeout(150);
  const bloomAlto = await cp.evaluate(() => OX.game.bloomFrac);
  ok(Math.abs(bloomAlto - 0.25) < 1e-9, `tier Alto com bloom em 1/4 (${bloomAlto})`);

  await cp.evaluate(() => { OX.game.qualLock = 0.7; });
  await cp.waitForTimeout(150);
  const bloomMedio = await cp.evaluate(() => OX.game.bloomFrac);
  ok(Math.abs(bloomMedio - 1 / 6) < 1e-9, `tier Médio com bloom em 1/6 (${bloomMedio.toFixed(3)})`);

  // vinheta some no Baixo (§11) — o canto do fundo estático clareia
  const cantoAlto = await cp.evaluate(() => window.__LINHA(3, 3, 3)[0]);
  await cp.evaluate(() => { OX.game.qualLock = 0.55; });
  await cp.waitForTimeout(180);
  const bloomBaixo = await cp.evaluate(() => OX.game.bloomFrac);
  ok(bloomBaixo === 0, `tier Baixo sem bloom (${bloomBaixo})`);
  const cantoBaixo = await cp.evaluate(() => window.__LINHA(3, 3, 3)[0]);
  const somaAlto = cantoAlto[0] + cantoAlto[1] + cantoAlto[2];
  const somaBaixo = cantoBaixo[0] + cantoBaixo[1] + cantoBaixo[2];
  ok(somaBaixo > somaAlto + 8,
    `vinheta desligada no Baixo (canto rgb ${cantoAlto.join(',')} -> ${cantoBaixo.join(',')})`);

  // §11: teto de partículas do tier — burst de 100 nasce no teto
  await cp.evaluate(() => {
    OX.fx.setPoolMax(40);
    for (let i = 0; i < 6; i++) OX.fx.burst(120, 120, '#22E4FF', 40);
  });
  const vivas = await cp.evaluate(() => OX.fx.countActive());
  ok(vivas <= 40, `teto de 40 partículas respeitado (${vivas} vivas para 240 pedidas)`);

  // §11: a qualidade nunca sobe sozinha durante a partida
  await cp.evaluate(() => {
    OX.game.qualLock = null;
    OX.game.resScale = 0.55;
    OX.game.smoothFrames = 600;   // "pronto" para subir — mas está em partida
  });
  await cp.waitForTimeout(1300);
  const escalaDepois = await cp.evaluate(() => OX.game.resScale);
  ok(escalaDepois === 0.55, `qualidade não sobe na partida (escala segue ${escalaDepois})`);

  // ===== QUALIDADE MANUAL (A7/HD) =====
  // Configurações → Imagem: o jogador escolhe e a escala trava no
  // valor escolhido, mesmo em partida (é decisão do usuário, não a
  // adaptação automática que o §11 regula).
  await cp.evaluate(() => { OX.state.settings.imageQuality = 'alta'; });
  await cp.waitForTimeout(300);
  const escalaAlta = await cp.evaluate(() => OX.game.resScale);
  ok(escalaAlta === 1, `qualidade manual "Alta (HD)" trava 100% (${escalaAlta})`);
  await cp.evaluate(() => { OX.state.settings.imageQuality = 'baixa'; });
  await cp.waitForTimeout(300);
  const escalaBaixa = await cp.evaluate(() => OX.game.resScale);
  ok(escalaBaixa === 0.55, `qualidade manual "Baixa" trava 55% (${escalaBaixa})`);
  await cp.evaluate(() => {
    OX.state.settings.imageQuality = 'auto';
    OX.game.resScale = 1;      // deixa o estado limpo p/ o fechamento
  });

  await c.context.close();

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'CENÁRIO OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
