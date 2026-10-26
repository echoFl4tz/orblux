/* =========================================================
   GAME — controlador principal do ORBLUX
   Pontuação, combo, vidas, dificuldade, colisões, render.
   ========================================================= */

import { emit } from '../core/events.js';
import { getAxis, getPointer, resetInput } from '../core/input.js';
import { sfx, getMusicPulse } from '../core/audio.js';
import { state, saveSettings } from '../core/state.js';
import {
  createPlayer, drawPlayer, drawOrbLight, orbLightRadius, drawObstacle, drawPickup, drawPowerup, drawOrbDecor,
  circleRectHit, circlesHit, COLORS,
} from './entities.js';
import { difficultyParams, spawnObstacles, spawnPickupWave, spawnPowerup, resetSpawner, setSpawnerRng, nextSpawnTimer, nextPickupTimer, nextPowerTimer } from './spawner.js';
import { resetDrops, updateDrops, spawnDrop, drawDrops, tryCollectDrop, nextDropTimer, dropsAtivos, setDropsRng, atracaoRaio, fx, velocidadeMul, bonusDreno } from './drops.js';
import { updateEventos, drawEventoOverlay, resetEventos, setEventosRng } from './eventos.js';
import { hashSeed, mulberry32 } from '../../net/rng.js';
import { SCORE, waveForTime, waveBonus } from '../../net/rules.js';
import { equippedLook, skinCollectFx } from './skinrender.js';
import {
  burst, ring, shockwave, floatText, comboText, levelBanner, waveBanner,
  updateParticles, drawParticles, setPoolReducido, setPoolMax,
  updateTexts, drawTexts, addShake, updateShake, shakeOffset, resetFX,
} from './particles.js';
import { tutorial, startTutorial, updateTutorial } from './tutorial.js';
import { THEME, zoneForLevel, tierForRes, rgba } from './theme.js';

// ---------------------------------------------------------
//  Constantes de balanceamento
// ---------------------------------------------------------
const LIVES_START = 3;
const COMBO_WINDOW = 3.5;       // s sem coletar até zerar o combo
const INVULN_TIME = 1.6;        // s de invulnerabilidade após levar dano
const PLAYER_SPEED = 470;       // px/s (antes da escala S)
export const POINTS_PER_LEVEL = 1000;
const X2_DURATION = 8;          // s do power-up dobra-pontos
const MAX_MULT = SCORE.MAX_MULT; // teto do multiplicador (regra espelhada, Fase 2)

// ---------------------------------------------------------
//  Estado do jogo (singleton)
// ---------------------------------------------------------
export const game = {
  mode: 'menu',            // menu | playing | paused | gameover
  W: 0, H: 0, S: 1, dpr: 1,
  canvas: null, ctx: null,

  player: null,
  obstacles: [], pickups: [], powerups: [],
  drops: [], dropFx: {},              // novos drops (camada 1.1.0, drops.js)
  dropCd: {}, dropCounts: {}, dropSemTempo: 0, dropTimer: Infinity,
  lastSpawnX: null,
  spawnTimer: 0, pickupTimer: 0, powerTimer: 0,

  score: 0,
  combo: 0, comboTimer: 0, multiplier: 1,
  lives: LIVES_START, level: 1, wave: 1,
  elapsed: 0, sinceHit: 0,
  x2Timer: 0, reviveUsed: false, moved: false,
  runSeq: 0,                    // contador de corridas (runId p/ contabilidade única)
  runStats: { pickups: 0, maxCombo: 1, powerups: 0, nearMiss: 0, drops: 0, crystals: 0, dropsByKind: {} },

  stars: [], bgOffset: 0,
  bgStatic: null,              // fundo estático offscreen (pintado só no resize)
  bgPrev: null,                // fundo anterior (só durante a troca de zona, A2)
  zoneFadeT: -1,               // segundos do crossfade de zona (-1 = parado)
  zoneIndex: 0, zoneIntensity: 1, gridColor: '#22E4FF',
  rings: [], dustSprite: null, // camadas 2 (anéis) e 3 (poeira) do parallax
  bgFlash: 0,               // flash sutil do fundo ao subir de nível (s)
  danoT: 0,                 // vinheta danger nas bordas ao levar dano (s, §9)
  comboBreakT: 0,           // fundo escurece 15% ao quebrar o combo (s, §9)
  resScale: 1,                 // qualidade adaptativa dos pixels (1 → 0,85 → 0,7)
  qualLock: null,              // trava de qualidade p/ testes (null = adaptativo)
  bloom: null, bloomFrac: 0,   // offscreen do bloom (§11) e fração vigente
  frameAcc: 0, frameN: 0,      // janela p/ medir a duração média dos quadros
  smoothFrames: 0,             // quadros lisos consecutivos (p/ voltar ao topo)
  lastPerf: 0,                 // performance.now() do frame anterior (dt real)
  qualHealFeito: false,        // A8: recuo da sonda já aconteceu nesta sessão
  reduceMotion: false,
};

