/* =========================================================
   RUN FLOW — regras PURAS de contabilidade de fim de partida
   (auditoria 26/10/2026: reviver por anúncio não pode contar
   stats/moedas/missões em dobro).

   O jogo emite 'game:over' na PRIMEIRA morte (para o painel
   oferecer o reviver) e de novo na morte final. Aqui decidimos,
   sem tocar em DOM nem estado global, quando a contabilidade
   (stats, moedas, missões, ranking local) deve rodar:

   • morte com reviver possível  → NÃO contabiliza; guarda a
     partida como "pendente" (o painel usa os números projetados);
   • morte final                 → contabiliza UMA vez (runId);
   • o jogador recusa o reviver  → a pendente é descarregada no
     próximo 'game:start' ou 'game:quit' (menu/replay).

   Teste: tests/run-flow.test.mjs
   ========================================================= */

/**
 * Fábrica de estado do fluxo (1 por sessão; puro — testável em Node).
 * @param {{now?:()=>number}} [opts]
 */
export function createRunFlow() {
  /** @returns {{account:boolean, run:object|null, flush:object|null}} */
  let pending = null;      // partida aguardando reviver/recusa
  let lastAccounted = -1;  // runId já contabilizado

  return {
    /**
     * Um 'game:over' chegou.
     * @param {object} run payload (precisa de runId e revivePossible)
     */
    onGameOver(run) {
      // defesa: pendente de OUTRA partida nunca deve sobreviver
      const flush = (pending && pending.runId !== run.runId) ? pending : null;
      if (run.revivePossible) {
        pending = run;
        return { account: false, run: null, flush };
      }
      pending = null;
      if (run.runId === lastAccounted) return { account: false, run, flush };
      lastAccounted = run.runId;
      return { account: true, run, flush };
    },

    /**
     * Nova partida começou ou voltamos ao menu: descarrega a pendente
     * (o jogador desistiu do reviver — a corrida acabou de verdade).
     * @returns {object|null} payload a contabilizar (ou null)
     */
    onRunBoundary() {
      const f = pending;
      pending = null;
      if (!f || f.runId === lastAccounted) return null;
      lastAccounted = f.runId;
      return f;
    },
  };
}
