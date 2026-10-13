/* =========================================================
   PULSO NEON — ponto de entrada (main.js)
   Liga todos os módulos: core, jogo, UI, ads e PWA.
   ========================================================= */

import { startLoop } from './core/loop.js';
import { on, emit } from './core/events.js';
import { state, saveStats, addScoreToRanking } from './core/state.js';
import { initAudio, resumeAudio, sfx } from './core/audio.js';
import { initInput } from './core/input.js';
import { initGame, update, render, startGame, forceGameOver, revive, game } from './game/game.js';
import { initHud } from './ui/hud.js';
import { initToasts, showToast } from './ui/toasts.js';
import { initScreens, applySettingsToUI, showGameOver, showScreen } from './ui/screens.js';
import { initAchievements, checkAchievements } from './ui/achievements.js';
import { initMissions, allMissionsDone } from './ui/missions.js';
import { initRanking } from './ui/ranking.js';
import { initShare } from './ui/share.js';
import { initAds, onRunEnd as adsOnRunEnd, showRewarded } from './monetization/ads.js';

function boot() {
  const canvas = document.getElementById('game-canvas');

  // ---- núcleo ----
  initGame(canvas);
  initInput(canvas);

  // ---- UI ----
  initToasts();
  initHud();
  initScreens();
  applySettingsToUI();
  initAchievements();
  initMissions();
  initRanking();
  initShare();
  initAds();

  // ---- áudio no 1º gesto (política de autoplay dos navegadores) ----
  const firstGesture = () => {
    initAudio();
    resumeAudio();
  };
  window.addEventListener('pointerdown', firstGesture);
  window.addEventListener('keydown', firstGesture);

  // ---- fim de partida: estatísticas, ranking, missões, conquistas ----
  on('game:over', (run) => {
    const st = state.stats;
    st.runs += 1;
    st.totalPickups += run.pickups;
    st.totalPowerups += run.powerups;
    st.bestCombo = Math.max(st.bestCombo, run.maxCombo);
    st.bestLevel = Math.max(st.bestLevel, run.level);
    st.totalTime = Math.round((st.totalTime || 0) + run.elapsed);
    const isRecord = run.score > st.best;
    if (isRecord) st.best = run.score;
    saveStats();

    const position = addScoreToRanking(run.score);
    emit('stats:changed');

    emit('missions:report', run);           // progresso das missões diárias
    const missionsAll = allMissionsDone();
    checkAchievements({ ...run, isRecord, missionsAll });

    if (isRecord) {
      sfx('record');
      showToast({ icon: '🏆', title: 'Novo recorde!', desc: `${run.score.toLocaleString('pt-BR')} pontos` });
    }

    showGameOver({ ...run, best: state.stats.best, isRecord, position });
    adsOnRunEnd();
  });

  // ---- reviver via anúncio recompensado ----
  on('ads:rewarded-revive', () => {
    showRewarded(() => {
      if (revive()) showScreen(null);
    });
  });

  // ---- banner de cookies (LGPD) ----
  if (state.consent === null) {
    setTimeout(() => {
      const banner = document.getElementById('cookie-banner');
      if (banner) banner.hidden = false;
    }, 900);
  }

  // ---- game loop (60 FPS com delta time) ----
  startLoop(update, render);

  // ---- PWA: registra o service worker (só em http/https) ----
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[pwa] service worker não registrado:', err);
      });
    });
  }

  // ---- visibilidade: retoma áudio ao voltar para a aba ----
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeAudio();
  });

  // ---- API de debug/testes (inofensiva em produção) ----
  window.PN = {
    version: '1.0.0',
    state,
    game,
    start: (opts = {}) => startGame(opts),
    advance: (seconds = 1) => {              // simula N segundos de jogo
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) update(1 / 60);
    },
    endRun: () => forceGameOver(),
  };

  console.info('%c🕹️ Pulso Neon pronto!', 'color:#22e6ff;font-weight:bold', `v${window.PN.version}`);
}

try {
  boot();
} catch (err) {
  console.error('[boot] falha ao iniciar:', err);
  document.body.insertAdjacentHTML('beforeend',
    '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:#05060f;font-family:sans-serif;padding:20px;text-align:center;z-index:99">Ops! Algo deu errado ao iniciar o jogo.<br>Recarregue a página.</div>');
}
