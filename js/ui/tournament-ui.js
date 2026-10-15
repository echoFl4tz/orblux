/* =========================================================
   tournament-ui.js — Fase 5: torneios de clãs (temporada
   semanal, 8 clãs por grupo, 6 ligas — decisão §8.4).

   • Flag TOURNAMENTS_ENABLED (junto com SOCIAL_ENABLED)
     desligada = botões ocultos e SEM nenhum listener.
   • Servidor é a fonte da verdade: temporada, grupo,
     contribuição, recompensas e resgate vêm da UMA interface
   net/api.js (mock espelha; backend real em SQL, Fase 6/§7).
   • MOEDAS: o resgate paga 50 (participação, com 3+ partidas
     válidas) + 40..300 (posição) + 150 (promoção) — só ganhas
     jogando, nunca compradas; o cliente credita a carteira
     LOCAL só DEPOIS que o servidor confirma o resgate
     (idempotente: uma vez por temporada).
   • Corrida do Dia não paga moedas (só recorde/contribuição).
   • Texto da rede só via textContent (nunca innerHTML).
   • Erros de ABRIR degradam com "Tentar de novo".
   ========================================================= */

import { on } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';
import { showScreen, returnToMenu } from './screens.js';
import * as wallet from '../core/wallet.js';
import { flag } from '../../net/flags.js';
import { getApi, SocialError } from '../../net/api.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = ['loading', 'cta', 'error', 'noclan', 'temporada'];

let season = null;
let contrib = null;
let rewards = [];

function mostrarEstado(novo) {
  for (const e of ESTADOS) {
    const el = $(`tournament-${e}`);
    if (el) el.hidden = e !== novo;
  }
}

function msgErro(e) {
  if (e instanceof SocialError) {
    if (e.code === 'offline') return 'Você está sem conexão. Tente de novo — o jogo segue 100% offline.';
    if (e.code === 'disabled') return 'Os torneios estão indisponíveis agora.';
    if (e.code === 'no-session') return 'Sessão expirada. Entre na comunidade de novo.';
    return e.message || 'Não foi possível agora.';
  }
  return 'Falha de conexão. Tente de novo.';
}

function dataBR(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ---------------- abrir / carregar ---------------- */

function abrir() {
  showScreen('tournament');
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
    if (!p) { mostrarEstado('cta'); return; }

    const meuClan = await api.clans.mine();
    if (!meuClan) { mostrarEstado('noclan'); return; }

    season = await api.tournaments.current();
    try { contrib = await api.tournaments.myContribution(); } catch { contrib = null; }
    try { rewards = await api.tournaments.rewards(); } catch { rewards = []; }
    renderTemporada();
    mostrarEstado('temporada');
  } catch (e) {
    if (e && e.code === 'no-session') { mostrarEstado('cta'); return; }
    console.warn('[tournament] abrir falhou:', (e && e.code) || 'erro');
    const el = $('tournament-error-text');
    if (el) el.textContent = msgErro(e);
    mostrarEstado('error');
  }
}

/* ---------------- render ---------------- */

