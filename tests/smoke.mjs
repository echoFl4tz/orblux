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
    style: { setProperty() {}, removeProperty() {} },
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
    append() {},
    removeChild() {},
    remove() {},
    insertAdjacentHTML() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setPointerCapture() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
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
  createElement: () => {
    const el = stubEl();
    el.getContext = () => fakeCtx;   // canvas offscreen do fundo (prerender)
    return el;
  },
  createDocumentFragment: () => stubEl('fragment'),
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  execCommand() {},
};
globalThis.location = { protocol: 'http:', href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', search: '' };
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
const OX = globalThis.window.OX; // main.js grava em window (mock no Node)
const { state, resetAllProgress } = await import('../js/core/state.js');
const { game, revive, quitToMenu } = await import('../js/game/game.js');
const { difficultyParams, nextPickupTimer, nextSpawnTimer, setSpawnerRng } = await import('../js/game/spawner.js');
const { createPickup, createObstacle } = await import('../js/game/entities.js');
const events = await import('../js/core/events.js');
const { burst, countActive, setPoolMax, resetFX } = await import('../js/game/particles.js');

console.log('\n— Etapa A: boot e menu —');
assert(OX && OX.version, 'main.js inicializou e expôs window.OX');
assert(game.mode === 'menu', 'jogo começa no menu');
assert(Array.isArray(state.missions.list) && state.missions.list.length === 3, 'missões do dia geradas (3)');
assert(state.tutorialDone === false, 'tutorial habilitado na 1ª partida');

// A5 §11: teto de partículas por tier — o burst nasce no teto e nunca passa
resetFX();
setPoolMax(40);
burst(0, 0, '#22E4FF', 100);
assert(countActive() === 40, 'teto do tier: burst de 100 nasce 40 partículas (§11)');
burst(0, 0, '#22E4FF', 10);
assert(countActive() === 40, 'teto do tier: burst extra não passa do teto');
resetFX();
assert(countActive() === 0, 'resetFX zera o contador de partículas');
setPoolMax(220);

console.log('\n— Etapa B: iniciar partida (com tutorial) —');
let overPayload = null;
events.on('game:over', (p) => { overPayload = p; });
OX.start();
assert(game.mode === 'playing', 'partida iniciada');
assert(game.lives === 3, '3 vidas no início');
assert(game.player && game.player.y > 0, 'jogador criado');

// roda 2 s sem erros
OX.advance(2);
assert(game.mode === 'playing', '2 s de jogo sem erros');
assert(game.elapsed > 1.5, 'delta time acumulando');

console.log('\n— Etapa C: coleta de pulsos e combo —');
game.pickups.push(createPickup(game.player.x, game.player.y, game.S));
OX.advance(0.2);
assert(game.score > 0, `ponto coletado (score=${game.score})`);
assert(game.combo === 1, 'combo incrementa ao coletar');
assert(game.runStats.pickups === 1, 'estatística de pulsos da partida');

// coleta mais 7 → multiplicador deve subir para x2 (combo 8)
for (let i = 0; i < 7; i++) {
  game.pickups.push(createPickup(game.player.x, game.player.y, game.S));
  OX.advance(0.05);
}
assert(game.multiplier === 3, `multiplicador sobe conforme o combo (combo=${game.combo}, mult=${game.multiplier})`);

console.log('\n— Etapa D: colisão e vidas —');
const livesBefore = game.lives;
game.player.invuln = 0;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
OX.advance(0.2);
assert(game.lives === livesBefore - 1, 'batida custa 1 vida');
assert(game.combo === 0, 'combo zera ao bater');
assert(game.player.invuln > 0, 'invulnerabilidade ativada');

console.log('\n— Etapa E: escudo —');
game.player.invuln = 0;
game.player.shield = true;
const livesShield = game.lives;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
OX.advance(0.2);
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

console.log('\n— Etapa F2: ritmo inicial, densidade por área e determinismo —');
const d10 = difficultyParams(10);
assert(d10.interval <= 0.75, `rampa acelerada: 10 s já em <= 0,75 s (${d10.interval.toFixed(2)} s)`);
assert(Math.abs(difficultyParams(15).interval - 0.64) < 0.001, 'curva contínua na virada dos 15 s (0,64 s)');
const mkRng = () => { let s = 42; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };
const gTel = { elapsed: 12, W: 390, H: 844, runSeed: null };
setSpawnerRng(mkRng());
const tRef = nextPickupTimer(gTel);
setSpawnerRng(mkRng());
const tIni = nextPickupTimer({ ...gTel, elapsed: 3 });
setSpawnerRng(mkRng());
const tWide = nextPickupTimer({ ...gTel, W: 1280, H: 720 });
assert(tRef >= 0.98 && tRef <= 1.72, `390x844: cadência base 1,0–1,7 s (${tRef.toFixed(2)} s)`);
assert(tIni >= 0.69 && tIni <= 1.01, `10 s iniciais: pulsos 0,7–1,0 s (${tIni.toFixed(2)} s)`);
assert(tWide < tRef, `1280x720 ganha densidade por área (${tWide.toFixed(2)} s < ${tRef.toFixed(2)} s)`);
setSpawnerRng(mkRng());
const corridaA = nextPickupTimer({ ...gTel, W: 1280, H: 720, runSeed: 'corrida-1' });
setSpawnerRng(mkRng());
const corridaB = nextPickupTimer({ ...gTel, W: 360, H: 640, runSeed: 'corrida-1' });
assert(corridaA === corridaB,
  `Corrida do Dia: mesma cadência em qualquer aparelho (${corridaA.toFixed(2)} s)`);
setSpawnerRng(mkRng());
const jt = nextSpawnTimer(0.7);
assert(jt >= 0.59 && jt <= 0.81, `jitter de obstáculo pelo rng da semente (±15% = ${jt.toFixed(2)} s)`);
setSpawnerRng(null);

console.log('\n— Etapa F2b: near miss e ondas (Fase 2) —');
const { SCORE, waveForTime, waveBonus } = await import('../net/rules.js');
OX.start();
game.player.invuln = 9999;               // não morre durante a etapa
game.spawnTimer = 999;                  // sem spawns distraindo o asserts
const nmBase = game.score;
const nmObs = createObstacle('drone', game.player.x, game.player.y, game.S, 0);
// fora da hitbox, mas dentro da folga do "quase" (drone ancora o sway em baseX)
nmObs.x = nmObs.baseX = game.player.x + game.player.r + nmObs.r * 0.85 + 8 * game.S;
game.obstacles.push(nmObs);
OX.advance(0.1);
assert(game.runStats.nearMiss === 1, 'near miss contabilizado');
assert(game.score === nmBase + SCORE.NEAR_MISS,
  `bônus de near miss pago (+${SCORE.NEAR_MISS}, score=${game.score})`);
OX.advance(0.5);
assert(game.runStats.nearMiss === 1, 'mesmo obstáculo não paga duas vezes');
game.obstacles.length = 0;
const nmFar = createObstacle('drone', game.W / 2, 40, game.S, 0);
game.obstacles.push(nmFar);
OX.advance(0.1);
assert(game.runStats.nearMiss === 1, 'obstáculo distante não paga near miss');
game.obstacles.length = 0;
// ondas: determinísticas pelo tempo, com bônus na virada
game.elapsed = SCORE.WAVE_SECONDS - 0.15;
const wvBase = game.score;
OX.advance(0.3);
assert(game.wave === 2, `onda avança pelo tempo (onda=${game.wave})`);
assert(game.score >= wvBase + waveBonus(2), `bônus de onda 2 pago (+${waveBonus(2)})`);
assert(waveForTime(0) === 1 && waveForTime(SCORE.WAVE_SECONDS) === 2,
  'waveForTime determinístico nos limites');
assert(waveBonus(1) === 0 && waveBonus(2) === 2 * SCORE.WAVE_BONUS
  && waveBonus(SCORE.WAVE_BONUS_MAX + 1) === SCORE.WAVE_BONUS * SCORE.WAVE_BONUS_MAX,
  'bônus de onda com teto');
setSpawnerRng(null);

console.log('\n— Etapa G: game over, ranking e estatísticas —');
overPayload = null;
game.player.invuln = 0;
game.player.shield = false;
game.lives = 1;
game.obstacles.push(createObstacle('drone', game.player.x, game.player.y, game.S, 0));
OX.advance(0.2);
assert(game.mode === 'gameover', 'modo gameover ao zerar vidas');
assert(overPayload && typeof overPayload.score === 'number', 'evento game:over emitido com resumo');
assert(typeof overPayload.wave === 'number' && overPayload.wave >= 1, 'game:over inclui a onda da partida');
assert(typeof overPayload.nearMiss === 'number' && overPayload.nearMiss >= 0, 'game:over inclui os desvios (near miss)');
// auditoria 26/10: contabilidade ÚNICA por corrida (js/core/run-flow.js).
// A 1ª morte deixa o revive pendente e NÃO contabiliza ainda.
assert(typeof overPayload.runId === 'number' && overPayload.revivePossible === true,
  'game:over carrega runId e revivePossible');
assert(state.stats.runs === 0, 'contabilidade adiada (revive pendente não conta em dobro)');
assert(state.ranking.length === 0, 'corrida pendente ainda não entrou no ranking');
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
OX.advance(0.2);
assert(game.mode === 'gameover', 'segundo game over ok');
assert(overPayload.revivePossible === false, 'morte final não oferece revive');
assert(state.stats.runs === 1, '1 corrida registrada (morrer+reviver = UMA corrida)');
assert(state.ranking.length === 1, 'ranking com 1 entrada (a pontuação final)');
assert(state.achievements.first_run !== undefined, 'conquista "Primeiro pulso" desbloqueada');
assert(state.achievements.revive !== undefined, 'conquista "Segunda chance" desbloqueada');
quitToMenu();
assert(game.mode === 'menu', 'sair para o menu funciona');

console.log('\n— Etapa J: sobrevivência com jogador parado (balanceamento) —');
OX.start({ tutorial: false });
let t = 0;
while (game.mode === 'playing' && t < 120) { OX.advance(1); t++; }
assert(game.mode === 'gameover', `jogador parado morre em ${t}s (nem eterno, nem instantâneo)`);
assert(t >= 5, 'não é game over instantâneo (dá reação)');
assert(t <= 110, 'não é impossível sobreviver um tempo com jogo ativo');

console.log('\n— Etapa K: persistência e reset —');
quitToMenu();                                  // desiste do revive: pendente é contabilizada
assert(state.stats.runs === 2, 'sair do menu descarrega a corrida pendente (2 corridas no total)');
// retenção (análise): maestria e métricas locais coerentes com a sessão
const maestriaMod = await import('../js/core/maestria.js');
const metricasMod = await import('../js/core/metricas.js');
assert(maestriaMod.xpAtual() >= 20, `maestria: 2 corridas contabilizadas creditaram XP (${maestriaMod.xpAtual()})`);
assert(metricasMod.resumoMetricas().sessoes >= 1, 'métricas: sessão aberta no boot (pn_metricas)');
assert(metricasMod.resumoMetricas().partidas >= 2, 'métricas: partidas contadas em game:start');
resetAllProgress();
assert(state.stats.runs === 0 && state.ranking.length === 0, 'reset de progresso limpa tudo');
assert(maestriaMod.xpAtual() === 0, 'reset apaga o XP da maestria (pn_maestria)');
assert(metricasMod.resumoMetricas().sessoes === 0, 'reset apaga as métricas (pn_metricas)');

console.log(`\n════════════════════════════════\n${pass} testes passaram, ${fail} falharam\n`);
process.exit(fail > 0 ? 1 : 0);
