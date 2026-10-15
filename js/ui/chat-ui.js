/* =========================================================
   chat-ui.js — Fase 3: chat global (salas/shards).

   • Flag CHAT_ENABLED (junto com SOCIAL_ENABLED) desligada =
     botões ocultos e SEM nenhum listener.
   • UMA interface net/api.js: join() assina o tempo real da
     sala (mock: bots; supabase: canal Realtime) e onMessage
     entrega as mensagens — a UI não conhece o provedor.
   • Todo texto da rede entra por textContent (nunca innerHTML).
   • Erros de ABRIR degradam com "Tentar de novo"; erros de
     ENVIO ficam inline sob o campo (nunca trocam de tela).
   • Denúncia e bloqueio exigidos pela política Play de UGC;
     menores de 13 usam só frases prontas/emojis (net/rules.js).
   ========================================================= */

import { on } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';
import { showScreen, openModal, closeModal, returnToMenu } from './screens.js';
import { flag } from '../../net/flags.js';
import { getApi, SocialError } from '../../net/api.js';
import { CHAT, validateChatMessage } from '../../net/rules.js';
import { APPEAL } from '../../net/config.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const ESTADOS = ['loading', 'cta', 'error', 'room'];

let perfil = null;
let room = null;
let unsub = null;        // cancelador do onMessage
let pendente = null;     // última ação de abertura (retry)
let acaoMsg = null;      // mensagem aberta no modal de ações
let bloqueados = [];

// espelho LOCAL das regras de envio (feedback imediato; o servidor decide)
let lastSentAt = 0;
let recentes = [];
let ultimoTexto = '';

/* ---------------- utilidades ---------------- */

/** Ícone criado por DOM — conteúdo de rede nunca passa por innerHTML. */
function icone(id) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

function mostrarEstado(novo) {
  for (const e of ESTADOS) {
    const el = $(`chat-${e}`);
    if (el) el.hidden = e !== novo;
  }
}

function msgErro(e) {
  if (e instanceof SocialError) {
    if (e.code === 'offline') return 'Você está sem conexão. Tente de novo — o jogo segue 100% offline.';
    if (e.code === 'disabled') return 'O chat está indisponível agora.';
    if (e.code === 'no-session') return 'Sessão expirada. Entre na comunidade de novo.';
    return e.message || 'Não foi possível conectar agora.';
  }
  return 'Falha de conexão. Tente de novo.';
}

