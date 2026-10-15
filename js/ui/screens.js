/* =========================================================
   Screens — gerencia telas, botões e configurações
   Foco gerenciado (a11y), modal de confirmação próprio
   (sem confirm() nativo) e colapso de missões
   ========================================================= */

import { on, emit } from '../core/events.js';
import { state, saveSettings, resetAllProgress, resetTutorialFlag, markTutorialDone } from '../core/state.js';
import { startGame, pauseGame, resumeGame, quitToMenu, game, setReduceMotion } from '../game/game.js';
import { sfx, initAudio, applyVolume, setMusicEnabled, resumeAudio } from '../core/audio.js';
import { showToast, trimToasts, clearToasts } from './toasts.js';
import { updateHudMenuBest, resetHud } from './hud.js';
import { closeAllAds } from '../monetization/ads.js';
import { renderMissions } from './missions.js';

const SCREEN_IDS = {
  menu: 'screen-menu',
  howto: 'screen-howto',
  ranking: 'screen-ranking',
  skins: 'screen-skins',
  settings: 'screen-settings',
  social: 'screen-social',
  chat: 'screen-chat',
  pause: 'screen-pause',
  gameover: 'screen-gameover',
};

let current = 'menu';
let deferredInstallPrompt = null;
let lastFocused = null; // elemento que tinha o foco antes de abrir um modal
let screenGen = 0;      // "geração de tela": invalida callbacks de animações antigas
let scoreRafId = 0;     // id do RAF da contagem do placar (cancelado ao trocar de tela)

export function initScreens() {
  bindActions();
  bindSettings();
  bindModals();
  updateBestDisplay();
  collapseMissionsOnShortScreens();

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

/** Inicia uma nova partida (tutorial se for a primeira vez). */
export function startRun() {
  initAudio();
  resumeAudio();
  startGame({ tutorial: !state.tutorialDone });
  showScreen(null);
}

export function showScreen(name) {
  current = name || null;
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', key === name);
  }
  document.body.dataset.screen = name || 'playing';
  // fim de jogo: no máximo 1 toast visível (os outros já disparados somem)
  if (name === 'gameover') trimToasts(1);

  // foco no painel aberto (a11y): painel recebe tabindex=-1 dinamicamente.
  // Focar o painel (não um botão) evita duplo-disparo de Enter com o jogo.
  if (name) {
    const panel = document.querySelector(`#screen-${name} .panel, #screen-${name} .menu-wrap`);
    if (panel) {
      panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    }
  }
}

export function getCurrentScreen() { return current; }

/**
 * Caminho ÚNICO de volta ao menu (fim de jogo, pausa e "Voltar" das telas).
 * Faz a limpeza completa e determinística para o menu nunca herdar nada da
 * partida: HUD, toasts, modais, anúncios, efeitos, input e entidades.
 * Ordem importa — ver comentários numerados.
 */
export function returnToMenu() {
  // nova geração de tela: ignora qualquer callback de animação pendente
  screenGen++;

  // 1) cancela a contagem animada do placar (requestAnimationFrame)
  if (scoreRafId) { cancelAnimationFrame(scoreRafId); scoreRafId = 0; }

  // 2) fecha todos os modais e para os timers de anúncio/compartilhar
  closeAllAds();
  emit('share:close');
  closeModal('modal-confirm');
  closeModal('modal-social-delete');
  closeModal('modal-chat-actions');
  closeModal('modal-chat-blocked');

  // 3) remove todos os toasts da tela
  clearToasts();

  // 4-5) zera a partida: entidades, efeitos, shake, combo, spawner, input e mode='menu'
  quitToMenu();

  // 6) esconde HUD/tutorial/hud-toast e limpa chips de power-up e barra de combo
  resetHud();

  // 7) restaura o botão de reviver e o placar/painel de fim de jogo
  const btnRevive = document.getElementById('btn-revive');
  if (btnRevive) { btnRevive.hidden = true; btnRevive.disabled = false; }
  const goScore = document.getElementById('go-score');
  if (goScore) goScore.textContent = '0';
  const goRecord = document.getElementById('go-record');
  if (goRecord) goRecord.hidden = true;
  const goStats = document.getElementById('go-stats');
  if (goStats) goStats.innerHTML = '';
  const pauseScore = document.getElementById('pause-score');
  if (pauseScore) pauseScore.textContent = '0';

  // 8) mostra o menu (o canvas já redesenha só a cena ambiente do menu)
  showScreen('menu');

  // 9) re-renderiza recorde e missões do menu
  updateBestDisplay();
  renderMissions();

  // 10) o cache offscreen do fundo só depende de W/H/dpr (válidos); se a janela
  //     mudou (ex.: barra de endereço mobile), resize() já o reconstruiu.
  emit('game:quit-menu');
}

