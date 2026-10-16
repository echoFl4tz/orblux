/* =========================================================
   Ranking local (localStorage) + ranking global opcional
   da camada social (net/api.js).

   • Local: sempre funciona, offline, só no dispositivo.
   • Global: só com a flag GLOBAL_RANKING_ENABLED (desligada
     por padrão — a produção fica intacta). Entra e sai pela
     UMA interface net/api.js (mock/supabase/null) e o
     SERVIDOR é a fonte da verdade: submitRun envia a partida
     e o servidor valida a plausibilidade (net/rules.js
     validateRun é o espelho — ver SOCIAL.md §4).

   Análise de dados da rede: renderização por textContent
   (nunca innerHTML) — linhas vindas do servidor não executam
   HTML.
   ========================================================= */

import { state } from '../core/state.js';
import { on } from '../core/events.js';
import { escapeHtml } from '../core/nickname.js';
import { sfx, initAudio, resumeAudio } from '../core/audio.js';
import { startGame } from '../game/game.js';
import { showScreen } from './screens.js';
import { flag } from '../../net/flags.js';
import { getApi } from '../../net/api.js';
import { validateRun } from '../../net/rules.js';

const GLOBAL_LIMIT = 10;
const RUN_VERSION = '1.0.0';   // versão da partida enviada (espelho de OX.version)

let escopo = 'local';
let globalPage = 0;
let globalTotal = 0;
let carregando = false;
let filaGlobal = null;        // página pedida durante um carregamento em voo

// Corrida do Dia (Fase 5): semente vem do SERVIDOR (nunca do cliente)
let diariaAtual = null;         // { date, seed, endsAt, melhorHoje }
let diariaCarregando = false;

export function initRanking() {
  on('screen:ranking', () => {
    renderRanking();
    if (escopo === 'global') carregarGlobal(0);   // refresh ao (re)abrir a tela
    if (diariaVisivel()) carregarDiaria();        // refresh da Corrida do Dia
  });
  on('stats:changed', () => { renderRanking(); });

  const scopes = document.getElementById('ranking-scopes');
  const ligado = flag('GLOBAL_RANKING_ENABLED');
  if (scopes) scopes.hidden = !ligado;            // produção: nem aparece
  if (!ligado || !scopes) return;                 // sem flag: sem listeners

  // Corrida do Dia: só com TOURNAMENT_ENABLED (desligada em produção)
  const diaria = document.getElementById('daily-race');
  if (diaria) diaria.hidden = !diariaVisivel();
  if (diaria && diariaVisivel()) {
    const play = document.getElementById('daily-play');
    if (play) play.addEventListener('click', () => { sfx('ui'); jogarDiaria(); });
    const retry = document.getElementById('daily-retry');
    if (retry) retry.addEventListener('click', () => { sfx('ui'); carregarDiaria(); });
  }

  scopes.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rank-scope]');
    if (!btn || btn.disabled) return;
    definirEscopo(btn.dataset.rankScope);
  });
  const more = document.getElementById('ranking-global-more');
  if (more) more.addEventListener('click', () => { sfx('ui'); carregarGlobal(globalPage + 1); });
  const retry = document.getElementById('ranking-global-retry');
  if (retry) retry.addEventListener('click', () => { sfx('ui'); carregarGlobal(0); });
}

/* ------------------------------------------------------------------
   CORRIDA DO DIA — a semente do dia vem do servidor; mesma semente =
   mesmo percurso em qualquer aparelho (net/rng.js + game.js).
   Recompensa: só recorde/contribuição — NUNCA moedas (decisão Fase 5).
   ------------------------------------------------------------------ */

function diariaVisivel() {
  return flag('TOURNAMENTS_ENABLED') && flag('GLOBAL_RANKING_ENABLED');
}

function diariaStatus(txt) {
  const el = document.getElementById('daily-status');
  if (!el) return;
  el.textContent = txt || '';
  el.hidden = !txt;
}

