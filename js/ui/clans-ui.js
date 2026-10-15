/* =========================================================
   clans-ui.js — Fase 4: clãs (criar com moedas, entrada,
   cargos e elenco de emblema).

   • Flag CLANS_ENABLED (junto com SOCIAL_ENABLED) desligada =
     botões ocultos e SEM nenhum listener.
   • Servidor é a fonte da verdade: criar/entrar/gerir passa
     pela UMA interface net/api.js; o mock espelha a régua
     (net/rules.js) e o backend real fará o mesmo em SQL.
   • MOEDAS: criar clã custa CLAN.CREATE_COST_COINS (500, §8.3).
     A carteira é LOCAL (pn_wallet): só se ganham jogando e
     nunca se compram; o débito acontece DEPOIS do servidor
     confirmar a criação. Sem pop-up de pagamento — se faltam
     moedas, o botão explica e fica inativo ("ganhe jogando").
   • Emblema: elenco FECHADO (8 ícones × 8 cores × 4 molduras);
     cores vêm da paleta de rules.js — nunca CSS arbitrário.
   • Texto da rede só via textContent (nunca innerHTML).
   • Erros de ABRIR degradam com "Tentar de novo"; erros de
     ação aparecem em toast e nunca travam a tela.
   ========================================================= */

import { on } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';
import { showScreen, openModal, closeModal, returnToMenu } from './screens.js';
import * as wallet from '../core/wallet.js';
import { flag } from '../../net/flags.js';
import { getApi, SocialError } from '../../net/api.js';
import {
  CLAN, CLAN_ICONS, CLAN_COLORS, validateClanName, validateClanTag,
} from '../../net/rules.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const ESTADOS = ['loading', 'cta', 'error', 'fora', 'dentro'];

const TIPO_NOME = { aberto: 'Aberto', solicitacao: 'Solicitação', convite: 'Só convite' };
const PAPEL_NOME = { lider: 'Líder', vice: 'Vice', membro: 'Membro' };

let perfil = null;
let clanAtual = null;
let membros = [];
let pedidos = [];
let esperados = new Set();      // pedidos que eu já enviei
let esperaAte = 0;              // aviso local p/ espera de troca (servidor decide)

// estado do formulário (criar/editar)
let modoForm = 'criar';
let emblemaForm = { icon: 0, cor: CLAN_COLORS[0], moldura: 0 };
let tipoForm = 'aberto';
let onConfirmar = null;
let buscaTimer = null;

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
    const el = $(`clans-${e}`);
    if (el) el.hidden = e !== novo;
  }
}

function msgErro(e) {
  if (e instanceof SocialError) {
    if (e.code === 'offline') return 'Você está sem conexão. Tente de novo — o jogo segue 100% offline.';
    if (e.code === 'disabled') return 'Os clãs estão indisponíveis agora.';
    if (e.code === 'no-session') return 'Sessão expirada. Entre na comunidade de novo.';
    return e.message || 'Não foi possível agora.';
  }
  return 'Falha de conexão. Tente de novo.';
}

function toastAviso(titulo, e) {
  showToast({ icon: 'ic-flag', title: titulo, desc: msgErro(e) });
}

/** Aplica um emblema VALIDADO a um elemento (paleta fechada também na render). */
function aplicarEmblema(host, e) {
  host.textContent = '';
  host.dataset.moldura = String((e && e.moldura) | 0);
  const cor = e && CLAN_COLORS.includes(String(e.cor).toLowerCase()) ? String(e.cor).toLowerCase() : CLAN_COLORS[0];
  const iconId = e && Number.isInteger(e.icon) && CLAN_ICONS[e.icon] ? CLAN_ICONS[e.icon] : CLAN_ICONS[0];
  host.style.color = cor;
  host.appendChild(icone(`ic-${iconId}`));
}

/* ---------------- abrir / carregar ---------------- */

function abrir() {
  showScreen('clans');
  mostrarEstado('loading');
  carregar();
}

