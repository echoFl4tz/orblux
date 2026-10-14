/* =========================================================
   Teste CRÍTICO — a hitbox NÃO muda com a skin (Etapa 3)
   Usa um canvas falso que grava arc()/drawImage() para provar que,
   para TODAS as 21 skins (e personalizações), o corpo é desenhado
   sobre a MESMA caixa derivada do raio base p.r:
       box = (p.r * 1.25) / 0.49      (ORB_SCALE / ORB_CIRCLE)
   Também garante: sem shadowBlur nem createRadialGradient por frame
   no contexto principal (só sprites em cache).
   Runner: node:test. Uso: node --test tests/skin-hitbox.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---- globals falsos ANTES de importar os módulos ----
function makeStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i],
    get length() { return m.size; },
  };
}
globalThis.localStorage = makeStore({ pn_version: '3' });

/** Canvas falso: métodos gravam ou dão no-op; gradiente tem addColorStop. */
function makeCtx(record = null) {
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arcTo() {},
    fillRect() {}, strokeRect() {}, clip() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    arc(_x, _y, r) { if (record) record.arcs.push(r); },
    drawImage(_img, _x, _y, w, h) { if (record) record.images.push({ w, h }); },
    createRadialGradient() {
      if (record) record.gradients++;
      return { addColorStop() {} };
    },
    createLinearGradient() {
      if (record) record.gradients++;
      return { addColorStop() {} };
    },
    measureText: () => ({ width: 0 }),
  };
  return ctx;
}
const spriteCtx = makeCtx();
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => spriteCtx }),
};

const { SKINS, resolveLook, RASTROS, AURAS } = await import('../js/game/skins.js');
const { drawPlayer, createPlayer, circleRectHit, circlesHit } = await import('../js/game/entities.js');

const ORB_SCALE = 1.25;
const ORB_CIRCLE = 0.49;

function renderWith(look, r = 12, reduceMotion = false) {
  const rec = { arcs: [], images: [], gradients: 0 };
  const ctx = makeCtx(rec);
  const p = createPlayer(100, 200, r);
  // rastro em movimento (ativa squash & stretch)
  p.trail = [
    { x: 100, y: 200 }, { x: 104, y: 196 },
    { x: 110, y: 191 }, { x: 117, y: 187 }, { x: 125, y: 184 },
  ];
  drawPlayer(ctx, p, 1.25, reduceMotion, look);
  return rec;
}

/** Isola a imagem do CORPO (a do halo tem outra escala). */
function bodyBox(rec, r) {
  const alvo = (r * ORB_SCALE) / ORB_CIRCLE;
  const body = rec.images.find((im) => Math.abs(im.w - alvo) < 0.001 && im.w === im.h);
  return body || null;
}

test('TODAS as 21 skins desenham o corpo na MESMA caixa do raio base', () => {
  const r = 12;
  const esperado = (r * ORB_SCALE) / ORB_CIRCLE;
  for (const s of SKINS) {
    const rec = renderWith(resolveLook(s.id), r);
    const body = bodyBox(rec, r);
    assert.ok(body, `${s.id}: corpo não encontrado no render`);
    assert.ok(
      Math.abs(body.w - esperado) < 0.0001,
      `${s.id}: caixa do corpo ${body.w} ≠ esperado ${esperado} (hitbox mudou!)`,
    );
  }
});

test('Raio base diferente escala PROPORCIONALMENTE (nunca fixo pela skin)', () => {
  for (const r of [6, 12, 20]) {
    const esperado = (r * ORB_SCALE) / ORB_CIRCLE;
    for (const s of SKINS) {
      const rec = renderWith(resolveLook(s.id), r);
      const body = bodyBox(rec, r);
      assert.ok(body, `${s.id} @r=${r}: sem corpo`);
      assert.ok(Math.abs(body.w - esperado) < 0.0001, `${s.id} @r=${r}: caixa ${body.w} ≠ ${esperado}`);
    }
  }
});

