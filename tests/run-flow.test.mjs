/* =========================================================
   RUN FLOW (auditoria 26/10/2026) — reviver não conta em dobro.
   Antes: todo 'game:over' rodava a contabilidade completa — quem
   morria, revivia e morria de novo levava stats, moedas, missões
   e envio ao ranking DUPLICADOS (main.js on('game:over')).
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunFlow } from '../js/core/run-flow.js';

const run = (runId, revivePossible) => ({ runId, revivePossible, score: 100 });

test('morte final contabiliza exatamente 1 vez', () => {
  const f = createRunFlow();
  const r1 = f.onGameOver(run(1, false));
  assert.equal(r1.account, true);
  const r2 = f.onGameOver(run(1, false));   // re-emissão (defesa)
  assert.equal(r2.account, false);
});

test('reviver e morrer de novo contabiliza SÓ a morte final', () => {
  const f = createRunFlow();
  const primeira = f.onGameOver(run(7, true));    // 1ª morte (painel de reviver)
  assert.equal(primeira.account, false);
  const final = f.onGameOver(run(7, false));      // morte após o revive
  assert.equal(final.account, true);
  assert.equal(final.run.runId, 7);
  // e uma re-emissão da final não duplica
  assert.equal(f.onGameOver(run(7, false)).account, false);
});

test('recusar o reviver (menu/replay) descarrega a pendente na fronteira', () => {
  const f = createRunFlow();
  assert.equal(f.onGameOver(run(3, true)).account, false);
  const flush = f.onRunBoundary();               // 'game:start' ou 'game:quit'
  assert.ok(flush, 'a corrida recusada deve ser contabilizada');
  assert.equal(flush.runId, 3);
  assert.equal(f.onRunBoundary(), null);         // 2ª fronteira não reconta
});

test('reviver de verdade: a pendente some e só a final conta', () => {
  const f = createRunFlow();
  f.onGameOver(run(4, true));      // 1ª morte: pendente (revive possível)
  // revive: SEM fronteira — o jogo volta a rodar e nada é contabilizado
  assert.equal(f.onGameOver(run(4, false)).account, true);   // morte final conta
  assert.equal(f.onRunBoundary(), null);   // nada pendente sobrou
});

test('corridas distintas nunca se misturam', () => {
  const f = createRunFlow();
  f.onGameOver(run(1, true));                    // pendente da corrida 1
  const flush = f.onGameOver(run(2, false));     // corrida 2 morre final
  assert.ok(flush.flush, 'a pendente da corrida 1 deve ir junto como flush');
  assert.equal(flush.flush.runId, 1);
  assert.equal(flush.account, true);             // e a corrida 2 conta normalmente
  assert.equal(f.onRunBoundary(), null);
});

test('sem runId/revivePossible o fluxo não quebra (payload defensivo)', () => {
  const f = createRunFlow();
  // flag ausente = tratar como morte final (comportamento antigo: conta)
  const r = f.onGameOver({});
  assert.equal(r.account, true);
});