async function carregar() {
  mostrarEstado('loading');
  try {
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
    const c = await api.clans.mine();
    if (c) { await carregarDentro(c); } else { await carregarFora(); }
  } catch (e) {
    if (e && e.code === 'no-session') { mostrarEstado('cta'); return; }
    console.warn('[clans] abrir falhou:', (e && e.code) || 'erro');
    const el = $('clans-error-text');
    if (el) el.textContent = msgErro(e);
    mostrarEstado('error');
  }
}

async function carregarFora() {
  const api = getApi();
  const lista = await api.clans.search({});
  try {
    const out = await api.clans.outgoingRequests();
    esperados = new Set(out.map((o) => o.clanId));
  } catch { esperados = new Set(); }
  renderLista(lista);
  atualizarCriarBtn();
  mostrarEstado('fora');
}

async function carregarDentro(inicial) {
  const api = getApi();
  const c = inicial || clanAtual;
  if (!c) { await carregarFora(); return; }
  clanAtual = c;
  membros = await api.clans.members(c.id);
  const papel = c.meuPapel;
  if (papel === 'lider' || papel === 'vice') {
    try { pedidos = await api.clans.requests(c.id); } catch { pedidos = []; }
  } else {
    pedidos = [];
  }
  renderDentro();
  mostrarEstado('dentro');
}

/* ---------------- lista de busca ---------------- */

function montarLinhaClan(c) {
  const li = document.createElement('li');
  li.className = 'clan-row' + (c.meuPapel ? ' mine' : '');

  const emb = document.createElement('span');
  emb.className = 'clan-emblema';
  emb.setAttribute('aria-hidden', 'true');
  aplicarEmblema(emb, c.emblema);

  const main = document.createElement('div');
  main.className = 'clan-row-main';
  const nick = document.createElement('div');
  nick.className = 'clan-row-nick';
  const nome = document.createElement('b');
  nome.textContent = String(c.nome || '');
  const tag = document.createElement('span');
  tag.className = 'clan-tipo-badge';
  tag.textContent = `[${String(c.tag || '')}]`;
  const tipo = document.createElement('span');
  tipo.className = 'clan-tipo-badge';
  tipo.textContent = TIPO_NOME[c.tipo] || c.tipo || '';
  nick.append(nome, tag, tipo);
  const meta = document.createElement('span');
  meta.className = 'clan-row-meta';
  meta.textContent = `${c.membros}/${CLAN.MAX_MEMBERS} membros · ${c.vagas} vaga(s) · Nv ${c.nivel}`;
  main.append(nick, meta);
  li.append(emb, main);

  if (c.meuPapel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.dataset.clanOpen = '1';
    b.textContent = 'Seu clã';
    li.appendChild(b);
  } else if (esperados.has(c.id)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.disabled = true;
    b.textContent = 'Pedido enviado';
    li.appendChild(b);
  } else if (c.tipo === 'convite') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.disabled = true;
    b.textContent = 'Só convite';
    li.appendChild(b);
  } else if (c.tipo === 'solicitacao') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.dataset.clanRequest = c.id;
    b.textContent = 'Solicitar';
    li.appendChild(b);
  } else {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small btn-primary';
    b.dataset.clanJoin = c.id;
    b.textContent = 'Entrar';
    li.appendChild(b);
  }
  return li;
}

function renderLista(lista) {
  const ul = $('clans-list');
  const vazio = $('clans-empty');
  if (!ul) return;
  ul.textContent = '';
  for (const c of lista || []) ul.appendChild(montarLinhaClan(c));
  if (vazio) vazio.hidden = ul.childElementCount > 0;
  const wait = $('clans-wait');
  if (wait) wait.hidden = !(esperaAte && esperaAte > Date.now());
}

