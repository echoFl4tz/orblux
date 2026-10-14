/* =========================================================
   Testes da CARTEIRA DE MOEDAS (wallet.js + state.js)
   Cobrem: migração v3->v4 e origem das skins ('coins'/'play'),
   ganho, gasto ATÔMICO (rollback + trava anti-duplo-toque),
   recompensa diária com proteção de relógio, meta, teto,
   checksum, ledger de 50 e reset com opção de manter moedas.
   Runner: node:test. Uso: node --test tests/wallet.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

// shim de localStorage ANTES de importar os módulos
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i],
  get length() { return store.size; },
};

// loja v3 legada: skins compradas (numérico = dinheiro) e SEM carteira
store.set('pn_version', '3');
store.set('pn_skins', JSON.stringify({
  equipped: 'classic',
  owned: { brasa_neon: 1700000000000, oceano: 1700000000001 },
  custom: {},
  seen: { classic: true },
}));

const W = await import('../js/core/wallet.js');
const ST = await import('../js/core/state.js');
const EV = await import('../js/core/events.js');
const ECO = await import('../js/core/economy.js');

/** Carteira limpa entre testes (mesma forma de reset, sem apagar skins). */
function freshWallet() {
  ST.state.wallet = ST.defaultWallet();
  ST.saveWallet();
}

/** Chave YYYY-MM-DD de N dias atrás (sequência da recompensa diária). */
function keyDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Executa fn com console.warn silenciado; retorna os avisos capturados. */
function withSilentWarn(fn) {
  const warns = [];
  const real = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { fn(); } finally { console.warn = real; }
  return warns;
}

/* ---------------------------------------------------------
   Migração / formato
--------------------------------------------------------- */
test('migração v3->v4: carteira válida criada; skins numéricas viram {at, source:play}', () => {
  assert.equal(store.get('pn_version'), '4');
  assert.equal(ST.state.wallet.coins, 0);
  assert.equal(ST.state.wallet.lifetimeEarned, 0);
  assert.equal(ST.state.wallet.streak, 0);
  assert.deepEqual(ST.state.wallet.ledger, []);
  // skins legadas (compradas com dinheiro) ganham a origem 'play'
  assert.equal(ST.state.skins.owned.brasa_neon.source, 'play');
  assert.equal(ST.state.skins.owned.brasa_neon.at, 1700000000000);
  assert.equal(ST.state.skins.owned.oceano.source, 'play');
});

test('persistência: carteira gravada com checksum válido e conferida na leitura', () => {
  freshWallet();
  W.earn(15, 'partida', 'run-1');
  const payload = JSON.parse(store.get('pn_wallet'));
  assert.equal(payload.v, 4);
  assert.equal(payload.c, ST.walletChecksum(payload.d));   // checksum bate
  assert.equal(payload.d.coins, 15);
  assert.equal(ST.loadWallet().coins, 15);                 // leitura confere
});

test('validação: formato corrompido é descartado campo a campo', () => {
  const d = {
    coins: -50,             // negativo -> 0
    lifetimeEarned: 'abc',  // não número -> 0
    lifetimeSpent: 2.5,     // fracionário -> 0
    streak: 99999999,       // absurdo -> clamp
    lastClaimDate: 'hoje',  // formato inválido -> ''
    goalSkinId: 'id_invalido',
    ledger: 'nope',
  };
  store.set('pn_wallet', JSON.stringify({ v: 4, c: ST.walletChecksum(d), d }));
  const w = ST.loadWallet();
  assert.equal(w.coins, 0);
  assert.equal(w.lifetimeEarned, 0);
  assert.equal(w.lifetimeSpent, 0);
  assert.equal(w.streak, 100000);
  assert.equal(w.lastClaimDate, '');
  assert.equal(w.goalSkinId, null);
  assert.deepEqual(w.ledger, []);
});

test('checksum: adulterar o arquivo zera a carteira (aviso discreto, sem travar)', () => {
  freshWallet();
  W.earn(120, 'partida', 'z');
  const payload = JSON.parse(store.get('pn_wallet'));
  payload.d.coins = 999999;                          // mexeu sem recalcular o c
  store.set('pn_wallet', JSON.stringify(payload));
  let w = null;
  const warns = withSilentWarn(() => { w = ST.loadWallet(); });
  assert.equal(w.coins, 0);
  assert.ok(warns.some((s) => s.includes('checksum')));
  // payload sem dados também cai no padrão (sem exceção)
  store.set('pn_wallet', JSON.stringify({ v: 4, c: 'x' }));
  assert.equal(ST.loadWallet().coins, 0);
});

/* ---------------------------------------------------------
   Ganho
--------------------------------------------------------- */
test('earn: soma inteiros, registra no ledger e emite wallet:changed', () => {
  freshWallet();
  let evt = null;
  const off = EV.on('wallet:changed', (p) => { evt = p; });
  const r = W.earn(15, 'partida', 'run-1');
  off();
  assert.equal(r.ok, true);
  assert.equal(r.granted, 15);
  assert.equal(W.getCoins(), 15);
  assert.equal(ST.state.wallet.lifetimeEarned, 15);
  const last = ST.state.wallet.ledger.at(-1);
  assert.equal(last.delta, 15);
  assert.equal(last.reason, 'partida');
  assert.equal(last.ref, 'run-1');
  assert.equal(evt.coins, 15);
  assert.equal(evt.delta, 15);
});

