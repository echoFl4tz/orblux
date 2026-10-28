/* =========================================================
   MÉTRICAS LOCAIS (análise de retenção) — linha de base.
   • primeira visita: sessão 1, sem retorno;
   • retorno após ≥1 dia (d1) e ≥7 dias (d7);
   • partidas totais e por sessão;
   • leitura validada (dado corrompido não explode).
   Tudo local/anônimo: só storage pn_metricas, sem rede.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem, setItem, removeItem } from '../js/core/storage.js';

const DIA_MS = 86400000;
// cada cenário importa uma instância fresca (o módulo guarda a
// sessão viva em memória; o storage é compartilhado entre elas)
const importar = (q) => import(`../js/core/metricas.js?${q}`);

test('primeira visita: 1 sessão, sem retorno, sem partidas', async () => {
  removeItem('pn_metricas');
  const m = await importar('v1');
  m.abrirSessao();
  const r = m.resumoMetricas();
  assert.equal(r.sessoes, 1);
  assert.equal(r.d1, 0, 'primeira visita não é retorno');
  assert.equal(r.d7, 0);
  assert.equal(r.partidas, 0);
  assert.equal(r.partidasSessao, 0);
  const salvo = getItem('pn_metricas');
  assert.equal(salvo.sessoes, 1, 'gravado em pn_metricas');
  assert.equal(typeof salvo.ultimaSessao, 'string');
});

test('retorno após ≥1 dia soma d1 (não soma d7)', async () => {
  setItem('pn_metricas', {
    sessoes: 5, partidas: 10,
    ultimaSessao: new Date(Date.now() - 2 * DIA_MS).toISOString(),
    d1: 2, d7: 1,
  });
  const m = await importar('v2');
  m.abrirSessao();
  const r = m.resumoMetricas();
  assert.equal(r.sessoes, 6, 'sessões acumulam');
  assert.equal(r.d1, 3, '2 dias de ausência = retorno d1');
  assert.equal(r.d7, 1, '2 dias ainda não é retorno d7');
});

test('retorno após ≥7 dias soma d1 e d7', async () => {
  setItem('pn_metricas', {
    sessoes: 5, partidas: 10,
    ultimaSessao: new Date(Date.now() - 8 * DIA_MS).toISOString(),
    d1: 0, d7: 0,
  });
  const m = await importar('v3');
  m.abrirSessao();
  const r = m.resumoMetricas();
  assert.equal(r.d1, 1, '≥7 dias também conta como retorno d1');
  assert.equal(r.d7, 1, 'retorno d7');
});

test('mesmo dia: não infla d1 nem d7', async () => {
  setItem('pn_metricas', {
    sessoes: 1, partidas: 1,
    ultimaSessao: new Date(Date.now() - 3 * 3600000).toISOString(),  // 3 h atrás
    d1: 0, d7: 0,
  });
  const m = await importar('v4');
  m.abrirSessao();
  const r = m.resumoMetricas();
  assert.equal(r.sessoes, 2);
  assert.equal(r.d1, 0, 'reabrir no mesmo dia não é retorno');
  assert.equal(r.d7, 0);
});

test('registrarPartida conta partidas totais e da sessão', async () => {
  removeItem('pn_metricas');
  const m = await importar('v5');
  m.registrarPartida();
  m.registrarPartida();
  m.registrarPartida();
  const r = m.resumoMetricas();
  assert.equal(r.partidas, 3);
  assert.equal(r.partidasSessao, 3);
  assert.equal(getItem('pn_metricas').partidas, 3, 'persistido');
  // abrir sessão nova zera só o contador vivo
  const m2 = await importar('v6');
  m2.abrirSessao();
  assert.equal(m2.resumoMetricas().partidasSessao, 0, 'sessão nova zerada');
  assert.equal(m2.resumoMetricas().partidas, 3, 'total preservado');
});

test('dado corrompido é validado, não explode', async () => {
  setItem('pn_metricas', { sessoes: 'muitos', partidas: null, ultimaSessao: 42, d1: -9, d7: 'x' });
  const m = await importar('v7');
  m.abrirSessao();
  const r = m.resumoMetricas();
  assert.equal(r.sessoes, 1, 'corrompido vira 0 e soma a sessão');
  assert.equal(r.d1, 0, 'negativo/inválido vira 0');
  assert.equal(r.d7, 0);
  m.registrarPartida();
  assert.equal(m.resumoMetricas().partidas, 1, 'partidas reconstruídas');
  removeItem('pn_metricas');
});