test('Personalização (paleta/rastro/aura diferentes) NÃO altera a hitbox', () => {
  const r = 14;
  const esperado = (r * ORB_SCALE) / ORB_CIRCLE;
  for (const s of SKINS) {
    for (const paleta of s.personalizacao.paletasPermitidas) {
      for (const rastro of s.personalizacao.rastros) {
        for (const aura of s.personalizacao.auras) {
          const rec = renderWith(resolveLook(s.id, { paleta, rastro, aura }), r);
          const body = bodyBox(rec, r);
          assert.ok(body, `${s.id} (${paleta}/${rastro}/${aura}): sem corpo`);
          assert.ok(Math.abs(body.w - esperado) < 0.0001,
            `${s.id} (${paleta}/${rastro}/${aura}): caixa mudou`);
        }
      }
    }
  }
});

test('Reduzir movimento mantém a MESMA geometria', () => {
  const r = 12;
  const esperado = (r * ORB_SCALE) / ORB_CIRCLE;
  for (const s of SKINS) {
    const rec = renderWith(resolveLook(s.id), r, true);
    const body = bodyBox(rec, r);
    assert.ok(body && Math.abs(body.w - esperado) < 0.0001, `${s.id}: geometria mudou c/ mov. reduzido`);
  }
});

test('Halo tem tamanho constante entre skins (só a cor muda)', () => {
  const r = 12;
  let haloRef = null;
  for (const s of SKINS) {
    const rec = renderWith(resolveLook(s.id), r);
    const alvo = (r * ORB_SCALE) / ORB_CIRCLE;
    const halo = rec.images.find((im) => Math.abs(im.w - alvo) >= 0.001); // a que NÃO é o corpo
    assert.ok(halo, `${s.id}: halo ausente`);
    if (haloRef === null) haloRef = halo.w;
    assert.ok(Math.abs(halo.w - haloRef) < 0.0001, `${s.id}: halo com tamanho diferente`);
  }
});

test('Sem createRadialGradient nem shadowBlur POR FRAME no contexto principal', async () => {
  const fs = await import('node:fs');
  for (const s of SKINS) {
    const rec = renderWith(resolveLook(s.id));
    assert.equal(rec.gradients, 0, `${s.id}: gradiente criado por frame!`);
  }
  // verificação direta: nenhum CÓDIGO de render seta shadowBlur (comentários ignorados)
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const src = strip(fs.readFileSync(new URL('../js/game/skinrender.js', import.meta.url), 'utf8'));
  assert.ok(!/shadowBlur/.test(src), 'skinrender.js usa shadowBlur');
  const srcEnt = strip(fs.readFileSync(new URL('../js/game/entities.js', import.meta.url), 'utf8'));
  assert.ok(!/shadowBlur/.test(srcEnt), 'entities.js usa shadowBlur');
});

test('Os 18 estilos de rastro existentes renderizam sem erro', () => {
  const r = 12;
  const cobertos = new Set();
  for (const s of SKINS) {
    const look = resolveLook(s.id);
    cobertos.add(look.rastro.tipo);
    assert.doesNotThrow(() => renderWith(look, r), `rastro "${look.rastro.tipo}" quebrou`);
  }
  assert.equal(cobertos.size, 18, `só ${cobertos.size}/18 estilos de rastro exercitados`);
  // e todos os tipos de aura
  const auras = new Set(SKINS.map((s) => AURAS[s.aura].tipo));
  assert.ok(auras.size >= 3, 'poucos tipos de aura exercitados');
  assert.ok(new Set(Object.values(RASTROS).map((x) => x.tipo)).size >= 18);
});

test('Colisão usa SEMPRE o raio base (p.r) — auxiliares de colisão intactos', () => {
  const p = createPlayer(50, 50, 10);
  // círculo do jogador vs obstáculo: raio de colisão = p.r (sem folga de skin)
  assert.equal(circlesHit(p.x, p.y, p.r, 50 + p.r + 1, 50, 1), true, 'folga a mais na colisão');
  assert.equal(circlesHit(p.x, p.y, p.r, 50 + p.r + 3, 50, 1), false, 'hitbox maior que o raio base');
  assert.equal(circleRectHit(p.x, p.y, p.r, 61, 45, 4, 4), false, 'retângulo fora do raio base');
  assert.equal(circleRectHit(p.x, p.y, p.r, 59, 45, 4, 4), true, 'retângulo dentro do raio base');
});
