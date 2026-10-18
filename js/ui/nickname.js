/* =========================================================
   Apelido — UI (modal de onboarding + edição, chip no menu,
   linha em Configurações). Validação em tempo real, sem alert().
   ========================================================= */

import { on } from '../core/events.js';
import { state, setNickname, markProfileAsked } from '../core/state.js';
import { validateNickname, NICK_MAX } from '../core/nickname.js';
import { startRun } from './screens.js';

let modal, input, counter, errorEl, saveBtn, skipBtn, titleEl;
let mode = 'onboard';
let lastFocused = null;

export function initNickname() {
  modal = document.getElementById('modal-nickname');
  input = document.getElementById('nick-input');
  counter = document.getElementById('nick-counter');
  errorEl = document.getElementById('nick-error');
  saveBtn = document.getElementById('nick-save');
  skipBtn = document.getElementById('nick-skip');
  titleEl = document.getElementById('nick-title');
  if (!modal || !input) return;

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSave(); }
  });
  saveBtn.addEventListener('click', doSave);
  skipBtn.addEventListener('click', doSkip);

  // tocar no chip do menu ou no botão "Alterar" das configurações abre para editar
  document.querySelectorAll('[data-action="edit-nickname"]').forEach((b) =>
    b.addEventListener('click', () => openNickname('edit')));

  on('profile:changed', refreshDisplays);
  refreshDisplays();

  // onboarding: uma única vez, antes da primeira partida
  if (!state.profile.asked) {
    setTimeout(() => { if (!state.profile.asked) openNickname('onboard'); }, 1100);
  }
}

/** Espelha o apelido atual no chip do menu e nas configurações. */
function refreshDisplays() {
  const nick = state.profile.nickname;
  const mn = document.getElementById('menu-nickname');
  if (mn) mn.textContent = nick;
  // nome acessível do chip inclui o texto visível (WCAG: rótulo == nome)
  mn?.closest('.nick-chip')?.setAttribute('aria-label', `Alterar apelido — Olá, ${nick}`);
  const sn = document.getElementById('set-nickname');
  if (sn) sn.textContent = nick;
}

function onInput() {
  const raw = input.value;
  if (counter) counter.textContent = `${raw.length}/${NICK_MAX}`;
  const v = validateNickname(raw);
  const showErr = raw.length > 0 && !v.ok;
  if (errorEl) errorEl.textContent = showErr ? v.error : '';
  input.classList.toggle('invalid', showErr);
  input.setAttribute('aria-invalid', showErr ? 'true' : 'false');
  saveBtn.disabled = !v.ok;
}

function openNickname(m) {
  mode = m;
  lastFocused = document.activeElement;
  if (titleEl) titleEl.textContent = m === 'onboard' ? 'Escolha seu apelido' : 'Editar apelido';
  saveBtn.textContent = m === 'onboard' ? 'Salvar e jogar' : 'Salvar';
  skipBtn.textContent = m === 'onboard' ? 'Pular por agora' : 'Cancelar';
  input.value = state.profile.nickname;
  onInput();
  modal.hidden = false;
  input.focus();
  input.select();
}

function closeNickname() {
  modal.hidden = true;
  if (lastFocused && lastFocused.isConnected) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
}

function doSave() {
  const v = validateNickname(input.value);
  if (!v.ok) { onInput(); input.focus(); return; }
  setNickname(v.value);
  markProfileAsked();
  refreshDisplays();
  closeNickname();
  if (mode === 'onboard') startRun();   // "Salvar e jogar"
}

function doSkip() {
  markProfileAsked();                    // mantém o apelido gerado e não pergunta de novo
  closeNickname();
}
