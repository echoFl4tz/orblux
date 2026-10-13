/* =========================================================
   Screens — gerencia telas, botões e configurações
   ========================================================= */

import { on, emit } from '../core/events.js';
import { state, saveSettings, saveMissions, resetAllProgress, resetTutorialFlag, markTutorialDone } from '../core/state.js';
import { startGame, pauseGame, resumeGame, quitToMenu, game, setReduceMotion } from '../game/game.js';
import { sfx, initAudio, applyVolume, setMusicEnabled, resumeAudio } from '../core/audio.js';
import { showToast } from './toasts.js';
import { updateHudMenuBest } from './hud.js';

const SCREEN_IDS = {
  menu: 'screen-menu',
  howto: 'screen-howto',
  ranking: 'screen-ranking',
  settings: 'screen-settings',
  pause: 'screen-pause',
  gameover: 'screen-gameover',
};

let current = 'menu';
let deferredInstallPrompt = null;

export function initScreens() {
  bindActions();
  bindSettings();
  updateBestDisplay();

  // prompt de instalação (PWA) — Chrome/Edge Android
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install');
    if (btn) btn.hidden = false;
  });

  // pausa automática ao trocar de aba/app
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') {
      pauseGame();
      showScreen('pause');
    }
  });
  window.addEventListener('blur', () => {
    if (game.mode === 'playing') { pauseGame(); showScreen('pause'); }
  });

  // atalhos de teclado
  on('input:pause', () => {
    if (game.mode === 'playing') { pauseGame(); showScreen('pause'); sfx('ui'); }
    else if (game.mode === 'paused') { resumeGame(); showScreen(null); sfx('ui'); }
  });
  on('input:confirm', () => {
    if (current === 'menu') startRun();
    else if (current === 'gameover') startRun();
    else if (game.mode === 'paused') { resumeGame(); showScreen(null); }
  });

  on('stats:changed', updateBestDisplay);
  on('state:reset', () => { updateBestDisplay(); applySettingsToUI(); });
}

/** Inicia uma nova partida (com bônus de missão pendente e tutorial se 1ª vez). */
export function startRun() {
  initAudio();
  resumeAudio();
  const bonus = state.missions.bonus || 0;
  if (bonus) { state.missions.bonus = 0; saveMissions(); }
  startGame({ tutorial: !state.tutorialDone, bonus });
  showScreen(null);
}

export function showScreen(name) {
  current = name || null;
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', key === name);
  }
  document.body.dataset.screen = name || 'playing';
}

export function getCurrentScreen() { return current; }

/** Tela de fim de jogo com contagem animada do placar. */
export function showGameOver({ score, best, isRecord, position, elapsed, pickups, maxCombo, level, revived }) {
  const scoreEl = document.getElementById('go-score');
  document.getElementById('go-best').textContent = (best || 0).toLocaleString('pt-BR');
  document.getElementById('go-record').hidden = !isRecord;

  const stats = document.getElementById('go-stats');
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  stats.innerHTML = `
    <span>⏱️ <b>${mins}:${String(secs).padStart(2, '0')}</b></span>
    <span>✨ <b>${pickups}</b> pulsos</span>
    <span>🔥 máx <b>x${maxCombo}</b></span>
    <span>📈 <b>Nv ${level}</b></span>
    ${revived ? '<span>🎬 reviveu</span>' : ''}
    ${position && position <= 5 ? `<span>🏅 <b>${position}º</b> lugar</span>` : ''}`;

  // botão de reviver: só na primeira derrota da sessão
  const btnRevive = document.getElementById('btn-revive');
  btnRevive.hidden = game.reviveUsed;
  btnRevive.disabled = false;

  showScreen('gameover');

  // animação de contagem do placar
  animateScore(scoreEl, score);
}

function animateScore(elScore, target) {
  if (state.settings.reduceMotion) { elScore.textContent = target.toLocaleString('pt-BR'); return; }
  const dur = 700;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    elScore.textContent = Math.floor(target * eased).toLocaleString('pt-BR');
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function updateBestDisplay() {
  updateHudMenuBest(state.stats.best);
}

// ---------------------------------------------------------
//  Botões (delegação por data-action)
// ---------------------------------------------------------
function bindActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action], [data-consent]');
    if (!btn) return;
    initAudio(); resumeAudio();

    const consent = btn.dataset.consent;
    if (consent) { emit('consent:answer', consent === 'accepted'); return; }

    const action = btn.dataset.action;
    switch (action) {
      case 'play': case 'replay': case 'restart':
        sfx('ui'); startRun(); break;
      case 'howto': sfx('ui'); showScreen('howto'); break;
      case 'ranking': sfx('ui'); emit('screen:ranking'); showScreen('ranking'); break;
      case 'settings': sfx('ui'); applySettingsToUI(); showScreen('settings'); break;
      case 'menu':
        sfx('ui');
        if (game.mode === 'playing' || game.mode === 'paused') quitToMenu();
        showScreen('menu');
        break;
      case 'pause': sfx('ui'); pauseGame(); showScreen('pause'); break;
      case 'resume': sfx('ui'); resumeGame(); showScreen(null); break;
      case 'revive': sfx('ui'); emit('ads:rewarded-revive'); break;
      case 'share-score': case 'share-rank': sfx('ui'); emit('share:open', action === 'share-score' ? 'score' : 'rank'); break;
      case 'close-share': sfx('ui'); document.getElementById('modal-share').hidden = true; break;
      case 'reset':
        sfx('ui');
        if (confirm('Apagar TODO o progresso (recorde, conquistas e ranking)?')) {
          resetAllProgress();
          showToast({ icon: '🗑️', title: 'Progresso apagado', desc: 'Comece do zero!' });
        }
        break;
      case 'install':
        sfx('ui');
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          deferredInstallPrompt.userChoice.finally(() => { deferredInstallPrompt = null; btn.hidden = true; });
        }
        break;
      default: break;
    }
  });
}

// ---------------------------------------------------------
//  Configurações
// ---------------------------------------------------------
function bindSettings() {
  const sound = document.getElementById('set-sound');
  const music = document.getElementById('set-music');
  const volume = document.getElementById('set-volume');
  const haptics = document.getElementById('set-haptics');
  const reduce = document.getElementById('set-reduce');
  const tut = document.getElementById('set-tutorial');

  sound.addEventListener('change', () => {
    state.settings.sound = sound.checked; saveSettings(); applyVolume(); sfx('ui');
  });
  music.addEventListener('change', () => {
    setMusicEnabled(music.checked); saveSettings();
  });
  volume.addEventListener('input', () => {
    state.settings.volume = volume.value / 100; saveSettings(); applyVolume();
  });
  haptics.addEventListener('change', () => {
    state.settings.haptics = haptics.checked; saveSettings();
  });
  reduce.addEventListener('change', () => {
    state.settings.reduceMotion = reduce.checked;
    saveSettings();
    setReduceMotion(reduce.checked);
    document.body.classList.toggle('reduce-motion', reduce.checked);
  });
  tut.addEventListener('change', () => {
    if (tut.checked) resetTutorialFlag();
    else markTutorialDone();
  });
}

export function applySettingsToUI() {
  const s = state.settings;
  document.getElementById('set-sound').checked = s.sound;
  document.getElementById('set-music').checked = s.music;
  document.getElementById('set-volume').value = Math.round(s.volume * 100);
  document.getElementById('set-haptics').checked = s.haptics;
  document.getElementById('set-reduce').checked = s.reduceMotion;
  document.getElementById('set-tutorial').checked = !state.tutorialDone;
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
  setReduceMotion(s.reduceMotion);
}