function atualizarCriarBtn() {
  const btn = $('clans-create-open');
  const hint = $('clans-create-hint');
  const custo = $('clans-create-cost');
  if (custo) custo.textContent = String(CLAN.CREATE_COST_COINS);
  if (!btn || !hint) return;
  if (perfil && perfil.ageBand === 'menor13') {
    btn.disabled = true;
    hint.textContent = 'Menores de 13 anos entram em clãs só por convite.';
    hint.hidden = false;
  } else if (esperaAte && esperaAte > Date.now()) {
    btn.disabled = true;
    hint.textContent = 'Você acabou de sair de um clã — existe uma espera de 24 h.';
    hint.hidden = false;
  } else if (!wallet.canAfford(CLAN.CREATE_COST_COINS)) {
    btn.disabled = true;
    hint.textContent = `Faltam ${CLAN.CREATE_COST_COINS - wallet.getCoins()} moedas — ganhe jogando.`;
    hint.hidden = false;
  } else {
    btn.disabled = false;
    hint.hidden = true;
  }
}

/* ---------------- meu clã ---------------- */

function renderDentro() {
  const c = clanAtual;
  if (!c) return;
  aplicarEmblema($('clans-emblema'), c.emblema);
  $('clans-nome').textContent = String(c.nome || '');
  $('clans-tag').textContent = `[${String(c.tag || '')}]`;
  $('clans-meta').textContent =
    `Nível ${c.nivel} · ${c.trofeus} troféus · ${TIPO_NOME[c.tipo] || c.tipo} · ${String(c.pais || '')}`;
  const desc = $('clans-desc');
  desc.textContent = String(c.descricao || '');
  desc.hidden = !c.descricao;

  $('clans-count').textContent = String(membros.length);
  $('clans-max').textContent = String(CLAN.MAX_MEMBERS);

  const meuId = perfil && perfil.id;
  const meuPapel = c.meuPapel;
  const ul = $('clans-members');
  ul.textContent = '';
  for (const m of membros) {
    const li = document.createElement('li');
    li.className = 'clan-row';
    const main = document.createElement('div');
    main.className = 'clan-row-main';
    const nick = document.createElement('div');
    nick.className = 'clan-row-nick';
    const nome = document.createElement('b');
    nome.textContent = `${String(m.nick || 'Jogador').slice(0, 16)}${m.userId === meuId ? ' (você)' : ''}`;
    const papel = document.createElement('span');
    papel.className = 'clan-papel' + (m.papel === 'vice' ? ' vice' : '');
    papel.textContent = PAPEL_NOME[m.papel] || m.papel || '';
    nick.append(nome, papel);
    const meta = document.createElement('span');
    meta.className = 'clan-row-meta';
    meta.textContent = `${m.contribuicao | 0} contribuições`;
    main.append(nick, meta);
    li.appendChild(main);

    const lider = m.papel === 'lider';
    if (m.userId !== meuId && !lider && (meuPapel === 'lider' || (meuPapel === 'vice' && m.papel === 'membro'))) {
      if (meuPapel === 'lider') {
        const bProm = document.createElement('button');
        bProm.type = 'button';
        bProm.className = 'btn btn-small';
        bProm.dataset.memAct = m.papel === 'vice' ? 'demote' : 'promote';
        bProm.dataset.memId = m.userId;
        bProm.textContent = m.papel === 'vice' ? 'Rebaixar' : 'Tornar vice';
        li.appendChild(bProm);
      }
      const bKick = document.createElement('button');
      bKick.type = 'button';
      bKick.className = 'btn btn-small btn-danger';
      bKick.dataset.memAct = 'kick';
      bKick.dataset.memId = m.userId;
      bKick.textContent = 'Expulsar';
      li.appendChild(bKick);
    }
    ul.appendChild(li);
  }

  // pedidos de entrada (só lider/vice — o servidor também barra)
  const wrap = $('clans-requests-wrap');
  const gerencia = meuPapel === 'lider' || meuPapel === 'vice';
  wrap.hidden = !gerencia;
  $('clans-req-count').textContent = String(pedidos.length);
  const ulr = $('clans-requests');
  ulr.textContent = '';
  for (const r of pedidos) {
    const li = document.createElement('li');
    li.className = 'clan-row';
    const nome = document.createElement('b');
    nome.textContent = String(r.nick || 'Jogador').slice(0, 16);
    const acts = document.createElement('div');
    acts.className = 'clan-req-actions';
    const okB = document.createElement('button');
    okB.type = 'button';
    okB.className = 'btn btn-small btn-primary';
    okB.dataset.reqAct = 'accept';
    okB.dataset.reqId = r.userId;
    okB.textContent = 'Aceitar';
    const noB = document.createElement('button');
    noB.type = 'button';
    noB.className = 'btn btn-small';
    noB.dataset.reqAct = 'decline';
    noB.dataset.reqId = r.userId;
    noB.textContent = 'Recusar';
    acts.append(okB, noB);
    li.append(nome, acts);
    ulr.appendChild(li);
  }

  const isLider = meuPapel === 'lider';
  $('clans-edit-open').hidden = !isLider;
  $('clans-dissolve').hidden = !isLider;
}

