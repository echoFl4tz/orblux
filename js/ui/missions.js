/* =========================================================
   Missões — 3 objetivos por DIA + 3 objetivos por SEMANA
   (reset na segunda) + recompensa em MOEDAS
   Ícones = ids do sprite SVG (sem emojis na interface)
   ========================================================= */

import { state, saveMissions, todayKey, weekKey } from '../core/state.js';
import { on, emit } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { missionCoins, weeklyMissionCoins } from '../core/economy.js';
import * as wallet from '../core/wallet.js';
import { showToast } from './toasts.js';

// recompensa por dificuldade mora em economy.js (MISSION_COINS)
const TEMPLATES = [
  { id: 'collect20', icon: 'ic-pulse', text: 'Colete 20 pulsos', target: 20, field: 'pickups', mode: 'sum', d: 'facil' },
  { id: 'collect45', icon: 'ic-pulse', text: 'Colete 45 pulsos', target: 45, field: 'pickups', mode: 'sum', d: 'medio' },
  { id: 'score1500', icon: 'ic-bolt', text: 'Faça 1500 pontos numa partida', target: 1500, field: 'score', mode: 'max', d: 'medio' },
  { id: 'score3000', icon: 'ic-bolt', text: 'Faça 3000 pontos numa partida', target: 3000, field: 'score', mode: 'max', d: 'dificil' },
  { id: 'combo4', icon: 'ic-flame', text: 'Alcance o combo x4', target: 4, field: 'maxCombo', mode: 'max', d: 'dificil' },
  { id: 'survive45', icon: 'ic-clock', text: 'Sobreviva 45 segundos', target: 45, field: 'elapsed', mode: 'max', d: 'facil' },
  { id: 'play3', icon: 'ic-play', text: 'Jogue 3 partidas', target: 3, field: 'runs', mode: 'sum', d: 'facil' },
  { id: 'powerups2', icon: 'ic-shield', text: 'Pegue 2 power-ups', target: 2, field: 'powerups', mode: 'sum', d: 'medio' },
  // 1.1.0 — drops/eventos (sem mudar as recompensas: tiers já existentes)
  { id: 'magnets3', icon: 'ic-magnet', text: 'Pegue 3 Ímãs', target: 3, field: 'magnets', mode: 'sum', d: 'medio' },
  { id: 'events2', icon: 'ic-flag', text: 'Complete 2 eventos', target: 2, field: 'events', mode: 'sum', d: 'medio' },
  { id: 'stormClean', icon: 'ic-shield', text: 'Sobreviva a uma Tempestade sem bater', target: 1, field: 'stormClean', mode: 'sum', d: 'dificil' },
];

/** Pick determinístico por dia (sem aleatoriedade entre recargas). */
function pickDaily() {
  const key = todayKey();
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const pool = [...TEMPLATES];
  const list = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const idx = seed % pool.length;
    const t = pool.splice(idx, 1)[0];
    list.push({ id: t.id, icon: t.icon, text: t.text, target: t.target, field: t.field, mode: t.mode, d: t.d, progress: 0, done: false });
  }
  return list;
}

/* ---------------------------------------------------------
   SEMANAIS — 3 objetivos maiores, resetam na segunda-feira.
   Mesma mecânica dos diários (pick semeado, sum/max), mas com
   alvos de semana inteira e recompensa própria (WEEKLY_MISSION_COINS).
   --------------------------------------------------------- */
