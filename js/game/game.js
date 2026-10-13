/* =========================================================
   GAME — controlador principal do ORBLUX
   Pontuação, combo, vidas, dificuldade, colisões, render.
   ========================================================= */

import { emit } from '../core/events.js';
import { getAxis, getPointer, resetInput } from '../core/input.js';
import { sfx } from '../core/audio.js';
import { state } from '../core/state.js';
import {
  createPlayer, drawPlayer, drawObstacle, drawPickup, drawPowerup,
  circleRectHit, circlesHit, COLORS,
} from './entities.js';
import { difficultyParams, spawnObstacles, spawnPickupWave, spawnPowerup, resetSpawner } from './spawner.js';
import {
  burst, ring, floatText, updateParticles, drawParticles,
  updateTexts, drawTexts, addShake, updateShake, shakeOffset, resetFX,
} from './particles.js';
import { tutorial, startTutorial, updateTutorial } from './tutorial.js';

// ---------------------------------------------------------
//  Constantes de balanceamento
// ---------------------------------------------------------
const LIVES_START = 3;
const COMBO_WINDOW = 3.5;       // s sem coletar até zerar o combo
const INVULN_TIME = 1.6;        // s de invulnerabilidade após levar dano
const PLAYER_SPEED = 470;       // px/s (antes da escala S)
const POINTS_PER_LEVEL = 1000;
const X2_DURATION = 8;          // s do power-up dobra-pontos
const MAX_MULT = 5;

// ---------------------------------------------------------
//  Estado do jogo (singleton)
// ---------------------------------------------------------
export const game = {
  mode: 'menu',            // menu | playing | paused | gameover
  W: 0, H: 0, S: 1, dpr: 1,
  canvas: null, ctx: null,

  player: null,
  obstacles: [], pickups: [], powerups: [],
  lastSpawnX: null,
  spawnTimer: 0, pickupTimer: 0, powerTimer: 0,

  score: 0, bonus: 0,
  combo: 0, comboTimer: 0, multiplier: 1,
  lives: LIVES_START, level: 1,
  elapsed: 0, sinceHit: 0,
  x2Timer: 0, reviveUsed: false, moved: false,
  runStats: { pickups: 0, maxCombo: 1, powerups: 0 },

  stars: [], ambient: [], bgOffset: 0,
  bgGradient: null,
  reduceMotion: false,
};

// ---------------------------------------------------------
//  Setup / resize
// ---------------------------------------------------------
export function initGame(canvas) {
  game.canvas = canvas;
  game.ctx = canvas.getContext('2d', { alpha: false });
  game.reduceMotion = state.settings.reduceMotion;
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
}

export function setReduceMotion(v) { game.reduceMotion = v; }

export function resize() {
  const g = game;
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  g.dpr = Math.min(window.devicePixelRatio || 1, 2); // limita a 2 (performance)
  g.W = w; g.H = h;
  g.canvas.width = Math.round(w * g.dpr);
  g.canvas.height = Math.round(h * g.dpr);
  g.canvas.style.width = w + 'px';
  g.canvas.style.height = h + 'px';

  // escala global: o jogo usa o mesmo "tamanho relativo" em qualquer tela
  g.S = Math.max(0.62, Math.min(1.5, Math.min(w, h) / 720));

  buildBackdrop();

  // mantém o jogador dentro dos novos limites
  if (g.player) {
    g.player.x = Math.max(g.player.r, Math.min(g.W - g.player.r, g.player.x));
    g.player.y = Math.max(g.player.r, Math.min(g.H - g.player.r, g.player.y));
  }
}

function buildBackdrop() {
  const g = game;
  const area = g.W * g.H;
  const starCount = Math.max(24, Math.min(70, Math.round(area / 16000)));
  g.stars = new Array(starCount).fill(0).map(() => ({
    x: Math.random() * g.W,
    y: Math.random() * g.H,
    r: Math.random() * 1.6 + 0.4,
    v: Math.random() * 26 + 8,
    a: Math.random() * 0.5 + 0.2,
  }));
  const ambCount = Math.max(6, Math.min(14, Math.round(area / 60000)));
  g.ambient = new Array(ambCount).fill(0).map(() => ({
    x: Math.random() * g.W,
    y: Math.random() * g.H,
    r: (Math.random() * 9 + 5),
    v: Math.random() * 14 + 5,
    t: Math.random() * Math.PI * 2,
    color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
  }));

  const grad = g.ctx.createLinearGradient(0, 0, 0, g.H);
  grad.addColorStop(0, '#070a1c');
  grad.addColorStop(0.6, '#05060f');
  grad.addColorStop(1, '#0a0620');
  g.bgGradient = grad;
}

