/* =========================================================
   Testes do THEME e helpers puros (direção de arte, A2)
   zonas de cor por nível, faixa de qualidade, rgba() e
   integridade da paleta (cenário nunca usa danger nem gold).
   Runner: node:test. Uso: node --test tests/theme.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME, zoneForLevel, tierForRes, rgba } from '../js/game/theme.js';

test('zonas: faixas do guia (1-3, 4-6, 7-9, 10-12)', () => {
  assert.equal(THEME.zones.length, 4);
  assert.deepEqual(THEME.zones.map((z) => z.from), [1, 4, 7, 10]);
  // cores batem com a tabela §3 do guia
  assert.equal(THEME.zones[0].bgTop, '#06142A');
  assert.equal(THEME.zones[0].grid, '#22E4FF');
  assert.equal(THEME.zones[3].bgTop, '#241406');
  assert.equal(THEME.zones[3].grid, '#FFA63D');
});

test('cenário nunca usa as cores danger nem gold (guia §2)', () => {
  const proibidas = [THEME.color.danger, THEME.color.gold].map((c) => c.toUpperCase());
  for (const z of THEME.zones) {
    for (const [k, v] of Object.entries(z)) {
      if (k === 'from') continue;
      assert.ok(!proibidas.includes(String(v).toUpperCase()),
        `zona ${z.from} campo ${k} = ${v} não pode ser danger/gold`);
    }
  }
});

test('zoneForLevel: limites e pureza (puro, sem RNG)', () => {
  assert.equal(zoneForLevel(1).index, 0);
  assert.equal(zoneForLevel(3).index, 0);
  assert.equal(zoneForLevel(4).index, 1);
  assert.equal(zoneForLevel(6).index, 1);
  assert.equal(zoneForLevel(7).index, 2);
  assert.equal(zoneForLevel(10).index, 3);
  assert.equal(zoneForLevel(12).index, 3);
  // determinístico: mesmo nível ⇒ mesma zona
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(zoneForLevel(7), zoneForLevel(7));
  }
  // inválido vira nível 1 (zona 0), nunca quebra
  assert.equal(zoneForLevel(0).index, 0);
  assert.equal(zoneForLevel(-5).index, 0);
  assert.equal(zoneForLevel(NaN).index, 0);
  assert.equal(zoneForLevel(undefined).index, 0);
});

test('zoneForLevel: intensidade +15% por ciclo após o 12 (teto 1,6)', () => {
  assert.equal(zoneForLevel(12).intensity, 1);        // 1º ciclo: sem bônus
  assert.equal(zoneForLevel(13).intensity, 1.15);     // repete do início +15%
  assert.equal(zoneForLevel(24).intensity, 1.15);
  assert.equal(zoneForLevel(25).intensity, 1.3);
  assert.equal(zoneForLevel(49).intensity, 1.6);      // 1 + 0,6 = 1,6 (na tampa)
  assert.equal(zoneForLevel(1000).intensity, 1.6);    // teto cumulativo
});

test('tierForRes: Alto/Médio/Baixo pela escala de resolução', () => {
  assert.equal(tierForRes(1), 'high');
  assert.equal(tierForRes(0.85), 'high');
  assert.equal(tierForRes(0.84), 'mid');
  assert.equal(tierForRes(0.65), 'mid');
  assert.equal(tierForRes(0.55), 'low');   // escala mínima atual (perf 4x)
  assert.equal(tierForRes(0), 'low');
  assert.equal(tierForRes(NaN), 'low');
  // camadas por faixa: Alto 4, Médio 3, Baixo 2 (guia §11)
  assert.equal(THEME.quality.high.layers, 4);
  assert.equal(THEME.quality.mid.layers, 3);
  assert.equal(THEME.quality.low.layers, 2);
});

test('rgba(): hex → rgba sem alfa quebrado', () => {
  assert.equal(rgba('#22E4FF', 0.5), 'rgba(34, 228, 255, 0.5)');
  assert.equal(rgba('#000', 1), 'rgba(0, 0, 0, 1)');
  assert.equal(rgba('#FF3B5C', 0.123), 'rgba(255, 59, 92, 0.123)');
});

test('speedFactor e unit batem com o guia (§4 e §5)', () => {
  assert.equal(THEME.speedFactor(1), 1.04);
  assert.equal(THEME.speedFactor(15), 1.6);    // teto
  assert.equal(THEME.speedFactor(30), 1.6);
  assert.equal(THEME.unit(360, 640), 3.6);
  assert.equal(THEME.unit(1280, 720), 5.6);
  assert.equal(THEME.unit(200, 100), 3.6);     // clamp mínimo 360
});