test('earn: valores inválidos não viram moedas e o teto é respeitado', () => {
  freshWallet();
  assert.equal(W.earn(0).granted, 0);
  assert.equal(W.earn(-5).granted, 0);
  assert.equal(W.earn(NaN).granted, 0);
  assert.equal(W.earn(3.7).granted, 3);              // sempre inteiros
  assert.equal(W.getCoins(), 3);
  const r = W.earn(ECO.MAX_COINS, 'partida', '');
  assert.equal(r.granted, ECO.MAX_COINS - 3);
  assert.equal(W.getCoins(), ECO.MAX_COINS);         // teto 999.999
  assert.equal(W.earn(50, 'partida', '').granted, 0); // já no teto: nada muda
  assert.equal(W.getCoins(), ECO.MAX_COINS);
});

/* ---------------------------------------------------------
   Gasto atômico
--------------------------------------------------------- */
test('spend: decrementa, soma gasto, registra e emite', () => {
  freshWallet();
  W.earn(100);
  let evt = null;
  const off = EV.on('wallet:changed', (p) => { evt = p; });
  const r = W.spend(60, 'skin', 'brasa_neon');
  off();
  assert.equal(r.ok, true);
  assert.equal(W.getCoins(), 40);
  assert.equal(ST.state.wallet.lifetimeSpent, 60);
  assert.equal(evt.delta, -60);
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 40); // persistido
});

test('spend insuficiente não mexe em nada (memória nem arquivo)', () => {
  freshWallet();
  W.earn(10);
  const r = W.spend(11, 'skin', 'x');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.equal(W.getCoins(), 10);
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 10);
});

test('gasto atômico: grava ANTES de liberar; release falho desfaz tudo', () => {
  freshWallet();
  W.earn(1000);
  let coinsWhenReleased = null;
  const r = W.spend(600, 'skin', 'supernova', () => {
    coinsWhenReleased = JSON.parse(store.get('pn_wallet')).d.coins; // gravação já ocorreu
    return true;
  });
  assert.equal(r.ok, true);
  assert.equal(coinsWhenReleased, 400);
  assert.equal(W.getCoins(), 400);

  const ledgerLen = ST.state.wallet.ledger.length;
  withSilentWarn(() => {
    const r2 = W.spend(100, 'skin', 'oceano', () => false);        // release falhou
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'release');
  });
  assert.equal(W.getCoins(), 400);                                  // saldo devolvido
  assert.equal(ST.state.wallet.lifetimeSpent, 600);                 // gasto devolvido
  assert.equal(ST.state.wallet.ledger.length, ledgerLen);           // ledger devolvido
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 400);    // arquivo devolvido

  withSilentWarn(() => {
    const r3 = W.spend(100, 'skin', 'holograma', () => { throw new Error('boom'); });
    assert.equal(r3.ok, false);                                     // exceção = desfeito
  });
  assert.equal(W.getCoins(), 400);
});

test('trava anti-duplo-toque: toque/re-entrada durante a compra é recusado', () => {
  freshWallet();
  W.earn(100);
  let nested = null;
  const r = W.spend(30, 'skin', 'a', () => { nested = W.spend(30, 'skin', 'b'); return true; });
  assert.equal(r.ok, true);
  assert.equal(nested.ok, false);
  assert.equal(nested.reason, 'busy');
  assert.equal(W.getCoins(), 70);          // cobrou UMA vez só
});

test('sem persistência => sem operação: gasto e ganho desfazem (rollback)', () => {
  freshWallet();
  W.earn(100);
  const realSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {};          // simula quota/modo privado
  let r = null;
  let g = null;
  withSilentWarn(() => {
    r = W.spend(30, 'skin', 'x');
    g = W.earn(10, 'partida', 'y');
  });
  globalThis.localStorage.setItem = realSet;
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'persist');
  assert.equal(g.ok, false);
  assert.equal(W.getCoins(), 100);                     // nada mudou
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 100);
});

test('ledger guarda só as 50 últimas transações', () => {
  freshWallet();
  for (let i = 0; i < 60; i++) W.earn(1, 'partida', `r${i}`);
  assert.equal(ST.state.wallet.ledger.length, 50);
  assert.equal(ST.state.wallet.ledger[0].ref, 'r10');   // mais antiga recortada
  assert.equal(ST.state.wallet.ledger[49].ref, 'r59');  // mais recente no fim
});

