/* =========================================================
   SCORE (Fase 2) — réguas de pontuação da partida.
   Ondas 100% determinísticas pelo tempo (sem RNG, Corrida do
   Dia intacta) e constantes finitas/positivas. Os MESMOS
   números são espelhados em app_rules (backend-parity).
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SCORE, waveForTime, waveBonus } from '../net/rules.js';

test('waveForTime é determinístico e cai na janela certa de 20 s', () => {
  assert.equal(waveForTime(0), 1);
  assert.equal(waveForTime(SCORE.WAVE_SECONDS - 0.001), 1);
  assert.equal(waveForTime(SCORE.WAVE_SECONDS), 2);
  assert.equal(waveForTime(SCORE.WAVE_SECONDS * 3 - 0.1), 3);
  assert.equal(waveForTime(SCORE.WAVE_SECONDS * 3), 4);
  // mesma entrada ⇒ sempre a mesma onda (duas passagens idênticas)
  assert.equal(waveForTime(41.7), waveForTime(41.7));
});

test('waveForTime é à prova de valor ruim (clamp em ≥ 1)', () => {
  assert.equal(waveForTime(-5), 1);
  assert.equal(waveForTime(NaN), 1);
  assert.equal(waveForTime('abc'), 1);
  assert.equal(waveForTime(undefined), 1);
});

test('bônus de onda: 1ª não paga, cresce e tem teto', () => {
  assert.equal(waveBonus(1), 0);
  assert.equal(waveBonus(2), SCORE.WAVE_BONUS * 2);
  assert.equal(waveBonus(3), SCORE.WAVE_BONUS * 3);
  assert.equal(waveBonus(SCORE.WAVE_BONUS_MAX), SCORE.WAVE_BONUS * SCORE.WAVE_BONUS_MAX);
  // teto: ondas além do máximo pagam o mesmo do teto (score plausível)
  assert.equal(waveBonus(SCORE.WAVE_BONUS_MAX + 1), SCORE.WAVE_BONUS * SCORE.WAVE_BONUS_MAX);
  assert.equal(waveBonus(9999), SCORE.WAVE_BONUS * SCORE.WAVE_BONUS_MAX);
  assert.equal(waveBonus(0), 0);
  assert.equal(waveBonus(NaN), 0);
});

test('constantes de score finitas, inteiras e plausíveis', () => {
  for (const k of ['PICKUP', 'NEAR_MISS', 'NEAR_GAP', 'WAVE_SECONDS',
    'WAVE_BONUS', 'WAVE_BONUS_MAX', 'MAX_MULT', 'X2_FACTOR']) {
    assert.ok(Number.isFinite(SCORE[k]) && SCORE[k] > 0, `${k} deve ser > 0`);
  }
  assert.ok(Number.isInteger(SCORE.PICKUP), 'PICKUP inteiro');
  assert.ok(Number.isInteger(SCORE.NEAR_MISS), 'NEAR_MISS inteiro');
  assert.equal(SCORE.X2_FACTOR, 2, 'dobro-pontos é ×2');
  assert.ok(SCORE.WAVE_SECONDS >= 5, 'onda não vira tela de carregamento');
  // soma máxima plausível de uma partida longa de 2 h cabe no RUN.MAX_SCORE:
  // bônus de onda limitado a WAVE_BONUS_MAX por onda (regra do servidor)
  const ondas2h = Math.floor(7200 / SCORE.WAVE_SECONDS);
  const piorCaso = SCORE.WAVE_BONUS * SCORE.WAVE_BONUS_MAX
    * (ondas2h - SCORE.WAVE_BONUS_MAX);
  assert.ok(piorCaso < 200000, `bônus acumulado plausível (${piorCaso} < 200000)`);
});
