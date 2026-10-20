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
const drops = await import('../js/game/drops.js');
const { on } = await import('../js/core/events.js');

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

// ---------------------------------------------------------
//  Estado fake de partida (objeto g puro, sem DOM/canvas)
// ---------------------------------------------------------
function fakeG(extra = {}) {
  return {
    W: 390, H: 844, S: 1, runSeed: null, level: 1, lives: 3, score: 0,
    player: null, obstacles: [], pickups: [], powerups: [],
    drops: [], dropFx: {}, dropCd: {}, dropCounts: {}, dropSemTempo: 0,
    dropTimer: 0, reduceMotion: false,
    runStats: { pickups: 0, maxCombo: 1, powerups: 0, nearMiss: 0, drops: 0, crystals: 0, dropsByKind: {} },
    ...extra,
  };
}

// ---------------------------------------------------------
//  Infraestrutura de drops (cap, expiração, flags, RNG, spawn)
// ---------------------------------------------------------
test('drops: cap de 3 efeitos — renova sem empilhar; novo substitui o mais antigo', () => {
  const g = fakeG();
  const ends = [];
  on('game:powerup:end', ({ kind }) => ends.push(kind));
  drops.ativarFx(g, 'a', 5);
  drops.ativarFx(g, 'b', 5);
  drops.ativarFx(g, 'a', 7);                 // já ativo: renova, não empilha
  assert.equal(Object.keys(g.dropFx).length, 2);
  drops.ativarFx(g, 'c', 4);
  drops.ativarFx(g, 'd', 4);                 // cap atingido: expulsa o mais antigo (b)
  assert.ok(!g.dropFx.b, 'o efeito mais antigo deve expirar');
  assert.equal(Object.keys(g.dropFx).length, 3);
  assert.deepEqual(ends, ['b'], 'expirar deve emitir game:powerup:end');
});

test('drops: updateDrops expira efeitos, cooldowns e zera o chip', () => {
  const g = fakeG({ dropFx: { ima: 0.1 }, dropCd: { surto: 0.05 } });
  const ends = [];
  on('game:powerup:end', ({ kind }) => ends.push(kind));
  drops.updateDrops(g, 0.2);
  assert.deepEqual(ends, ['ima']);
  assert.equal(drops.fx(g, 'ima'), 0);
  assert.ok(!g.dropCd.surto, 'cooldown deve zerar');
  drops.updateDrops(g, 0.1);
  assert.deepEqual(ends, ['ima'], 'sem re-emitir fim de efeito já removido');
});

test('drops: Corrida do Dia força off; flag setDropsNovos(false) desliga tudo', () => {
  assert.equal(drops.dropsAtivos(fakeG({ runSeed: 'dia-42' })), false);
  assert.equal(drops.dropsAtivos(fakeG()), true);
  drops.setDropsNovos(false);
  try {
    assert.equal(drops.dropsAtivos(fakeG()), false);
    const g = fakeG({ level: 10 });
    assert.equal(drops.spawnDrop(g), false, 'com flag off nada deve nascer');
    assert.equal(g.drops.length, 0);
  } finally {
    drops.setDropsNovos(true);
  }
});

test('drops: RNG próprio — mesma semente ⇒ mesma sequência de escolhas', () => {
  const push = () => drops.DROP_CONFIG.push(
    { id: 't1', nome: 'T1', cor: '#fff', dur: 0, raridade: 'comum', peso: 10, nivelMin: 1, cd: 0 },
    { id: 't2', nome: 'T2', cor: '#fff', dur: 0, raridade: 'comum', peso: 3, nivelMin: 1, cd: 0 },
  );
  const pop = () => { drops.DROP_CONFIG.pop(); drops.DROP_CONFIG.pop(); };
  const seq = () => {
    drops.setDropsRng('corrida-x');
    push();
    try {
      const g = fakeG({ level: 10 });
      const out = [];
      for (let i = 0; i < 40; i++) {
        drops.spawnDrop(g);
        out.push(g.drops.map((d) => d.kind).join(), drops.nextDropTimer().toFixed(6));
        g.drops.length = 0;
        g.dropCd = {};
      }
      return out;
    } finally {
      pop();                    // sempre desfaz os sintéticos (nunca toca nos reais)
    }
  };
  assert.deepEqual(seq(), seq(), 'duas rodadas com a mesma semente devem ser iguais');
});