// ---------------------------------------------------------
//  Setup / resize
// ---------------------------------------------------------
export function initGame(canvas) {
  game.canvas = canvas;
  // canvas ÚNICO e opaco: fundo estático assado num offscreen e pintado com
  // 1 drawImage/quadro. Split em camadas DOM testou pior (~1,5 ms/quadro
  // de compósito software no main thread, ~3 camadas = 55 FPS inatingível).
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
  // teto de devicePixelRatio POR QUALIDADE (auditoria Fase 2):
  // alta ≤3 (nítida, opt-in), média ≤2 (padrão/automática), baixa =1
  // (celular modesto: menos pixels para a GPU preencher)
  const dprMax = state.settings.imageQuality === 'alta' ? 3
    : state.settings.imageQuality === 'baixa' ? 1 : 2;
  g.dpr = Math.min(window.devicePixelRatio || 1, dprMax);
  g.W = w; g.H = h;
  g.canvas.width = Math.round(w * g.dpr * g.resScale);
  g.canvas.height = Math.round(h * g.dpr * g.resScale);
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

// baldes de alfa das camadas de parallax (guia §5): 3 trocas de
// globalAlpha por camada em vez de 1 por estrela
const ALFA_ESTRELA = [0.3, 0.4, 0.5];    // camada 1: 0,3–0,5
const ALFA_POEIRA = [0.2, 0.28, 0.36];   // camada 3: 0,15–0,40

function buildBackdrop() {
  const g = game;
  const area = g.W * g.H;
  const density = state.settings.reduceMotion ? 0.6 : 1;

  // estrelas da camada 1 (distantes, 1–2 px) e poeira da camada 3
  // (2–5 px, sprite suave). As posições usam Math.random: sorteio
  // VISUAL, separado do spawner — nunca toca na semente da Corrida.
  // Velocidades = base 70 px/s × fator da camada (parallax[i]).
  const mk = (near) => ({
    x: Math.random() * g.W,
    y: Math.random() * g.H,
    r: near ? 2 + Math.random() * 3 : 1 + Math.random() * 1,
    v: near
      ? 70 * THEME.parallax[3] * (0.8 + Math.random() * 0.4)    // 0,70
      : 70 * THEME.parallax[1] * (0.75 + Math.random() * 0.5),  // 0,05
    ab: Math.floor(Math.random() * 3),
    near,
  });
  const nearCount = Math.max(8, Math.min(26, Math.round(area / 52000 * density)));
  const farCount = Math.max(16, Math.min(60, Math.round(area / 14000 * density)));
  g.stars = [];
  for (let i = 0; i < nearCount; i++) g.stars.push(mk(true));
  for (let i = 0; i < farCount; i++) g.stars.push(mk(false));

  // camada 2 — anéis do túnel / linhas de velocidade (guia §5)
  g.rings = [];
  const aneis = 5;
  for (let i = 0; i < aneis; i++) {
    g.rings.push({
      y: (i / aneis) * g.H + Math.random() * (g.H / aneis) * 0.6,
      rx: g.W * (0.45 + Math.random() * 0.3),
      ry: 4 + Math.random() * 8,
      a: 0.10 + Math.random() * 0.15,   // guia: 0,10–0,25
    });
  }

  // sprite suave da poeira (1 drawImage por ponto, sem blur por quadro)
  if (!g.dustSprite) {
    const c = document.createElement('canvas');
    if (c.getContext) {
      c.width = 16; c.height = 16;
      const sx = c.getContext('2d');
      const gr = sx.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      sx.fillStyle = gr;
      sx.fillRect(0, 0, 16, 16);
      g.dustSprite = c;
    }
  }

  // zona de cor do nível atual (guia §3): só a zona atual fica em
  // memória; a anterior só existe durante o crossfade de 1,5 s
  const zi = zoneForLevel(g.level);
  g.zoneIndex = zi.index;
  g.zoneIntensity = zi.intensity;
  g.gridColor = zi.zone.grid;
  g.bgPrev = null;
  g.zoneFadeT = -1;
  g.bgStatic = prerender((ctx, w, h) => paintZone(ctx, w, h, zi), g.dpr * g.resScale);
}

/** Offscreen do bloom (§11): 1/4 (Alto) ou 1/6 (Médio) da resolução
 *  do canvas principal; recriado só quando o tamanho muda. */
function ensureBloom(frac) {
  const g = game;
  const w = Math.max(2, Math.round(g.canvas.width * frac));
  const h = Math.max(2, Math.round(g.canvas.height * frac));
  if (!g.bloom) {
    const c = document.createElement('canvas');
    if (!c.getContext) return null;
    g.bloom = c;
  }
  if (g.bloom.width !== w || g.bloom.height !== h) { g.bloom.width = w; g.bloom.height = h; }
  return g.bloom;
}

/** Pinta o fundo de uma zona (guia §3): degradê bgTop→bgBottom, glow
 *  do horizonte e névoa na cor da zona, vinheta e verticais da grade.
 *  Opacidades limitadas: cenário nunca passa de 35% da luz dos objetos. */
function paintZone(ctx, w, h, zi) {
  const z = zi.zone;
  const i = zi.intensity;   // +15% por ciclo após o nível 12 (teto 1,6)

  // degradé do fundo (1x por resize — a vinheta sozinha custava ~7,8 ms/quadro)
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, z.bgTop);
  grad.addColorStop(0.6, z.bgBottom);
  grad.addColorStop(1, z.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // glow do horizonte tingido pela névoa da zona
  const hz = h * 0.45;
  const glow = ctx.createLinearGradient(0, hz - h * 0.14, 0, hz + h * 0.12);
  glow.addColorStop(0, rgba(z.nebula, 0));
  glow.addColorStop(0.5, rgba(z.nebula, Math.min(0.13, 0.10 * i)));
  glow.addColorStop(1, rgba(z.nebula, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, hz - h * 0.14, w, h * 0.26);

  // névoa: manchas largas na cor da zona (≤ 0,18 com a intensidade)
  const blobs = [
    { x: w * 0.2, y: h * 0.26, r: Math.max(w, h) * 0.5, a: 0.13 },
    { x: w * 0.85, y: h * 0.56, r: Math.max(w, h) * 0.46, a: 0.12 },
    { x: w * 0.5, y: h * 0.94, r: Math.max(w, h) * 0.5, a: 0.10 },
  ];
  for (const b of blobs) {
    const fog = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    fog.addColorStop(0, rgba(z.nebula, Math.min(0.18, b.a * i)));
    fog.addColorStop(1, rgba(z.nebula, 0));
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);
  }

  // vinheta — desligada no tier Baixo (§11: vinheta não)
  if (tierForRes(game.resScale) !== 'low') {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  // verticais da grade na cor da zona (estáticas; as horizontais rolam)
  const horizon = h * 0.45;
  const cx = w / 2;
  ctx.strokeStyle = rgba(z.grid, Math.min(0.11, 0.08 * i));
  ctx.lineWidth = 1;
  ctx.beginPath();
  const cols = 11;
  for (let k = 0; k <= cols; k++) {
    const xb = cx + ((k / cols) - 0.5) * w * 1.7;
    const xt = cx + (xb - cx) * 0.05;
    ctx.moveTo(xt, horizon);
    ctx.lineTo(xb, h);
  }
  ctx.stroke();
}

/** Cria um canvas offscreen na escala de pixels pedida e desenha nele. */
function prerender(paint, px) {
  const g = game;
  const c = document.createElement('canvas');
  if (!c.getContext) return null; // ambiente sem canvas (testes/sem DOM)
  c.width = Math.max(1, Math.round(g.W * px));
  c.height = Math.max(1, Math.round(g.H * px));
  const ctx = c.getContext('2d');
  ctx.scale(px, px);
  paint(ctx, g.W, g.H);
  return c;
}

// ---------------------------------------------------------
//  Fluxo de partida
// ---------------------------------------------------------
/** @param {{tutorial?:boolean}} opts */
export function startGame(opts = {}) {
  const g = game;
  const r = 15 * g.S;

  g.player = createPlayer(g.W / 2, g.H * 0.72, r);
  g.obstacles.length = 0;
  g.pickups.length = 0;
  g.powerups.length = 0;
  g.score = 0;                       // pontuação SEMPRE do zero (sem bônus de missão)
  g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
  g.lives = LIVES_START;
  g.level = Math.floor(g.score / POINTS_PER_LEVEL) + 1;
  g.wave = 1;
  g.elapsed = 0; g.sinceHit = 0;
  g.x2Timer = 0; g.reviveUsed = false; g.moved = false;
  g.runSeq += 1;                // corrida nova = id novo (contabilidade em run-flow.js)
  g.runStats = { pickups: 0, maxCombo: 1, powerups: 0, nearMiss: 0, drops: 0, crystals: 0, dropsByKind: {} };
  // Corrida do Dia: mesma semente ⇒ MESMA sequência de obstáculos para
  // todo mundo (net/rng.js). Sem semente = Math.random (partida normal).
  g.runSeed = opts.seed != null ? String(opts.seed).slice(0, 40) : null;
  setSpawnerRng(g.runSeed != null ? mulberry32(hashSeed(g.runSeed)) : null);
  resetSpawner(g);
  setDropsRng(g.runSeed);              // rng próprio dos drops (null = Math.random)
  resetDrops(g);                       // camada nova zera (desligada em corrida do dia)
  setEventosRng(g.runSeed);            // rng próprio dos eventos (null = Math.random)
  resetEventos(g);                     // agendador zera (desligado em corrida do dia)
  resetFX();
  resetInput();
  g.mode = 'playing';

  if (opts.tutorial) startTutorial();

  emit('game:start', { tutorial: !!opts.tutorial });
  emit('game:score', { score: g.score });
  emit('game:lives', { lives: g.lives });
  emit('game:combo', { combo: 0, multiplier: 1, frac: 0 });
  emit('game:level', { level: g.level });
  emit('game:wave', { wave: g.wave, bonus: 0 });
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

/**
 * Sai da partida e volta ao estado de menu, zerando TUDO o que pertence à
 * partida (entidades, efeitos, shake, combo, spawner e input). Chamado por
 * returnToMenu() (screens.js) em qualquer caminho que leve ao menu — inclusive
 * a partir de 'gameover', onde antes o estado ficava congelado e o canvas
 * continuava desenhando a partida atrás do menu.
 */
export function quitToMenu() {
  const g = game;
  g.mode = 'menu';
  g.obstacles.length = 0;
  g.pickups.length = 0;
  g.powerups.length = 0;
  g.player = null;                 // garante que render() nunca redesenhe a partida no menu
  g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
  g.x2Timer = 0;
  g.wave = 1;
  g.reviveUsed = false;
  g.bgFlash = 0;
  g.runSeed = null;               // esquece a semente da corrida do dia
  setSpawnerRng(null);            // volta ao Math.random das partidas normais
  setDropsRng(null);              // rng dos drops também volta ao Math.random
  setEventosRng(null);
  resetSpawner(g);                 // zera timers/spawn da última partida
  resetDrops(g);                   // limpa drops/efeitos da partida anterior
  resetEventos(g);                 // limpa evento ativo e mods vigentes
  resetFX();                       // remove partículas, textos, ondas e shake da morte
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
  addShake(17);
  emit('game:over', {
    score: Math.floor(g.score),
    elapsed: g.elapsed,
    pickups: g.runStats.pickups,
    maxCombo: g.runStats.maxCombo,
    level: g.level,
    wave: g.wave,
    nearMiss: g.runStats.nearMiss,
    powerups: g.runStats.powerups,
    drops: g.runStats.drops,            // novos drops coletados (stats/conquistas)
    dropsByKind: g.runStats.dropsByKind,
    crystals: g.runStats.crystals,      // Cristal vira +3 moedas cada (main.js)
    events: g.runStats.events,          // eventos completados (stats/conquistas)
    eventsClean: g.runStats.eventsClean,
    revived: g.reviveUsed,
    seed: g.runSeed || null,          // Corrida do Dia: semente usada (null = normal)
    runId: g.runSeq,                  // identificador da corrida (contabilidade única)
    revivePossible: !g.reviveUsed,    // ainda dá para reviver? (1ª morte = painel de revive)
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
/** Resolução mínima da qualidade adaptativa (55% dos pixels). */
const RES_MIN = 0.55;

/** Escalas das opções manuais de qualidade (Configurações → Imagem). */
const QUAL_ESCALA = { alta: 1, media: 0.7, baixa: 0.55 };

export function update(dt) {
  const g = game;

  // qualidade adaptativa (Fase 1): se a duração média dos quadros passar
  // de ~18 ms por 60 quadros (abaixo de ~55 FPS), reduz a resolução
  // interna um passo; só volta ao topo depois de ~10 s lisos (~59+ FPS).
  // Faixa morta [17 ms, 18 ms] evita oscilar entre os passos.
  // Afeta SÓ os pixels do canvas — lógica, hitbox e pontuação não mudam.
  // Trava de qualidade (testes/perf, §11): OX.game.qualLock = escala
  // fixa desliga a adaptação automática — a suíte mede cada tier isolado.
  if (g.qualLock != null) {
    if (g.resScale !== g.qualLock) { g.resScale = g.qualLock; resize(); }
  } else {
    const alvoManual = QUAL_ESCALA[state.settings.imageQuality];
    if (alvoManual != null) {
      // qualidade manual (Configurações → Imagem, A7/HD): escala
      // travada na escolha do jogador — inclusive em partida, pois é
      // decisão dele; o §11 regula só a adaptação automática.
      if (g.resScale !== alvoManual) { g.resScale = alvoManual; resize(); }
    } else {
      // dt REAL entre frames (o loop corta em 50 ms, então o dt
      // recebido mentiria em aba oculta): quadros > 0,75 s (janela
      // coberta a ~1 Hz, aba suspensa) não entram na média — sem
      // isso, trocar de aba derrubava o HD de 100% para 55% em
      // segundos. Pausa de GC longa conta no teto de 50 ms.
      const agora = performance.now();
      const cru = g.lastPerf > 0 ? (agora - g.lastPerf) / 1000 : dt;
      g.lastPerf = agora;
      if (cru <= 0.75) { g.frameAcc += Math.min(cru, 0.05); g.frameN++; }
      if (g.frameN >= 60) {
        const avg = g.frameAcc / g.frameN;
        g.frameAcc = 0; g.frameN = 0;
        // A8: a sonda errou e o aparelho não aguenta a Alta em partida?
        // Uma única vez por sessão, recua para Automático (persistido
        // como 'healada' — a sonda não semeia de novo) e a adaptação
        // assume. Escolha manual do jogador ('usuario') intocável.
        if (state.settings.imageQualitySeed === 'sonda' && !g.qualHealFeito
            && g.mode === 'playing' && avg > 0.030) {
          state.settings.imageQuality = 'auto';
          state.settings.imageQualitySeed = 'healada';
          saveSettings();
          g.qualHealFeito = true;
        }
        if (avg > 0.0180 && g.resScale > RES_MIN) {
          g.resScale = Math.max(RES_MIN, Math.round((g.resScale - 0.15) * 100) / 100);
          g.smoothFrames = 0;
          resize();
        } else if (avg < 0.0170 && g.mode !== 'playing') {
          // §11: a qualidade NUNCA sobe sozinha durante a partida
          g.smoothFrames += 60;
          if (g.smoothFrames >= 600 && g.resScale < 1) {
            g.resScale = Math.min(1, Math.round((g.resScale + 0.15) * 100) / 100);
            g.smoothFrames = 0;
            resize();
          }
        } else {
          g.smoothFrames = 0;
        }
      }
    }
  }

  // fundo e efeitos continuam animando em qualquer tela
  // zonas de cor por nível (A2): crossfade de 1,5 s sobre o pré-render
  const zi = zoneForLevel(g.level);
  if (zi.index !== g.zoneIndex) {
    g.bgPrev = g.bgStatic;                    // fundo antigo sobe por baixo
    g.zoneIndex = zi.index;
    g.zoneIntensity = zi.intensity;
    g.gridColor = zi.zone.grid;
    // novo fundo pronto ANTES do fade (sem "piscar" no meio da troca)
    g.bgStatic = prerender((c, w, h) => paintZone(c, w, h, zi), g.dpr * g.resScale);
    g.zoneFadeT = 0;
  }
  if (g.zoneFadeT >= 0) {
    g.zoneFadeT += dt;
    if (g.zoneFadeT >= THEME.time.zone / 1000) { g.zoneFadeT = -1; g.bgPrev = null; }
  }

  // paralaxe: velFator do nível (guia §5) e 30% da velocidade com
  // movimento reduzido (o guia manda reduzir, não congelar)
  const velFator = THEME.speedFactor(g.level) * (g.reduceMotion ? 0.3 : 1);
  g.bgOffset += dt * 70 * g.S * velFator;
  if (g.bgFlash > 0) g.bgFlash = Math.max(0, g.bgFlash - dt);
  if (g.danoT > 0) g.danoT = Math.max(0, g.danoT - dt);
  if (g.comboBreakT > 0) g.comboBreakT = Math.max(0, g.comboBreakT - dt);
  setPoolReducido(g.reduceMotion);   // teto de partículas com mov. reduzido (§9)
  // §11: teto de partículas do tier (220/120/40); "reduzir movimento"
  // mantém o piso de 40 do guia §9
  setPoolMax(g.reduceMotion ? 40 : THEME.quality[tierForRes(g.resScale)].particles);
  for (const s of g.stars) {
    s.y += s.v * dt * velFator;
    if (s.y > g.H) { s.y = -4; s.x = Math.random() * g.W; }
  }
  for (const r of g.rings) {
    r.y += dt * 70 * THEME.parallax[2] * velFator;   // camada 2: 0,25
    if (r.y - r.ry > g.H) {
      r.y = -r.ry;
      r.rx = g.W * (0.45 + Math.random() * 0.3);
    }
  }
  updateParticles(dt);
  updateTexts(dt);
  updateShake(dt);

  if (g.mode !== 'playing') return;

  const S = g.S;
  g.elapsed += dt;
  g.sinceHit += dt;
  updateTutorial(g);

  // ---------- ondas (Fase 2: determinísticas, só pelo tempo decorrido) ----------
  const wv = waveForTime(g.elapsed);
  if (wv > g.wave) {
    g.wave = wv;
    const bonus = waveBonus(wv);
    g.score += bonus;
    sfx('level');
    waveBanner(wv, g.W, g.H, g.reduceMotion);
    if (bonus > 0) floatText(g.W / 2, g.H * 0.24, `+${bonus} ONDA`, COLORS.cyan, 17);
    emit('game:wave', { wave: wv, bonus });
    emit('game:score', { score: Math.floor(g.score) });
  }

  // ---------- dificuldade ----------
  const dp = difficultyParams(g.elapsed, tutorial.active);

  // ---------- jogador ----------
  const p = g.player;
  const speed = PLAYER_SPEED * S * velocidadeMul(g);   // Turbo: +35% por 5 s
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
    if (p.trail.length > 16) p.trail.shift();   // rastro mais longo
  } else p.trail.length = 0;

  // ---------- spawn ----------
  // Todos os jitters passam pelo rng do spawner (Corrida do Dia
  // reproduz o timing em qualquer aparelho; sem semente = Math.random)
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawnObstacles(g, dp);
    // eventoMod: obstMul rara a cadência de barreiras (fallback = original)
    g.spawnTimer = nextSpawnTimer(dp.interval * (g.eventoMod?.obstMul || 1));
  }
  g.pickupTimer -= dt;
  if (g.pickupTimer <= 0) {
    spawnPickupWave(g);
    g.pickupTimer = nextPickupTimer(g);
  }
  g.powerTimer -= dt;
  if (g.powerTimer <= 0) {
    spawnPowerup(g);
    g.powerTimer = nextPowerTimer();
  }
  // drops novos (1.1.0): timer/prng próprios — não toca no spawner legado
  g.dropTimer -= dt;
  if (g.dropTimer <= 0) {
    spawnDrop(g);
    g.dropTimer = dropsAtivos(g) ? nextDropTimer() : Infinity;
  }

  // ---------- mover objetos ----------
  // Câmara lenta (drop tempo, 1.1.0): mundo a 70%; jogador/pontuação intactos
  const lento = fx(g, 'tempo') > 0 ? 0.7 : 1;
  for (const o of g.obstacles) {
    o.y += o.vy * dt * lento;
    if (o.type === 'drone') {
      o.t += dt * lento;
      o.x = o.baseX + Math.sin(o.t * o.swayFreq) * o.swayAmp;
      o.x = Math.max(o.r, Math.min(g.W - o.r, o.x));
    }
  }
  // Ímã (1.1.0): enquanto ativo, pulsos no raio são puxados ao jogador
  const imaR = atracaoRaio(g);
  for (let i = 0; i < g.pickups.length; i++) {
    const pk = g.pickups[i];
    pk.y += pk.vy * dt * lento;
    if (imaR > 0) {
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const dist = Math.hypot(dx, dy);
      if (dist < imaR && dist > 1) {
        const pull = Math.min(380 * S * dt, dist);
        pk.x += (dx / dist) * pull;
        pk.y += (dy / dist) * pull * 0.85;
      }
    }
  }
  for (const pw of g.powerups) pw.y += pw.vy * dt * lento;

  // ---------- colisões ----------
  const pr = p.r * 0.82; // hitbox generosa (jogo justo)
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i];
    if (o.y > g.H + 60 * S) { g.obstacles.splice(i, 1); continue; }
    const hit = o.type === 'bar'
      ? circleRectHit(p.x, p.y, pr, o.x, o.y, o.w, o.h)
      : circlesHit(p.x, p.y, pr, o.x, o.y, o.r * 0.85);

    // ---------- quase-colidir (near miss, Fase 2) ----------
    // Desvio apertado paga um bônus fixo, 1× por obstáculo, só por
    // PROXIMIDADE — não mexe em hitbox nem em cadência, só soma pontos.
    if (!hit && !o.nearDone) {
      const or = o.type === 'bar' ? Math.hypot(o.w, o.h) / 2 : o.r;
      if (Math.hypot(p.x - o.x, p.y - o.y) <= p.r + or + SCORE.NEAR_GAP * S) {
        nearMiss(o);
      }
    }

    // Fase (1.1.0): enquanto ativa, atravesca obstáculos sem levar dano
    if (!hit || p.invuln > 0 || fx(g, 'fantasma') > 0) continue;

    if (p.shield) {
      p.shield = false;
      p.invuln = 1.0;               // janela de reação justa após o escudo quebrar
      g.obstacles.splice(i, 1);
      sfx('shield');
      ring(p.x, p.y, COLORS.green, 16, 280);
      if (!g.reduceMotion) shockwave(p.x, p.y, COLORS.green, 130 * S); // onda de choque
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

  tryCollectDrop(g, p);            // colisão dos novos drops (drops.js)

  // ---------- combo / x2 / nível ----------
  // Trava de combo (drop combo, 1.1.0): congela o cronômetro enquanto ativa
  if (g.comboTimer > 0 && fx(g, 'combo') === 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) {
      if (g.combo >= 3) g.comboBreakT = 0.35;  // fundo escurece 350 ms (§9)
      g.combo = 0;
      g.multiplier = 1;
      emit('game:combo', { combo: 0, multiplier: 1, frac: 0 });
    }
  }
  if (g.x2Timer > 0) {
    g.x2Timer -= dt;
    if (g.x2Timer <= 0) emit('game:powerup:end', { kind: 'x2' });
  }
  updateDrops(g, dt);              // efeitos temporários + queda dos drops
  updateEventos(g, dt);            // scheduler de eventos (pausa congela junto)
  const newLevel = Math.floor(g.score / POINTS_PER_LEVEL) + 1;
  if (newLevel > g.level) {
    g.level = newLevel;
    sfx('level');
    emit('game:level', { level: g.level });
    // juice: faixa "NÍVEL N" cruzando a tela + flash discreto do fundo
    levelBanner(g.level, g.W, g.H, g.reduceMotion);
    if (podeFlash(g)) g.bgFlash = 0.8;   // teto de 3 flashes/s (§9)
    burst(p.x, p.y, COLORS.yellow, 18, 260, 3);
  }

  // barra de tempo do combo (HUD)
  if (g.combo > 0) {
    emit('game:combo', {
      combo: g.combo, multiplier: g.multiplier,
      frac: Math.max(0, g.comboTimer / (g.eventoMod?.comboWindow || COMBO_WINDOW)),
    });
  }
}

/** Near miss (Fase 2): bônus por passar colado sem bater — 1× por obstáculo. */
function nearMiss(o) {
  const g = game;
  o.nearDone = true;
  g.runStats.nearMiss += 1;
  g.score += SCORE.NEAR_MISS;
  sfx('pickup', { combo: 0 });            // som discreto (pitch baixo do arco)
  floatText(o.x, o.y - 10 * g.S, `QUASE! +${SCORE.NEAR_MISS}`, COLORS.yellow, 14);
  if (!g.reduceMotion) ring(o.x, o.y, COLORS.yellow, 8, 130);   // lampejo gold (§9)
  emit('game:score', { score: Math.floor(g.score) });
}

/** Teto de flashes do guia (§9): nunca mais de 3 flashes por segundo. */
function podeFlash(g) {
  const agora = performance.now();
  g.flashes = (g.flashes || []).filter((t) => agora - t < 1000);
  if (g.flashes.length >= 3) return false;
  g.flashes.push(agora);
  return true;
}

function onHit() {
  const g = game;
  const p = g.player;
  if (g.evento) g.eventoHouveBatida = true;   // "sem arranhão" (tempestade)
  p.invuln = INVULN_TIME;
  g.lives -= 1;
  if (g.combo >= 3) g.comboBreakT = 0.35; // fundo escurece ao quebrar (§9)
  g.combo = 0; g.comboTimer = 0; g.multiplier = 1;
  g.sinceHit = 0;
  sfx('hit');
  addShake(16);                         // tremor mais forte (sensível a mov. reduzido)
  g.danoT = 0.35;                       // vinheta danger nas bordas 350 ms (§9)
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
  g.comboTimer = g.eventoMod?.comboWindow || COMBO_WINDOW;  // Frenesi estende a janela
  const prevMult = g.multiplier;
  g.multiplier = Math.min(MAX_MULT, 1 + Math.floor(g.combo / 4));
  // Hora Dourada multiplica só a coleta (goldMul), nunca os bônus fixos
  // (o +12 do Dreno entra depois da multiplicação, como o x2)
  const points = Math.round(SCORE.PICKUP * g.multiplier
    * (g.x2Timer > 0 ? SCORE.X2_FACTOR : 1) * (g.eventoMod?.goldMul || 1)) + bonusDreno(g);
  g.score += points;
  g.runStats.pickups += 1;
  g.runStats.maxCombo = Math.max(g.runStats.maxCombo, g.multiplier);

  sfx('pickup', { combo: g.combo });
  // coleta: efeito da skin equipada (pool fixo de partículas; menos com mov. reduzido)
  skinCollectFx(pk.x, pk.y, equippedLook(), g.reduceMotion);
  floatText(pk.x, pk.y - 14 * S, `+${points}`, g.x2Timer > 0 ? COLORS.yellow : COLORS.cyan, 15 + g.multiplier);
  if (!g.reduceMotion) ring(pk.x, pk.y, COLORS.cyan, 10, 150);   // anel de onda (§9)

  if (g.multiplier > prevMult) {
    sfx('combo');
    // número grande semitransparente ao centro-alto (pulso + fade);
    // cresce com o multiplicador — x5 muito mais impactante que x2
    comboText(g.W / 2, g.H * 0.3, `x${g.multiplier}`, COLORS.yellow, 40 + g.multiplier * 7);
    if (!g.reduceMotion) burst(g.W / 2, g.H * 0.3, COLORS.yellow, 10, 220, 2.4);
    // vibração sutil de recompensa (mesmo ajuste "Vibração" das opções)
    if (state.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(20); } catch { /* ignore */ }
    }
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
    floatText(pw.x, pw.y - 20 * S, 'ESCUDO!', COLORS.green, 18);
    emit('game:powerup', { kind: 'shield' });
  } else {
    g.x2Timer = X2_DURATION;
    floatText(pw.x, pw.y - 20 * S, 'PONTOS x2!', COLORS.yellow, 18);
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

  ctx.setTransform(g.dpr * g.resScale, 0, 0, g.dpr * g.resScale, 0, 0);
  const off = shakeOffset(g.reduceMotion);
  ctx.translate(off.x, off.y);

  drawBackdrop(ctx, time);

  const inRun = g.mode === 'playing' || g.mode === 'paused' || g.mode === 'gameover';
  if (inRun && g.player) {
    for (const pk of g.pickups) drawPickup(ctx, pk, time, g.reduceMotion);
    for (const pw of g.powerups) drawPowerup(ctx, pw, time, g.reduceMotion);
    drawDrops(ctx, g, time);        // glifos dos novos drops (drops.js)
    const contrast = state.settings.highContrast;
    for (const o of g.obstacles) drawObstacle(ctx, o, { contrast, time, reduceMotion: g.reduceMotion });
    if (g.mode !== 'gameover') drawDangerChevrons(ctx);
    drawEventoOverlay(ctx, g, time);   // véu/colunas do evento ativo (sai limpo)
    // Bloom da luz projetada (§11): o "lighter" da orbe roda em
    // resolução fracionária (Alto 1/4, Médio 1/6, Baixo desligado) num
    // offscreen em cache e é esticado com suavização — custo ~16x
    // menor que em resolução cheia e o brilho fica mais "bloom".
    const bloomFrac = THEME.quality[tierForRes(g.resScale)].bloom;
    g.bloomFrac = bloomFrac;
    if (bloomFrac > 0) {
      const bc = ensureBloom(bloomFrac);
      if (bc) {
        const bctx = bc.getContext('2d');
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, bc.width, bc.height);
        // mesmo alinhamento do mundo (inclui o tremor), em escala fracionária
        bctx.setTransform(ctx.getTransform());
        bctx.scale(bloomFrac, bloomFrac);
        drawOrbLight(bctx, g.player, equippedLook(), time);
        // blit só da área do brilho (fora do círculo o offscreen é
        // transparente): mesma imagem, ~20x menos área aditiva copiada —
        // tier Alto estável em 55+ mesmo em máquina fraca. A origem no
        // offscreen segue a matriz do bloom (escala fracionária + tremor),
        // então o recorte fica alinhado ao mundo em qualquer tremor.
        const tr = ctx.getTransform();
        const kb = tr.a * bloomFrac;              // lógico -> px do offscreen
        const lr = orbLightRadius(g.player);
        const gx = g.player.x - lr, gy = g.player.y - lr, gl = 2 * lr;
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(bc, gx * kb + tr.e, gy * kb + tr.f, gl * kb, gl * kb,
          gx, gy, gl, gl);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // Fase (1.1.0): orbe translúcida; pisca suave nos últimos 1,5 s
    const faseResto = fx(g, 'fantasma');
    if (faseResto > 0) {
      ctx.save();
      ctx.globalAlpha = faseResto < 1.5
        ? 0.55 + 0.28 * Math.sin(time / 143)   // ~1,1 Hz: abaixo do teto de flashes
        : 0.55;
      drawPlayer(ctx, g.player, time, g.reduceMotion, equippedLook());
      ctx.restore();
    } else {
      drawPlayer(ctx, g.player, time, g.reduceMotion, equippedLook());
    }
    drawParticles(ctx);
    drawTexts(ctx);
  } else {
    // menu: orbe decorativa grande + pulsos orbitando (atrás do DOM),
    // partículas decorativas continuam vivas
    if (g.mode === 'menu') drawMenuDecor(ctx, time);
    drawParticles(ctx);
    drawTexts(ctx);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Decoração do menu: orbe respirando com anel girando e pulsos em órbita. */
function drawMenuDecor(ctx, time) {
  const g = game;
  const wide = g.W > g.H;
  // no paisagem, a orbe ocupa a faixa vazia de baixo (longe da logo e dos botões)
  const cx = wide ? g.W * 0.62 : g.W / 2;
  const cy = wide ? g.H * 0.9 : g.H * 0.46;
  const R = Math.min(g.W, g.H) * (wide ? 0.0625 : 0.13);
  drawOrbDecor(ctx, cx, cy, R, time, g.reduceMotion, equippedLook());

  const orbitR = R * 2.3;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + (g.reduceMotion ? 0 : time * 0.55);
    const pk = {
      x: cx + Math.cos(a) * orbitR,
      y: cy + Math.sin(a) * orbitR * 0.62,     // órbita achatada p/ retrato
      r: Math.max(7, R * 0.14),
      t: a * 3,
    };
    drawPickup(ctx, pk, time, g.reduceMotion);
  }
}

/**
 * Marcadores de perigo: chevron vermelho na borda superior, na coluna X
 * de cada barra/drone prestes a entrar (~0,6 s de antecedência),
 * desaparecendo quando o objeto entra em cena.
 */
function drawDangerChevrons(ctx) {
  const g = game;
  const LEAD = 0.6; // s de antecedência (limitado pela posição de spawn)
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.red;
  const y = 9 * g.S;
  const s = 7 * g.S;
  for (const o of g.obstacles) {
    const edge = o.type === 'bar' ? o.y : o.y + o.r;
    const cx = o.type === 'bar' ? o.x + o.w / 2 : o.x;
    const limit = -(o.vy * LEAD);
    if (edge >= 0 || edge <= limit) continue;
    // intensifica conforme se aproxima da borda
    ctx.globalAlpha = 0.35 + 0.65 * ((edge - limit) / -limit);
    ctx.beginPath();
    ctx.moveTo(cx - s, y - s * 0.55);
    ctx.lineTo(cx, y + s * 0.55);
    ctx.lineTo(cx + s, y - s * 0.55);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function drawBackdrop(ctx, time) {
  const g = game;
  const camadas = THEME.quality[tierForRes(g.resScale)].layers;

  // fundo da zona (gradiente, névoa, vinheta, verticais) com 1
  // drawImage; esticado 20px além das bordas para cobrir o shake.
  // Durante a troca de zona, o fundo antigo aparece por baixo e o
  // novo entra em 1,5 s (crossfade ≈ inOutSine, guia §3)
  if (g.bgStatic) {
    if (g.bgPrev && g.zoneFadeT >= 0) {
      ctx.globalAlpha = 1;
      ctx.drawImage(g.bgPrev, -20, -20, g.W + 40, g.H + 40);
      const p = Math.min(1, g.zoneFadeT / (THEME.time.zone / 1000));
      ctx.globalAlpha = p * p * (3 - 2 * p);
      ctx.drawImage(g.bgStatic, -20, -20, g.W + 40, g.H + 40);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(g.bgStatic, -20, -20, g.W + 40, g.H + 40);
    }
  } else {
    ctx.fillStyle = THEME.color.bgDeep;
    ctx.fillRect(-20, -20, g.W + 40, g.H + 40);
  }

  // camada 2 — anéis do túnel descendo, tingidos pela grade da zona
  // (camada distante: entra antes de energia/grade/estrelas)
  if (camadas >= 3) {
    ctx.strokeStyle = g.gridColor;
    ctx.lineWidth = 1.2;
    for (const r of g.rings) {
      ctx.globalAlpha = r.a;
      ctx.beginPath();
      ctx.ellipse(g.W / 2, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // fundo reativo: pulso do sequenciador + combo como tinta chapada
  // (calibrada no valor de pico da antiga segunda exposição da névoa)
  let energy = 0;
  if (!g.reduceMotion) {
    energy = Math.min(0.55,
      getMusicPulse() * 0.3 + Math.min(0.28, (g.multiplier - 1) * 0.07 + g.combo * 0.006));
  }
  if (energy > 0.02) {
    ctx.fillStyle = `rgba(96,74,178,${(energy * 0.11).toFixed(3)})`;
    ctx.fillRect(-20, -20, g.W + 40, g.H + 40);
  }

  // grade em perspectiva: só as horizontais rolam aqui (verticais assadas)
  drawPerspectiveGrid(ctx, energy);

  // estrelas (camada 1) em 3 baldes de alfa; poeira próxima (camada 3)
  // com sprite suave, só na qualidade Alta (guia §5: camadas 4/3/2)
  ctx.fillStyle = '#ffffff';
  for (let b = 0; b < 3; b++) {
    ctx.globalAlpha = ALFA_ESTRELA[b];
    for (const s of g.stars) {
      if (!s.near && s.ab === b) ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }
  if (camadas >= 4 && g.dustSprite) {
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = ALFA_POEIRA[b];
      for (const s of g.stars) {
        if (s.near && s.ab === b) {
          const d = s.r * 3;
          ctx.drawImage(g.dustSprite, s.x - d / 2, s.y - d / 2, d, d);
        }
      }
    }
  }
  ctx.globalAlpha = 1;

  // flash sutil do fundo ao subir de nível
  // vinheta de dano (§9): borda danger 0,35 por 350 ms, decai suave
  if (g.danoT > 0) {
    const a = 0.35 * (g.danoT / 0.35);
    const grad = ctx.createRadialGradient(
      g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.45,
      g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.8);
    grad.addColorStop(0, rgba(THEME.color.danger, 0));
    grad.addColorStop(1, rgba(THEME.color.danger, a));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, g.W, g.H);
  }
  // fundo escurece 15% por 350 ms ao quebrar o combo (§9)
  if (g.comboBreakT > 0) {
    ctx.fillStyle = `rgba(0,0,0,${(0.15 * (g.comboBreakT / 0.35)).toFixed(3)})`;
    ctx.fillRect(0, 0, g.W, g.H);
  }

  if (g.bgFlash > 0) {
    ctx.fillStyle = `rgba(255,244,214,${(g.bgFlash * 0.07).toFixed(3)})`;
    ctx.fillRect(0, 0, g.W, g.H);
  }

  // (a vinheta saiu daqui: assada na camada estática — era o maior
  // custo de raster por quadro, ~7,8 ms em software)
}

/** Grade em perspectiva: só as horizontais rolam (as verticais convergentes
 *  são estáticas e vivem na camada #bg-canvas desde o Fase 1 de performance).
 *  Com movimento reduzido rola a 30% da velocidade (guia §9).
 *  @param {number} energy 0..0.55 — pulso da música/combinação (fundo reativo) */
function drawPerspectiveGrid(ctx, energy = 0) {
  const g = game;
  const horizon = g.H * 0.45;
  const boost = 1 + energy * 0.9;
  ctx.lineWidth = 1;

  // horizontais com perspectiva, rolando para baixo (congelar com
  // movimento reduzido virou 30% da velocidade — guia §9)
  const rows = 10;
  const phase = (g.bgOffset * 0.0045) % 1;
  ctx.strokeStyle = rgba(g.gridColor, Math.min(0.22, 0.15 * boost));
  for (let i = 0; i < rows; i++) {
    const t = (i + phase) / rows;
    if (t <= 0.02) continue;
    const y = horizon + Math.pow(t, 2.1) * (g.H - horizon);
    ctx.globalAlpha = Math.min(1, t * 2.4) * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(g.W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