/* ---------------------------------------------------------
   Recompensa diária
--------------------------------------------------------- */
test('recompensa diária: 1x por dia, sequência diária e ciclo dia 7->8', () => {
  freshWallet();
  assert.equal(ECO.dailyReward(1), 20);
  assert.equal(ECO.dailyReward(7), 100);
  assert.equal(ECO.dailyReward(8), 20);                 // o ciclo repete

  const r1 = W.claimDaily();
  assert.equal(r1.status, 'ok');
  assert.equal(r1.coins, 20);
  assert.equal(r1.streak, 1);
  assert.equal(W.getCoins(), 20);

  assert.equal(W.claimDaily().status, 'already');       // mesmo dia: não paga
  assert.equal(W.getCoins(), 20);

  ST.state.wallet.lastClaimDate = keyDaysAgo(1);        // dia seguinte: +1 -> 25
  ST.saveWallet();
  const r2 = W.claimDaily();
  assert.equal(r2.status, 'ok');
  assert.equal(r2.coins, 25);
  assert.equal(r2.streak, 2);

  ST.state.wallet.streak = 6;                           // próximo dia fecha a sequência 7
  ST.state.wallet.lastClaimDate = keyDaysAgo(1);
  ST.saveWallet();
  assert.equal(W.claimDaily().coins, 100);              // dia 7 paga 100

  ST.state.wallet.lastClaimDate = '2020-01-01';         // pulei dias -> volta ao 1
  ST.saveWallet();
  assert.equal(W.claimDaily().streak, 1);
});

test('recompensa diária: relógio voltou não libera e não zera a sequência', () => {
  freshWallet();
  W.claimDaily();                                       // streak 1, hoje
  ST.state.wallet.lastClaimDate = '2999-01-01';         // data futura (relógio voltou)
  ST.saveWallet();
  const coins = W.getCoins();
  const r = W.claimDaily();
  assert.equal(r.status, 'clock');
  assert.equal(W.getCoins(), coins);                    // nada pago
  assert.equal(ST.state.wallet.streak, 1);              // sequência intacta
  assert.equal(W.dailyStatus().canClaim, false);
  assert.equal(W.dailyStatus().clockOdd, true);
});

/* ---------------------------------------------------------
   Meta + requisitos do prompt
--------------------------------------------------------- */
test('meta: só skin paga não possuída; zera ao obter/inválido', () => {
  freshWallet();
  assert.equal(W.setGoal('supernova'), true);
  assert.equal(W.getGoal(), 'supernova');
  assert.equal(W.setGoal('classic'), true);              // free -> limpa
  assert.equal(W.getGoal(), null);
  assert.equal(W.setGoal('id_invalido'), true);          // inválido -> limpa sem erro
  assert.equal(W.getGoal(), null);
  W.setGoal('supernova');
  ST.grantSkin('supernova', 'play');
  assert.equal(W.setGoal('supernova'), true);            // já possuída -> limpa
  assert.equal(W.getGoal(), null);
});

test('compra com moedas: gasto + liberação da skin acontecem juntos', () => {
  freshWallet();
  W.earn(600);
  const r = W.spend(600, 'skin', 'menta_cristal', () => ST.grantSkin('menta_cristal', 'coins'));
  assert.equal(r.ok, true);
  assert.equal(W.getCoins(), 0);
  assert.equal(ST.ownsSkin('menta_cristal'), true);
  assert.equal(ST.skinSource('menta_cristal'), 'coins');    // origem registrada
});

test('a skin equipada NUNCA altera quantas moedas se ganham', () => {
  freshWallet();
  W.earn(2000);
  ST.grantSkin('supernova', 'coins');
  ST.equipSkin('supernova');
  const a = W.earn(50, 'partida', 'a').granted;
  ST.equipSkin('classic');
  const b = W.earn(50, 'partida', 'b').granted;
  assert.equal(a, 50);
  assert.equal(b, 50);
});

/* ---------------------------------------------------------
   Reset
--------------------------------------------------------- */
test('reset padrão: apaga moedas e skins com moedas; mantém as de dinheiro', () => {
  freshWallet();
  W.earn(300);
  ST.grantSkin('holograma', 'play');                    // comprada com dinheiro
  ST.grantSkin('dragao_cosmico', 'coins');              // comprada com moedas
  ST.resetAllProgress();
  assert.equal(W.getCoins(), 0);
  assert.deepEqual(ST.state.wallet, ST.defaultWallet());
  assert.equal(ST.ownsSkin('holograma'), true);         // mantida (dinheiro)
  assert.equal(ST.skinSource('holograma'), 'play');
  assert.equal(ST.ownsSkin('dragao_cosmico'), false);   // apagada (moedas)
  assert.equal(ST.state.skins.equipped, 'classic');     // equipada volta ao padrão
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 0); // zerada no arquivo
});

test('reset com keepCoins: mantém saldo, sequência e skins com moedas', () => {
  freshWallet();
  W.earn(150);
  ST.grantSkin('holograma', 'play');
  ST.grantSkin('dragao_cosmico', 'coins');
  ST.resetAllProgress({ keepCoins: true });
  assert.equal(W.getCoins(), 150);
  assert.equal(ST.ownsSkin('dragao_cosmico'), true);
  assert.equal(ST.skinSource('dragao_cosmico'), 'coins');
  assert.equal(ST.ownsSkin('holograma'), true);
  assert.equal(JSON.parse(store.get('pn_wallet')).d.coins, 150);
});
