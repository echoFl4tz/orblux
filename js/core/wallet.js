/* =========================================================
   WALLET — carteira de moedas (API ÚNICA de mutação)

   Nada mexe em state.wallet fora deste arquivo: quem precisa de
   moedas usa getCoins/canAfford/earn/spend/claimDaily/setGoal.
   (A persistência/formato mora em state.js, como em state.skins;
    aqui só acontecem as MUTAÇÕES, com rollback atômico.)

   REGRAS INEGOCIÁVEIS
   - Moedas só se GANHAM jogando. Nunca há produto in-app de moedas,
     nunca se compram/vendem/trocam por dinheiro (MONETIZACAO.md §9).
   - Valores SEMPRE inteiros; teto MAX_COINS (economia.js).
   - Gasto ATÔMICO: valida saldo → grava → só então executa `release`
     (ex.: liberar a skin); se algo falhar, ROLLBACK total.
   - Trava `busy` impede cobrança dupla por toque duplo/re-entrada.
   - A gravação é conferida (checksum + leitura) em saveWallet().
   ========================================================= */

import { MAX_COINS, DAILY_REWARDS, dailyReward } from './economy.js';
import { emit } from './events.js';
import { state, saveWallet, defaultWallet, todayKey } from './state.js';
import { getSkin } from '../game/skins.js';

/** Janela do ledger: guarda só as últimas N transações. */
const LEDGER_MAX = 50;

let busy = false;   // trava de operação em andamento (anti duplo-toque)

/* ---------------------------------------------------------
   Leitura
--------------------------------------------------------- */
export function getCoins() { return state.wallet.coins; }

/** @param {number} n @returns {boolean} tem (pelo menos) n moedas? */
export function canAfford(n) {
  const v = Math.floor(Number(n) || 0);
  return v > 0 && state.wallet.coins >= v;
}

export function getGoal() { return state.wallet.goalSkinId; }

function snapshot() { return JSON.stringify(state.wallet); }
function restore(snap) {
  try { state.wallet = JSON.parse(snap); } catch { state.wallet = defaultWallet(); }
}

function pushLedger(delta, reason, ref) {
  state.wallet.ledger.push({
    t: Date.now(),
    delta,
    reason: String(reason || '').slice(0, 40),
    ref: String(ref || '').slice(0, 60),
  });
  while (state.wallet.ledger.length > LEDGER_MAX) state.wallet.ledger.shift();
}

/* ---------------------------------------------------------
   Mutação
--------------------------------------------------------- */
/**
 * Ganha moedas (inteiros; respeita o teto). Fontes: partida, missão,
 * conquista e recompensa diária — NUNCA dinheiro real.
 * @param {number} amount
 * @param {string} reason código curto (ex.: 'partida', 'missao')
 * @param {string} ref    referência única (ex.: id da missão/dia)
 * @returns {{ok:boolean, coins:number, granted:number, reason?:string}}
 */
export function earn(amount, reason = 'ganho', ref = '') {
  const n = Math.floor(Number(amount) || 0);
  const coinsBefore = state.wallet.coins;
  if (n <= 0) return { ok: true, coins: coinsBefore, granted: 0 };
  if (busy) return { ok: false, coins: coinsBefore, granted: 0, reason: 'busy' };

  const snap = snapshot();
  const granted = Math.max(0, Math.min(MAX_COINS - state.wallet.coins, n));
  if (granted <= 0) return { ok: true, coins: state.wallet.coins, granted: 0 };  // já no teto
  state.wallet.coins += granted;
  state.wallet.lifetimeEarned += granted;
  pushLedger(granted, reason, ref);

  if (!saveWallet()) {
    restore(snap);
    console.warn('[wallet] falha ao gravar ganho de moedas — operação desfeita');
    return { ok: false, coins: state.wallet.coins, granted: 0, reason: 'persist' };
  }
  emit('wallet:changed', { coins: state.wallet.coins, delta: granted, reason, ref });
  return { ok: true, coins: state.wallet.coins, granted };
}

/**
 * Gasta moedas de forma ATÔMICA:
 * valida saldo → grava → chama `release()` (libera a contrapartida,
 * ex.: skin); se `release` falhar/lançar, desfaz TUDO (rollback).
 * A trava `busy` recusa toque duplo enquanto uma compra está em curso.
 *
 * @param {number} amount
 * @param {string} reason
 * @param {string} ref
 * @param {()=>boolean} [release] contrapartida liberada DEPOIS da gravação
 * @returns {{ok:boolean, coins:number, reason?:string}}
 */