/* ---------------- ações: entrar / solicitar ---------------- */

async function entrar(id) {
  try {
    const c = await getApi().clans.join(id);
    showToast({ icon: 'ic-flag', title: 'Bem-vindo ao clã', desc: `Você entrou em ${c.nome} [${c.tag}].` });
    await carregarDentro(c);
  } catch (e) { toastAviso('Não foi possível entrar', e); }
}

async function pedirEntrada(id) {
  try {
    await getApi().clans.request(id);
    showToast({ icon: 'ic-flag', title: 'Pedido enviado', desc: 'O líder do clã vai analisar seu pedido.' });
    await carregarFora();
  } catch (e) { toastAviso('Não foi possível pedir', e); }
}

/* ---------------- ações: cargos e gestão ---------------- */

async function acaoMembro(acao, userId) {
  const api = getApi();
  try {
    if (acao === 'promote') { await api.clans.promote(userId); showToast({ icon: 'ic-user', title: 'Vice-líder', desc: 'Jogador promovido a vice-líder.' }); }
    else if (acao === 'demote') { await api.clans.demote(userId); showToast({ icon: 'ic-user', title: 'Membro', desc: 'Jogador rebaixado a membro.' }); }
    else if (acao === 'kick') { await api.clans.kick(userId); showToast({ icon: 'ic-user', title: 'Jogador expulso', desc: 'Ele não está mais no clã.' }); }
    await carregarDentro();
  } catch (e) { toastAviso('Não foi possível', e); }
}

function abrirConfirm({ titulo, texto, okLabel, onOk }) {
  $('clan-confirm-title').textContent = titulo || 'Confirmar';
  $('clan-confirm-text').textContent = texto || '';
  $('clan-confirm-ok').textContent = okLabel || 'Confirmar';
  onConfirmar = onOk || null;
  sfx('ui');
  openModal('modal-clan-confirm');
}

function confirmarExpulsar(userId) {
  const m = membros.find((x) => x.userId === userId);
  abrirConfirm({
    titulo: 'Expulsar jogador',
    texto: `Expulsar ${m ? m.nick : 'este jogador'} do clã?`,
    okLabel: 'Expulsar',
    onOk: () => acaoMembro('kick', userId),
  });
}

function confirmarSair() {
  abrirConfirm({
    titulo: 'Sair do clã',
    texto: 'Você sai do clã agora. Depois de sair, existe uma espera de 24 h para entrar em outro ou criar um novo.',
    okLabel: 'Sair',
    onOk: async () => {
      try {
        await getApi().clans.leave();
        esperaAte = Date.now() + CLAN.SWITCH_WAIT_H * 3600000;
        clanAtual = null;
        showToast({ icon: 'ic-flag', title: 'Você saiu do clã', desc: 'Boa sorte nos próximos caminhos!' });
        await carregarFora();
      } catch (e) { toastAviso('Não foi possível sair', e); }
    },
  });
}

