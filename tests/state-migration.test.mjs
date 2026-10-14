/* =========================================================
   Testes de migração e persistência do estado (apelido)
   Garante: migração v1->v2 do ranking, geração do apelido padrão,
   addScoreToRanking grava o apelido e resetAllProgress limpa o perfil.
   Runner: node:test. Uso: node --test tests/state-migration.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

// shim de localStorage ANTES de importar state.js (storage.js o usa sob try)
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i],
  get length() { return store.size; },
};

// dados LEGADOS (v1): ranking sem 'name', sem perfil, sem versão
store.set('pn_ranking', JSON.stringify([
  { score: 3000, date: '2026-01-05T10:00:00.000Z' },
  { score: 1500, date: '2026-01-06T10:00:00.000Z' },
  { score: 9000, date: '2026-01-07T10:00:00.000Z' },
]));

const stateMod = await import('../js/core/state.js');
const { state, addScoreToRanking, setNickname, resetAllProgress, markProfileAsked } = stateMod;

test('migração v1->v2: entradas antigas do ranking ganham name', () => {
  assert.equal(state.ranking.length, 3);
  for (const r of state.ranking) {
    assert.equal(typeof r.name, 'string');
    assert.ok(r.name.length >= 3, `name migrado: "${r.name}"`);
  }
  // ordenado por score desc
  assert.equal(state.ranking[0].score, 9000);
});

test('migração: perfil criado com apelido padrão válido', () => {
  assert.match(state.profile.nickname, /^Jogador\d{4}$/);
  assert.equal(state.profile.asked, false);
  assert.ok(state.profile.createdAt);
});

test('addScoreToRanking grava o apelido do momento', () => {
  setNickname('NeoPilot');
  const pos = addScoreToRanking(500);
  assert.ok(pos >= 1);
  const mine = state.ranking.find((r) => r.score === 500);
  assert.equal(mine.name, 'NeoPilot');
});

test('addScoreToRanking mantém limite de 20', () => {
  for (let i = 0; i < 30; i++) addScoreToRanking(10 + i);
  assert.ok(state.ranking.length <= 20);
});

test('resetAllProgress apaga o perfil e volta a perguntar', () => {
  markProfileAsked();
  resetAllProgress();
  assert.equal(state.profile.asked, false);
  assert.equal(state.ranking.length, 0);
  assert.match(state.profile.nickname, /^Jogador\d{4}$/); // novo apelido padrão
});

test('dado corrompido não quebra o jogo (ranking inválido é descartado)', async () => {
  // recarrega state.js com um ranking corrompido num contexto novo
  const s2 = new Map();
  globalThis.localStorage = {
    getItem: (k) => (s2.has(k) ? s2.get(k) : null),
    setItem: (k, v) => s2.set(k, String(v)),
    removeItem: (k) => s2.delete(k),
    key: (i) => [...s2.keys()][i],
    get length() { return s2.size; },
  };
  s2.set('pn_ranking', JSON.stringify([{ score: 'abc' }, null, { score: 700, name: 'Ana' }]));
  s2.set('pn_profile', JSON.stringify({ nickname: 'x', asked: true })); // apelido inválido (1 char)
  const m2 = await import(`../js/core/state.js?corrupt=${Date.now()}`);
  // entradas corrompidas descartadas; a válida (700) mantida
  assert.ok(Array.isArray(m2.state.ranking));
  assert.equal(m2.state.ranking.length, 1);
  assert.equal(m2.state.ranking[0].score, 700);
  // perfil com apelido inválido é regenerado
  assert.match(m2.state.profile.nickname, /^Jogador\d{4}$/);
});
