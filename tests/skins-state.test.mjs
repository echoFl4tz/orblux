/* =========================================================
   Testes do estado de SKINS (state.skins)
   Migração v2->v3, posse, equipar, personalização e — crítico —
   que resetAllProgress NÃO apaga skins compradas.
   Runner: node:test. Uso: node --test tests/skins-state.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

// shim de localStorage ANTES de importar state.js
function makeStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    _m: m,
    api: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i],
      get length() { return m.size; },
    },
  };
}

// loja legada v2 (com apelido já, mas SEM skins) -> deve migrar para v3
const store = makeStore({
  pn_version: '2',
  pn_profile: JSON.stringify({ nickname: 'NeoPilot', createdAt: '2026-01-01T00:00:00.000Z', asked: true }),
  pn_stats: JSON.stringify({ best: 1200, runs: 5 }),
});
globalThis.localStorage = store.api;

const S = await import('../js/core/state.js');
const { state, grantSkin, revokeSkin, equipSkin, ownsSkin, setSkinCustom, resetSkinCustom, markSkinSeen, resetAllProgress } = S;

test('migração v2->v3 cria state.skins com a clássica equipada', () => {
  assert.ok(state.skins);
  assert.equal(state.skins.equipped, 'classic');
  assert.deepEqual(state.skins.owned, {});
  assert.equal(state.skins.seen.classic, true);
});

test('grantSkin/ownsSkin/equipSkin funcionam e bloqueiam skin não possuída', () => {
  assert.equal(ownsSkin('classic'), true);
  assert.equal(ownsSkin('supernova'), false);
  // equipar skin não possuída falha
  assert.equal(equipSkin('supernova'), false);
  grantSkin('supernova');
  assert.equal(ownsSkin('supernova'), true);
  assert.equal(equipSkin('supernova'), true);
  assert.equal(state.skins.equipped, 'supernova');
});

test('setSkinCustom aceita só vocabulário permitido e reseta', () => {
  grantSkin('brasa_neon'); // tem 3 paletas/2 rastros/3 auras
  setSkinCustom('brasa_neon', { paleta: 'lava', rastro: 'derretido', aura: 'quente' });
  assert.equal(state.skins.custom.brasa_neon.paleta, 'lava');
  // paleta fora do permitido é ignorada (mantém a anterior)
  setSkinCustom('brasa_neon', { paleta: 'gelo' });
  assert.notEqual(state.skins.custom.brasa_neon.paleta, 'gelo');
  resetSkinCustom('brasa_neon');
  assert.equal(state.skins.custom.brasa_neon, undefined);
});

test('markSkinSeen registra e não repete', () => {
  markSkinSeen('oceano');
  assert.equal(state.skins.seen.oceano, true);
});

test('revokeSkin remove e volta à clássica se estava equipada', () => {
  equipSkin('supernova');
  revokeSkin('supernova');
  assert.equal(ownsSkin('supernova'), false);
  assert.equal(state.skins.equipped, 'classic');
});

test('CRÍTICO: resetAllProgress NÃO apaga skins compradas (mantém owned)', () => {
  grantSkin('brasa_neon');
  grantSkin('oceano');
  setSkinCustom('brasa_neon', { paleta: 'lava' });
  equipSkin('oceano');

  resetAllProgress();

  // compras preservadas
  assert.equal(ownsSkin('brasa_neon'), true, 'brasa_neon deve ser mantida');
  assert.equal(ownsSkin('oceano'), true, 'oceano deve ser mantida');
  assert.ok(state.skins.owned.brasa_neon);
  // personalização e equipada zeradas
  assert.equal(state.skins.custom.brasa_neon, undefined, 'personalização deve zerar');
  assert.equal(state.skins.equipped, 'classic', 'skin equipada volta ao padrão');
});

test('loadSkins descarta ids desconhecidos (dados corrompidos não quebram)', async () => {
  const s2 = makeStore({
    pn_version: '3',
    pn_skins: JSON.stringify({
      equipped: 'skin_que_nao_existe',
      owned: { brasa_neon: 123, id_invalido: 999 },
      custom: { id_invalido: { paleta: 'x' }, brasa_neon: { paleta: 'lava' } },
      seen: { id_invalido: true, brasa_neon: true },
    }),
  });
  globalThis.localStorage = s2.api;
  const m2 = await import(`../js/core/state.js?corruptskins=${Date.now()}`);
  const sk = m2.state.skins;
  assert.equal(sk.equipped, 'classic', 'equipada inválida volta à clássica');
  assert.ok(sk.owned.brasa_neon, 'brasa_neon válida mantida');
  assert.equal(sk.owned.id_invalido, undefined, 'id desconhecido descartado');
  assert.equal(sk.custom.id_invalido, undefined, 'custom de id desconhecido descartado');
  assert.equal(sk.custom.brasa_neon.paleta, 'lava');
  assert.equal(sk.seen.id_invalido, undefined);
  assert.equal(sk.seen.brasa_neon, true);
});
