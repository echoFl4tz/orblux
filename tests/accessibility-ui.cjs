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
     (6) sem env(safe-area-inset-*) — versão desktop-only;
     (7) contraste de texto em 8 telas (§12): principal ≥ 7:1 e
         secundário ≥ 4,5:1 sobre o fundo efetivo (WCAG 2.1);
     (8) zero erros de console.
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

  /* ============ (4)(5) teclado, aria e sem safe-area (sem reduced) ============ */
  console.log('===== A11Y — teclado, aria e desktop-only =====');
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
  // desktop-only: env(safe-area-inset-*) foi removido junto com o layout mobile
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const usoSafe = (css.match(/env\(safe-area-inset-/g) || []).length;
  ok(usoSafe === 0,
    `sem env(safe-area-inset-) no CSS (${usoSafe} usos — versão desktop-only)`);

  /* ============ (7) contraste de texto por tela (§12) ============ */
  console.log('===== A11Y — contraste de texto (§12: 7:1 / 4,5:1) =====');
  // Avalia cada elemento com texto visível: fundo efetivo sobe a árvore
  // (compondo alfa) e o par texto/fundo é medido em WCAG 2.1.
  // Principal (títulos, botões, corpo) precisa de 7:1; secundário
  // (rótulos pequenos, legendas) de 4,5:1. Desabilitados são isentos.
  const AUDITAR = () => {
    const lum = (r, g, b) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parseCor = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const sobre = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const fundoEfetivo = (el) => {
      const pilha = [];
      let atual = el;
      while (atual && atual !== document.documentElement) {
        const c = parseCor(getComputedStyle(atual).backgroundColor);
        if (c && c.a > 0) {
          pilha.push(c);
          if (c.a >= 1) break;
        }
        atual = atual.parentElement;
      }
      let base = { r: 5, g: 6, b: 15, a: 1 };   // --bg-0
      for (let i = pilha.length - 1; i >= 0; i--) base = sobre(pilha[i], base);
      return base;
    };
    // contraste do texto contra o fundo; com gradiente, mede o pior caso
    // entre as paradas opacas (compostas sobre o fundo de baixo)
    const contraste = (fg, bg, cs) => {
      const img = cs.backgroundImage || '';
      if (/gradient\(/.test(img)) {
        const stops = (img.match(/rgba?\([^)]+\)/g) || [])
          .map(parseCor).filter((c) => c && c.a >= 0.9);
        if (stops.length) {
          return Math.min(...stops.map((s) => {
            const eff = sobre(s, bg);
            return razao(sobre(fg, eff), eff);
          }));
        }
      } else if (img && img !== 'none') {
        return null;   // texto sobre imagem fotográfica: fora do cálculo
      }
      return razao(sobre(fg, bg), bg);
    };
    const razao = (c1, c2) => {
      const l1 = lum(c1.r, c1.g, c1.b);
      const l2 = lum(c2.r, c2.g, c2.b);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const visivel = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n);
        if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.15) return false;
        n = n.parentElement;
      }
      return true;
    };
    const violacoes = [];
    const vistos = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!visivel(el)) continue;
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.fontSize) < 11) continue;
      const proprio = [...el.childNodes]
        .some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!proprio) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const fg = parseCor(cs.color);
      if (!fg || fg.a < 0.99) continue;   // alfa baixo = decoração, não leitura
      const cr = contraste(fg, fundoEfetivo(el), cs);
      if (cr == null) continue;           // sobre imagem: não mensurável por CSS
      const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.id} ${el.tagName}`;
      const secundario = /\b(caption|label|hint|legal|muted|aux|kicker|tag|badge|small|sub|over|meta|note|desc)\b/i.test(cls)
        || parseFloat(cs.fontSize) <= 13;
      const min = secundario ? 4.5 : 7;
      const chave = `${cls}|${el.textContent.trim().slice(0, 24)}`;
      if (cr + 0.02 < min && !vistos.has(chave)) {
        vistos.add(chave);
        violacoes.push({
          txt: el.textContent.trim().slice(0, 30),
          cls: cls.trim().slice(0, 46),
          cr: Math.round(cr * 100) / 100,
          min,
          fg: cs.color,
        });
      }
    }
    return violacoes;
  };
  const relatar = (nome, v) => ok(v.length === 0,
    `${nome}: contraste dentro do §12 (${v.length} violações)${v.length
      ? ' — ' + v.slice(0, 4).map((x) => `${x.cr} < ${x.min} "${x.txt}" [${x.fg}]`).join(' | ')
      : ''}`);

  const telas = [
    ['menu', () => { OX.screen('menu'); }],
    ['ajustes', () => { OX.screen('settings'); }],
    ['como jogar', () => { OX.screen('howto'); }],
    ['loja', () => { OX.screen('skins'); OX.emit('shop:open'); }],
    ['ranking', () => { OX.screen('ranking'); OX.emit('screen:ranking'); }],
  ];
  for (const [nome, abrir] of telas) {
    await bp.evaluate(abrir);
    await bp.waitForTimeout(350);
    relatar(nome, await bp.evaluate(AUDITAR));
  }
  // HUD da partida, pausa e fim de jogo (entra pelo botão Jogar, como o jogador)
  await bp.evaluate(() => OX.screen('menu'));
  await bp.click('[data-action="play"]');
  await bp.waitForFunction(() => document.body.dataset.screen === 'playing'
    && window.OX.game.mode === 'playing');
  await bp.evaluate(() => { OX.game.player.invuln = 9999; });
  await bp.waitForTimeout(500);
  relatar('HUD da partida', await bp.evaluate(AUDITAR));
  await bp.click('#btn-pause');
  await bp.waitForTimeout(300);
  relatar('pausa', await bp.evaluate(AUDITAR));
  // fim de jogo: força o fim (só age em partida, então retoma antes)
  await bp.evaluate(() => { document.querySelector('[data-action="resume"]').click(); });
  await bp.waitForFunction(() => document.body.dataset.screen !== 'pause'
    && window.OX.game.mode === 'playing');
  await bp.evaluate(() => OX.endRun());
  await bp.waitForSelector('#screen-gameover.active');
  await bp.waitForTimeout(250);
  relatar('fim de jogo', await bp.evaluate(AUDITAR));

  await b.context.close();

  await browser.close();

  console.log('===== CONSOLE =====');
  ok(ALL_ERRORS.length === 0, `zero erros de console (${ALL_ERRORS.length})`);
  if (ALL_ERRORS.length) console.log(ALL_ERRORS.join('\n'));

  if (server) { try { process.kill(-server.pid); } catch { /* já morreu */ } }
  console.log(`\n${failures === 0 ? 'ACESSIBILIDADE OK' : `FALHAS: ${failures}`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
