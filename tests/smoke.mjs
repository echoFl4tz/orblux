/* =========================================================
   Smoke test — valida a lógica do jogo em Node (sem navegador)
   Uso: node tests/smoke.mjs
   ========================================================= */

import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------
//  Mocks mínimos de navegador
// ---------------------------------------------------------
function stubEl(id = '') {
  const el = {
    id,
    hidden: false,
    disabled: false,
    checked: true,
    value: '70',
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    children: [],
    firstChild: null,
    offsetWidth: 0,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    insertAdjacentHTML() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setPointerCapture() {},
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

// fake 2d context (Proxy no-op)
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
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  open() {},
};
globalThis.document = {
  documentElement: { clientWidth: 1280, clientHeight: 720 },
  visibilityState: 'visible',
  hidden: false,
  body: stubEl('body'),
  getElementById: (id) => (id === 'game-canvas' ? fakeCanvas : getEl(id)),
  createElement: () => stubEl(),
  addEventListener() {},
  querySelectorAll: () => [],
  execCommand() {},
};
globalThis.location = { protocol: 'http:', href: 'http://localhost/', origin: 'http://localhost' };
// navigator já existe no Node 24 (sem vibrate — caminho de fallback é exercitado)
try { Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {}, share: null }, configurable: true }); } catch { /* usa o nativo */ }
globalThis.requestAnimationFrame = () => 1;   // loop único (não repete)
globalThis.cancelAnimationFrame = () => {};
globalThis.confirm = () => true;

// ---------------------------------------------------------
//  Utilitários de teste
// ---------------------------------------------------------
let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.error(`  ❌ ${label}`); }
}

// ---------------------------------------------------------
//  Carrega o jogo inteiro (main.js faz o boot)
// ---------------------------------------------------------
await import('../js/main.js');
const PN = globalThis.window.PN; // main.js grava em window (mock no Node)
const { state, resetAllProgress } = await import('../js/core/state.js');
const { game, revive, quitToMenu } = await import('../js/game/game.js');
const { difficultyParams } = await import('../js/game/spawner.js');
const { createPickup, createObstacle } = await import('../js/game/entities.js');
const events = await import('../js/core/events.js');

console.log('\n— Etapa A: boot e menu —');
assert(PN && PN.version, 'main.js inicializou e expôs window.PN');
assert(game.mode === 'menu', 'jogo começa no menu');
assert(Array.isArray(state.missions.list) && state.missions.list.length === 3, 'missões do dia geradas (3)');
assert(state.tutorialDone === false, 'tutorial habilitado na 1ª partida');

console.log('\n— Etapa B: iniciar partida (com tutorial) —');
let overPayload = null;
events.on('game:over', (p) => { overPayload = p; });
PN.start();
assert(game.mode === 'playing', 'partida iniciada');
assert(game.lives === 3, '3 vidas no início');
assert(game.player && game.player.y > 0, 'jogador criado');

// roda 2 s sem erros
PN.advance(2);
assert(game.mode === 'playing', '2 s de jogo sem erros');
assert(game.elapsed > 1.5, 'delta time acumulando');

console.log('\n— Etapa C: coleta de pulsos e combo —');
game.pickups.push(createPickup(game.player.x, game.player.y, game.S));
PN.advance(0.2);
assert(game.score > 0, `ponto coletado (score=${game.score})`);
assert(game.combo === 1, 'combo incrementa ao coletar');
assert(game.runStats.pickups === 1, 'estatística de pulsos da partida');

// coleta mais 7 → multiplicador deve subir para x2 (combo 8)
for (let i = 0; i < 7; i++) {
  game.pickups.push(createPickup(game.player.x, game.player.y, game.S));
  PN.advance(0.05);
}
assert(game.multiplier === 3, `multiplicador sobe conforme o combo (combo=${game.combo}, mult=${game.multiplier})`);