// ---------------------------------------------------------
//  Fluxo de partida
// ---------------------------------------------------------
/** @param {{tutorial?:boolean, bonus?:number}} opts */
export function startGame(opts = {}) {
  const g = game;
  const r = 15 * g.S;

  g.player = createPlayer(g.W / 2, g.H * 0.72, r);
  g.obstacles.length = 0;
  g.pickups.length = 0;
  g.powerups.length = 0;
  g.score = opts.bonus || 0;
  g.bonus = opts.bonus || 0;
  g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
  g.lives = LIVES_START;
  g.level = Math.floor(g.score / POINTS_PER_LEVEL) + 1;
  g.elapsed = 0; g.sinceHit = 0;
  g.x2Timer = 0; g.reviveUsed = false; g.moved = false;
  g.runStats = { pickups: 0, maxCombo: 1, powerups: 0 };
  resetSpawner(g);
  resetFX();
  resetInput();
  g.mode = 'playing';

  if (opts.bonus) floatText(g.W / 2, g.H * 0.5, `BÔNUS +${opts.bonus}`, COLORS.green, 22);
  if (opts.tutorial) startTutorial();

  emit('game:start', { tutorial: !!opts.tutorial });
  emit('game:score', { score: g.score });
  emit('game:lives', { lives: g.lives });
  emit('game:combo', { combo: 0, multiplier: 1, frac: 0 });
  emit('game:level', { level: g.level });
}

export function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  resetInput();
  emit('game:paused', { score: game.score });
}

export function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  emit('game:resumed');
}

export function quitToMenu() {
  game.mode = 'menu';
  game.obstacles.length = 0;
  game.pickups.length = 0;
  game.powerups.length = 0;
  resetInput();
  emit('game:quit');
}

/** Encerra a partida imediatamente (usado pelo debug/testes). */
export function forceGameOver() {
  if (game.mode === 'playing') gameOver();
}

function gameOver() {
  const g = game;
  g.mode = 'gameover';
  resetInput();
  sfx('gameover');
  burst(g.player.x, g.player.y, COLORS.magenta, 26, 320, 4);
  addShake(14);
  emit('game:over', {
    score: Math.floor(g.score),
    elapsed: g.elapsed,
    pickups: g.runStats.pickups,
    maxCombo: g.runStats.maxCombo,
    level: g.level,
    powerups: g.runStats.powerups,
    revived: g.reviveUsed,
  });
}

/** Reviver via anúncio recompensado (1x por partida). */
export function revive() {
  const g = game;
  if (g.mode !== 'gameover' || g.reviveUsed) return false;
  g.reviveUsed = true;
  g.lives = 1;
  g.player.invuln = 2.6;
  g.combo = 0; g.comboTimer = 0;
  g.sinceHit = 0;
  // limpa a área perto do jogador para dar chance justa de recomeçar
  const py = g.player.y;
  g.obstacles = g.obstacles.filter((o) => !(o.y > py - 170 * g.S && o.y < py + 90 * g.S));
  g.mode = 'playing';
  resetInput();
  sfx('revive');
  ring(g.player.x, g.player.y, COLORS.green, 22, 340);
  emit('game:revive', { lives: g.lives });
  emit('game:lives', { lives: g.lives });
  return true;
}

