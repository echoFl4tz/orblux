/* =========================================================
   WALLET UI — moedas na interface:
   • chip de saldo + botão da recompensa diária no menu
   • modal discreto da diária (1×/dia; só para quem já joga,
     nunca sobre outro modal, sem pressão/contagem regressiva)
   • grupo "Moedas" em Configurações (saldo + extrato local)
   • bloco "Você ganhou N moedas" no fim de jogo
   Ícones = ids do sprite SVG (sem emojis na interface).
   Todo texto entra via textContent (nunca innerHTML).
   ========================================================= */

import { state } from '../core/state.js';
import { on } from '../core/events.js';
import { sfx } from '../core/audio.js';
import * as wallet from '../core/wallet.js';
import { showToast } from './toasts.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR');

/** Rótulos do extrato (`reason` vem do ledger — sempre via textContent). */
const MOTIVOS = {
  partida: 'Partida',
  dobro: 'Dobro do fim de jogo',
  missao: 'Missão',
  conquista: 'Conquista',
  diaria: 'Recompensa diária',
  skin: 'Skin',
  'bonus-legado': 'Bônus legado',
  ganho: 'Ganho',
  ox: 'Teste (debug)',
  debug: 'Teste (debug)',
};

let dailyModalShown = false;   // modal da diária já exibido nesta sessão
let dailyLastFocused = null;

/* ---------------------------------------------------------
   Render
--------------------------------------------------------- */
function renderBalance() {
  const el = $('menu-coins');
  if (el) el.textContent = fmt(wallet.getCoins());
}

function renderDailyButton() {
  const btn = $('btn-daily');
  if (!btn) return;
  const st = wallet.dailyStatus();
  btn.hidden = !st.canClaim;
  if (st.canClaim) {
    // pílula compacta ao lado do saldo (P0-1): valor à vista, texto completo no aria-label
    const lbl = $('btn-daily-label');
    if (lbl) lbl.textContent = `+${st.next}`;
    btn.setAttribute('aria-label', `Resgatar recompensa diária: +${st.next} moedas`);
  }
}

function formatWhen(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderLedger() {
  const saldo = $('set-coins');
  if (!saldo) return;
  const w = state.wallet;
  saldo.textContent = fmt(w.coins);
  const count = $('extrato-count');
  if (count) count.textContent = String(w.ledger.length);
  const box = $('set-ledger');
  if (!box) return;
  box.textContent = '';
  const frag = document.createDocumentFragment();
  for (let i = w.ledger.length - 1; i >= 0; i--) {          // mais recente primeiro
    const e = w.ledger[i];
    const li = document.createElement('li');

    const quando = document.createElement('span');
    quando.className = 'extrato-data';
    quando.textContent = formatWhen(e.t);

    const motivo = document.createElement('span');
    motivo.className = 'extrato-motivo';
    motivo.textContent = MOTIVOS[e.reason] || e.reason || '—';

    const delta = document.createElement('span');
    delta.className = `extrato-delta ${e.delta >= 0 ? 'pos' : 'neg'}`;
    delta.textContent = `${e.delta > 0 ? '+' : ''}${e.delta}`;

    li.append(quando, motivo, delta);
    frag.appendChild(li);
  }
  box.appendChild(frag);
}

function refreshAll() {
  renderBalance();
  renderDailyButton();
  renderLedger();
}

/* ---------------------------------------------------------
   Fim de jogo: "Você ganhou N moedas"
   (renderiza o payload creditado por main.js — evento
    wallet:run-coins; sem payload não há linha inventada)
--------------------------------------------------------- */
function showRunCoins(p) {
  const box = $('go-coins');
  if (!box) return;
  // só mostra quando há ganho REAL (> 0): nunca "Você ganhou 0 moedas"
  if (p && Number.isFinite(p.coins) && p.coins > 0) {
    const val = $('go-coins-value');
    if (val) val.textContent = fmt(p.coins);
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function hideRunCoins() {
  const box = $('go-coins');
  if (box) box.hidden = true;
}

/* ---------------------------------------------------------
   Recompensa diária (botão do menu + modal do boot)
--------------------------------------------------------- */
function claimDailyAction() {
  const r = wallet.claimDaily();
  if (r.status === 'ok') {
    sfx('achievement');
    showToast({
      icon: 'ic-coin',
      title: 'Recompensa diária',
      desc: `+${r.coins} moedas — dia ${r.streak} de sequência`,
    });
  } else if (r.status === 'already') {
    showToast({ icon: 'ic-clock', title: 'Já resgatada hoje', desc: 'Volte amanhã para manter a sequência.' });
  } else if (r.status === 'clock') {
    showToast({ icon: 'ic-clock', title: 'Data alterada', desc: 'A recompensa libera quando a data fizer sentido.' });
  } else {
    showToast({ icon: 'ic-mission', title: 'Não foi possível resgatar', desc: 'Tente de novo em instantes.' });
  }
  refreshAll();
  return r;
}

function openDailyModal() {
  dailyLastFocused = document.activeElement;
  const m = $('modal-daily');
  m.hidden = false;
  const panel = m.querySelector('.panel');
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
}

function closeDailyModal() {
  const m = $('modal-daily');
  if (!m || m.hidden) return;
  m.hidden = true;
  if (dailyLastFocused && dailyLastFocused.isConnected) {
    dailyLastFocused.focus({ preventScroll: true });
  }
  dailyLastFocused = null;
}

/** Tenta exibir o modal da diária no boot. Retorna true se exibiu. */
function tryShowDailyModal() {
  if (dailyModalShown) return true;
  const st = wallet.dailyStatus();
  if (!st.canClaim) return false;
  if (!state.wallet.lastClaimDate) return false;    // só para quem já resgatou antes
  if (!state.profile.asked) return false;           // onboarding primeiro
  if (document.querySelector('.modal:not([hidden])')) return false;  // nunca sobre outro modal
  dailyModalShown = true;
  const txt = $('daily-text');
  if (txt) {
    txt.textContent = st.streak > 0
      ? `Sua sequência está em ${st.streak} dia${st.streak > 1 ? 's' : ''}. A recompensa de hoje vale ${st.next} moedas.`
      : `A recompensa de hoje vale ${st.next} moedas.`;
  }
  const btn = $('daily-claim');
  if (btn) btn.textContent = `Resgatar +${st.next} moedas`;
  openDailyModal();
  return true;
}

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
export function initWalletUI() {
  refreshAll();

  on('wallet:changed', refreshAll);
  on('state:reset', () => {
    dailyModalShown = false;
    hideRunCoins();
    refreshAll();
  });
  on('wallet:run-coins', showRunCoins);
  on('game:start', hideRunCoins);

  $('btn-daily')?.addEventListener('click', () => claimDailyAction());
  $('daily-claim')?.addEventListener('click', () => { const r = claimDailyAction(); if (r.status === 'ok') closeDailyModal(); });
  $('daily-later')?.addEventListener('click', closeDailyModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDailyModal();
  });

  // modal discreto no boot: espera a poeira do onboarding assentar
  let tentativas = 0;
  const tentar = () => {
    if (tryShowDailyModal()) return;
    if (++tentativas < 4) setTimeout(tentar, 1600);
  };
  setTimeout(tentar, 800);
}
