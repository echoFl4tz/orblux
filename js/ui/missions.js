/* =========================================================
   Missões diárias — 3 objetivos por dia + recompensa em bônus
   Ícones = ids do sprite SVG (sem emojis na interface)
   ========================================================= */

import { state, saveMissions, todayKey } from '../core/state.js';
import { on, emit } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';

const BONUS_PER_MISSION = 100; // pontos de bônus na próxima partida

const TEMPLATES = [
  { id: 'collect20', icon: 'ic-pulse', text: 'Colete 20 pulsos', target: 20, field: 'pickups', mode: 'sum' },
  { id: 'collect45', icon: 'ic-pulse', text: 'Colete 45 pulsos', target: 45, field: 'pickups', mode: 'sum' },
  { id: 'score1500', icon: 'ic-bolt', text: 'Faça 1500 pontos numa partida', target: 1500, field: 'score', mode: 'max' },
  { id: 'score3000', icon: 'ic-bolt', text: 'Faça 3000 pontos numa partida', target: 3000, field: 'score', mode: 'max' },
  { id: 'combo4', icon: 'ic-flame', text: 'Alcance o combo x4', target: 4, field: 'maxCombo', mode: 'max' },
  { id: 'survive45', icon: 'ic-clock', text: 'Sobreviva 45 segundos', target: 45, field: 'elapsed', mode: 'max' },
  { id: 'play3', icon: 'ic-play', text: 'Jogue 3 partidas', target: 3, field: 'runs', mode: 'sum' },
  { id: 'powerups2', icon: 'ic-shield', text: 'Pegue 2 power-ups', target: 2, field: 'powerups', mode: 'sum' },
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
    list.push({ id: t.id, icon: t.icon, text: t.text, target: t.target, field: t.field, mode: t.mode, progress: 0, done: false });
  }
  return list;
}

export function initMissions() {
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

function ensureToday() {
  const today = todayKey();
  if (state.missions.date !== today) {
    state.missions = { date: today, list: pickDaily(), bonus: state.missions.bonus || 0 };
    saveMissions();
  }
  if (!Array.isArray(state.missions.list) || state.missions.list.length === 0) {
    state.missions.list = pickDaily();
    saveMissions();
  }
}

/** Aplica progresso a uma missão por campo (sum = acumula, max = maior valor). */
function applyProgress(field, value, mode = 'sum') {
  let changed = false;
  for (const m of state.missions.list) {
    if (m.done || m.field !== field) continue;
    m.progress = mode === 'max' ? Math.max(m.progress, value) : m.progress + value;
    if (m.progress >= m.target) { m.progress = m.target; complete(m); }
    changed = true;
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
  saveMissions();
}

function complete(m) {
  if (m.done) return;
  m.done = true;
  state.missions.bonus = (state.missions.bonus || 0) + BONUS_PER_MISSION;
  sfx('mission');
  showToast({ icon: 'ic-mission', title: 'Missão concluída!', desc: `${m.text} — bônus +${BONUS_PER_MISSION} na próxima partida` });
  emit('missions:completed');
}

export function allMissionsDone() {
  ensureToday();
  return state.missions.list.length > 0 && state.missions.list.every((m) => m.done);
}

export function renderMissions() {
  const list = document.getElementById('missions-list');
  if (!list) return;
  ensureToday();
  const done = state.missions.list.filter((m) => m.done).length;
  const badge = document.getElementById('missions-count');
  if (badge) badge.textContent = `${done}/${state.missions.list.length}`;

  list.innerHTML = state.missions.list.map((m) => {
    const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
    return `<li class="mission-row ${m.done ? 'done' : ''}">
      <span class="mission-ic"><svg class="ic" aria-hidden="true"><use href="#${m.done ? 'ic-check' : m.icon}"/></svg></span>
      <div class="mission-info">
        <div>${m.text} <span class="muted">(${Math.floor(m.progress)}/${m.target})</span></div>
        <div class="mission-bar"><span style="width:${pct}%"></span></div>
      </div>
      <span class="chip ${m.done ? 'chip-success' : 'chip-reward'} mission-reward">+${BONUS_PER_MISSION}</span>
    </li>`;
  }).join('');
}
