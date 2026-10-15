/* =========================================================
   social-ui.js — Fase 1: entrada na comunidade, conta,
   código de recuperação e exclusão de conta.

   • 100% OPCIONAL: nada aqui abre sozinho nem bloqueia a
     1ª partida; o botão só existe se SOCIAL_ENABLED.
   • Flag desligada = botões ocultos e SEM nenhum listener.
   • Erros degradam com "Tentar de novo" (nunca travam a tela);
     erros de DIGITAÇÃO ficam inline no campo certo.
   • Todo texto da rede entra via textContent (sem innerHTML).
   ========================================================= */

import { on } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';
import { state } from '../core/state.js';
import { showScreen, openModal, closeModal } from './screens.js';
import { validateNickname } from '../core/nickname.js';
import { flag } from '../../net/flags.js';
import { getApi, SocialError } from '../../net/api.js';

const $ = (id) => document.getElementById(id);

const PASSOS = ['fora', 'idade', 'termos', 'perfil', 'recuperar', 'codigo', 'dentro', 'loading', 'erro'];

const IDADE_LABEL = {
  menor13: 'Menor de 13 anos',
  '13a17': '13 a 17 anos',
  '18+': '18 anos ou mais',
};

const IDADE_NOTA = {
  menor13: 'Para sua segurança, você usará só frases prontas e emojis no chat e não cria clãs.',
  '13a17': 'Seu perfil fica como menor: chat com supervisão e sem compras.',
  '18+': 'Sem restrições adicionais.',
};

// erros de DIGITAÇÃO voltam ao passo com mensagem inline;
// só rede/estado vai para a tela de erro com "Tentar de novo"
const ERROS_INLINE = new Set([
  'invalid-nickname', 'nickname-required', 'age-required',
  'terms-required', 'invalid-code',
]);

let passo = 'fora';
let idade = null;
let perfil = null;
let pendente = null;   // { acao, de } — reexecutado pelo "Tentar de novo"

/* ---------------- navegação entre passos ---------------- */

function mostrar(novo) {
  passo = novo;
  for (const p of PASSOS) {
    const el = $(`social-${p}`);
    if (el) el.hidden = p !== novo;
  }
}

function focarPasso() {
  const box = $(`social-${passo}`);
  if (!box) return;
  const alvo = box.querySelector('button:not([disabled]), input:not([disabled]), select, a');
  if (alvo && typeof alvo.focus === 'function') alvo.focus({ preventScroll: true });
}

function voltar() {
  sfx('ui');
  const destino = {
    idade: 'fora',
    termos: 'idade',
    perfil: 'termos',
    recuperar: 'fora',
    erro: (pendente && pendente.de) || 'fora',
  }[passo] || 'fora';
  mostrar(destino);
  focarPasso();
}

function inlineErro(de, msg) {
  const alvos = { perfil: 'social-nick-error', recuperar: 'social-recover-error', idade: 'social-age-note' };
  const el = $(alvos[de] || 'social-nick-error');
  if (el) el.textContent = msg;
}

function msgErro(e) {
  if (e instanceof SocialError) {
    if (e.code === 'offline') return 'Você está sem conexão. Tente de novo — o jogo segue 100% offline.';
    if (e.code === 'disabled') return 'A comunidade está indisponível agora.';
    if (e.code === 'no-session') return 'Sessão expirada. Entre na comunidade de novo.';
    return e.message || 'Não foi possível conectar agora.';
  }
  return 'Falha de conexão. Tente de novo.';
}

function mostrarErro(e) {
  console.warn('[social] operação falhou:', (e && e.code) || (e && e.name) || 'erro');
  const el = $('social-erro-text');
  if (el) el.textContent = msgErro(e);
  mostrar('erro');
  focarPasso();
}

/** Executa uma ação da rede com loading, retry e erros inline. */
async function executar(acao, de) {
  pendente = { acao, de };
  mostrar('loading');
  try {
    await acao();
  } catch (e) {
    if (e && ERROS_INLINE.has(e.code)) {
      mostrar(de);
      inlineErro(de, msgErro(e));
      focarPasso();
    } else {
      mostrarErro(e);
    }
  }
}

/* ---------------- ações (rede) ---------------- */

function acaoAbrir() {
  return (async () => {
    const api = getApi();
    let p = null;
    try {
      p = await api.profile.get();
    } catch (e) {
      if (e && e.code === 'no-session') p = null;   // ainda não entrou = "fora"
      else throw e;
    }
    perfil = p || null;
    atualizarStatus();
    if (perfil) { renderDentro(); mostrar('dentro'); }
    else mostrar('fora');
    focarPasso();
  })();
}