/** Tela de fim de jogo com contagem animada do placar. */
export function showGameOver({ score, best, isRecord, position, elapsed, pickups, maxCombo, level, revived }) {
  const scoreEl = document.getElementById('go-score');
  document.getElementById('go-best').textContent = (best || 0).toLocaleString('pt-BR');
  document.getElementById('go-record').hidden = !isRecord;
  // apelido junto ao placar
  const goNick = document.getElementById('go-nick');
  if (goNick) {
    const nick = state.profile?.nickname || 'Jogador';
    goNick.textContent = `${nick} — ${score.toLocaleString('pt-BR')} pts`;
    goNick.hidden = false;
  }

  const stats = document.getElementById('go-stats');
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;
  stats.innerHTML = `
    <div class="go-stat">${icon('ic-clock')}<b>${mins}:${String(secs).padStart(2, '0')}</b>${revived ? '<span class="go-revived">reviveu</span>' : ''}</div>
    <div class="go-stat">${icon('ic-pulse')}<b>${pickups}</b> pulsos</div>
    <div class="go-stat">${icon('ic-flame')}máx <b>x${maxCombo}</b></div>
    <div class="go-stat">${icon('ic-bolt')}<b>Nv ${level}</b></div>
    ${position && position <= 5 ? `<div class="go-stat go-rank">${icon('ic-trophy')}<b>${position}º</b> lugar</div>` : ''}`;

  // botão de reviver: só na primeira derrota da sessão
  const btnRevive = document.getElementById('btn-revive');
  btnRevive.hidden = game.reviveUsed;
  btnRevive.disabled = false;

  showScreen('gameover');

  // selo de recorde: solta confetes (desligado com movimento reduzido)
  if (isRecord && !state.settings.reduceMotion) spawnConfetti();

  // animação de contagem do placar
  animateScore(scoreEl, score);
}

