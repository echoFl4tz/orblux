/* =========================================================
   MISSÕES DIÁRIAS + SEMANAIS (Fase 2 — retenção).
   • semana local (segunda a domingo) com reset na segunda;
   • pick semanal determinístico (mesma semana = mesmas missões);
   • progresso reportado numa partida avança as DUAS listas;
   • recompensa semanal própria (acima da diária, equilibrada);
   • migração: save antigo {date,list} ganha a lista semanal.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem, removeItem } from '../js/core/storage.js';
import { weekKey } from '../js/core/state.js';
import { missionCoins, weeklyMissionCoins } from '../js/core/economy.js';
import { on, emit } from '../js/core/events.js';

// stub mínimo de document (missions.js só lê elementos no render)
const elements = new Map();
function stubEl(id) {
  return {
    id, hidden: false, textContent: '', innerHTML: '', dataset: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, appendChild() {}, addEventListener() {}, setAttribute() {},
  };
}
globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, stubEl(id));
    return elements.get(id);
  },
};

// cada import fresco rele o storage (o módulo tem estado em memória)
const importar = (q) => import(`../js/ui/missions.js?${q}`);

test('weekKey: semana local cai numa segunda-feira e tem formato de data', () => {
  const k = weekKey();
  assert.match(k, /^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD');
  const d = new Date(`${k}T12:00:00`);
  assert.equal(d.getDay(), 1, 'a chave é a SEGUNDA-FEIRA da semana');
  // segunda vira domingo continua a mesma semana; segunda seguinte muda
  const hoje = new Date();
  const dowHoje = (hoje.getDay() + 6) % 7;
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() + (6 - dowHoje));
  const proximaSeg = new Date(hoje);
  proximaSeg.setDate(hoje.getDate() + (7 - dowHoje));
  const keyDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(keyDe(domingo) >= k, true, 'domingo ainda é esta semana');
  assert.notEqual(keyDe(proximaSeg), k, 'segunda seguinte já é outra semana');
});

test('recompensa semanal: acima da diária e abaixo de 7 dias de diária', () => {
  for (const d of ['facil', 'medio', 'dificil']) {
    assert.ok(weeklyMissionCoins(d) > missionCoins(d), `${d}: semanal paga mais que a diária`);
    assert.ok(weeklyMissionCoins(d) <= missionCoins(d) * 7, `${d}: semanal < semana cheia de diária`);
  }
  assert.equal(weeklyMissionCoins('facil'), weeklyMissionCoins('inexistente'), 'dificuldade inválida cai no padrão');
});

// cada import fresco reusa o state.js em memória (autoritativo) —
// para simular um "boot com save X", mutamos state.missions direto
const stateRef = await import('../js/core/state.js');

test('boot cria a lista semanal (3 missões, flag weekly, mesma semana)', async () => {
  removeItem('pn_missions');
  stateRef.state.missions = { date: '', list: [] };   // boot limpo
  const m = await importar('v1');
  m.initMissions();
  const st = getItem('pn_missions');
  assert.equal(st.date !== '', true, 'data diária gravada');
  assert.equal(st.semana.date, weekKey(), 'semana = segunda-feira atual');
  assert.equal(st.semana.list.length, 3, '3 missões semanais');
  for (const wm of st.semana.list) {
    assert.equal(wm.weekly, true, `${wm.id} marcada como semanal`);
    assert.equal(wm.done, false);
    assert.equal(wm.progress, 0);
    assert.ok(wm.target > 0 && typeof wm.text === 'string');
  }
  const idsDiarias = st.list.map((x) => x.id);
  const idsSemanais = st.semana.list.map((x) => x.id);
  assert.equal(idsSemanais.some((id) => idsDiarias.includes(id)), false,
    'ids semanais nunca colidem com os diários (dedupe da carteira)');
});

test('pick semanal determinístico: regenerar na mesma semana dá as mesmas missões', async () => {
  const antes = getItem('pn_missions').semana;
  removeItem('pn_missions');
  stateRef.state.missions = { date: '', list: [] };   // força o pick de novo
  const m = await importar('v2');
  m.initMissions();
  const depois = getItem('pn_missions').semana;
  assert.deepEqual(depois.list.map((x) => x.id), antes.list.map((x) => x.id),
    'mesma semana ⇒ mesmas 3 missões (pick semeado)');
});

test('reporte de partida avança diária E semanal; concluir paga a moeda certa', async () => {
  removeItem('pn_missions');
  const m = await importar('v3');
  m.initMissions();
  const { state } = await import('../js/core/state.js');
  const walletMod = await import('../js/core/wallet.js');

  // escolhe a 1ª missão semanal e satisfaz o alvo com uma partida real
  const alvo = state.missions.semana.list[0];
  const run = { score: 0, pickups: 0, maxCombo: 1, elapsed: 0, powerups: 0, magnets: 0, events: 0, eventsClean: 0 };
  run[alvo.field] = alvo.mode === 'max' ? alvo.target : alvo.target;   // sum e max cobertos pelo alvo exato

  const saldoAntes = walletMod.getCoins();
  let completou = 0;
  on('missions:completed', () => { completou += 1; });
  emit('missions:report', run);

  const depois = getItem('pn_missions');
  const feita = depois.semana.list.find((x) => x.id === alvo.id);
  assert.equal(feita.done, true, 'missão semanal concluída pelo reporte');
  assert.equal(feita.progress, alvo.target, 'progresso saturado no alvo');
  assert.equal(completou, 1, 'evento missions:completed emitido');
  assert.equal(walletMod.getCoins(), saldoAntes + weeklyMissionCoins(alvo.d),
    'carteira creditou a RECOMPENSA SEMANAL (não a diária)');

  // as missões DIÁRIAS do mesmo campo também progrediram (runs=1 etc.)
  const diariasDepois = getItem('pn_missions').list;
  const mesmaCampo = diariasDepois.find((x) => x.field === alvo.field && !x.done);
  if (mesmaCampo) assert.ok(mesmaCampo.progress > 0, 'diária do mesmo campo também avança');
});

test('migração: save antigo {date,list} ganha a lista semanal sem perder as diárias', async () => {
  // o estado em memória é autoritativo entre imports — simulamos o boot
  // antigo mutando state.missions (formato v3: só {date,list})
  stateRef.state.missions = {
    date: '2020-01-01',   // dia velho: diárias serão regeneradas
    list: [{ id: 'collect20', icon: 'ic-pulse', text: 'x', target: 20, field: 'pickups', mode: 'sum', d: 'facil', progress: 7, done: false }],
  };
  const m = await importar('v4');
  m.initMissions();
  const st = getItem('pn_missions');
  assert.ok(st.semana, 'campo semana criado');
  assert.equal(st.semana.date, weekKey(), 'semana = a atual');
  assert.equal(st.semana.list.length, 3);
  assert.equal(st.list.length, 3, 'diárias regeneradas (dia velho)');
  assert.notEqual(st.date, '2020-01-01', 'data diária atualizada');
});

test('semana virou: lista semanal regenera, diária continua', async () => {
  // força uma semana antiga no estado em memória (save antigo)
  stateRef.state.missions.semana = {
    date: '2020-01-06',
    list: [{ id: 'velha', icon: 'ic-bolt', text: 'velha', target: 1, field: 'runs', mode: 'sum', d: 'facil', weekly: true, progress: 0, done: false }],
  };
  const m = await importar('v5');
  m.initMissions();
  const novo = getItem('pn_missions');
  assert.equal(novo.semana.date, weekKey(), 'semana resetada para a atual');
  assert.equal(novo.semana.list.length, 3);
  assert.equal(novo.semana.list.some((x) => x.id === 'velha'), false, 'missão velha descartada');
  assert.equal(novo.semana.list.every((x) => !x.done), true, 'reset limpa as marcações');
});
