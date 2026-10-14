/* =========================================================
   Testes do billing (MockProvider) — Etapa 5
   Compra, cancelamento, falha, restauração, preços e — crítico —
   que nenhuma skin é liberada SEM confirmação do provedor.
   Runner: node:test. Uso: node --test tests/billing.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

function makeStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    api: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i],
      get length() { return m.size; },
    },
    has: (k) => m.has(k),
    get: (k) => m.get(k),
  };
}

// ambiente "localhost" + estado v3 limpo
const store = makeStore({ pn_version: '3' });
globalThis.localStorage = store.api;
globalThis.location = { search: '', hostname: 'localhost' };

const B = await import('../js/monetization/billing.js');
const { state, grantSkin, ownsSkin } = await import('../js/core/state.js');
const { ALL_SKUS, BUNDLE_SKU, SKINS } = await import('../js/game/skins.js');

test('initBilling em localhost usa o MockProvider (disponível)', async () => {
  const id = await B.initBilling();
  assert.equal(id, 'mock');
  assert.equal(B.isStoreAvailable(), true);
});

test('fetchPrices devolve preço localizado para TODOS os SKUs (nunca vazio)', async () => {
  const prices = await B.fetchPrices();
  assert.equal(Object.keys(prices).length, ALL_SKUS.length);
  for (const sku of ALL_SKUS) {
    assert.ok(prices[sku], `sem preço: ${sku}`);
    assert.match(prices[sku].localizedPrice, /^R\$\s?\d+,\d{2}$/, `preço fora do formato pt-BR: ${sku}`);
  }
  // pacote completo tem preço próprio
  assert.equal(prices[BUNDLE_SKU].localizedPrice, 'R$ 39,90');
});

test('compra OK libera a skin E grava em state.skins.owned', async () => {
  const res = await B.purchase('skin_brasa_neon');
  assert.equal(res.status, 'ok');
  assert.equal(ownsSkin('brasa_neon'), true, 'skin deve ser concedida após confirmação');
  assert.ok(state.skins.owned.brasa_neon);
});

test('CRÍTICO: flag forjada em localStorage SEM confirmação do provedor é REMOVIDA', async () => {
  // atacante "desbloqueia" uma skin direto no estado
  grantSkin('supernova');
  assert.equal(ownsSkin('supernova'), true);
  // sincronização com o provedor (que nunca a vendeu) remove a skin
  const sync = await B.syncPurchases();
  assert.equal(sync.status, 'ok');
  assert.equal(ownsSkin('supernova'), false, 'skin não confirmada deve ser revogada');
  // a comprada de verdade permanece
  assert.equal(ownsSkin('brasa_neon'), true);
});

test('restorePurchases devolve o que foi comprado no provedor', async () => {
  await B.purchase('skin_oceano');
  const r = await B.restorePurchases();
  assert.equal(r.status, 'ok');
  assert.ok(r.owned.includes('skin_oceano'));
  assert.ok(r.owned.includes('skin_brasa_neon'));
  assert.equal(ownsSkin('oceano'), true);
});

test('loja indisponível (vitrine) nunca falha: compra retorna unavailable', async () => {
  globalThis.location = { search: '?nomock=1', hostname: '' };
  const id = await B.initBilling();
  assert.equal(id, 'none');
  assert.equal(B.isStoreAvailable(), false);
  const res = await B.purchase('skin_brasa_neon');
  assert.equal(res.status, 'unavailable');
  // preços vazios => UI mostra "indisponível"
  assert.deepEqual(await B.fetchPrices(), {});
  // sync não derruba o estado (mantém cache)
  const sync = await B.syncPurchases();
  assert.equal(sync.status, 'unavailable');
  assert.equal(ownsSkin('brasa_neon'), true, 'cache mantido quando loja indisponível');
});

test('?mock=cancel cancela sem mensagem de erro e sem liberar skin', async () => {
  globalThis.location = { search: '?mock=cancel', hostname: 'localhost' };
  await B.initBilling();
  const res = await B.purchase('skin_supernova');
  assert.equal(res.status, 'cancelled');
  assert.equal(ownsSkin('supernova'), false);
});

test('?mock=fail retorna erro genérico (UI oferece tentar de novo)', async () => {
  globalThis.location = { search: '?mock=fail', hostname: 'localhost' };
  await B.initBilling();
  const res = await B.purchase('skin_galaxia');
  assert.equal(res.status, 'error');
  assert.equal(ownsSkin('galaxia'), false);
});

test('pacote Coleção Completa concede as 20 pagas; revogar o pacote cai com tudo', async () => {
  globalThis.location = { search: '', hostname: 'localhost' };
  await B.initBilling();
  const res = await B.purchase(BUNDLE_SKU);
  assert.equal(res.status, 'ok');
  const paid = SKINS.filter((s) => s.tier !== 'free');
  assert.equal(paid.length, 20);
  for (const s of paid) assert.equal(ownsSkin(s.id), true, `pacote deve conceder ${s.id}`);
  // provedor: pacote revogado, mas a compra individual de brasa_neon continua
  store.api.setItem('pn_mock_purchases', JSON.stringify(['skin_brasa_neon']));
  const sync = await B.syncPurchases();
  assert.equal(sync.status, 'ok');
  assert.equal(ownsSkin('brasa_neon'), true, 'compra individual permanece');
  assert.equal(ownsSkin('supernova'), false, 'skin só do pacote é revogada');
});

test('skin grátis (classic) nunca é revogada nem com dado legado no mapa owned', async () => {
  state.skins.owned.classic = true;   // dado antigo/corrompido
  const sync = await B.syncPurchases();
  assert.equal(sync.status, 'ok');
  assert.ok('classic' in state.skins.owned, 'classic não pode sair do mapa owned');
  assert.equal(ownsSkin('classic'), true);
});
