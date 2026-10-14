/* =========================================================
   RNG COM SEMENTE + SPAWNER DETERMINÍSTICO (node:test)
   Garante que um "desafio com semente" produz EXATAMENTE
   a mesma sequência de obstáculos, pulsos e power-ups.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, seededRng, hashSeed, randInt, chance, pick } from '../net/rng.js';
import {
  setSpawnerRng, difficultyParams, spawnObstacles, spawnPickupWave, spawnPowerup, resetSpawner,
} from '../js/game/spawner.js';

/* ---------------- mulberry32 ---------------- */

test('mulberry32 é determinístico (mesma semente = mesma sequência)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 200 }, () => a());
  const seqB = Array.from({ length: 200 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('mulberry32: sementes diferentes geram sequências diferentes', () => {
  const a = mulberry32(42);
  const b = mulberry32(43);
  const seqA = Array.from({ length: 50 }, () => a());
  const seqB = Array.from({ length: 50 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('valores ficam em [0, 1)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `valor fora do intervalo: ${v}`);
  }
});

test('hashSeed é estável e sensível ao texto', () => {
  assert.equal(hashSeed('2026-10-14'), hashSeed('2026-10-14'));
  assert.notEqual(hashSeed('2026-10-14'), hashSeed('2026-10-15'));
  assert.ok(Number.isInteger(hashSeed('x')) && hashSeed('x') >= 0);
});

test('seededRng aceita texto e número', () => {
  const t1 = seededRng('corrida-do-dia');
  const t2 = seededRng('corrida-do-dia');
  assert.equal(t1(), t2());
  const n = seededRng(2026);
  const m = mulberry32(2026);
  assert.equal(n(), m());
});

test('randInt/chance/pick respeitam o rng injetado', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 100; i++) {
    const v = randInt(rng, 3, 5);
    assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
  }
  const rng2 = mulberry32(5);
  assert.equal(pick(rng2, ['unico']), 'unico');
  const lista = [1, 2, 3, 4];
  assert.ok(lista.includes(pick(rng2, lista)));
  const rng3 = mulberry32(11);
  let truths = 0;
  for (let i = 0; i < 1000; i++) if (chance(rng3, 0.5)) truths++;
  assert.ok(truths > 350 && truths < 650, `chance(0.5) desbalanceado: ${truths}`);
});

/* ---------------- spawner com rng injetado ---------------- */

const mkG = () => ({
  W: 390, H: 844, S: 1,
  obstacles: [], pickups: [], powerups: [],
  lastSpawnX: null, spawnTimer: 0, pickupTimer: 0, powerTimer: 0,
});

/** Sequência de 12 spawns de cada tipo (forma canônica p/ comparação). */
function runSequence(seed) {
  setSpawnerRng(mulberry32(seed));
  const g = mkG();
  resetSpawner(g);
  for (let i = 0; i < 12; i++) {
    spawnObstacles(g, difficultyParams(i * 6));
    spawnPickupWave(g);
    if (i % 4 === 0) spawnPowerup(g);
  }
  setSpawnerRng(null); // restaura o padrão
  return JSON.stringify({
    o: g.obstacles.map((x) => [x.type, +x.x.toFixed(4), +x.vy.toFixed(4), +(x.w || 0).toFixed(4), +(x.phase || 0).toFixed(4), +(x.swayFreq || 0).toFixed(4)]),
    p: g.pickups.map((x) => [+x.x.toFixed(4), +x.t.toFixed(4)]),
    u: g.powerups.map((x) => [x.kind, +x.x.toFixed(4)]),
  });
}

test('spawner: mesma semente = sequência IDÊNTICA de obstáculos/pulsos/power-ups', () => {
  const s1 = runSequence(20261014);
  const s2 = runSequence(20261014);
  assert.equal(s1, s2);
  assert.ok(JSON.parse(s1).o.length > 0, 'a sequência gerou obstáculos');
});

test('spawner: semente diferente = sequência diferente', () => {
  assert.notEqual(runSequence(1), runSequence(2));
});

test('spawner: sem injeção usa Math.random e continua funcionando', () => {
  setSpawnerRng(null);
  const g = mkG();
  resetSpawner(g);
  spawnObstacles(g, difficultyParams(30));
  spawnPickupWave(g);
  spawnPowerup(g);
  assert.ok(g.obstacles.length >= 1 && g.pickups.length >= 1 && g.powerups.length === 1);
});

test('difficultyParams continua puro (não usa rng)', () => {
  const a = difficultyParams(60);
  const b = difficultyParams(60);
  assert.deepEqual(a, b);
  assert.ok(a.speedMul > 1 && a.interval < 0.95);
});