test('drops: spawn nunca nasce sobre barreira (rota livre no topo)', () => {
  drops.setDropsRng('barreira');
  drops.DROP_CONFIG.push({ id: 'tb', nome: 'TB', cor: '#fff', dur: 0, raridade: 'comum', peso: 10, nivelMin: 1, cd: 0 });
  try {
    // barreira cobrindo a largura toda na linha de nascimento: nada nasce
    const gBar = fakeG({ obstacles: [{ type: 'bar', x: 0, y: -60, w: 390, h: 20 }] });
    for (let i = 0; i < 30; i++) { drops.spawnDrop(gBar); gBar.dropCd = {}; }
    assert.equal(gBar.drops.length, 0, 'não pode nascer sobre barreira de ponta a ponta');
    // barreira estreita: nasce com folga ≥ 90 px da borda (ou não nasce)
    const g2 = fakeG({ obstacles: [{ type: 'bar', x: 170, y: -60, w: 50, h: 20 }] });
    for (let i = 0; i < 30; i++) { drops.spawnDrop(g2); g2.dropCd = {}; }
    for (const d of g2.drops) {
      const dx = Math.max(0, Math.abs(d.x - 195) - 25);
      assert.ok(dx > 90, `drop nasceu a ${dx}px da barreira (mín 90)`);
    }
    assert.ok(g2.drops.length > 0, 'com espaço lateral deve nascer normalmente');
  } finally {
    drops.DROP_CONFIG.pop();
  }
});

test('drops: coleta conta runStats e toast de novelty é único', () => {
  drops.DROP_CONFIG.push({
    id: 'tc', nome: 'TC', desc: 'teste', icone: 'ic-bolt', cor: '#fff',
    dur: 6, raridade: 'comum', peso: 1, nivelMin: 1, cd: 0,
  });
  const firsts = [];
  on('drop:first', ({ kind }) => firsts.push(kind));
  const g = fakeG();
  try {
    drops.collectDrop(g, { kind: 'tc', x: 10, y: 10 });
    drops.collectDrop(g, { kind: 'tc', x: 10, y: 10 });
    assert.equal(g.runStats.drops, 2);
    assert.equal(g.runStats.dropsByKind.tc, 2);
    assert.deepEqual(firsts, ['tc'], 'toast de primeira vez deve ser único');
  } finally {
    drops.DROP_CONFIG.pop();
  }
});

test('drops: resetDrops — 7 s sem semente; Infinity na corrida do dia', () => {
  const gA = fakeG();
  drops.resetDrops(gA);
  assert.equal(gA.dropTimer, 7);
  const gB = fakeG({ runSeed: 'dia' });
  drops.resetDrops(gB);
  assert.equal(gB.dropTimer, Infinity);
  assert.equal(gB.runStats.drops, 0);
  assert.deepEqual(gB.runStats.dropsByKind, {});
});

// ---------------------------------------------------------
//  Drops individuais
// ---------------------------------------------------------
test('drop imã: atrai pulsos no raio de 150 e some ao expirar', () => {
  const cfg = drops.DROP_CONFIG.find((c) => c.id === 'ima');
  assert.ok(cfg, 'config do imã deve existir');
  assert.equal(cfg.nivelMin, 1, 'imã é comum: disponível desde o nível 1');
  const g = fakeG();
  drops.ativarFx(g, 'ima', cfg.dur);
  assert.equal(drops.atracaoRaio(g), 150, 'raio de atração de 150×S');
  drops.updateDrops(g, cfg.dur + 0.01);
  assert.equal(drops.atracaoRaio(g), 0, 'sem efeito após expirar');
});