console.log('\n— Etapa D: colisão e vidas —');
const livesBefore = game.lives;
game.player.invuln = 0;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
PN.advance(0.2);
assert(game.lives === livesBefore - 1, 'batida custa 1 vida');
assert(game.combo === 0, 'combo zera ao bater');
assert(game.player.invuln > 0, 'invulnerabilidade ativada');

console.log('\n— Etapa E: escudo —');
game.player.invuln = 0;
game.player.shield = true;
const livesShield = game.lives;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
PN.advance(0.2);
assert(game.lives === livesShield, 'escudo absorve a batida');
assert(game.player.shield === false, 'escudo é consumido');

console.log('\n— Etapa F: dificuldade progressiva —');
const d0 = difficultyParams(0);
const d60 = difficultyParams(60);
assert(d60.speedMul > d0.speedMul, `velocidade sobe com o tempo (${d0.speedMul.toFixed(2)} → ${d60.speedMul.toFixed(2)})`);
assert(d60.interval < d0.interval, `intervalo de spawn diminui (${d0.interval.toFixed(2)}s → ${d60.interval.toFixed(2)}s)`);
assert(d60.interval > 0.25, 'intervalo nunca fica impossível');
const dEasy = difficultyParams(30, true);
assert(dEasy.interval > difficultyParams(30).interval, 'tutorial é mais fácil que o modo normal');

console.log('\n— Etapa G: game over, ranking e estatísticas —');
overPayload = null;
game.player.invuln = 0;
game.player.shield = false;
game.lives = 1;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
PN.advance(0.2);
assert(game.mode === 'gameover', 'modo gameover ao zerar vidas');
assert(overPayload && typeof overPayload.score === 'number', 'evento game:over emitido com resumo');
assert(state.stats.runs === 1, 'estatística de partidas incrementada');
assert(state.ranking.length === 1, 'partida salva no ranking local');
assert(state.achievements.first_run !== undefined, 'conquista "Primeiro pulso" desbloqueada');
assert(getEl('screen-gameover').classList.contains('active'), 'tela de fim de jogo exibida');
assert(getEl('hud').hidden === true, 'HUD escondido no fim de jogo');

console.log('\n— Etapa H: reviver (anúncio recompensado) —');
const revived = revive();
assert(revived === true, 'reviver aceito na 1ª derrota');
assert(game.mode === 'playing' && game.lives === 1, 'volta a jogar com 1 vida');
assert(revive() === false, 'segundo revive bloqueado na mesma partida');

console.log('\n— Etapa I: jogar novamente + sair —');
overPayload = null;
game.player.invuln = 0;
game.lives = 1;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
PN.advance(0.2);
assert(game.mode === 'gameover', 'segundo game over ok');
assert(state.stats.runs === 2, '2 partidas registradas');
assert(state.ranking.length === 2, 'ranking com 2 entradas');
assert(state.achievements.revive !== undefined, 'conquista "Segunda chance" desbloqueada');
quitToMenu();
assert(game.mode === 'menu', 'sair para o menu funciona');

console.log('\n— Etapa J: sobrevivência com jogador parado (balanceamento) —');
PN.start({ tutorial: false });
let t = 0;
while (game.mode === 'playing' && t < 120) { PN.advance(1); t++; }
assert(game.mode === 'gameover', `jogador parado morre em ${t}s (nem eterno, nem instantâneo)`);
assert(t >= 5, 'não é game over instantâneo (dá reação)');
assert(t <= 110, 'não é impossível sobreviver um tempo com jogo ativo');

console.log('\n— Etapa K: persistência e reset —');
assert(state.stats.runs >= 3, 'estatísticas continuam acumulando');
resetAllProgress();
assert(state.stats.runs === 0 && state.ranking.length === 0, 'reset de progresso limpa tudo');

console.log(`\n════════════════════════════════\n${pass} testes passaram, ${fail} falharam\n`);
process.exit(fail > 0 ? 1 : 0);