const WEEKLY_TEMPLATES = [
  { id: 'w_runs15', icon: 'ic-play', text: 'Jogue 15 partidas', target: 15, field: 'runs', mode: 'sum', d: 'facil' },
  { id: 'w_collect150', icon: 'ic-pulse', text: 'Colete 150 pulsos', target: 150, field: 'pickups', mode: 'sum', d: 'facil' },
  { id: 'w_score2500', icon: 'ic-bolt', text: 'Faça 2500 pontos numa partida', target: 2500, field: 'score', mode: 'max', d: 'medio' },
  { id: 'w_combo20', icon: 'ic-bolt', text: 'Alcance combo 20', target: 20, field: 'maxCombo', mode: 'max', d: 'medio' },
  { id: 'w_survive90', icon: 'ic-clock', text: 'Sobreviva 90 segundos numa partida', target: 90, field: 'elapsed', mode: 'max', d: 'medio' },
  { id: 'w_powerups10', icon: 'ic-shield', text: 'Pegue 10 power-ups', target: 10, field: 'powerups', mode: 'sum', d: 'facil' },
  { id: 'w_magnets8', icon: 'ic-magnet', text: 'Pegue 8 Ímãs', target: 8, field: 'magnets', mode: 'sum', d: 'medio' },
  { id: 'w_events6', icon: 'ic-flag', text: 'Complete 6 eventos', target: 6, field: 'events', mode: 'sum', d: 'medio' },
  { id: 'w_storm2', icon: 'ic-shield', text: 'Sobreviva a 2 Tempestades sem bater', target: 2, field: 'stormClean', mode: 'sum', d: 'dificil' },
];

/** Pick determinístico por semana (semente = semana local). */
function pickWeekly() {
  const key = weekKey();
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const pool = [...WEEKLY_TEMPLATES];
  const list = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const idx = seed % pool.length;
    const t = pool.splice(idx, 1)[0];
    list.push({ id: t.id, icon: t.icon, text: t.text, target: t.target, field: t.field, mode: t.mode, d: t.d, weekly: true, progress: 0, done: false });
  }
  return list;
}

export function initMissions() {
  migrateLegacyBonus();
  ensureToday();
  renderMissions();

  // progresso ao vivo (contadores somados ao vivo dão feedback imediato)
  on('mission:live', ({ field, value, mode }) => applyProgress(field, value, mode));

  // consolidação ao fim da partida
  on('missions:report', (run) => {
    reportRun(run);
    renderMissions();
    emit('missions:changed');
  });

  on('screen:ranking', renderMissions);
}

/**
 * Migração v3->v4: bônus PENDENTE de pontuação (sistema antigo)
 * vira moedas — 1 ponto = 0,25 moeda (arredondado para baixo).
 * Idempotente: roda uma vez e apaga o campo legado.
 */
function migrateLegacyBonus() {
  const legacy = state.missions?.bonus;
  if (typeof legacy !== 'number' || !(legacy > 0)) {
    if (state.missions && 'bonus' in state.missions) {
      delete state.missions.bonus;
      saveMissions();
    }
    return;
  }
  const coins = Math.floor(legacy * 0.25);
  if (coins > 0 && !wallet.earn(coins, 'missao', 'bonus-legado').ok) return; // storage instável: tenta no boot seguinte
  delete state.missions.bonus;
  saveMissions();
}

function ensureToday() {
  const today = todayKey();
  const week = weekKey();
  const m = state.missions || {};
  let mudou = false;
  if (m.date !== today) {
    m.date = today;
    m.list = pickDaily();
    mudou = true;
  }
  if (!Array.isArray(m.list) || m.list.length === 0) {
    m.list = pickDaily();
    mudou = true;
  }
  // semanal (novo): cria na 1ª visita e reseta quando a semana vira
  if (!m.semana || m.semana.date !== week) {
    m.semana = { date: week, list: pickWeekly() };
    mudou = true;
  }
  if (!Array.isArray(m.semana.list) || m.semana.list.length === 0) {
    m.semana.list = pickWeekly();
    mudou = true;
  }
  state.missions = m;
  if (mudou) saveMissions();
}

/** Aplica progresso a uma missão por campo (sum = acumula, max = maior valor). */
function applyProgress(field, value, mode = 'sum') {
  let changed = false;
  const listas = [state.missions.list, state.missions.semana?.list || []];
  for (const lista of listas) {
    for (const m of lista) {
      if (m.done || m.field !== field) continue;
      m.progress = mode === 'max' ? Math.max(m.progress, value) : m.progress + value;
      if (m.progress >= m.target) { m.progress = m.target; complete(m); }
      changed = true;
    }
  }
  if (changed) { saveMissions(); renderMissions(); }
}