function renderTemporada() {
  const s = season;
  if (!s) return;
  $('tournament-liga').textContent = `Liga ${String(s.liga || '')}`;
  $('tournament-ends').textContent = `Temporada ${dataBR(s.startsAt)}–${dataBR(s.endsAt)} (fecha na segunda)`;
  const regras = s.regras || {};
  $('tournament-rules').textContent =
    `Vale a melhor partida de cada jogador na semana — mínimo de ${regras.minimoRuns || 3} partidas válidas para a recompensa de participação.`;

  // grupo da liga: 8 clãs + o meu (quando estou em clã)
  const ul = $('tournament-group');
  ul.textContent = '';
  for (const r of s.group || []) {
    const li = document.createElement('li');
    li.className = 'tourn-row' + (r.meuClan ? ' mine' : '');
    const pos = document.createElement('span');
    pos.className = 'tourn-pos';
    pos.textContent = `${Number(r.posicao) || '–'}º`;
    const main = document.createElement('div');
    main.className = 'tourn-main';
    const nick = document.createElement('div');
    nick.className = 'tourn-nick';
    const nome = document.createElement('b');
    nome.textContent = `${String(r.nome || 'Clã').slice(0, 18)}${r.meuClan ? ' (seu clã)' : ''}`;
    const tag = document.createElement('span');
    tag.className = 'clan-tipo-badge';
    tag.textContent = `[${String(r.tag || '')}]`;
    nick.append(nome, tag);
    const meta = document.createElement('span');
    meta.className = 'tourn-meta';
    meta.textContent = `${Number(r.membrosAtivos) || 0} membro(s) ativo(s)`;
    main.append(nick, meta);
    li.append(pos, main);
    ul.appendChild(li);
  }

  const c = contrib || { melhorPartida: 0, runsNaTemporada: 0 };
  $('tournament-contrib').textContent =
    `Sua contribuição: melhor partida ${Number(c.melhorPartida || 0).toLocaleString('pt-BR')} pts · ${c.runsNaTemporada | 0} partida(s) válida(s) na temporada`;

  // recompensas de temporadas encerradas (resgate de moedas)
  const ulr = $('tournament-rewards');
  ulr.textContent = '';
  const vazio = $('tournament-rewards-empty');
  const lista = rewards || [];
  if (vazio) vazio.hidden = lista.length > 0;
  for (const h of lista) {
    const li = document.createElement('li');
    li.className = 'tourn-reward';
    const main = document.createElement('div');
    main.className = 'tourn-reward-main';
    const titulo = document.createElement('b');
    titulo.textContent = `Temporada ${h.number} · ${h.liga}${h.posicao ? ` · ${h.posicao}º lugar` : ''}`;
    const det = document.createElement('span');
    det.className = 'tourn-meta';
    const parts = [];
    if (h.rewards.participacao) parts.push(`${h.rewards.participacao} participação`);
    if (h.rewards.posicao) parts.push(`${h.rewards.posicao} posição`);
    if (h.rewards.promocao) parts.push(`${h.rewards.promocao} promoção`);
    det.textContent = `${parts.join(' + ') || 'Sem recompensa'} = ${h.rewards.total | 0} moedas (só jogando)`;
    main.append(titulo, det);
    li.appendChild(main);
    if (h.coletada) {
      const ok = document.createElement('span');
      ok.className = 'clan-papel';
      ok.textContent = 'Coletada';
      li.appendChild(ok);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-small btn-primary';
      b.dataset.claimSeason = h.seasonId;
      b.textContent = 'Resgatar';
      li.appendChild(b);
    }
    ulr.appendChild(li);
  }
}

/* ---------------- resgate (idempotente no servidor) ---------------- */

async function resgatar(seasonId, btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await getApi().tournaments.claimReward(seasonId);
    // servidor confirmou o resgate ⇒ credita a carteira LOCAL (moedas ganhas jogando)
    const ganho = wallet.earn(Number(r.coins) || 0, 'torneio', String(seasonId));
    if (!ganho.ok) console.warn('[tournament] resgate ok, mas crédito local falhou:', ganho.reason);
    showToast({ icon: 'ic-trophy', title: 'Recompensa coletada', desc: `${Number(r.coins) || 0} moedas no seu bolso.` });
    rewards = await getApi().tournaments.rewards();
    renderTemporada();
  } catch (e) {
    console.warn('[tournament] resgate falhou:', (e && e.code) || 'erro');
    showToast({ icon: 'ic-trophy', title: 'Não foi possível resgatar', desc: msgErro(e) });
    if (btn) btn.disabled = false;
  }
}

/* ---------------- eventos ---------------- */

function onTelaClick(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'tournament-close') { sfx('ui'); returnToMenu(); return; }
  if (btn.id === 'tournament-retry') { sfx('ui'); carregar(); return; }
  if (btn.dataset.claimSeason) { sfx('ui'); resgatar(btn.dataset.claimSeason, btn); }
}

/* ---------------- init ---------------- */

export function initTournamentUI() {
  // torneios pressupõem a Comunidade — sem ela, CTA morto
  const ligada = flag('TOURNAMENTS_ENABLED') && flag('SOCIAL_ENABLED');
  const btn = $('btn-tournament');
  if (btn) btn.hidden = !ligada;
  const btnClans = $('clans-tournament-open');
  if (btnClans) btnClans.hidden = !ligada;
  if (!ligada) return;                   // produção: oculto e SEM listeners

  const tela = $('screen-tournament');
  if (tela) tela.addEventListener('click', onTelaClick);
  on('tournament:open', abrir);
}
