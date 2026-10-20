/* =========================================================
   Áudio — efeitos e música gerados com Web Audio API
   (sem nenhum arquivo de áudio; tudo sintetizado)
   ========================================================= */

import { state } from './state.js';

let ctx = null;            // AudioContext (criado no 1º gesto do usuário)
let master = null;         // gain master (volume do usuário)
let musicGain = null;      // gain da música
let sfxGain = null;        // gain dos efeitos
let musicTimer = null;     // timer do sequenciador
let musicStep = 0;
let stepAt = -1e9;         // instante do último passo (para o fundo reativo)
let available = true;      // false se Web Audio não existir

/** Deve ser chamado a partir de um gesto do usuário (política de autoplay). */
export function initAudio() {
  if (ctx || !available) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { available = false; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    applyVolume();
    if (state.settings.music && document.visibilityState === 'visible') startMusic();
  } catch (err) {
    console.warn('[audio] indisponível:', err);
    available = false;
  }
}

export function applyVolume() {
  if (!ctx || !master) return;
  const v = state.settings.sound || state.settings.music ? state.settings.volume : state.settings.volume;
  master.gain.value = v;
  if (musicGain) musicGain.gain.value = state.settings.music ? 0.35 : 0;
}

/** Retoma o contexto (necessário após pausa em iOS/Safari). */
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// ---------------------------------------------------------
//  Efeitos sonoros (osciladores + envelopes curtos)
// ---------------------------------------------------------
function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.5, delay = 0, dest = null }) {
  if (!ctx || !available || !state.settings.sound) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch { /* áudio nunca derruba o jogo */ }
}

/** Sons do jogo. comboIndex sobe a altura do blip (feedback de progressão). */
export function sfx(name, opts = {}) {
  if (!ctx || !available || !state.settings.sound) return;
  resumeAudio();
  switch (name) {
    case 'pickup': {
      const step = Math.min(opts.combo || 0, 16);
      const base = 520 + step * 38;
      tone({ freq: base, freqEnd: base * 1.5, type: 'triangle', dur: 0.12, gain: 0.4 });
      tone({ freq: base * 2, type: 'sine', dur: 0.08, gain: 0.18, delay: 0.02 });
      break;
    }
    case 'combo': // milestone de combo
      tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.35 });
      tone({ freq: 880, type: 'triangle', dur: 0.12, gain: 0.35, delay: 0.08 });
      tone({ freq: 1320, type: 'sine', dur: 0.16, gain: 0.3, delay: 0.16 });
      break;
    case 'hit':
      tone({ freq: 220, freqEnd: 60, type: 'sawtooth', dur: 0.28, gain: 0.45 });
      tone({ freq: 110, freqEnd: 40, type: 'square', dur: 0.3, gain: 0.25 });
      break;
    case 'shield':
      tone({ freq: 300, freqEnd: 900, type: 'sine', dur: 0.22, gain: 0.4 });
      break;
    case 'powerup':
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.32, delay: i * 0.07 }));
      break;
    case 'level':
      [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.14, gain: 0.22, delay: i * 0.09 }));
      break;
    case 'gameover':
      [440, 370, 294, 220].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.22, gain: 0.3, delay: i * 0.16 }));
      break;
    case 'revive':
      [262, 392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.35, delay: i * 0.08 }));
      break;
    case 'ui':
      tone({ freq: 700, freqEnd: 900, type: 'sine', dur: 0.07, gain: 0.25 });
      break;
    case 'record':
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.35, delay: i * 0.1 }));
      break;
    case 'achievement':
      [784, 988, 1174, 1568].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.2, gain: 0.3, delay: i * 0.09 }));
      break;
    case 'mission':
      tone({ freq: 880, freqEnd: 1320, type: 'sine', dur: 0.2, gain: 0.35 });
      break;
    case 'drop': // ganho de drop novo (arpejo curto, categoria)
      tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.14 });
      tone({ freq: 1320, type: 'square', dur: 0.09, gain: 0.1, delay: 0.05 });
      break;
    case 'drop_prot': // proteção/recuperação (quadratura grave)
      tone({ freq: 160, type: 'sine', dur: 0.16, gain: 0.2 });
      tone({ freq: 240, type: 'sine', dur: 0.2, gain: 0.12, delay: 0.05 });
      break;
    case 'drop_tempo': // câmara lenta (tom caindo)
      tone({ freq: 660, freqEnd: 220, type: 'triangle', dur: 0.25, gain: 0.14 });
      break;
    case 'evento': // aviso de evento (dupla grave)
      tone({ freq: 330, type: 'square', dur: 0.12, gain: 0.22 });
      tone({ freq: 330, type: 'square', dur: 0.12, gain: 0.22, delay: 0.16 });
      break;
    case 'evento_start': // início do evento (subida)
      tone({ freq: 440, freqEnd: 880, type: 'triangle', dur: 0.3, gain: 0.28 });
      break;
    case 'evento_end': // fim do evento (resolução descendente)
      [784, 659, 523].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.26, delay: i * 0.1 }));
      break;
    default: break;
  }
}

// ---------------------------------------------------------
//  Música — arpejo procedural em loop (lookahead simples)
// ---------------------------------------------------------
const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66]; // Lá menor
const LEAD = [440, 523.25, 587.33, 659.25, 783.99, 880];
const STEP_TIME = 0.24; // ~125 BPM em colcheias

function scheduleMusicStep() {
  if (!ctx || !state.settings.music) return;
  try {
    const t = ctx.currentTime + 0.05;
    const s = musicStep % 16;

    // Baixo pulsante nos tempos fortes
    if (s % 4 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = SCALE[Math.floor(s / 4) % 4];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP_TIME * 1.6);
      osc.connect(g); g.connect(musicGain);
      osc.start(t); osc.stop(t + STEP_TIME * 1.8);
    }

    // Arpejo suave
    if (s % 2 === 0) {
      const f = LEAD[(s / 2) % LEAD.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f / 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP_TIME * 1.2);
      osc.connect(g); g.connect(musicGain);
      osc.start(t); osc.stop(t + STEP_TIME * 1.4);
    }
    stepAt = performance.now();
    musicStep++;
  } catch { /* ignore */ }
}

export function startMusic() {
  if (!ctx || musicTimer || !state.settings.music) return;
  musicTimer = setInterval(scheduleMusicStep, STEP_TIME * 1000);
  if (musicGain) musicGain.gain.value = 0.35;
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function setMusicEnabled(on) {
  state.settings.music = on;
  if (on) { initAudio(); startMusic(); } else stopMusic();
}

/**
 * Fase do último passo do sequenciador: 1 logo no pulso, decai até 0
 * antes do próximo passo (0 se a música está parada). Usado pelo fundo
 * para pulsar névoa/grade no ritmo (fundo reativo, apresentação pura).
 */
export function getMusicPulse() {
  if (!musicTimer || !state.settings.music) return 0;
  const k = (performance.now() - stepAt) / (STEP_TIME * 1000);
  return k >= 0 && k <= 1 ? 1 - k : 0;
}

export function audioAvailable() {
  return available;
}
