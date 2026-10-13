/* =========================================================
   Compartilhar — WhatsApp, X (Twitter) e copiar link
   ========================================================= */

import { state } from '../core/state.js';
import { on, emit } from '../core/events.js';
import { showToast } from './toasts.js';

const SITE_URL = 'https://EXEMPLO.com/'; // <-- troque pelo endereço do seu jogo

export function initShare() {
  on('share:open', (mode) => openShare(mode));

  document.querySelectorAll('[data-share]').forEach((btn) => {
    btn.addEventListener('click', () => doShare(btn.dataset.share));
  });
}

function buildText(mode) {
  const best = state.stats.best || 0;
  if (mode === 'rank' || best > 0) {
    return `🔥 Marquei ${best.toLocaleString('pt-BR')} pontos no Pulso Neon! Consegue me superar? 🏆\nJogue grátis aqui: ${SITE_URL}`;
  }
  return ` Acabei de jogar Pulso Neon 🕹️ jogo neon viciante, partidas de 1 minuto!\nJogue grátis: ${SITE_URL}`;
}

function openShare(mode) {
  const modal = document.getElementById('modal-share');
  const preview = document.getElementById('share-text-preview');
  preview.textContent = buildText(mode).replace(/\n/g, ' ');
  modal.dataset.mode = mode;
  modal.hidden = false;
}

function doShare(network) {
  const mode = document.getElementById('modal-share').dataset.mode || 'score';
  const text = buildText(mode);
  const url = SITE_URL;

  if (network === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  } else if (network === 'x') {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
  } else if (network === 'copy') {
    copyToClipboard(`${text}`);
  }
  document.getElementById('modal-share').hidden = true;
  emit('share:done', network);
}

async function copyToClipboard(text) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Pulso Neon', text, url: SITE_URL }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast({ icon: '🔗', title: 'Copiado!', desc: 'Cole onde quiser compartilhar.' });
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
      showToast({ icon: '🔗', title: 'Copiado!', desc: 'Cole onde quiser compartilhar.' });
    } catch {
      showToast({ icon: '😕', title: 'Não foi possível copiar', desc: 'Copie manualmente o link.' });
    }
  }
}

/** Texto usado no botão de compartilhar (exportado p/ testes). */
export { buildText };
