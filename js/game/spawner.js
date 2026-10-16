/* =========================================================
   Spawner — geração de obstáculos/pulsos/power-ups
   e curva de dificuldade progressiva (equilibrada)
   ========================================================= */

import { createObstacle, createPickup, createPowerup } from './entities.js';

const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------
   RNG injetável (padrão Math.random).
   Para o "desafio com semente" (Corrida do Dia) o jogo chama
   setSpawnerRng(mulberry32(seed)) antes de começar: a mesma
   semente gera EXATAMENTE a mesma sequência de obstáculos,
   pulsos e power-ups em qualquer aparelho (ver net/rng.js).
   setSpawnerRng(null) volta ao Math.random normal.
--------------------------------------------------------- */
let rng = Math.random;
export function setSpawnerRng(fn) {
  rng = typeof fn === 'function' ? fn : Math.random;
}

const rand = (a, b) => a + rng() * (b - a);

/**
 * Parâmetros de dificuldade conforme o tempo de jogo.
 * Curva em 2 fases (ritmo desde o 1º minuto, sem sobressalto):
 *  - 0→15s:  rampa ACELERADA (0,95→0,64s entre obstáculos; aos 10 s
 *            já está em ≤0,75 s — a partida "pega o groove" cedo)
 *  - 15→75s: progressão longa até o platô intenso (0,42s)
 * O resultado é contínuo na virada (pa=1 e pb=0 se encontram) e
 * monotônico — testado em smoke.mjs (Etapa F).
 * @param {number} elapsed segundos de partida
 * @param {boolean} easy modo tutorial
 */
export function difficultyParams(elapsed, easy = false) {
  const A = 15;                                       // ponto de virada da rampa
  const pa = Math.min(elapsed / A, 1);                // fase rápida 0→1
  const pb = Math.max(0, Math.min((elapsed - A) / (75 - A), 1)); // fase longa 0→1
  let speedMul = lerp(lerp(1, 1.38, pa), 1.9, pb);    // 100% → 138% em 15s → 190%
  let interval = lerp(lerp(0.95, 0.64, pa), 0.42, pb);// 0,95s → 0,64s → 0,42s
  let doubleChance = lerp(0, 0.45, Math.max(0, (elapsed - 25) / 60));
  if (easy) {                                          // tutorial: bem mais leve
    speedMul *= 0.8;
    interval *= 1.9;
    doubleChance = 0;
  }
  return { speedMul, interval, doubleChance };
}

/**
 * Cria 1 ou 2 obstáculos no topo, garantindo uma janela de desvio
 * sempre maior que o dobro do jogador (nunca "parede impossível").
 * @param {any} g estado do jogo
 */
export function spawnObstacles(g, params) {
  const { W, S } = g;
  const margin = 30 * S;
  const minGap = 120 * S;                    // janela mínima de desvio
  const count = rng() < params.doubleChance ? 2 : 1;
  const vy = 260 * S * params.speedMul * rand(0.92, 1.12);

  let lastX = g.lastSpawnX;
  for (let i = 0; i < count; i++) {
    const type = rng() < 0.3 ? 'drone' : 'bar';
    let x = rand(margin, W - margin);

    // evita sobrepor o spawn anterior (mantém corredor livre)
    if (lastX !== null && Math.abs(x - lastX) < minGap) {
      x = lastX + (x >= lastX ? minGap : -minGap);
      x = Math.max(margin, Math.min(W - margin, x));
    }
    // se ainda inviável, inverte o lado
    if (lastX !== null && Math.abs(x - lastX) < minGap * 0.7) {
      x = W - x;
    }

    g.obstacles.push(createObstacle(type, x, -40 * S, S, vy, rng));
    lastX = x;
  }
  g.lastSpawnX = lastX;
}

/** Onda de pulsos: 1 solitário, arco de 3 ou fileira de 2-3. */
export function spawnPickupWave(g) {
  const { W, S } = g;
  const margin = 40 * S;
  const roll = rng();
  const x = rand(margin, W - margin);

  if (roll < 0.35 && x > margin + 60 * S && x < W - margin - 60 * S) {
    // arco suave de 3
    const dir = rng() < 0.5 ? 1 : -1;
    for (let i = -1; i <= 1; i++) {
      g.pickups.push(createPickup(x + i * 46 * S, -40 * S - Math.abs(i) * 26 * S + dir * 0, S, rng));
    }
  } else if (roll < 0.6) {
    // fileira horizontal de 2
    const gap = 60 * S;
    g.pickups.push(createPickup(x, -40 * S, S, rng));
    const x2 = Math.max(margin, Math.min(W - margin, x + (rng() < 0.5 ? gap : -gap)));
    g.pickups.push(createPickup(x2, -40 * S, S, rng));
  } else {
    g.pickups.push(createPickup(x, -40 * S, S, rng));
  }
}

/** Power-up raro: escudo ou dobra-pontos. */
export function spawnPowerup(g) {
  const { W, S } = g;
  const margin = 46 * S;
  const kind = rng() < 0.5 ? 'shield' : 'x2';
  g.powerups.push(createPowerup(kind, rand(margin, W - margin), -46 * S, S));
}

/* ---------------------------------------------------------
   Próximos intervalos de spawn — TODOS pelo rng do spawner.
   Assim a Corrida do Dia (semente) também reproduz o TIMING
   em qualquer aparelho; sem semente continua Math.random.
--------------------------------------------------------- */
/** Jitter do obstáculo (±15% do intervalo da curva). */
export function nextSpawnTimer(interval) {
  return interval * rand(0.85, 1.15);
}

/**
 * Cadência dos pulsos: 0,7–1,0 s nos 10 s iniciais (ritmo imediato),
 * depois 1,0–1,7 s. A densidade se ajusta à ÁREA da tela (tela grande
 * ganha mais pulsos, tela pequena respira) — EXCETO na Corrida do Dia,
 * onde o fator de área fica em 1 para valer a regra sagrada:
 * mesma semente ⇒ mesma cadência em qualquer aparelho.
 * @param {any} g estado do jogo (lê elapsed, W, H e runSeed)
 */
export function nextPickupTimer(g) {
  const base = g.elapsed < 10 ? rand(0.7, 1.0) : rand(1.0, 1.7);
  if (g.runSeed) return base;
  // referência 390x844 = 1,0; clamp 0,85–1,3 (nunca vira nem deserto nem tempestade)
  const area = Math.sqrt(g.W * g.H) / 574;
  return base / Math.max(0.85, Math.min(1.3, area));
}

/** Power-up: 14–22 s (mesmo comportamento antigo, agora com o rng da semente). */
export function nextPowerTimer() {
  return rand(14, 22);
}

export function resetSpawner(g) {
  g.lastSpawnX = null;
  g.spawnTimer = 1.4;               // 1ª barreira respira (antes era 0,8s — sobressalto)
  g.pickupTimer = 0.4;              // 1º pulsos chegam logo (feedback rápido)
  g.powerTimer = rand(10, 14);
}
