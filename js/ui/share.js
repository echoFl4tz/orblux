/* =========================================================
   Compartilhar — WhatsApp, X (Twitter) e copiar link
   ========================================================= */

import { state } from '../core/state.js';
import { on, emit } from '../core/events.js';
import { showToast } from './toasts.js';

const SITE_URL = 'https://EXEMPLO.com/'; // <-- troque pelo endereço do seu jogo

let shareLastFocused = null;
let shareState = { mode: 'score', score: 0 };

export function initShare() {
  on('share:open', (payload) => openShare(payload));
  on('share:close', () => closeShare());

  document.querySelectorAll('[data-share]').forEach((btn) => {
    btn.addEventListener('click', () => doShare(btn.dataset.share));
  });
}

function buildText(mode, score) {
  const nick = (state.profile && state.profile.nickname) || 'Jogador';
  const best = state.stats.best || 0;
  // modo 'rank' usa o recorde; modo 'score' usa a pontuação da partida
  const pts = mode === 'rank' ? best : (typeof score === 'number' ? score : best);
  const head = pts > 0
    ? `${nick} marcou ${pts.toLocaleString('pt-BR')} pontos no ORBLUX! Consegue me superar?`
    : `${nick} acabou de jogar ORBLUX!`;
  return `${head}\nJogue grátis aqui: ${SITE_URL}`;
}

function openShare(payload) {
  const mode = typeof payload === 'string' ? payload : (payload?.mode || 'score');
  const score = typeof payload === 'object' && payload ? (payload.score || 0) : 0;
  shareState = { mode, score };
  const modal = document.getElementById('modal-share');
  const preview = document.getElementById('share-text-preview');
  preview.textContent = buildText(mode, score).replace(/\n/g, ' ');
  modal.dataset.mode = mode;
  shareLastFocused = document.activeElement;
  modal.hidden = false;
  // foco no painel do modal (a11y) — evita perder o foco ao fechar
  const panel = modal.querySelector('.panel');
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
}

function closeShare() {
  const modal = document.getElementById('modal-share');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (shareLastFocused && shareLastFocused.isConnected) shareLastFocused.focus({ preventScroll: true });
  shareLastFocused = null;
}

function doShare(network) {
  const text = buildText(shareState.mode, shareState.score);
  const url = SITE_URL;

  if (network === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  } else if (network === 'x') {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
  } else if (network === 'copy') {
    copyToClipboard(`${text}`);
  }
  closeShare();
  emit('share:done', network);
}

async function copyToClipboard(text) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ORBLUX', text, url: SITE_URL }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast({ icon: 'ic-copy', title: 'Copiado!', desc: 'Cole onde quiser compartilhar.' });
  } catch {
    // fallback (navegadores antigos / permissão negada)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast({ icon: 'ic-copy', title: 'Copiado!', desc: 'Cole onde quiser compartilhar.' });
    } catch {
      showToast({ icon: 'ic-help', title: 'Não foi possível copiar', desc: 'Copie manualmente o link.' });
    }
  }
}

/** Texto usado no botão de compartilhar (exportado p/ testes). */
export { buildText };
