/* =========================================================
   Conquistas — medalhas desbloqueáveis
   Ícones = ids do sprite SVG (sem emojis na interface)
   ========================================================= */

import { state, saveAchievements } from '../core/state.js';
import { on, emit } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { showToast } from './toasts.js';

export const ACHIEVEMENTS = [
  { id: 'first_run', icon: 'ic-play', name: 'Primeiro pulso', desc: 'Jogue sua primeira partida', test: (r) => r.stats.runs >= 1 },
  { id: 'score_1000', icon: 'ic-medal', name: 'Cem vezes dez', desc: 'Faça 1000 pontos numa partida', test: (r) => r.score >= 1000 },
  { id: 'score_3000', icon: 'ic-bolt', name: 'Turbo', desc: 'Faça 3000 pontos numa partida', test: (r) => r.score >= 3000 },
  { id: 'score_6000', icon: 'ic-pulse', name: 'Supernova', desc: 'Faça 6000 pontos numa partida', test: (r) => r.score >= 6000 },
  { id: 'combo_x5', icon: 'ic-flame', name: 'Em chamas', desc: 'Alcance o multiplicador x5', test: (r) => r.maxCombo >= 5 },
  { id: 'collect_100', icon: 'ic-mission', name: 'Colecionador', desc: 'Colete 100 pulsos no total', test: (r) => r.stats.totalPickups >= 100 },
  { id: 'collect_500', icon: 'ic-mission', name: 'Imã de pulsos', desc: 'Colete 500 pulsos no total', test: (r) => r.stats.totalPickups >= 500 },
  { id: 'survive_60', icon: 'ic-clock', name: 'Resistente', desc: 'Sobreviva 60 segundos numa partida', test: (r) => r.elapsed >= 60 },
  { id: 'survive_120', icon: 'ic-clock', name: 'Imperturbável', desc: 'Sobreviva 120 segundos numa partida', test: (r) => r.elapsed >= 120 },
  { id: 'runs_10', icon: 'ic-restart', name: 'Viciado', desc: 'Jogue 10 partidas', test: (r) => r.stats.runs >= 10 },
  { id: 'powerup_5', icon: 'ic-shield', name: 'Bem equipado', desc: 'Pegue 5 power-ups no total', test: (r) => r.stats.totalPowerups >= 5 },
  { id: 'record', icon: 'ic-trophy', name: 'Campeão', desc: 'Bata seu próprio recorde', test: (r) => r.isRecord },
  { id: 'missions_all', icon: 'ic-check', name: 'Dedicado', desc: 'Complete todas as missões do dia', test: (r) => r.missionsAll },
  { id: 'revive', icon: 'ic-heart', name: 'Segunda chance', desc: 'Reviva com um anúncio', test: (r) => r.revived },
];

export function initAchievements() {
  on('screen:ranking', renderAchievements);
  on('achievements:changed', renderAchievements);
}

/** Confere todas as conquistas após uma partida. */
export function checkAchievements(run) {
  const ctx = { ...run, stats: state.stats };
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(ctx); } catch { ok = false; }
    if (ok) unlock(a);
  }
}

function unlock(a) {
  state.achievements[a.id] = Date.now();
  saveAchievements();
  sfx('achievement');
  showToast({ icon: 'ic-medal', title: `Conquista: ${a.name}`, desc: a.desc });
  emit('achievements:unlocked', a.id);
}

export function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;
  const unlockedCount = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;
  const badge = document.getElementById('achievements-count');
  if (badge) badge.textContent = `${unlockedCount}/${ACHIEVEMENTS.length}`;

  grid.innerHTML = ACHIEVEMENTS.map((a) => {
    const got = !!state.achievements[a.id];
    return `<div class="achievement ${got ? 'unlocked' : ''}" title="${a.desc}">
      <svg class="ic" aria-hidden="true"><use href="#${a.icon}"/></svg>
      <span class="ach-name">${a.name}</span>
      <span class="ach-desc">${got ? 'Desbloqueada' : a.desc}</span>
    </div>`;
  }).join('');
}