test('drop reparo: +1 vida (máx 3); some com vida cheia; dobra com 1 vida', () => {
  const cfg = drops.DROP_CONFIG.find((c) => c.id === 'coracao');
  assert.ok(cfg, 'config do reparo deve existir');
  assert.equal(cfg.soVidaBaixa, true, 'regra: invisível com vida cheia');
  assert.equal(cfg.nivelMin, 2, 'raros exigem nível mínimo');
  // pool: com vida cheia não nasce; ferido, nasce
  const backup = [...drops.DROP_CONFIG];
  drops.DROP_CONFIG.length = 0;
  drops.DROP_CONFIG.push(cfg);
  try {
    drops.setDropsRng('reparo');
    assert.equal(drops.spawnDrop(fakeG({ lives: 3, level: 2 })), false, 'vida cheia: não nasce');
    assert.equal(drops.spawnDrop(fakeG({ lives: 1, level: 2 })), true, 'ferido: nasce');
    assert.equal(drops.spawnDrop(fakeG({ lives: 2, level: 1 })), false, 'nível 1: raros fora');
  } finally {
    drops.DROP_CONFIG.length = 0;
    drops.DROP_CONFIG.push(...backup);
  }
  // efeito: cura até o teto; cheio vira fallback de pontos (não desperdiça)
  const g = fakeG({ lives: 1, player: { x: 100, y: 200 } });
  drops.EFEITOS.coracao(g, cfg, { x: 50, y: 50 });
  assert.equal(g.lives, 2);
  drops.EFEITOS.coracao(g, cfg, { x: 50, y: 50 });
  assert.equal(g.lives, 3);
  drops.EFEITOS.coracao(g, cfg, { x: 50, y: 50 });
  assert.equal(g.lives, 3, 'nunca passa do máximo');
  assert.equal(g.score, 50, 'com vida cheia vira +50 pontos');
});

test('drop fantasma: atravessa obstáculos por 4s e expira limpo', () => {
  const cfg = drops.DROP_CONFIG.find((c) => c.id === 'fantasma');
  assert.ok(cfg, 'config do fantasma deve existir');
  assert.equal(cfg.nivelMin, 3);
  const g = fakeG();
  drops.ativarFx(g, 'fantasma', cfg.dur);
  assert.equal(drops.fx(g, 'fantasma'), 4);
  drops.updateDrops(g, 2);
  assert.ok(drops.fx(g, 'fantasma') > 0, 'ainda ativo no meio da duração');
  drops.updateDrops(g, 2.01);
  assert.equal(drops.fx(g, 'fantasma'), 0, 'expira e sai do mapa de efeitos');
});

test('drop tempo: mundo a 70% enquanto ativo; pontuação nunca muda', () => {
  const cfg = drops.DROP_CONFIG.find((c) => c.id === 'tempo');
  assert.ok(cfg, 'config da câmara lenta deve existir');
  const g = fakeG({ drops: [{ x: 0, y: 0, vy: 100, glow: 0, kind: 'ima' }] });
  drops.ativarFx(g, 'tempo', cfg.dur);
  drops.updateDrops(g, 1);
  assert.ok(Math.abs(g.drops[0].y - 70) < 1e-6, 'queda a 70% enquanto ativo');
  drops.updateDrops(g, cfg.dur + 0.01);      // expira aqui
  const esperado = 70 + 100 * (cfg.dur + 0.01);
  assert.ok(Math.abs(g.drops[0].y - esperado) < 1e-3, 'volta à velocidade normal ao expirar');
  assert.equal(g.score, 0, 'câmera lenta nunca mexe na pontuação');
});

test('drop trava de combo: congela por 8s e expira com mapa limpo', () => {
  const cfg = drops.DROP_CONFIG.find((c) => c.id === 'combo');
  assert.ok(cfg, 'config da trava deve existir');
  const g = fakeG();
  drops.ativarFx(g, 'combo', cfg.dur);
  assert.equal(drops.fx(g, 'combo'), 8);
  drops.updateDrops(g, 4);
  assert.ok(drops.fx(g, 'combo') > 0, 'congelada no meio da duração');
  drops.updateDrops(g, 4.01);
  assert.equal(drops.fx(g, 'combo'), 0);
  assert.deepEqual(g.dropFx, {}, 'fim limpo: nada vaza no mapa de efeitos');
});
