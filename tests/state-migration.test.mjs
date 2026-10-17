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

test('qualidade de imagem nasce em automática (A7/HD)', () => {
  // settings legados sem a chave ganham o default por merge
  assert.equal(state.settings.imageQuality, 'auto');
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

// ---------------------------------------------------------
//  Fase 4 — migração SEM PERDA (v3 -> v4, o upgrade real que
//  adicionou a carteira; v1/v2 antecederam o sistema de skins)
// ---------------------------------------------------------
test('migração v3->v4: nada se perde — ranking, skins e saldo sobrevivem ao upgrade', async () => {
  const s3 = new Map();
  globalThis.localStorage = {
    getItem: (k) => (s3.has(k) ? s3.get(k) : null),
    setItem: (k, v) => s3.set(k, String(v)),
    removeItem: (k) => s3.delete(k),
    key: (i) => [...s3.keys()][i],
    get length() { return s3.size; },
  };
  // usuário v3 (pré-carteira): skins com posse NUMÉRICA antiga
  // (formato "só Play") e posse-objeto; sem pn_wallet
  s3.set('pn_version', '3');
  s3.set('pn_ranking', JSON.stringify([
    { score: 4200, date: '2026-02-01T12:00:00.000Z', name: 'Explorador' },
    { score: 800, date: '2026-02-02T12:00:00.000Z', name: 'Veterano' },
  ]));
  s3.set('pn_skins', JSON.stringify({
    equipped: 'brasa_neon',
    owned: { brasa_neon: 1740000000000, oceano: { at: 1740001000000, source: 'coins' } },
    custom: {},
    seen: { classic: true },
  }));
  s3.set('pn_stats', JSON.stringify({ runs: 12, best: 4200, totalTime: 900 }));
  s3.set('pn_achievements', JSON.stringify({ first_run: 1740000000000 }));

  const m3 = await import(`../js/core/state.js?legacy=${Date.now()}`);
  // versão atualizada (idempotente)
  assert.equal(Number(s3.get('pn_version')), 4, 'pn_version migrado para 4');
  // ranking: scores/datas/nomes preservados
  assert.equal(m3.state.ranking.length, 2);
  const vet = m3.state.ranking.find((r) => r.score === 800);
  const alto = m3.state.ranking.find((r) => r.score === 4200);
  assert.equal(vet.name, 'Veterano', 'nome existente preservado');
  assert.equal(alto.name, 'Explorador', 'nome existente preservado');
  assert.equal(alto.date, '2026-02-01T12:00:00.000Z', 'data preservada');
  // skins: equipada mantida; posse numérica vira {at, source:'play'};
  // posse-objeto mantém source:'coins' (moedas ≠ dinheiro!)
  assert.equal(m3.state.skins.equipped, 'brasa_neon', 'skin equipada preservada');
  assert.deepEqual(m3.state.skins.owned.brasa_neon, { at: 1740000000000, source: 'play' });
  assert.deepEqual(m3.state.skins.owned.oceano, { at: 1740001000000, source: 'coins' });
  // estatísticas e conquistas intactas
  assert.equal(m3.state.stats.runs, 12);
  assert.equal(m3.state.stats.best, 4200);
  assert.equal(m3.state.achievements.first_run, 1740000000000);
  // carteira criada válida (checksum ok), saldo inicial honesto (0 —
  // moedas legadas nunca eram inventadas)
  assert.equal(m3.state.wallet.coins, 0, 'carteira nova começa em 0 (sem moeda fantasma)');
  assert.equal(m3.saveWallet(), true, 'carteira persiste com checksum válido');
});

test('sobe de versão sem perder saldo: wallet sobrevive ao re-load', async () => {
  const s4 = new Map();
  globalThis.localStorage = {
    getItem: (k) => (s4.has(k) ? s4.get(k) : null),
    setItem: (k, v) => s4.set(k, String(v)),
    removeItem: (k) => s4.delete(k),
    key: (i) => [...s4.keys()][i],
    get length() { return s4.size; },
  };
  // 1ª visita: joga e ganha moedas
  const mA = await import(`../js/core/state.js?w1=${Date.now()}`);
  mA.state.wallet.coins = 777;
  mA.state.wallet.lifetimeEarned = 777;
  assert.equal(mA.saveWallet(), true);
  // "atualização do app": recarrega o módulo com os mesmos dados
  const mB = await import(`../js/core/state.js?w2=${Date.now()}`);
  assert.equal(mB.state.wallet.coins, 777, 'saldo preservado após atualização');
  assert.equal(mB.state.wallet.lifetimeEarned, 777, 'histórico preservado');
  // checksum adulterado => zera (anti-trapaça), sem travar o jogo
  s4.set('pn_wallet', JSON.stringify({ v: 4, c: 'forjado', d: { coins: 999999 } }));
  const mC = await import(`../js/core/state.js?w3=${Date.now()}`);
  assert.equal(mC.state.wallet.coins, 0, 'checksum forjado zera a carteira');
});
