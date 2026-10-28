/* =========================================================
   MAESTRIA (análise de retenção) — progressão permanente.
   • curva de XP e níveis determinística;
   • XP creditado 1× por corrida (reviver/replay não farmam);
   • recompensas SÓ cosméticas e presentes no catálogo;
   • estado lido do storage sem cache (sobrevive a reset).
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  xpParaNivel, xpTotalParaNivel, nivelDeXp, xpDaPartida,
  RECOMPENSAS, xpAtual, progresso, proximaRecompensa, creditarPartida,
} from '../js/core/maestria.js';
import { getSkin } from '../js/game/skins.js';
import { ownsSkin } from '../js/core/state.js';
import { getItem, setItem, removeItem } from '../js/core/storage.js';

test('curva de XP: níveis lineares e totais coerentes', () => {
  assert.equal(xpParaNivel(1), 100);           // 1º nível em 100 XP
  assert.equal(xpParaNivel(2), 140);           // +40 por nível
  assert.equal(xpTotalParaNivel(1), 0);        // nível 1 = zero XP
  assert.equal(xpTotalParaNivel(2), 100);
  assert.equal(xpTotalParaNivel(5), 640);      // 100+140+180+220
  assert.equal(xpTotalParaNivel(10), 2340);    // soma dos 9 primeiros níveis

  assert.equal(nivelDeXp(0).nivel, 1);
  assert.equal(nivelDeXp(99).nivel, 1);
  assert.equal(nivelDeXp(100).nivel, 2);
  assert.equal(nivelDeXp(100).xpNoNivel, 0);
  assert.equal(nivelDeXp(639).nivel, 4);
  assert.equal(nivelDeXp(xpTotalParaNivel(5)).nivel, 5);
  const p = progresso();
  assert.ok(p.xpNoNivel >= 0 && p.xpNoNivel < p.xpNecessario, 'progresso dentro do nível');
});

test('xpDaPartida: piso 10, teto 500, 10% do placar', () => {
  assert.equal(xpDaPartida(0), 10);            // partida curta ainda progride
  assert.equal(xpDaPartida(50), 10);           // piso
  assert.equal(xpDaPartida(1234), 123);        // arredonda
  assert.equal(xpDaPartida(99999), 500);       // teto: farm rápido não compensa
});

test('trilha: recompensas existem no catálogo e são cosméticas', () => {
  assert.ok(RECOMPENSAS.length >= 4, 'há trilha de recompensas');
  let nivelAnterior = 1;
  for (const r of RECOMPENSAS) {
    assert.ok(r.nivel > nivelAnterior, `níveis crescentes (nível ${r.nivel})`);
    nivelAnterior = r.nivel;
    const s = getSkin(r.skin);
    assert.equal(s.id, r.skin, `${r.skin} existe no catálogo`);
    assert.notEqual(s.tier, 'free', `${r.nome}: recompensa não é a skin grátis`);
    assert.equal(s.nome, r.nome, `nome da recompensa = nome da skin (${r.nome})`);
    assert.ok(Number.isInteger(s.coinPrice) && s.coinPrice > 0,
      `${r.nome}: é uma skin real (também comprável com moedas)`);
  }
});

test('creditarPartida: 1× por runId (reviver/replay não farmam XP)', () => {
  const r1 = creditarPartida('maestria-run-1', 1000);   // 1000 pts → 100 XP
  assert.ok(r1, 'primeira crédito devolve o resultado');
  assert.equal(r1.xp, 100);
  assert.equal(r1.xpTotal, 100);
  assert.equal(xpAtual(), 100);
  const r2 = creditarPartida('maestria-run-1', 1000);   // mesma corrida: ignora
  assert.equal(r2, null, 'mesmo runId nunca credita duas vezes');
  assert.equal(xpAtual(), 100, 'XP intacto após re-emissão');
});

test('sobe de nível e concede a recompensa por habilidade', () => {
  // após o teste anterior: 100 XP = nível 2 (Brasa Neon já concedida)
  assert.equal(progresso().nivel, 2, '100 XP = nível 2');
  assert.ok(ownsSkin('brasa_neon'), 'recompensa do nível 2 concedida no 1º crédito');

  const a = creditarPartida('maestria-run-2a', 99999);   // +500 (teto) → 600 XP
  assert.equal(a.xpTotal, 600);
  assert.equal(a.nivel, 4, '600 XP = nível 4');
  assert.equal(a.recompensas.length, 0, 'níveis 3-4 não têm recompensa');

  const b = creditarPartida('maestria-run-2b', 99999);   // +500 → 1100 XP
  assert.equal(b.xpTotal, 1100);
  assert.equal(b.nivel, 6, '1100 XP = nível 6');
  assert.equal(b.subiu, true);
  assert.ok(b.recompensas.some((x) => x.skin === 'gelo_polar'), 'nível 5 concede Gelo Polar');
  assert.ok(!b.recompensas.some((x) => x.skin === 'brasa_neon'), 'recompensa já concedida não repete');
  assert.ok(ownsSkin('gelo_polar'), 'recompensa gravada como posse');
});

test('sem subir de nível não concede nada; trilha aponta a próxima', () => {
  const r = creditarPartida('maestria-run-3', 800);      // +80 → 1180 XP
  // 1180 XP continua no nível 6 (7 pede 1200) — e nível de
  // recompensa que não foi cruzado nunca concede
  assert.equal(r.nivel, 6);
  assert.equal(r.subiu, false);
  assert.equal(r.recompensas.length, 0, 'sem recompensa fora de nível de recompensa');
  const prox = proximaRecompensa();
  assert.equal(prox.nivel, 10, 'próxima recompensa: nível 10');
  assert.equal(prox.skin, 'violeta_eclipse');
});

test('estado vem do storage sem cache (reset em outro módulo é visto)', () => {
  setItem('pn_maestria', { xp: 999999 });
  assert.equal(xpAtual(), 999999, 'leitura direta, sem cache velho');
  assert.equal(proximaRecompensa(), null, 'nível altíssimo: trilha completa');
  removeItem('pn_maestria');
  assert.equal(xpAtual(), 0, 'sem chave: volta ao padrão');
  // chaves antigas/corrompidas não quebram
  setItem('pn_maestria', { xp: 'abacaxi' });
  assert.equal(xpAtual(), 0, 'xp inválido ignorado');
  assert.ok(getItem('pn_maestria'), 'chave pn_ preservada (prefixo correto)');
  removeItem('pn_maestria');
});