function acaoEntrar() {
  return (async () => {
    const api = getApi();
    const nickEl = $('social-nick');
    const v = validateNickname(nickEl ? nickEl.value : '');
    if (!v.ok) throw new SocialError('invalid-nickname', v.error);

    await api.auth.signIn();
    perfil = await api.profile.upsert({
      nickname: v.value,
      ageBand: idade,
      country: $('social-country') ? $('social-country').value : 'BR',
      skinId: (state.skins && state.skins.equipped) || 'classic',
      acceptTerms: true,
    });
    atualizarStatus();

    let code = null;
    try { code = await api.profile.getRecoveryCode(); } catch { /* segue sem mostrar agora */ }
    if (code) {
      const el = $('social-code-value');
      if (el) el.textContent = code;
      mostrar('codigo');
    } else {
      renderDentro();
      mostrar('dentro');
    }
    showToast({ icon: 'ic-globe', title: 'Você entrou na comunidade', desc: `Bem-vindo(a), ${perfil.nickname}.` });
    sfx('ui');
    focarPasso();
  })();
}

function acaoRecuperar() {
  return (async () => {
    const api = getApi();
    const input = $('social-recover-input');
    const code = input ? input.value.trim() : '';
    if (!code) throw new SocialError('invalid-code', 'Digite o código de recuperação.');
    perfil = await api.profile.recover(code);
    atualizarStatus();
    renderDentro();
    mostrar('dentro');
    showToast({ icon: 'ic-user', title: 'Perfil recuperado', desc: perfil.nickname });
    sfx('ui');
    focarPasso();
  })();
}

function acaoSair() {
  return (async () => {
    const api = getApi();
    await api.auth.signOut();
    perfil = null;
    atualizarStatus();
    mostrar('fora');
    showToast({ icon: 'ic-user', title: 'Você saiu da comunidade', desc: 'Seu progresso do jogo continua aqui.' });
    sfx('ui');
    focarPasso();
  })();
}

function acaoApagar() {
  return (async () => {
    const api = getApi();
    await api.profile.deleteAccount();
    perfil = null;
    idade = null;
    resetarFormulario();
    atualizarStatus();
    mostrar('fora');
    showToast({ icon: 'ic-trash', title: 'Conta da comunidade apagada', desc: 'Seu progresso neste dispositivo foi mantido.' });
    sfx('ui');
    focarPasso();
  })();
}

function resetarFormulario() {
  document.querySelectorAll('#social-idade [data-age]').forEach((b) => b.setAttribute('aria-checked', 'false'));
  const note = $('social-age-note');
  if (note) { note.textContent = ''; note.hidden = true; }
  const next = $('social-age-next');
  if (next) next.disabled = true;
  const chk = $('social-terms-check');
  if (chk) chk.checked = false;
  const termsNext = $('social-terms-next');
  if (termsNext) termsNext.disabled = true;
  const nick = $('social-nick');
  if (nick) nick.value = '';
  const nickErr = $('social-nick-error');
  if (nickErr) nickErr.textContent = '';
  const rec = $('social-recover-input');
  if (rec) rec.value = '';
  const recErr = $('social-recover-error');
  if (recErr) recErr.textContent = '';
}

/* ---------------- render ---------------- */

function atualizarStatus() {
  const el = $('social-status');
  if (!el) return;
  el.textContent = perfil ? `Na comunidade como ${perfil.nickname}` : 'Fora da comunidade';
}

function nomePais(sigla) {
  const sel = $('social-country');
  if (sel && sigla) {
    const opt = [...sel.options].find((o) => o.value === sigla);
    if (opt) return `${opt.text} (${sigla})`;
  }
  return sigla ? `País: ${sigla}` : 'País não informado';
}

function renderDentro() {
  if (!perfil) return;
  const nick = $('social-nick-out');
  if (nick) nick.textContent = perfil.nickname || '—';
  const age = $('social-age-out');
  if (age) age.textContent = IDADE_LABEL[perfil.ageBand] || '—';
  const pais = $('social-country-out');
  if (pais) pais.textContent = nomePais(perfil.country);
  // código sempre recolhido ao entrar: mostrar exige clique
  const view = $('social-code-view');
  if (view) { view.textContent = ''; view.hidden = true; }
  const btn = $('social-show-code');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Mostrar código de recuperação';
  }
}

function preencherPerfil() {
  const nick = $('social-nick');
  if (nick && !nick.value.trim() && state.profile && state.profile.nickname) {
    nick.value = state.profile.nickname;
  }
  const err = $('social-nick-error');
  if (err) err.textContent = '';
}

/* ---------------- interações pontuais ---------------- */