function confirmarDissolver() {
  abrirConfirm({
    titulo: 'Dissolver clã',
    texto: 'Dissolver o clã é permanente: membros, nível e troféus são apagados.',
    okLabel: 'Dissolver',
    onOk: async () => {
      try {
        await getApi().clans.dissolve();
        clanAtual = null;
        showToast({ icon: 'ic-flag', title: 'Clã dissolvido', desc: 'O clã não existe mais.' });
        await carregarFora();
      } catch (e) { toastAviso('Não foi possível dissolver', e); }
    },
  });
}

/* ---------------- formulário criar/editar ---------------- */

function montarPicker() {
  const icons = $('clan-icons');
  if (icons && icons.childElementCount === 0) {
    CLAN_ICONS.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clan-pick';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Ícone ${i + 1}`);
      b.dataset.icon = String(i);
      b.appendChild(icone(`ic-${id}`));
      icons.appendChild(b);
    });
  }
  const cores = $('clan-cores');
  if (cores && cores.childElementCount === 0) {
    CLAN_COLORS.forEach((cor, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clan-pick clan-pick-cores';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Cor ${i + 1}`);
      b.dataset.cor = cor;
      b.style.background = cor;
      cores.appendChild(b);
    });
  }
  const molduras = $('clan-molduras');
  if (molduras && molduras.childElementCount === 0) {
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clan-pick';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Moldura ${i + 1}`);
      b.dataset.moldura = String(i);
      const mini = document.createElement('span');
      mini.className = 'clan-emblema';
      mini.dataset.moldura = String(i);
      mini.style.width = '20px';
      mini.style.height = '20px';
      mini.style.color = 'var(--text-2)';
      b.appendChild(mini);
      molduras.appendChild(b);
    }
  }
}

function sincronizarPicker() {
  for (const b of $('clan-icons').children) b.setAttribute('aria-checked', String(Number(b.dataset.icon) === emblemaForm.icon));
  for (const b of $('clan-cores').children) b.setAttribute('aria-checked', String(b.dataset.cor === emblemaForm.cor));
  for (const b of $('clan-molduras').children) b.setAttribute('aria-checked', String(Number(b.dataset.moldura) === emblemaForm.moldura));
  const host = $('clan-emblem-preview');
  host.textContent = '';
  const span = document.createElement('span');
  span.className = 'clan-emblema';
  aplicarEmblema(span, emblemaForm);
  host.appendChild(span);
}

function sincronizarTipo() {
  for (const b of document.querySelectorAll('#modal-clan-create [data-tipo]')) {
    b.setAttribute('aria-checked', String(b.dataset.tipo === tipoForm));
  }
}

