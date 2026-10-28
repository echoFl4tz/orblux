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

// ---- Fase 4 (retenção): tutorial, missões e desbloqueios ----

test('save antigo sem os campos novos: começam zerados', async () => {
  setItem('pn_metricas', { sessoes: 2, partidas: 4, ultimaSessao: '', d1: 0, d7: 0 });
  const m = await importar('v8');
  const r = m.resumoMetricas();
  assert.equal(r.tutorial, 0, 'tutorial pendente por padrão');
  assert.equal(r.missoes, 0, 'missões começam em 0');
  assert.equal(r.desbloqueios, 0, 'desbloqueios começam em 0');
  assert.equal(r.sessoes, 2, 'campos legados intactos');
  assert.equal(r.partidas, 4);
});

test('registrarTutorial é idempotente (só vira 1, nunca volta)', async () => {
  removeItem('pn_metricas');
  const m = await importar('v9');
  assert.equal(m.resumoMetricas().tutorial, 0);
  m.registrarTutorial();
  assert.equal(m.resumoMetricas().tutorial, 1);
  m.registrarTutorial();
  m.registrarTutorial();
  assert.equal(m.resumoMetricas().tutorial, 1, 'segundas chamadas não mudam nada');
  assert.equal(getItem('pn_metricas').tutorial, 1, 'persistido');
});

test('registrarMissao e registrarDesbloqueio acumulam e persistem', async () => {
  removeItem('pn_metricas');
  const m = await importar('v10');
  m.registrarMissao();
  m.registrarMissao();
  m.registrarMissao();
  m.registrarDesbloqueio();
  const r = m.resumoMetricas();
  assert.equal(r.missoes, 3, 'missões concluídas somadas (diárias+semanais)');
  assert.equal(r.desbloqueios, 1, 'desbloqueio de skin contado');
  // outra instância lê o mesmo valor (persistência real)
  const m2 = await importar('v11');
  assert.equal(m2.resumoMetricas().missoes, 3, 'persistido em pn_metricas');
  assert.equal(m2.resumoMetricas().desbloqueios, 1);
  removeItem('pn_metricas');
});

test('contadores novos validam dado inválido (não explodem)', async () => {
  setItem('pn_metricas', { tutorial: 'sim', missoes: 'várias', desbloqueios: -4 });
  const m = await importar('v12');
  const r = m.resumoMetricas();
  assert.equal(r.tutorial, 0, 'string vira 0 (pendente)');
  assert.equal(r.missoes, 0, 'inválido vira 0');
  assert.equal(r.desbloqueios, 0, 'negativo vira 0');
  removeItem('pn_metricas');
});
