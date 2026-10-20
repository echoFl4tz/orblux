/* =========================================================
   Gera o snapshot de determinismo do spawner (pré-mudanças).
   Uso: node tests/.gen-spawner-snapshot.mjs
   Grava tests/fixtures/spawner-snapshot.json — o teste de
   determinismo (drops-eventos.test.mjs) compara a sequência
   atual com esse arquivo: flags desligadas = mesma sequência.
   ========================================================= */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setSpawnerRng, spawnObstacles, spawnPickupWave, spawnPowerup,
  difficultyParams, nextSpawnTimer, nextPickupTimer, nextPowerTimer, resetSpawner,
} from '../js/game/spawner.js';
import { hashSeed, mulberry32 } from '../net/rng.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DT = 1 / 60;
const SEEDS = ['snapshot-alpha', 'snapshot-beta', 'snapshot-gamma'];
const SEGUNDOS = 60;

/** Simula a sequência de spawns do spawner ORIGINAL por 60 s. */
function simular(seed) {
  setSpawnerRng(mulberry32(hashSeed(seed)));
  const g = {
    W: 390, H: 844, S: 1, runSeed: seed, elapsed: 0,
    obstacles: [], pickups: [], powerups: [],
    spawnTimer: 0, pickupTimer: 0, powerTimer: 0,
  };
  resetSpawner(g);
  const rec = [];
  for (let t = 0; t < SEGUNDOS; t += DT) {
    const dp = difficultyParams(t, false);
    g.elapsed = t;
    g.spawnTimer -= DT;
    if (g.spawnTimer <= 0) {
      spawnObstacles(g, dp);
      g.spawnTimer = nextSpawnTimer(dp.interval);
      const o = g.obstacles[g.obstacles.length - 1];
      rec.push(['o', +t.toFixed(3), o.type, Math.round(o.x), Math.round(o.vy)]);
    }
    g.pickupTimer -= DT;
    if (g.pickupTimer <= 0) {
      spawnPickupWave(g);
      g.pickupTimer = nextPickupTimer(g);
      const pk = g.pickups[g.pickups.length - 1];
      rec.push(['p', +t.toFixed(3), g.pickups.length, Math.round(pk.x)]);
    }
    g.powerTimer -= DT;
    if (g.powerTimer <= 0) {
      spawnPowerup(g);
      g.powerTimer = nextPowerTimer();
      const w = g.powerups[g.powerups.length - 1];
      rec.push(['w', +t.toFixed(3), w.kind, Math.round(w.x)]);
    }
  }
  return rec;
}

const out = { geradoEm: 'baseline-pre-eventos', dt: DT, segundos: SEGUNDOS, seeds: {} };
for (const s of SEEDS) out.seeds[s] = simular(s);

const dir = join(HERE, 'fixtures');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'spawner-snapshot.json'), JSON.stringify(out));
const total = SEEDS.reduce((n, s) => n + out.seeds[s].length, 0);
console.log(`snapshot ok: ${SEEDS.length} sementes, ${total} eventos de spawn em ${SEGUNDOS}s`);