function erroForm(msg) {
  const el = $('clan-form-error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

function erroCampo(id, msg) {
  const el = $(id);
  el.textContent = msg || '';
  el.hidden = !msg;
}

function abrirForm(modo) {
  modoForm = modo;
  montarPicker();
  erroForm('');
  erroCampo('clan-nome-err', '');
  erroCampo('clan-tag-err', '');
  const editando = modo === 'editar';
  const c = clanAtual || {};
  $('clan-form-title').textContent = editando ? 'Editar clã' : 'Criar clã';
  $('clan-form-submit').textContent = editando ? 'Salvar' : 'Criar clã';
  $('clan-nome').value = editando ? String(c.nome || '') : '';
  $('clan-tag-input').value = editando ? String(c.tag || '') : '';
  $('clan-tag-input').disabled = editando;   // tag não muda (contrato da RPC)
  $('clan-desc-input').value = editando ? String(c.descricao || '') : '';
  tipoForm = editando ? (c.tipo || 'aberto') : 'aberto';
  emblemaForm = editando && c.emblema
    ? { icon: c.emblema.icon | 0, cor: c.emblema.cor, moldura: c.emblema.moldura | 0 }
    : { icon: 0, cor: CLAN_COLORS[0], moldura: 0 };
  const custo = $('clan-form-cost');
  if (editando) {
    custo.textContent = 'Editar o emblema e a descrição é grátis para o líder.';
  } else {
    custo.textContent = `Custo: ${CLAN.CREATE_COST_COINS} moedas · Saldo: ${wallet.getCoins()} moedas (só se ganham jogando)`;
  }
  sincronizarTipo();
  sincronizarPicker();
  sfx('ui');
  openModal('modal-clan-create');
  setTimeout(() => { const el = $('clan-nome'); if (el) el.focus({ preventScroll: true }); }, 120);
}

async function submeterForm() {
  const nomeV = $('clan-nome').value;
  const tagV = $('clan-tag-input').value;
  const vn = validateClanName(nomeV);
  const vt = modoForm === 'editar' ? { ok: true, value: clanAtual.tag } : validateClanTag(tagV);
  erroCampo('clan-nome-err', vn.ok ? '' : vn.error);
  erroCampo('clan-tag-err', vt.ok ? '' : vt.error);
  if (!vn.ok || !vt.ok) return;
  erroForm('');

  const submit = $('clan-form-submit');
  submit.disabled = true;
  try {
    const api = getApi();
    if (modoForm === 'editar') {
      await api.clans.update({
        nome: vn.value,
        descricao: $('clan-desc-input').value.trim(),
        tipo: tipoForm,
        emblema: { ...emblemaForm },
      });
      closeModal('modal-clan-create');
      showToast({ icon: 'ic-flag', title: 'Clã atualizado', desc: 'As mudanças já estão valendo.' });
      await carregarDentro(await api.clans.mine());
      return;
    }

    // criar: régua local espelha o servidor antes de gastar tempo dele
    if (perfil.ageBand === 'menor13') {
      erroForm('Menores de 13 anos não criam clãs — entre por convite.');
      return;
    }
    if (!wallet.canAfford(CLAN.CREATE_COST_COINS)) {
      erroForm(`Faltam ${CLAN.CREATE_COST_COINS - wallet.getCoins()} moedas — ganhe jogando.`);
      return;
    }
    const c = await api.clans.create({
      nome: vn.value,
      tag: vt.value,
      descricao: $('clan-desc-input').value.trim(),
      tipo: tipoForm,
      emblema: { ...emblemaForm },
    });
    // servidor confirmou a criação ⇒ debita a carteira LOCAL (nunca comprada)
    const gasto = wallet.spend(CLAN.CREATE_COST_COINS, 'cla', c.id, () => true);
    if (!gasto.ok) console.warn('[clans] clã criado, mas débito local falhou:', gasto.reason);
    clanAtual = c;
    closeModal('modal-clan-create');
    showToast({ icon: 'ic-flag', title: 'Clã criado', desc: `Bem-vindo ao ${c.nome} [${c.tag}]!` });
    await carregarDentro(c);
  } catch (e) {
    console.warn('[clans] formulário falhou:', (e && e.code) || 'erro');
    erroForm(msgErro(e));
  } finally {
    submit.disabled = false;
  }
}

/* ---------------- eventos ---------------- */

function onScreenClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'clans-close') { sfx('ui'); returnToMenu(); return; }
  if (btn.id === 'clans-retry') { sfx('ui'); carregar(); return; }
  if (btn.id === 'clans-create-open') { abrirForm('criar'); return; }
  if (btn.id === 'clans-edit-open') { abrirForm('editar'); return; }
  if (btn.id === 'clans-leave') { confirmarSair(); return; }
  if (btn.id === 'clans-dissolve') { confirmarDissolver(); return; }
  if (btn.dataset.clanJoin) { sfx('ui'); entrar(btn.dataset.clanJoin); return; }
  if (btn.dataset.clanRequest) { sfx('ui'); pedirEntrada(btn.dataset.clanRequest); return; }
  if (btn.dataset.clanOpen) { sfx('ui'); carregarDentro(); return; }
  if (btn.dataset.memAct === 'kick') { sfx('ui'); confirmarExpulsar(btn.dataset.memId); return; }
  if (btn.dataset.memAct === 'promote' || btn.dataset.memAct === 'demote') {
    sfx('ui'); acaoMembro(btn.dataset.memAct, btn.dataset.memId); return;
  }
  if (btn.dataset.reqAct === 'accept') {
    sfx('ui');
    getApi().clans.acceptRequest(btn.dataset.reqId)
      .then(() => { showToast({ icon: 'ic-user', title: 'Pedido aceito', desc: 'Novo membro no clã.' }); return carregarDentro(); })
      .catch((err) => toastAviso('Não foi possível aceitar', err));
    return;
  }
  if (btn.dataset.reqAct === 'decline') {
    sfx('ui');
    getApi().clans.declineRequest(btn.dataset.reqId)
      .then(() => carregarDentro())
      .catch((err) => toastAviso('Não foi possível recusar', err));
  }
}

function onFormClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'clan-form-close' || btn.id === 'clan-form-cancel') {
    sfx('ui'); closeModal('modal-clan-create'); return;
  }
  if (btn.id === 'clan-form-submit') { sfx('ui'); submeterForm(); return; }
  if (btn.dataset.tipo) { sfx('ui'); tipoForm = btn.dataset.tipo; sincronizarTipo(); return; }
  if (btn.dataset.icon !== undefined && btn.dataset.icon !== '') {
    sfx('ui'); emblemaForm.icon = Number(btn.dataset.icon) | 0; sincronizarPicker(); return;
  }
  if (btn.dataset.cor) { sfx('ui'); emblemaForm.cor = btn.dataset.cor; sincronizarPicker(); return; }
  if (btn.dataset.moldura !== undefined && btn.dataset.moldura !== '') {
    sfx('ui'); emblemaForm.moldura = Number(btn.dataset.moldura) | 0; sincronizarPicker();
  }
}

function onConfirmClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'clan-confirm-cancel') { sfx('ui'); onConfirmar = null; closeModal('modal-clan-confirm'); return; }
  if (btn.id === 'clan-confirm-ok') {
    sfx('ui');
    const cb = onConfirmar;
    onConfirmar = null;
    closeModal('modal-clan-confirm');
    if (cb) cb();
  }
}

function onBuscaInput() {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(async () => {
    try {
      const lista = await getApi().clans.search({ q: $('clans-search').value });
      renderLista(lista);
    } catch (e) { toastAviso('Busca falhou', e); }
  }, 300);
}

function onKeyEsc(e) {
  if (e.key !== 'Escape') return;
  const confirmM = $('modal-clan-confirm');
  if (confirmM && !confirmM.hidden) { closeModal('modal-clan-confirm'); return; }
  const form = $('modal-clan-create');
  if (form && !form.hidden) closeModal('modal-clan-create');
}

/* ---------------- init ---------------- */

export function initClansUI() {
  // clãs pressupõem a Comunidade (tela da Fase 1) — sem ela, CTA morto
  const ligada = flag('CLANS_ENABLED') && flag('SOCIAL_ENABLED');
  const btn = $('btn-clans');
  if (btn) btn.hidden = !ligada;
  const btnDentro = $('social-clans-open');
  if (btnDentro) btnDentro.hidden = !ligada;
  if (!ligada) return;                   // produção: oculto e SEM listeners

  const tela = $('screen-clans');
  if (tela) tela.addEventListener('click', onScreenClick);
  const form = $('modal-clan-create');
  if (form) form.addEventListener('click', onFormClick);
  const conf = $('modal-clan-confirm');
  if (conf) conf.addEventListener('click', onConfirmClick);
  const busca = $('clans-search');
  if (busca) busca.addEventListener('input', onBuscaInput);
  document.addEventListener('keydown', onKeyEsc);
  // carteira mudou (partida/missão): reavalia o botão Criar se a lista estiver aberta
  on('wallet:changed', () => {
    const fora = $('clans-fora');
    if (fora && !fora.hidden && perfil && perfil.ageBand !== 'menor13') atualizarCriarBtn();
  });
  on('clans:open', abrir);
}