/** Reporte consolidado ao fim de cada partida. */
function reportRun(run) {
  applyProgress('runs', 1, 'sum');
  applyProgress('score', run.score, 'max');
  applyProgress('pickups', run.pickups, 'sum');
  applyProgress('maxCombo', run.maxCombo, 'max');
  applyProgress('elapsed', run.elapsed, 'max');
  applyProgress('powerups', run.powerups, 'sum');
  // 1.1.0 — drops/eventos (camada aditiva; sem recompensa nova)
  applyProgress('magnets', run.dropsByKind?.ima || 0, 'sum');
  applyProgress('events', run.events || 0, 'sum');
  applyProgress('stormClean', run.eventsClean || 0, 'sum');
  saveMissions();
}

function complete(m) {
  if (m.done) return;
  const coins = m.weekly ? weeklyMissionCoins(m.d) : missionCoins(m.d);
  // paga ANTES de marcar: se a gravação falhar, a missão fica pendente
  // e é conferida de novo na próxima partida (nada se perde)
  if (!wallet.earn(coins, 'missao', m.id).ok) return;
  m.done = true;
  sfx('mission');
  showToast({
    icon: 'ic-mission',
    title: m.weekly ? 'Missão semanal concluída!' : 'Missão concluída!',
    desc: `${m.text} — ${coins} moedas`,
  });
  emit('missions:completed');
}

/**
 * Todas as missões do DIA concluídas (semântica das conquistas
 * "missionsAll" — a semana vira depois, não bloqueia a conquista diária).
 */
export function allMissionsDone() {
  ensureToday();
  return state.missions.list.length > 0 && state.missions.list.every((m) => m.done);
}

/** Linhas HTML de uma lista de missões (recompensa diária ou semanal). */
function linhasHtml(list) {
  return list.map((m) => {
    const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
    const moedas = m.weekly ? weeklyMissionCoins(m.d) : missionCoins(m.d);
    return `<li class="mission-row ${m.done ? 'done' : ''}">
      <span class="mission-ic"><svg class="ic" aria-hidden="true"><use href="#${m.done ? 'ic-check' : m.icon}"/></svg></span>
      <div class="mission-info">
        <div>${m.text} <span class="muted">(${Math.floor(m.progress)}/${m.target})</span></div>
        <div class="mission-bar"><span style="width:${pct}%"></span></div>
      </div>
      <span class="chip ${m.done ? 'chip-success' : 'chip-reward'} mission-reward">+${moedas}</span>
    </li>`;
  }).join('');
}

/** Rodapé quando a lista inteira está concluída (pt-BR, sem só "3/3"). */
function fechamentoHtml(list, texto) {
  const todas = list.length > 0 && list.every((m) => m.done);
  if (!todas) return '';
  return `<li class="mission-row all-done">
    <span class="mission-ic"><svg class="ic" aria-hidden="true"><use href="#ic-check2"/></svg></span>
    <div class="mission-info"><div>${texto}</div></div>
  </li>`;
}

export function renderMissions() {
  const list = document.getElementById('missions-list');
  const wlist = document.getElementById('missions-week-list');
  if (!list) return;
  ensureToday();
  const diarias = state.missions.list;
  const semanais = state.missions.semana.list;

  const badge = document.getElementById('missions-count');
  if (badge) {
    const done = diarias.filter((m) => m.done).length;
    const todas = diarias.length > 0 && done === diarias.length;   // Parte 2: estado final do dia
    badge.textContent = `${done}/${diarias.length}`;
    badge.classList.toggle('chip-success', todas);
  }
  // Parte 2: quando fecha o dia, diz em pt-BR em vez de só mostrar 3/3
  list.innerHTML = linhasHtml(diarias)
    + fechamentoHtml(diarias, 'Todas concluídas! Novas missões amanhã.');

  // semanal (Fase 2 — retenção): mesma linha visual, seletor próprio
  const wbadge = document.getElementById('missions-week-count');
  if (wbadge) {
    const wdone = semanais.filter((m) => m.done).length;
    const wtodas = semanais.length > 0 && wdone === semanais.length;
    wbadge.textContent = `${wdone}/${semanais.length}`;
    wbadge.classList.toggle('chip-success', wtodas);
  }
  if (wlist) {
    wlist.innerHTML = linhasHtml(semanais)
      + fechamentoHtml(semanais, 'Semana fechada! Novas missões na segunda.');
  }
}
