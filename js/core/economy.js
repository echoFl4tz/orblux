/* =========================================================
   ECONOMIA — números do sistema de moedas em UM só lugar

   REGRAS INEGOCIÁVEIS
   - Moedas NÃO se compram com dinheiro real, não se vendem,
     trocam nem transferem: só se ganham JOGANDO (ver MONETIZACAO.md §9).
   - Moedas são 100% virtuais, sem valor monetário.
   - Nada aqui afeta gameplay: dificuldade/pontuação/hitbox NUNCA
     mudam para ajustar economia (só este arquivo muda).

   Este módulo é PURO (sem DOM, sem state, sem storage) para ser
   testável direto com node:test.
   ========================================================= */

/** Teto da carteira (evita número absurdo por adulteração/estouro). */
export const MAX_COINS = 999999;

/** Recompensa diária por dia de sequência (dia 7 repete). */
export const DAILY_REWARDS = [20, 25, 30, 35, 40, 50, 100];

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