async function carregarDiaria() {
  if (diariaCarregando) return;
  const cta = document.getElementById('daily-cta');
  const foot = document.getElementById('daily-foot');
  const play = document.getElementById('daily-play');
  const retry = document.getElementById('daily-retry');
  const dateEl = document.getElementById('daily-date');
  const bestEl = document.getElementById('daily-best');
  if (!dateEl) return;

  diariaCarregando = true;
  if (retry) retry.hidden = true;
  diariaStatus('Conectando…');
  try {
    const api = getApi();
    const sess = await api.auth.session();
    if (!sess) {
      if (cta) cta.hidden = false;
      if (foot) foot.hidden = true;
      if (play) play.disabled = true;
      diariaStatus('');
      return;
    }
    if (cta) cta.hidden = true;
    if (foot) foot.hidden = false;
    const d = await api.tournaments.daily();
    diariaAtual = d;
    const partes = String(d.date || '').split('-');
    dateEl.textContent = partes.length === 3
      ? `Hoje: ${partes[2]}/${partes[1]} — mesmo percurso para todo mundo`
      : 'Mesmo percurso para todo mundo hoje.';
    bestEl.textContent = d.melhorHoje
      ? `Seu melhor de hoje: ${Number(d.melhorHoje).toLocaleString('pt-BR')} pts`
      : 'Bata seu primeiro recorde de hoje!';
    if (play) play.disabled = false;
    diariaStatus('');
  } catch (e) {
    console.warn('[ranking] corrida do dia indisponível:', (e && e.code) || 'erro');
    diariaStatus('Não foi possível carregar a corrida de hoje.');
    if (retry) retry.hidden = false;
    if (play) play.disabled = true;
  } finally {
    diariaCarregando = false;
  }
}

async function jogarDiaria() {
  const play = document.getElementById('daily-play');
  try {
    const d = diariaAtual || await getApi().tournaments.daily();
    diariaAtual = d;
    if (play) play.disabled = true;
    initAudio();
    resumeAudio();
    startGame({ seed: d.seed });       // game.js injeta a semente no spawner
    showScreen(null);                  // mesma transição do botão Jogar
  } catch (e) {
    console.warn('[ranking] corrida do dia falhou:', (e && e.code) || 'erro');
    diariaStatus('Não foi possível abrir a corrida de hoje. Tente de novo.');
    if (play) play.disabled = false;
  }
}

/* ------------------------------------------------------------------
   LOCAL — pódio top 3 + lista (inalterado desde a Etapa 1)
   ------------------------------------------------------------------ */