function escolherIdade(age) {
  idade = age;
  sfx('ui');
  document.querySelectorAll('#social-idade [data-age]').forEach((b) => {
    b.setAttribute('aria-checked', b.dataset.age === age ? 'true' : 'false');
  });
  const note = $('social-age-note');
  if (note) { note.textContent = IDADE_NOTA[age] || ''; note.hidden = !note.textContent; }
  const next = $('social-age-next');
  if (next) next.disabled = false;
}

async function copiarCodigo() {
  const el = $('social-code-value');
  const code = ((el && el.textContent) || '').trim();
  if (!code) return;
  sfx('ui');
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
      ok = true;
    }
  } catch { /* sem permissão: sugere anotar */ }
  showToast(ok
    ? { icon: 'ic-copy', title: 'Código copiado', desc: 'Guarde em um local seguro.' }
    : { icon: 'ic-copy', title: 'Não foi possível copiar', desc: 'Anote o código manualmente.' });
}

async function alternarCodigo() {
  const btn = $('social-show-code');
  const view = $('social-code-view');
  if (!btn || !view) return;
  sfx('ui');
  if (!view.hidden) {
    view.textContent = '';
    view.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Mostrar código de recuperação';
    return;
  }
  try {
    const code = await getApi().profile.getRecoveryCode();
    view.textContent = code || 'Código indisponível.';
    view.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Ocultar código de recuperação';
  } catch (e) {
    showToast({ icon: 'ic-user', title: 'Não foi possível mostrar o código', desc: msgErro(e) });
  }
}

function abrir() {
  showScreen('social');
  mostrar('loading');
  executar(acaoAbrir, 'fora');
  // foco só depois da transição da tela (regra dos 350 ms)
  setTimeout(focarPasso, 350);
}

/* ---------------- eventos ---------------- */

function onScreenClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;

  if (btn.dataset.social === 'back') { voltar(); return; }

  switch (btn.id) {
    case 'social-start':
      sfx('ui'); mostrar('idade'); focarPasso(); break;
    case 'social-recover-open':
      sfx('ui'); mostrar('recuperar'); focarPasso(); break;
    case 'social-age-next':
      sfx('ui'); mostrar('termos'); focarPasso(); break;
    case 'social-terms-next':
      sfx('ui'); preencherPerfil(); mostrar('perfil'); focarPasso(); break;
    case 'social-enter':
      sfx('ui'); executar(acaoEntrar, 'perfil'); break;
    case 'social-recover-go':
      sfx('ui'); executar(acaoRecuperar, 'recuperar'); break;
    case 'social-code-ok':
      sfx('ui'); renderDentro(); mostrar('dentro'); focarPasso(); break;
    case 'social-code-copy':
      copiarCodigo(); break;
    case 'social-show-code':
      alternarCodigo(); break;
    case 'social-signout':
      sfx('ui'); executar(acaoSair, 'dentro'); break;
    case 'social-delete':
      sfx('ui'); openModal('modal-social-delete'); break;
    case 'social-retry':
      sfx('ui'); if (pendente) executar(pendente.acao, pendente.de); break;
    default:
      if (btn.dataset.age) escolherIdade(btn.dataset.age);
  }
}

function onChange(e) {
  const t = e.target;
  if (!t) return;
  if (t.id === 'social-terms-check') {
    const next = $('social-terms-next');
    if (next) next.disabled = !t.checked;
    sfx('ui');
  } else if (t.id === 'social-recover-input' || t.id === 'social-nick') {
    const err = $(t.id === 'social-nick' ? 'social-nick-error' : 'social-recover-error');
    if (err) err.textContent = '';
  }
}

function onDeleteClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'sd-cancel') { sfx('ui'); closeModal('modal-social-delete'); return; }
  if (btn.id === 'sd-confirm') {
    sfx('ui');
    closeModal('modal-social-delete');
    executar(acaoApagar, 'dentro');
  }
}

/* ---------------- init ---------------- */

export function initSocialUI() {
  const ligada = flag('SOCIAL_ENABLED');
  const btn = $('btn-social');
  if (btn) btn.hidden = !ligada;
  const grupo = $('group-social');
  if (grupo) grupo.hidden = !ligada;
  if (!ligada) return;                 // produção: oculto e SEM listeners

  const tela = $('screen-social');
  if (tela) {
    tela.addEventListener('click', onScreenClick);
    tela.addEventListener('change', onChange);
  }
  const modal = $('modal-social-delete');
  if (modal) modal.addEventListener('click', onDeleteClick);
  on('social:open', abrir);

  // status em Configurações: chamada leve, assíncrona, nunca trava o boot
  Promise.resolve()
    .then(() => getApi().profile.get())
    .then((p) => { perfil = p || null; atualizarStatus(); })
    .catch(() => { /* offline/sem conta: segue "Fora da comunidade" */ });
}