// ---------------------------------------------------------
//  Atualização (lógica)
// ---------------------------------------------------------
export function update(dt) {
  const g = game;

  // fundo e efeitos continuam animando em qualquer tela
  g.bgOffset += dt * 70 * g.S;
  for (const s of g.stars) {
    s.y += s.v * dt;
    if (s.y > g.H) { s.y = -4; s.x = Math.random() * g.W; }
  }
  for (const a of g.ambient) {
    a.y += a.v * dt;
    a.t += dt;
    if (a.y - a.r > g.H) { a.y = -a.r * 2; a.x = Math.random() * g.W; }
  }
  updateParticles(dt);
  updateTexts(dt);
  updateShake(dt);

  if (g.mode !== 'playing') return;

  const S = g.S;
  g.elapsed += dt;
  g.sinceHit += dt;
  updateTutorial(g);

  // ---------- dificuldade ----------
  const dp = difficultyParams(g.elapsed, tutorial.active);

  // ---------- jogador ----------
  const p = g.player;
  const speed = PLAYER_SPEED * S;
  const ptr = getPointer();
  let moving = false;

  if (ptr.active) {
    const dx = ptr.x - p.x, dy = ptr.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2.5) {
      const step = Math.min(dist, speed * dt);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      moving = true;
    }
  } else {
    const axis = getAxis();
    if (axis.x || axis.y) {
      p.x += axis.x * speed * dt;
      p.y += axis.y * speed * dt;
      moving = true;
    }
  }
  if (moving) g.moved = true;

  p.x = Math.max(p.r, Math.min(g.W - p.r, p.x));
  p.y = Math.max(p.r, Math.min(g.H - p.r, p.y));
  if (p.invuln > 0) p.invuln -= dt;

  if (!g.reduceMotion) {
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 10) p.trail.shift();
  } else p.trail.length = 0;

  // ---------- spawn ----------
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawnObstacles(g, dp);
    g.spawnTimer = dp.interval * (0.85 + Math.random() * 0.3);
  }
  g.pickupTimer -= dt;
  if (g.pickupTimer <= 0) {
    spawnPickupWave(g);
    g.pickupTimer = 1.0 + Math.random() * 0.7;
  }
  g.powerTimer -= dt;
  if (g.powerTimer <= 0) {
    spawnPowerup(g);
    g.powerTimer = 14 + Math.random() * 8;
  }

  // ---------- mover objetos ----------
  for (const o of g.obstacles) {
    o.y += o.vy * dt;
    if (o.type === 'drone') {
      o.t += dt;
      o.x = o.baseX + Math.sin(o.t * o.swayFreq) * o.swayAmp;
      o.x = Math.max(o.r, Math.min(g.W - o.r, o.x));
    }
  }
  for (const pk of g.pickups) pk.y += pk.vy * dt;
  for (const pw of g.powerups) pw.y += pw.vy * dt;

  // ---------- colisões ----------
  const pr = p.r * 0.82; // hitbox generosa (jogo justo)
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i];
    if (o.y > g.H + 60 * S) { g.obstacles.splice(i, 1); continue; }
    const hit = o.type === 'bar'
      ? circleRectHit(p.x, p.y, pr, o.x, o.y, o.w, o.h)
      : circlesHit(p.x, p.y, pr, o.x, o.y, o.r * 0.85);
    if (!hit || p.invuln > 0) continue;

    if (p.shield) {
      p.shield = false;
      p.invuln = 1.0;               // janela de reação justa após o escudo quebrar
      g.obstacles.splice(i, 1);
      sfx('shield');
      ring(p.x, p.y, COLORS.green, 16, 280);
      floatText(p.x, p.y - 30 * S, 'ESCUDO!', COLORS.green, 18);
      emit('game:shield');
    } else {
      onHit();
    }
  }

  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    if (pk.y > g.H + 40 * S) { g.pickups.splice(i, 1); continue; }
    if (circlesHit(p.x, p.y, p.r, pk.x, pk.y, pk.r)) {
      g.pickups.splice(i, 1);
      collectPulse(pk);
    }
  }

  for (let i = g.powerups.length - 1; i >= 0; i--) {
    const pw = g.powerups[i];
    if (pw.y > g.H + 40 * S) { g.powerups.splice(i, 1); continue; }
    if (circlesHit(p.x, p.y, p.r, pw.x, pw.y, pw.r)) {
      g.powerups.splice(i, 1);
      collectPowerup(pw);
    }
  }

  // ---------- combo / x2 / nível ----------
  if (g.comboTimer > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) {
      g.combo = 0;
      g.multiplier = 1;
      emit('game:combo', { combo: 0, multiplier: 1, frac: 0 });
    }
  }
  if (g.x2Timer > 0) {
    g.x2Timer -= dt;
    if (g.x2Timer <= 0) emit('game:powerup:end', { kind: 'x2' });
  }
  const newLevel = Math.floor(g.score / POINTS_PER_LEVEL) + 1;
  if (newLevel > g.level) {
    g.level = newLevel;
    sfx('level');
    emit('game:level', { level: g.level });
    emit('hud:toast', { text: `NÍVEL ${g.level}` });
    burst(p.x, p.y, COLORS.yellow, 18, 260, 3);
  }

  // barra de tempo do combo (HUD)
  if (g.combo > 0) {
    emit('game:combo', {
      combo: g.combo, multiplier: g.multiplier,
      frac: Math.max(0, g.comboTimer / COMBO_WINDOW),
    });
  }
}

function onHit() {
  const g = game;
  const p = g.player;
  p.invuln = INVULN_TIME;
  g.lives -= 1;
  g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
  g.sinceHit = 0;
  sfx('hit');
  addShake(11);
  burst(p.x, p.y, COLORS.red, 20, 300, 3.4);
  if (state.settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(60); } catch { /* ignore */ }
  }
  emit('game:hit', { lives: g.lives });
  emit('game:lives', { lives: g.lives });
  emit('game:combo', { combo: 0, multiplier: 1, frac: 0 });
  if (g.lives <= 0) gameOver();
}