export function renderRanking() {
  const list = document.getElementById('ranking-list');
  const podium = document.getElementById('ranking-podium');
  const empty = document.getElementById('ranking-empty');
  if (!list) return;

  const rows = state.ranking.slice(0, 10);

  if (rows.length === 0) {
    list.innerHTML = '';
    if (podium) { podium.innerHTML = ''; podium.hidden = true; }
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  const me = state.profile?.nickname || 'Jogador';
  const nameOf = (r) => (typeof r.name === 'string' && r.name ? r.name : 'Jogador');

  // pódio: top 3 (ordem visual: prata, ouro, bronze)
  const hasPodium = rows.length >= 3;
  if (podium) {
    podium.hidden = !hasPodium;
    if (hasPodium) {
      podium.innerHTML = [1, 0, 2].map((i) => {
        const nm = nameOf(rows[i]);
        const mine = nm === me ? ' mine' : '';
        return `
        <div class="podium-slot podium-${i + 1}${mine}">
          <svg class="ic" aria-hidden="true"><use href="#ic-trophy"/></svg>
          <span class="pos">${i + 1}º</span>
          <span class="podium-name">${escapeHtml(nm)}</span>
          <span class="pts">${rows[i].score.toLocaleString('pt-BR')}</span>
        </div>`;
      }).join('');
    } else podium.innerHTML = '';
  }

  // lista: do 4º em diante (ou todas as posições se menos de 3 partidas)
  const rest = hasPodium ? rows.slice(3) : rows;
  const offset = hasPodium ? 3 : 0;
  list.innerHTML = rest.map((r, i) => {
    const d = new Date(r.date);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const nm = nameOf(r);
    const mine = nm === me ? ' class="mine"' : '';
    return `<li${mine}>
      <span><span class="rank-pos">${i + 1 + offset}º</span> <b>${r.score.toLocaleString('pt-BR')}</b> <span class="rank-name">${escapeHtml(nm)}</span></span>
      <span class="rank-date">${date}</span>
    </li>`;
  }).join('');
}

/* ------------------------------------------------------------------
   GLOBAL — só com a flag; erros degradam com "Tentar de novo"
   ------------------------------------------------------------------ */

function definirEscopo(novo) {
  escopo = novo === 'global' ? 'global' : 'local';
  sfx('ui');
  document.querySelectorAll('#ranking-scopes [data-rank-scope]').forEach((b) => {
    const ativo = b.dataset.rankScope === escopo;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
  const loc = document.getElementById('ranking-local');
  if (loc) loc.hidden = escopo === 'global';
  const glob = document.getElementById('ranking-global');
  if (glob) glob.hidden = escopo !== 'global';
  if (escopo === 'global') carregarGlobal(0);
}

function statusGlobal(txt) {
  const el = document.getElementById('ranking-global-status');
  if (!el) return;
  el.textContent = txt || '';
  el.hidden = !txt;
}

/** Linha do ranking global: textContent em todo texto da rede. */
function montarLinha(r) {
  const li = document.createElement('li');
  if (r.isMe) li.className = 'mine';

  const esq = document.createElement('span');
  const pos = document.createElement('span');
  pos.className = 'rank-pos';
  pos.textContent = `${Number(r.posicao) || '–'}º`;
  const score = document.createElement('b');
  score.textContent = (Number(r.score) || 0).toLocaleString('pt-BR');
  const nick = document.createElement('span');
  nick.className = 'rank-name';
  const tag = typeof r.tag === 'string' && r.tag ? ` [${r.tag.slice(0, 4)}]` : '';
  nick.textContent = `${String(r.nick || 'Jogador').slice(0, 16)}${tag}`;
  esq.append(pos, score, nick);

  const dir = document.createElement('span');
  dir.className = 'rank-date';
  const d = r.at ? new Date(r.at) : null;
  dir.textContent = d && !Number.isNaN(d.getTime())
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    : '';

  li.append(esq, dir);
  return li;
}

async function carregarGlobal(page = 0) {
  if (carregando) {
    // clique/pedido durante um carregamento em voo: guarda a página mais
    // adiantante em fila (nunca descarta clique do usuário em silêncio)
    if (page > globalPage) filaGlobal = page;
    return;
  }
  const lista = document.getElementById('ranking-global-list');
  const cta = document.getElementById('ranking-global-cta');
  const myEl = document.getElementById('ranking-global-my');
  const more = document.getElementById('ranking-global-more');
  const retry = document.getElementById('ranking-global-retry');
  const foot = document.getElementById('ranking-global-foot');
  if (!lista) return;

  carregando = true;
  if (retry) retry.hidden = true;
  statusGlobal('Conectando…');
  try {
    const api = getApi();
    const sess = await api.auth.session();
    if (!sess) {
      // sem perfil social: convida a entrar na Comunidade (nunca força)
      lista.textContent = '';
      if (myEl) { myEl.textContent = ''; myEl.hidden = true; }
      if (more) more.hidden = true;
      if (foot) foot.hidden = true;
      if (cta) cta.hidden = false;
      statusGlobal('');
      return;
    }
    if (cta) cta.hidden = true;

    const data = await api.ranking.top({ scope: 'alltime', page, limit: GLOBAL_LIMIT });
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (page === 0) { lista.textContent = ''; }
    globalTotal = Number(data.total) || 0;
    for (const r of rows) lista.appendChild(montarLinha(r));
    globalPage = page;

    if (myEl) {
      myEl.textContent = data.myRank
        ? `Sua posição: ${data.myRank}º de ${globalTotal}`
        : 'Suas partidas ainda não pontuaram no global.';
      myEl.hidden = false;
    }
    const fim = (page + 1) * GLOBAL_LIMIT >= globalTotal;
    if (more) more.hidden = fim;
    if (foot) foot.hidden = fim;
    statusGlobal(rows.length === 0 ? 'Nenhuma partida no ranking ainda.' : '');
  } catch (e) {
    console.warn('[ranking] global indisponível:', (e && e.code) || 'erro');
    statusGlobal('Não foi possível carregar o ranking global.');
    if (retry) retry.hidden = false;
    if (foot) foot.hidden = false;
    if (more) more.hidden = true;
  } finally {
    carregando = false;
    // drena a fila: o clique "Carregar mais" que chegou durante o voo
    if (filaGlobal !== null) {
      const p = filaGlobal;
      filaGlobal = null;
      if (p === globalPage + 1) carregarGlobal(p);
    }
  }
}

/**
 * Envia a partida ao servidor quando o ranking global OU os torneios
 * estão ligados e o jogador tem perfil social. Fire-and-forget: falha
 * NUNCA afeta a tela de fim de jogo, o ranking local ou o progresso.
 */
export async function submitRunGlobal(run = {}) {
  if (!flag('GLOBAL_RANKING_ENABLED') && !flag('TOURNAMENTS_ENABLED')) return false;
  const seed = typeof run.seed === 'string' && run.seed ? run.seed.slice(0, 40) : null;
  const payload = {
    score: Math.floor(Number(run.score) || 0),
    seconds: Math.round(Number(run.elapsed) || 0),
    pickups: Number(run.pickups) || 0,
    comboMax: Number(run.maxCombo) || 1,
    level: Number(run.level) || 1,
    seed,                          // Corrida do Dia: a semente do servidor (null = partida normal)
    version: RUN_VERSION,
  };
  // régua local espelha a do servidor: nem tenta enviar o impossível
  if (!validateRun(payload).ok) return false;
  try {
    const api = getApi();
    const sess = await api.auth.session();
    if (!sess) return false;                 // sem perfil social: nada a enviar
    await api.ranking.submitRun(payload);
    return true;
  } catch (e) {
    console.warn('[ranking] partida não enviada:', (e && e.code) || 'erro');
    return false;
  }
}
