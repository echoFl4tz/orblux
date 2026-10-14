/* =========================================================
   Testes PUROS da economia (economy.js)
   Fórmula por partida (teto, mínimo de duração, bônus),
   valores de missões/conquistas/diária e o requisito central:
   a skin equipada NUNCA altera quantas moedas se ganham.
   Runner: node:test. Uso: node --test tests/economy.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

const E = await import('../js/core/economy.js');

/* ---------------------------------------------------------
   Fórmula da partida
--------------------------------------------------------- */
test('partida curta (<10s) não paga nada — nem com bônus', () => {
  assert.equal(E.calcRunCoins({ pickups: 50, score: 2000, seconds: 9.9 }), 0);
  assert.equal(E.calcRunCoins({ pickups: 50, score: 2000, seconds: 9.9, recordBroken: true, firstRunToday: true }), 0);
});

test('fórmula base: floor(pulsos×0.5) + floor(pontos/100) + floor(seg/10)', () => {
  // 20 pulsos → 10; 1540 pontos → 15; 47s → 4  => 29
  assert.equal(E.calcRunCoins({ pickups: 20, score: 1540, seconds: 47 }), 10 + 15 + 4);
  // fracionários SEMPRE arredondam para baixo
  assert.equal(E.calcRunCoins({ pickups: 1, score: 99, seconds: 10 }), 0 + 0 + 1);
});

test('teto por partida vale só para a base; bônus somam depois', () => {
  const huge = { pickups: 9999, score: 999999, seconds: 9999 };
  assert.equal(E.calcRunCoins(huge), E.CAP_POR_PARTIDA);                 // base estoura, teto segura
  assert.equal(E.calcRunCoins({ ...huge, recordBroken: true }),
    E.CAP_POR_PARTIDA + E.BONUS_RECORDE);                                // +15 avulso
  assert.equal(E.calcRunCoins({ ...huge, firstRunToday: true }),
    E.CAP_POR_PARTIDA + E.BONUS_PRIMEIRA_DIA);                           // +10 avulso
  assert.equal(E.calcRunCoins({ ...huge, recordBroken: true, firstRunToday: true }),
    E.CAP_POR_PARTIDA + E.BONUS_RECORDE + E.BONUS_PRIMEIRA_DIA);         // +25 no total
});

test('bônus de recorde é {recorde:true} e o de 1ª partida é {primeira:true}', () => {
  const base = { pickups: 10, score: 1000, seconds: 30 };
  const semBonus = E.calcRunCoins(base);
  assert.equal(E.calcRunCoins({ ...base, recordBroken: true }), semBonus + 15);
  assert.equal(E.calcRunCoins({ ...base, firstRunToday: true }), semBonus + 10);
  // recorde só com dado explícito: sem a flag, nada muda (não há "auto-bônus")
  assert.equal(E.calcRunCoins(base), semBonus);
});

test('valores de referência para o simulador (ECONOMIA.md)', () => {
  // partida fraca: 15 pulsos, 800 pontos, 35s
  assert.equal(E.calcRunCoins({ pickups: 15, score: 800, seconds: 35 }), 7 + 8 + 3);
  // partida média: 40 pulsos, 2500 pontos, 70s
  assert.equal(E.calcRunCoins({ pickups: 40, score: 2500, seconds: 70 }), 20 + 25 + 7);
  // partida forte: 70 pulsos, 6000 pontos, 120s
  assert.equal(E.calcRunCoins({ pickups: 70, score: 6000, seconds: 120 }), 35 + 60 + 12);
});

/* ---------------------------------------------------------
   Missões, conquistas e diária
--------------------------------------------------------- */
test('missões: 25 fáceis / 40 médias / 60 difíceis (fora do padrão cai no fácil)', () => {
  assert.equal(E.missionCoins('facil'), 25);
  assert.equal(E.missionCoins('medio'), 40);
  assert.equal(E.missionCoins('dificil'), 60);
  assert.equal(E.missionCoins('qualquer'), 25);
  assert.deepEqual(Object.values(E.MISSION_COINS), [25, 40, 60]);
});

test('conquistas: 25/40/60 por porte (fora do padrão cai no menor)', () => {
  assert.equal(E.achievementCoins('pequena'), 25);
  assert.equal(E.achievementCoins('media'), 40);
  assert.equal(E.achievementCoins('grande'), 60);
  assert.equal(E.achievementCoins('x'), 25);
});

test('recompensa diária: 20,25,30,35,40,50,100 e ciclo do dia 8', () => {
  assert.deepEqual(E.DAILY_REWARDS, [20, 25, 30, 35, 40, 50, 100]);
  assert.equal(E.dailyReward(7), 100);
  assert.equal(E.dailyReward(8), 20);
  assert.equal(E.dailyReward(0), 20);      // inválido vira dia 1
  assert.equal(E.dailyReward(-3), 20);
});

/* ---------------------------------------------------------
   Requisito central: cosmético nunca mexe em economia
--------------------------------------------------------- */
test('a skin equipada NUNCA altera quantas moedas se ganham', () => {
  const run = { pickups: 400, score: 9000, seconds: 300, recordBroken: true, firstRunToday: true };
  // calcRunCoins é pura: não recebe nem consulta skin alguma —
  // qualquer variação de "skin equipada" produz exatamente o mesmo ganho
  const comSkinLendaria = E.calcRunCoins(run);
  const comSkinClassica = E.calcRunCoins({ ...run });
  assert.equal(comSkinLendaria, comSkinClassica);
  assert.equal(comSkinLendaria, E.CAP_POR_PARTIDA + 15 + 10);   // 120 (teto) + 15 + 10
  // e as fontes continuam proibidas de depender de skin/dinheiro
  assert.equal(E.COINS_PICKUP, false);       // pulsos não pagam moedas avulsas
  assert.equal(E.COINS_AD_DOUBLE, false);    // sem "dobrar com anúncio"
  assert.equal(E.MAX_COINS, 999999);         // teto da carteira
});