function collectPulse(pk) {
  const g = game;
  const S = g.S;
  g.combo += 1;
  g.comboTimer = COMBO_WINDOW;
  const prevMult = g.multiplier;
  g.multiplier = Math.min(MAX_MULT, 1 + Math.floor(g.combo / 4));
  const points = 10 * g.multiplier * (g.x2Timer > 0 ? 2 : 1);
  g.score += points;
  g.runStats.pickups += 1;
  g.runStats.maxCombo = Math.max(g.runStats.maxCombo, g.multiplier);

  sfx('pickup', { combo: g.combo });
  burst(pk.x, pk.y, COLORS.cyan, 8, 160, 2.4);
  floatText(pk.x, pk.y - 14 * S, `+${points}`, g.x2Timer > 0 ? COLORS.yellow : COLORS.cyan, 15 + g.multiplier);

  if (g.multiplier > prevMult) {
    sfx('combo');
    floatText(g.W / 2, g.H * 0.4, `COMBO x${g.multiplier}`, COLORS.yellow, 24);
  }
  emit('game:score', { score: Math.floor(g.score) });
  emit('game:combo', { combo: g.combo, multiplier: g.multiplier, frac: 1 });
}

function collectPowerup(pw) {
  const g = game;
  const S = g.S;
  g.runStats.powerups += 1;
  sfx('powerup');
  if (state.settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(30); } catch { /* ignore */ }
  }
  if (pw.kind === 'shield') {
    g.player.shield = true;
    floatText(pw.x, pw.y - 20 * S, '🛡️ ESCUDO', COLORS.green, 18);
    emit('game:powerup', { kind: 'shield' });
  } else {
    g.x2Timer = X2_DURATION;
    floatText(pw.x, pw.y - 20 * S, '⚡ PONTOS x2', COLORS.yellow, 18);
    emit('game:powerup', { kind: 'x2', duration: X2_DURATION });
  }
  ring(pw.x, pw.y, pw.kind === 'shield' ? COLORS.green : COLORS.yellow, 14, 240);
}

// ---------------------------------------------------------
//  Renderização
// ---------------------------------------------------------
export function render(time) {
  const g = game;
  const ctx = g.ctx;
  if (!ctx) return;

  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  const off = shakeOffset(g.reduceMotion);
  ctx.translate(off.x, off.y);

  drawBackdrop(ctx, time);

  const inRun = g.mode === 'playing' || g.mode === 'paused' || g.mode === 'gameover';
  if (inRun && g.player) {
    for (const pk of g.pickups) drawPickup(ctx, pk, time, g.reduceMotion);
    for (const pw of g.powerups) drawPowerup(ctx, pw, time, g.reduceMotion);
    for (const o of g.obstacles) drawObstacle(ctx, o);
    drawPlayer(ctx, g.player, time, g.reduceMotion);
    drawParticles(ctx);
    drawTexts(ctx);
  } else {
    // menu: partículas decorativas continuam vivas
    drawParticles(ctx);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawBackdrop(ctx, time) {
  const g = game;
  ctx.fillStyle = g.bgGradient || '#05060f';
  ctx.fillRect(-20, -20, g.W + 40, g.H + 40);

  // grade neon em movimento (paralaxe)
  const spacing = 64 * g.S;
  const offset = g.bgOffset % spacing;
  ctx.lineWidth = 1;
  for (let y = offset - spacing; y < g.H + spacing; y += spacing) {
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.07)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(g.W, y);
    ctx.stroke();
  }
  const vSpacing = 90 * g.S;
  for (let x = 0; x < g.W + vSpacing; x += vSpacing) {
    ctx.strokeStyle = 'rgba(255, 61, 240, 0.05)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, g.H);
    ctx.stroke();
  }

  // estrelas
  ctx.fillStyle = '#ffffff';
  for (const s of g.stars) {
    ctx.globalAlpha = s.a;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // pulsos ambientes (usados no menu; discretos durante o jogo)
  const alpha = g.mode === 'menu' || g.mode === 'gameover' ? 0.5 : 0.16;
  for (const a of g.ambient) {
    const pulse = g.reduceMotion ? 1 : 1 + Math.sin(a.t * 2) * 0.2;
    ctx.globalAlpha = alpha;
    ctx.shadowColor = a.color;
    ctx.shadowBlur = g.reduceMotion ? 0 : 14;
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // vinheta suave nas bordas
  const vg = ctx.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.42, g.W / 2, g.H / 2, Math.max(g.W, g.H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, g.W, g.H);
}
