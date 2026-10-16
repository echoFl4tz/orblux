/* =========================================================
   Testes da personalização de skins — Etapa 2
   • vocabulário curado integro (nada de entrada livre)
   • contraste mínimo (núcleo sempre mais claro que meio/borda)
   • nenhuma paleta usa exatamente as cores dos obstáculos
     (danger + borda — evita confundir skin com perigo)
   • resolveLook só produz chaves visuais (nunca gameplay)
   Runner: node:test. Uso: node --test tests/skin-custom.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

const { SKINS, PALETAS, RASTROS, AURAS, COLETA_FX, resolveLook } =
  await import('../js/game/skins.js');

/** Cores de obstáculo (perigo): danger + borda (guia §2/§7 da direção
 *  "Corrida de luz num túnel cósmico") — nenhuma paleta de skin pode
 *  usá-las exatamente (evita confundir skin com perigo). */
const CORES_OBSTACULO = ['#ff3b5c', '#ff9aae'];

/** Luminância relativa (WCAG) de uma cor hex de 6 dígitos. */
function lum(hex) {
  const h = hex.replace('#', '');
  const ch = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(ch(0)) + 0.7152 * f(ch(2)) + 0.0722 * f(ch(4));
}

test('todo vocabulário de personalização referencia chaves existentes', () => {
  for (const s of SKINS) {
    const p = s.personalizacao;
    assert.ok(p.paletasPermitidas.length >= 1, `${s.id}: sem paletas`);
    for (const k of p.paletasPermitidas) assert.ok(PALETAS[k], `${s.id}: paleta inválida "${k}"`);
    for (const k of p.rastros) assert.ok(RASTROS[k], `${s.id}: rastro inválido "${k}"`);
    for (const k of p.auras) assert.ok(AURAS[k], `${s.id}: aura inválida "${k}"`);
    // padrões da skin precisam estar dentro do próprio vocabulário
    assert.ok(p.paletasPermitidas.includes(s.paleta), `${s.id}: paleta padrão fora do vocabulário`);
    assert.ok(p.rastros.includes(s.rastro), `${s.id}: rastro padrão fora do vocabulário`);
    assert.ok(p.auras.includes(s.aura), `${s.id}: aura padrão fora do vocabulário`);
    assert.ok(COLETA_FX[s.coletaFx], `${s.id}: coletaFx inválido`);
    assert.ok(COLETA_FX[s.particulas], `${s.id}: particulas inválido`);
  }
});

test('pagas oferecem variedade curada (mín. 3 paletas e 2 rastros/auras)', () => {
  for (const s of SKINS) {
    if (s.tier === 'free') continue;
    assert.ok(s.personalizacao.paletasPermitidas.length >= 3, `${s.id}: <3 paletas`);
    assert.ok(s.personalizacao.rastros.length >= 2, `${s.id}: <2 rastros`);
    assert.ok(s.personalizacao.auras.length >= 2, `${s.id}: <2 auras`);
  }
});

test('contraste: núcleo sempre mais claro que meio e borda (orbe legível no escuro)', () => {
  for (const [id, p] of Object.entries(PALETAS)) {
    assert.ok(lum(p.nucleo) > lum(p.meio), `${id}: núcleo (${p.nucleo}) não é mais claro que o meio (${p.meio})`);
    assert.ok(lum(p.nucleo) > lum(p.borda), `${id}: núcleo (${p.nucleo}) não é mais claro que a borda (${p.borda})`);
    assert.notEqual(p.nucleo.toLowerCase(), p.meio.toLowerCase(), `${id}: núcleo igual ao meio`);
    assert.notEqual(p.nucleo.toLowerCase(), p.borda.toLowerCase(), `${id}: núcleo igual à borda`);
  }
});

test('nenhuma paleta usa exatamente as cores dos obstáculos (sem confundir com perigo)', () => {
  for (const [id, p] of Object.entries(PALETAS)) {
    for (const [campo, cor] of Object.entries(p)) {
      if (campo === 'nome') continue;
      assert.ok(!CORES_OBSTACULO.includes(cor.toLowerCase()),
        `${id}.${campo}: ${cor} é idêntica à cor de obstáculo`);
    }
  }
});

test('personalização só produz chaves visuais (nunca toca gameplay)', () => {
  const look = resolveLook('brasa_neon', { paleta: 'lava', rastro: 'derretido', aura: 'nenhuma' });
  const proibidas = ['r', 'raio', 'speed', 'velocidade', 'hitbox', 'spawn', 'score', 'pontos'];
  for (const k of Object.keys(look)) {
    assert.ok(!proibidas.includes(k), `look contém chave de gameplay: ${k}`);
  }
  assert.equal(look.paleta.nome, 'Lava', 'custom deve valer na resolução');
  assert.equal(look.rastro.tipo, 'derretido');
  assert.equal(look.aura.tipo, 'nenhuma');
  // efeitos de coleta sempre vindos do vocabulário curado
  assert.ok(look.coletaFx && look.coletaFx.cor, 'coletaFx deve resolver para entrada do COLETA_FX');
});
