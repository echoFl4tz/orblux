/* =========================================================
   ECONOMIA — números do sistema de moedas em UM só lugar

   REGRAS INEGOCIÁVEIS
   - Moedas NÃO se compram com dinheiro real, não se vendem,
     trocam nem transferem: só se ganham JOGANDO (MONETIZACAO.md §9).
   - Moedas são 100% virtuais, sem valor monetário.
   - Nada aqui afeta gameplay: dificuldade/pontuação/hitbox NUNCA
     mudam para ajustar economia (e o contrário também: a skin
     equipada nunca muda quantas moedas se ganham).

   Este módulo é PURO (sem DOM, sem state, sem storage) para ser
   testável direto com node:test.
   ========================================================= */

/** Teto da carteira (evita número absurdo por adulteração/estouro). */
export const MAX_COINS = 999999;

/**
 * Preços das skins em MOEDAS por faixa (L = Lendária).
 * Moedas só se ganham jogando — jamais há conversão para dinheiro.
 * (Preço em REAIS não mora em lugar nenhum do código: a UI sempre
 * mostra o valor devolvido pelo Google Play — ver skins.js.)
 */
export const SKIN_PRICES = { A: 600, B: 1500, C: 3500, L: 6000 };

/** Recompensa diária por dia de sequência (dia 7 repete). */
export const DAILY_REWARDS = [20, 25, 30, 35, 40, 50, 100];

/**
 * Ganho por partida = min(CAP, floor(pulsos×0.5) + floor(pontos/100)
 * + floor(segundos/10)), 0 se a partida durar menos de 10s.
 * Bônus somam DEPOIS do teto: recorde existente +15, 1ª partida do dia +10.
 * (Tabela completa de simulação: ECONOMIA.md)
 */
export const CAP_POR_PARTIDA = 120;
export const MIN_RUN_SECONDS = 10;
export const BONUS_RECORDE = 15;
export const BONUS_PRIMEIRA_DIA = 10;

/** Recompensas das missões por dificuldade (facil/media/dificil). */
export const MISSION_COINS = { facil: 25, medio: 40, dificil: 60 };

/** Recompensas das conquistas por porte (pequena/media/grande). */
export const ACHIEVEMENT_COINS = { pequena: 25, media: 40, grande: 60 };

/**
 * Decisões de escopo (documentadas em ECONOMIA.md):
 * - Pulsos coletados NÃO pagam moedas (o ganho já considera os pulsos
 *   na fórmula — dobrar a fonte complicaria o balanceamento).
 * - "Dobrar com anúncio" desligado: sem incentivo pago perto do ganho.
 */
export const COINS_PICKUP = false;
export const COINS_AD_DOUBLE = false;

/**
 * Moedas de uma partida (função pura: recebe os fatos, não lê estado).
 * @param {{pickups?:number, score?:number, seconds?:number,
 *          recordBroken?:boolean, firstRunToday?:boolean}} run
 * @returns {number} moedas inteiras
 */
export function calcRunCoins(run = {}) {
  const pickups = Math.max(0, Math.floor(run.pickups || 0));
  const score = Math.max(0, Math.floor(run.score || 0));
  const seconds = Math.max(0, run.seconds || 0);
  if (seconds < MIN_RUN_SECONDS) return 0;               // partida curtíssima não paga
  const base = Math.floor(pickups * 0.5) + Math.floor(score / 100) + Math.floor(seconds / 10);
  let total = Math.min(CAP_POR_PARTIDA, base);
  if (run.recordBroken) total += BONUS_RECORDE;          // só bate recorde quem já tinha um
  if (run.firstRunToday) total += BONUS_PRIMEIRA_DIA;
  return total;
}

/** @param {'facil'|'media'|'dificil'} difficulty @returns {number} moedas da missão */
export function missionCoins(difficulty) {
  return MISSION_COINS[difficulty] || MISSION_COINS.facil;
}

/** @param {'pequena'|'media'|'grande'} tier @returns {number} moedas da conquista */
export function achievementCoins(tier) {
  return ACHIEVEMENT_COINS[tier] || ACHIEVEMENT_COINS.pequena;
}

/**
 * Recompensa da recompensa diária para a sequência informada.
 * Sequência 1..7 mapeia em DAILY_REWARDS; a partir do 8 o ciclo repete.
 * @param {number} streak sequência de dias (>= 1)
 * @returns {number} moedas
 */
export function dailyReward(streak) {
  const n = Number.isFinite(streak) && streak >= 1 ? Math.floor(streak) : 1;
  return DAILY_REWARDS[(n - 1) % DAILY_REWARDS.length];
}