function formatarHora(at) {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rolarFim() {
  const lista = $('chat-list');
  if (lista) lista.scrollTop = lista.scrollHeight;
}

/* ---------------- abrir / fechar ---------------- */

async function carregar() {
  mostrarEstado('loading');
  pendente = { acao: 'carregar' };
  try {
    await limpar();                       // sessão anterior (reabertura)
    const api = getApi();
    let p = null;
    try {
      p = await api.profile.get();
    } catch (e) {
      if (e && e.code === 'no-session') p = null;   // ainda não entrou = CTA
      else throw e;
    }
    perfil = p || null;
    if (!perfil) { mostrarEstado('cta'); return; }

    const j = await api.chat.join('global');
    room = (j && j.room) || 'global';
    const hist = await api.chat.history({ room, limit: CHAT.HISTORY_LIMIT });
    renderHistorico(hist);
    if (unsub) unsub();
    unsub = api.chat.onMessage(aoChegar);
    bloqueados = await api.chat.blocks();
    normalizarBloqueados();
    atualizarBloqueados();
    atualizarOnline(j && j.online);
    configurarComposer();
    mostrarEstado('room');
    rolarFim();
    const input = $('chat-input');
    if (input && !input.hidden) input.focus({ preventScroll: true });
  } catch (e) {
    if (e && e.code === 'no-session') { mostrarEstado('cta'); return; }
    console.warn('[chat] abrir falhou:', (e && e.code) || 'erro');
    const el = $('chat-error-text');
    if (el) el.textContent = msgErro(e);
    mostrarEstado('error');
  }
}

/** Encerra assinatura e sala (reabertura/fechamento). Silencioso. */
async function limpar() {
  if (unsub) {
    try { unsub(); } catch { /* ignore */ }
    unsub = null;
  }
  if (room) {
    room = null;
    try { await getApi().chat.leave(); } catch { /* silêncio */ }
  }
}

async function sair() {
  sfx('ui');
  await limpar();
  mostrarEstado('loading');              // estado neutro p/ próxima abertura
  returnToMenu();
}

/** A Comunidade abriu por cima (CTA do chat): sai sem navegar. */
function sairSilencioso() {
  if (!room && !unsub) return;
  limpar();                              // fire-and-forget
  mostrarEstado('loading');
}

function abrir() {
  showScreen('chat');
  mostrarEstado('loading');
  carregar();
}

/* ---------------- render (textContent sempre) ---------------- */

function renderHistorico(msgs) {
  const lista = $('chat-list');
  const vazio = $('chat-empty');
  if (!lista) return;
  lista.textContent = '';
  for (const m of msgs || []) {
    const li = montarLinha(m);
    if (li) lista.appendChild(li);
  }
  if (vazio) vazio.hidden = lista.childElementCount > 0;
}

function montarLinha(m) {
  if (!m || m.hidden) return null;
  if (m.room && room && m.room !== room) return null;       // só a minha sala
  if (perfil && bloqueados.some((b) => b.id === m.userId)) return null;
  const meu = !!(perfil && m.userId === perfil.id);

  const li = document.createElement('li');
  li.className = 'chat-msg' + (meu ? ' mine' : '');
  li.dataset.user = String(m.userId || '');

  const main = document.createElement('div');
  main.className = 'chat-msg-main';

  const head = document.createElement('div');
  head.className = 'chat-msg-head';
  const nick = document.createElement('b');
  const tag = typeof m.tag === 'string' && m.tag ? ` [${m.tag.slice(0, 4)}]` : '';
  nick.textContent = `${String(m.nick || 'Jogador').slice(0, 16)}${tag}`;
  const hora = document.createElement('span');
  hora.className = 'chat-msg-time';
  hora.textContent = formatarHora(m.at);
  head.append(nick, hora);

  const txt = document.createElement('p');
  txt.className = 'chat-msg-text';
  txt.textContent = String(m.text || '');

  main.append(head, txt);
  li.appendChild(main);

  // ações (denunciar/bloquear) só em mensagens de OUTROS
  if (!meu) {
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'icon-btn chat-msg-act';
    act.dataset.msgId = String(m.id);
    act.dataset.msgNick = String(m.nick || 'Jogador').slice(0, 16);
    act.setAttribute('aria-label', `Ações da mensagem de ${act.dataset.msgNick}`);
    act.appendChild(icone('ic-chevron'));
    li.appendChild(act);
  }
  return li;
}

function aoChegar(m) {
  if (!m || document.body.dataset.screen !== 'chat') return;  // fora da tela: ignora
  const lista = $('chat-list');
  if (!lista) return;
  const li = montarLinha(m);
  if (!li) return;
  const pertoDoFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
  const vazio = $('chat-empty');
  if (vazio) vazio.hidden = true;
  lista.appendChild(li);
  if (pertoDoFim) lista.scrollTop = lista.scrollHeight;
}

function atualizarOnline(n) {
  const el = $('chat-online');
  if (!el) return;
  const v = Math.max(1, Math.floor(Number(n) || 0));   // eu estou aqui ⇒ ≥ 1
  el.textContent = v === 1 ? '1 jogador online' : `${v} jogadores online`;
}

/* ---------------- composer ---------------- */

function configurarComposer() {
  const form = $('chat-form');
  const quick = $('chat-quick');
  const chips = $('chat-quick-chips');
  const input = $('chat-input');
  const menor = !!(perfil && perfil.ageBand === 'menor13');
  if (form) form.hidden = menor;
  if (quick) quick.hidden = !menor;
  if (menor && chips && chips.childElementCount === 0) {
    const cat = (getApi().chat && getApi().chat.catalog) || {};
    for (const t of [...(cat.phrases || []), ...(cat.emojis || [])]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.dataset.quick = t;
      b.textContent = t;
      chips.appendChild(b);
    }
  }
  if (input) input.value = '';
  esconderErroEnvio();
}

function erroEnvio(msg, codigo) {
  const el = $('chat-send-error');
  if (el) {
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  // punição do servidor (muted/banned): mostra o link de contestação
  // por e-mail — decisão §8.5 (resposta em até APPEAL.prazoDias dias)
  const link = $('chat-appeal');
  if (link) {
    const contestar = !!msg && (codigo === 'muted' || codigo === 'banned');
    link.hidden = !contestar;
    link.href = contestar ? mailtoContestacao(codigo) : '#';
  }
}

/** mailto com ID/apelido/punição (sem texto livre do jogador no assunto). */
function mailtoContestacao(codigo) {
  const punicao = codigo === 'banned' ? 'bloqueio (conta suspensa no chat)' : 'silenciamento (mute) no chat';
  const assunto = `Contestar bloqueio — ORBLUX`;
  const corpo = [
    'Olá! Quero contestar uma punição no chat do ORBLUX.',
    '',
    `ID da conta: ${(perfil && perfil.id) || 'n/d'}`,
    `Apelido: ${(perfil && perfil.nickname) || 'n/d'}`,
    `Punição: ${punicao}`,
    `Prazo de resposta: ${APPEAL.prazoDias} dias`,
    '',
    'Contexto (opcional): ',
  ].join('\r\n');
  return `mailto:${APPEAL.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

function esconderErroEnvio() { erroEnvio(''); }

async function enviar(bruto) {
  if (!perfil || !room) return;
  const input = $('chat-input');
  const texto = typeof bruto === 'string' ? bruto : (input ? input.value : '');
  esconderErroEnvio();
  const agora = Date.now();
  // régua local espelha net/rules.js p/ feedback imediato; quem decide é o servidor
  const v = validateChatMessage(texto, {
    ageBand: perfil.ageBand,
    now: agora,
    lastSentAt,
    recentSent: recentes,
    lastText: ultimoTexto,
  });
  if (!v.ok) { erroEnvio(v.error); return; }
  try {
    await getApi().chat.send(v.value, room);
    lastSentAt = agora;
    recentes = [...recentes.filter((t) => agora - t < 60000), agora];
    ultimoTexto = v.value;
    if (input) input.value = '';
  } catch (e) {
    // erros de envio (inclusive mute/ban do servidor) ficam INLINE
    console.warn('[chat] envio falhou:', (e && e.code) || 'erro');
    erroEnvio(msgErro(e), e instanceof SocialError ? e.code : null);
  }
}

/* ---------------- denúncia / bloqueio ---------------- */

function mostrarAcao(vista) {
  const vist = { menu: 'chat-actions-menu', reasons: 'chat-actions-reasons', block: 'chat-actions-block' };
  for (const [k, id] of Object.entries(vist)) {
    const el = $(id);
    if (el) el.hidden = k !== vista;
  }
}

function abrirAcoes(btn) {
  if (!btn) return;
  acaoMsg = { id: btn.dataset.msgId, nick: btn.dataset.msgNick || 'Jogador', userId: (btn.closest('.chat-msg') || {}).dataset?.user || '' };
  const prev = $('chat-actions-preview');
  const li = btn.closest('.chat-msg');
  const txt = li ? li.querySelector('.chat-msg-text') : null;
  if (prev) prev.textContent = txt ? txt.textContent : '';
  const t = $('chat-actions-title');
  if (t) t.textContent = `Mensagem de ${acaoMsg.nick}`;
  const rn = $('chat-report-nick');
  if (rn) rn.textContent = acaoMsg.nick;
  const bn = $('chat-block-nick');
  if (bn) bn.textContent = acaoMsg.nick;
  const ba = $('chat-block-nick-a');
  if (ba) ba.textContent = acaoMsg.nick;
  mostrarAcao('menu');
  sfx('ui');
  openModal('modal-chat-actions');
}

async function denunciar(reason) {
  if (!acaoMsg) return;
  try {
    await getApi().chat.report({ messageId: acaoMsg.id, reason });
    closeModal('modal-chat-actions');
    showToast({ icon: 'ic-shield', title: 'Denúncia enviada', desc: 'Obrigado — vamos analisar a mensagem.' });
  } catch (e) {
    showToast({ icon: 'ic-shield', title: 'Não foi possível denunciar', desc: msgErro(e) });
  }
}

async function confirmarBloqueio() {
  if (!acaoMsg) return;
  try {
    const api = getApi();
    await api.chat.block(acaoMsg.userId, acaoMsg.nick);
    bloqueados = await api.chat.blocks();
    normalizarBloqueados();
    atualizarBloqueados();
    removerDoChat(acaoMsg.userId);
    closeModal('modal-chat-actions');
    showToast({ icon: 'ic-user', title: 'Jogador bloqueado', desc: `Você não vê mais as mensagens de ${acaoMsg.nick}.` });
  } catch (e) {
    showToast({ icon: 'ic-user', title: 'Não foi possível bloquear', desc: msgErro(e) });
  }
}

function removerDoChat(userId) {
  const lista = $('chat-list');
  if (!lista) return;
  [...lista.children].forEach((li) => {
    if (li.dataset.user === String(userId)) li.remove();
  });
  const vazio = $('chat-empty');
  if (vazio) vazio.hidden = lista.childElementCount > 0;
}

/* ---------------- lista de bloqueados ---------------- */

function normalizarBloqueados() {
  bloqueados = (Array.isArray(bloqueados) ? bloqueados : [])
    .map((b) => (typeof b === 'string'
      ? { id: b, nick: 'Jogador' }
      : { id: b && b.id, nick: (b && b.nick) || 'Jogador' }))
    .filter((b) => !!b.id);
}

function atualizarBloqueados() {
  const c = $('chat-blocked-count');
  if (c) c.textContent = String(bloqueados.length);
}

function renderBloqueados() {
  const ul = $('chat-blocked-list');
  const vazio = $('chat-blocked-empty');
  if (!ul) return;
  ul.textContent = '';
  for (const b of bloqueados) {
    const li = document.createElement('li');
    const nome = document.createElement('b');
    nome.textContent = b.nick;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small';
    btn.dataset.unblock = b.id;
    btn.textContent = 'Desbloquear';
    li.append(nome, btn);
    ul.appendChild(li);
  }
  if (vazio) vazio.hidden = bloqueados.length > 0;
  atualizarBloqueados();
}

async function abrirBloqueados() {
  sfx('ui');
  try {
    bloqueados = await getApi().chat.blocks();
    normalizarBloqueados();
    renderBloqueados();
    openModal('modal-chat-blocked');
  } catch (e) {
    showToast({ icon: 'ic-shield', title: 'Não foi possível carregar', desc: msgErro(e) });
  }
}

async function desbloquear(id) {
  try {
    await getApi().chat.unblock(id);
    bloqueados = bloqueados.filter((b) => b.id !== id);
    renderBloqueados();
    showToast({ icon: 'ic-user', title: 'Jogador desbloqueado', desc: 'As mensagens dele voltam a aparecer.' });
  } catch (e) {
    showToast({ icon: 'ic-user', title: 'Não foi possível desbloquear', desc: msgErro(e) });
  }
}

/* ---------------- eventos ---------------- */

function onChatClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'chat-close') { sair(); return; }
  if (btn.dataset.quick !== undefined && btn.dataset.quick !== null && btn.dataset.quick !== '') {
    sfx('ui'); enviar(btn.dataset.quick); return;
  }
  if (btn.classList.contains('chat-msg-act')) { abrirAcoes(btn); return; }
  if (btn.id === 'chat-blocked') { abrirBloqueados(); return; }
  if (btn.id === 'chat-retry') { sfx('ui'); carregar(); return; }
  if (btn.dataset.action === 'social') { sairSilencioso(); }  // screens.js abre a Comunidade
}

function onChatSubmit(e) {
  e.preventDefault();
  enviar();
}

function onModalActionsClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  switch (btn.id) {
    case 'chat-actions-close':
    case 'chat-actions-cancel':
      sfx('ui'); closeModal('modal-chat-actions'); break;
    case 'chat-report-open':
      sfx('ui'); mostrarAcao('reasons'); break;
    case 'chat-block-go':
      sfx('ui'); mostrarAcao('block'); break;
    case 'chat-block-confirm':
      sfx('ui'); confirmarBloqueio(); break;
    default:
      if (btn.dataset.reason) { sfx('ui'); denunciar(btn.dataset.reason); }
  }
}

function onModalBlockedClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'chat-blocked-close' || btn.id === 'chat-blocked-close-x') {
    sfx('ui'); closeModal('modal-chat-blocked'); return;
  }
  if (btn.dataset.unblock) { sfx('ui'); desbloquear(btn.dataset.unblock); }
}

function onKeyEsc(e) {
  if (e.key !== 'Escape') return;
  const blocked = $('modal-chat-blocked');
  if (blocked && !blocked.hidden) { closeModal('modal-chat-blocked'); return; }
  const actions = $('modal-chat-actions');
  if (actions && !actions.hidden) closeModal('modal-chat-actions');
}

/* ---------------- init ---------------- */

export function initChatUI() {
  // o chat pressupõe a Comunidade (tela da Fase 1) — sem ela, CTA morto
  const ligada = flag('CHAT_ENABLED') && flag('SOCIAL_ENABLED');
  const btn = $('btn-chat');
  if (btn) btn.hidden = !ligada;
  const btnDentro = $('social-chat-open');
  if (btnDentro) btnDentro.hidden = !ligada;
  if (!ligada) return;                   // produção: oculto e SEM listeners

  const tela = $('screen-chat');
  if (tela) {
    tela.addEventListener('click', onChatClick);
    tela.addEventListener('submit', onChatSubmit);
  }
  const modalA = $('modal-chat-actions');
  if (modalA) modalA.addEventListener('click', onModalActionsClick);
  const modalB = $('modal-chat-blocked');
  if (modalB) modalB.addEventListener('click', onModalBlockedClick);
  document.addEventListener('keydown', onKeyEsc);
  on('chat:open', abrir);
  on('social:open', sairSilencioso);
}