export function spend(amount, reason, ref, release) {
  if (busy) return { ok: false, coins: state.wallet.coins, reason: 'busy' };
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0) return { ok: false, coins: state.wallet.coins, reason: 'invalid' };

  busy = true;
  try {
    if (state.wallet.coins < n) return { ok: false, coins: state.wallet.coins, reason: 'insufficient' };

    const snap = snapshot();
    state.wallet.coins -= n;
    state.wallet.lifetimeSpent += n;
    pushLedger(-n, reason, ref);

    // 1) grava primeiro…
    if (!saveWallet()) {
      restore(snap);
      console.warn('[wallet] falha ao gravar o gasto — operação desfeita');
      return { ok: false, coins: state.wallet.coins, reason: 'persist' };
    }

    // 2) …e só então libera a contrapartida (com rollback se falhar)
    if (release) {
      let released = false;
      try { released = release() !== false; } catch (err) { console.warn('[wallet] release falhou:', err); released = false; }
      if (!released) {
        restore(snap);
        if (!saveWallet()) console.warn('[wallet] rollback não persistiu (armazenamento instável)');
        return { ok: false, coins: state.wallet.coins, reason: 'release' };
      }
    }

    emit('wallet:changed', { coins: state.wallet.coins, delta: -n, reason, ref });
    return { ok: true, coins: state.wallet.coins };
  } finally {
    busy = false;
  }
}

/* ---------------------------------------------------------
   Recompensa diária (1x por dia; proteção contra relógio)
--------------------------------------------------------- */
function dayIndex(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function streakFor(today) {
  const w = state.wallet;
  if (!w.lastClaimDate) return 1;
  const a = dayIndex(today);
  const b = dayIndex(w.lastClaimDate);
  if (a === null || b === null) return 1;
  return (a - b === 86400000) ? w.streak + 1 : 1;   // dia seguinte = +1; pulei = volta ao 1
}

/**
 * Situação da recompensa diária (para o modal).
 * @returns {{canClaim:boolean, claimedToday:boolean, clockOdd:boolean, streak:number, next:number, cycle:number}}
 */
export function dailyStatus() {
  const w = state.wallet;
  const today = todayKey();
  const clockOdd = !!(w.lastClaimDate && w.lastClaimDate > today);  // relógio voltou
  const claimedToday = w.lastClaimDate === today;
  const nextStreak = streakFor(today);
  return {
    canClaim: !claimedToday && !clockOdd,
    claimedToday,
    clockOdd,
    streak: w.streak,
    next: dailyReward(nextStreak),
    cycle: ((Math.max(1, nextStreak) - 1) % DAILY_REWARDS.length) + 1,
  };
}

/**
 * Coleta a recompensa diária (1x por dia).
 * - Hoje já coletado → { status:'already' } (sem mudar nada).
 * - Data ANTERIOR à última coleta (relógio andou p/ trás) → { status:'clock' }
 *   (não libera e NÃO zera a sequência).
 * - Perder um dia → volta ao dia 1.
 * @returns {{status:'ok'|'already'|'clock'|'fail', coins:number, streak:number}}
 */
export function claimDaily() {
  if (busy) return { status: 'fail', coins: state.wallet.coins, streak: state.wallet.streak };
  const w = state.wallet;
  const today = todayKey();

  if (w.lastClaimDate && w.lastClaimDate > today) return { status: 'clock', coins: w.coins, streak: w.streak };
  if (w.lastClaimDate === today) return { status: 'already', coins: w.coins, streak: w.streak };

  busy = true;
  try {
    const snap = snapshot();
    const streak = streakFor(today);
    const reward = dailyReward(streak);
    const before = w.coins;
    w.streak = streak;
    w.lastClaimDate = today;
    w.coins = Math.min(MAX_COINS, w.coins + reward);
    const granted = w.coins - before;                 // 0 se já está no teto
    w.lifetimeEarned += granted;
    if (granted > 0) pushLedger(granted, 'diaria', `dia-${streak}`);

    if (!saveWallet()) {
      restore(snap);
      console.warn('[wallet] falha ao gravar recompensa diária — operação desfeita');
      return { status: 'fail', coins: state.wallet.coins, streak: state.wallet.streak };
    }
    emit('wallet:changed', { coins: state.wallet.coins, delta: granted, reason: 'diaria', ref: `dia-${streak}` });
    emit('daily:claimed', { coins: granted, streak });
    return { status: 'ok', coins: granted, streak };
  } finally {
    busy = false;
  }
}

/* ---------------------------------------------------------
   Meta (skin que o jogador quer comprar com moedas)
--------------------------------------------------------- */
/**
 * Define/limpa a skin-meta (apenas uma por vez).
 * Aceita só skin paga ainda não possuída; `null`/inválido limpa.
 * @param {string|null} skinId
 * @returns {boolean}
 */
export function setGoal(skinId) {
  let next = null;
  if (skinId) {
    const s = getSkin(skinId);
    const owned = skinId === 'classic' || !!state.skins.owned[skinId];
    if (s.id === skinId && s.tier !== 'free' && !owned) next = s.id;
  }
  if (state.wallet.goalSkinId === next) return true;
  const snap = snapshot();
  state.wallet.goalSkinId = next;
  if (!saveWallet()) { restore(snap); return false; }
  emit('wallet:changed', { coins: state.wallet.coins, delta: 0, reason: 'meta', ref: next || '' });
  return true;
}
