/* =========================================================
   drops-eventos.test.mjs — testes dos novos drops e eventos
   • determinismo: spawner original idêntico ao snapshot pré-mudanças
   • RNG separado: ligar/desligar flags não muda a sequência original
   • efeitos temporários: ativar/renovar/expire/capa de 3/pausa/limpeza
   • tetos por partida (Cristal, Nova)
   • rota segura dos eventos (500+ sementes)
   • scheduler de eventos (1º após 25 s, intervalos, 1 por vez)
   Roda em Node puro: node --test tests/drops-eventos.test.mjs
   ========================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------
//  Stubs mínimos de navegador (mesmo padrão do smoke.mjs)
// ---------------------------------------------------------
function stubEl(id = '') {
  const el = {
    id, hidden: false, disabled: false, checked: true, value: '70',
    textContent: '', innerHTML: '', dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    children: [], firstChild: null, offsetWidth: 0,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, append() {}, removeChild() {}, remove() {},
    insertAdjacentHTML() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, setPointerCapture() {},
    setAttribute() {}, getAttribute() { return null; }, focus() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    select() {},
  };
  return el;
}
const elements = new Map();
const getEl = (id) => {
  if (!elements.has(id)) elements.set(id, stubEl(id));
  return elements.get(id);
};
const fakeCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') {
      return () => ({ addColorStop() {} });
    }
    if (!(k in t)) t[k] = () => {};
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
const fakeCanvas = stubEl('game-canvas');
fakeCanvas.getContext = () => fakeCtx;

globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false }), open() {},
};
globalThis.document = {
  documentElement: { clientWidth: 1280, clientHeight: 720 },
  visibilityState: 'visible', hidden: false,
  body: stubEl('body'),
  getElementById: (id) => (id === 'game-canvas' ? fakeCanvas : getEl(id)),
  createElement: () => {
    const el = stubEl();
    el.getContext = () => fakeCtx;
    return el;
  },
  createDocumentFragment: () => stubEl('fragment'),
  addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  execCommand() {},
};
globalThis.location = { protocol: 'http:', href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', search: '' };
try { Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {}, share: null }, configurable: true }); } catch { /* nativo */ }
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.confirm = () => true;

// ---------------------------------------------------------
//  Módulos sob teste
// ---------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const {
  setSpawnerRng, spawnObstacles, spawnPickupWave, spawnPowerup,
  difficultyParams, nextSpawnTimer, nextPickupTimer, nextPowerTimer, resetSpawner,
} = await import('../js/game/spawner.js');
const { hashSeed, mulberry32 } = await import('../net/rng.js');
// drops.js/eventos.js entram no próximo commit (arquitetura)

const DT = 1 / 60;

/** Simula a sequência do spawner ORIGINAL (mesma lógica do gerador). */
function simular(seed) {
  setSpawnerRng(mulberry32(hashSeed(seed)));
  const g = {
    W: 390, H: 844, S: 1, runSeed: seed, elapsed: 0,
    obstacles: [], pickups: [], powerups: [],
    spawnTimer: 0, pickupTimer: 0, powerTimer: 0,
  };
  resetSpawner(g);
  const rec = [];
  for (let t = 0; t < 60; t += DT) {
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

test('determinismo: spawner original idêntico ao snapshot pré-mudanças', () => {
  const snapPath = join(HERE, 'fixtures', 'spawner-snapshot.json');
  const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
  for (const [seed, esperado] of Object.entries(snap.seeds)) {
    const obtido = simular(seed);
    assert.deepEqual(obtido, esperado,
      `sequência do spawner divergiu do snapshot para a semente "${seed}"`);
  }
});