/** Confetes dourados em volta do selo NOVO RECORDE (poucos elementos, uma vez). */
function spawnConfetti() {
  const badge = document.getElementById('go-record');
  if (!badge) return;
  badge.querySelectorAll('.confetti').forEach((n) => n.remove());
  const holder = document.createElement('span');
  holder.className = 'confetti';
  holder.setAttribute('aria-hidden', 'true');
  const colors = ['#ffe45e', '#22e6ff', '#ff3df0', '#4dff9e', '#ff8a4d'];
  for (let i = 0; i < 14; i++) {
    const bit = document.createElement('i');
    const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 90;
    bit.style.setProperty('--cx', `${Math.cos(ang) * dist}px`);
    bit.style.setProperty('--cy', `${Math.abs(Math.sin(ang)) * dist * 0.9 + 40}px`);
    bit.style.setProperty('--cr', `${Math.round(Math.random() * 720 - 360)}deg`);
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${(Math.random() * 0.35).toFixed(2)}s`;
    holder.appendChild(bit);
  }
  badge.appendChild(holder);
}

function animateScore(elScore, target) {
  if (state.settings.reduceMotion) { elScore.textContent = target.toLocaleString('pt-BR'); return; }
  const dur = 700;
  const t0 = performance.now();
  const gen = screenGen;                       // captura a geração da tela atual
  if (scoreRafId) cancelAnimationFrame(scoreRafId); // cancela contagem anterior (replay rápido)
  const tick = (now) => {
    if (gen !== screenGen) { scoreRafId = 0; return; } // a tela mudou: ignora este callback
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    elScore.textContent = Math.floor(target * eased).toLocaleString('pt-BR');
    if (k < 1) scoreRafId = requestAnimationFrame(tick);
    else scoreRafId = 0;
  };
  scoreRafId = requestAnimationFrame(tick);
}

function updateBestDisplay() {
  updateHudMenuBest(state.stats.best);
}

// ---------------------------------------------------------
//  Modais (confirmação / compartilhar) com foco gerenciado
// ---------------------------------------------------------
export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocused = document.activeElement;
  modal.hidden = false;
  const panel = modal.querySelector('.panel');
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (lastFocused && lastFocused.isConnected) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
}

function bindModals() {
  // Esc fecha o modal aberto (sem afetar a pausa, que tem fluxo próprio)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const confirmM = document.getElementById('modal-confirm');
    if (confirmM && !confirmM.hidden) { closeModal('modal-confirm'); return; }
    const socialDel = document.getElementById('modal-social-delete');
    if (socialDel && !socialDel.hidden) { closeModal('modal-social-delete'); return; }
    const shareM = document.getElementById('modal-share');
    if (shareM && !shareM.hidden) { emit('share:close'); return; }
  });
}

// ---------------------------------------------------------
//  Missões colapsáveis
// ---------------------------------------------------------
function collapseMissionsOnShortScreens() {
  // em telas baixas, missões começam recolhidas para o menu não rolar
  const card = document.getElementById('missions-card');
  if (!card) return;
  if (window.innerHeight < 720 || window.innerWidth < 380) {
    card.classList.add('collapsed');
    card.querySelector('.missions-toggle')?.setAttribute('aria-expanded', 'false');
  }
}

function toggleMissions(btn) {
  const card = document.getElementById('missions-card');
  if (!card) return;
  const collapsed = card.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', String(!collapsed));
}

// ---------------------------------------------------------
//  Botões (delegação por data-action)
// ---------------------------------------------------------
function bindActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action], [data-consent]');
    if (!btn) return;
    initAudio(); resumeAudio();

    // vibração sutil de feedback nos botões (quando haptics ativo)
    if (state.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(10); } catch { /* ignore */ }
    }

    const consent = btn.dataset.consent;
    if (consent) { emit('consent:answer', consent === 'accepted'); return; }

    const action = btn.dataset.action;
    switch (action) {
      case 'play': case 'replay': case 'restart':
        sfx('ui'); startRun(); break;
      case 'howto': sfx('ui'); showScreen('howto'); break;
      case 'ranking': sfx('ui'); emit('screen:ranking'); showScreen('ranking'); break;
      case 'skins': sfx('ui'); showScreen('skins'); emit('shop:open'); break;
      case 'social': sfx('ui'); emit('social:open'); break;
      case 'chat': sfx('ui'); emit('chat:open'); break;
      case 'settings': sfx('ui'); applySettingsToUI(); showScreen('settings'); break;
      case 'menu':
        sfx('ui'); returnToMenu(); break;
      case 'pause': sfx('ui'); pauseGame(); showScreen('pause'); break;
      case 'resume': sfx('ui'); resumeGame(); showScreen(null); break;
      case 'revive': sfx('ui'); emit('ads:rewarded-revive'); break;
      case 'share-score': case 'share-rank': {
        sfx('ui');
        const mode = action === 'share-score' ? 'score' : 'rank';
        const score = mode === 'score' ? Math.floor(game.score) : (state.stats.best || 0);
        emit('share:open', { mode, score });
        break;
      }
      case 'close-share': sfx('ui'); emit('share:close'); break;
      case 'toggle-missions': sfx('ui'); toggleMissions(btn); break;
      // reset com modal de confirmação próprio (sem confirm() nativo)
      case 'reset': {
        sfx('ui');
        const keepBox = document.getElementById('reset-keep-coins');
        if (keepBox) keepBox.checked = false;       // padrão: apagar moedas e skins com moedas
        openModal('modal-confirm');
        break;
      }
      case 'reset-confirm': {
        sfx('ui');
        const keepCoins = !!document.getElementById('reset-keep-coins')?.checked;
        resetAllProgress({ keepCoins });
        closeModal('modal-confirm');
        showToast({
          icon: 'ic-trash',
          title: 'Progresso apagado',
          desc: keepCoins ? 'Suas moedas foram mantidas.' : 'Comece do zero!',
        });
        break;
      }
      case 'reset-cancel': sfx('ui'); closeModal('modal-confirm'); break;
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
  const contrast = document.getElementById('set-contrast');

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
  contrast.addEventListener('change', () => {
    state.settings.highContrast = contrast.checked;
    saveSettings();
    sfx('ui');
  });
}

export function applySettingsToUI() {
  const s = state.settings;
  document.getElementById('set-sound').checked = s.sound;
  document.getElementById('set-music').checked = s.music;
  document.getElementById('set-volume').value = Math.round(s.volume * 100);
  document.getElementById('set-haptics').checked = s.haptics;
  document.getElementById('set-reduce').checked = s.reduceMotion;
  document.getElementById('set-contrast').checked = !!s.highContrast;
  document.getElementById('set-tutorial').checked = !state.tutorialDone;
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
  setReduceMotion(s.reduceMotion);
}
