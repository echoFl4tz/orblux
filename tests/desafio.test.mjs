/* =========================================================
   DESAFIO DO DIA (local) — Fase 3 do prompt de retenção.
   • semente derivada da data (mesmo dia = mesma rota);
   • recorde local do dia e da semana em pn_desafio;
   • corrida normal (semente alheia) não mexe em nada;
   • virada de dia/semana zera o recorde do período anterior.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem, removeItem } from '../js/core/storage.js';
import { sementeDoDia, registrarPartidaDesafio, recordes } from '../js/core/desafio.js';

test('semente do dia: determinística, derivada só do calendário', () => {
  assert.equal(sementeDoDia('2026-10-27'), 'dia-2026-10-27');
  assert.equal(sementeDoDia('2026-10-27'), sementeDoDia('2026-10-27'),
    'mesma data ⇒ mesma semente (rota idêntica em qualquer aparelho)');
  assert.notEqual(sementeDoDia('2026-10-27'), sementeDoDia('2026-10-28'),
    'dia diferente ⇒ outra rota');
});

test('corrida sem a semente de hoje: null e nada gravado', () => {
  removeItem('pn_desafio');
  assert.equal(registrarPartidaDesafio({ score: 9999, seed: null }, '2026-10-27', '2026-10-26'), null,
    'partida normal não conta');
  assert.equal(registrarPartidaDesafio({ score: 9999, seed: 'outra-semente' }, '2026-10-27', '2026-10-26'), null,
    'semente alheia não conta');
  assert.equal(getItem('pn_desafio'), null, 'storage intocado');
});

test('primeiro resultado vira recorde; menor não derruba; maior atualiza', () => {
  removeItem('pn_desafio');
  const hoje = '2026-10-27';
  const semana = '2026-10-26';
  const seed = sementeDoDia(hoje);

  const r1 = registrarPartidaDesafio({ score: 500, seed }, hoje, semana);
  assert.deepEqual(r1, { bateuDia: true, bateuSemana: true, melhorDia: 500, melhorSemana: 500 });

  const r2 = registrarPartidaDesafio({ score: 300, seed }, hoje, semana);
  assert.equal(r2.bateuDia, false, 'resultado menor não é recorde');
  assert.equal(r2.bateuSemana, false);
  assert.equal(r2.melhorDia, 500, 'recorde preservado');
  assert.equal(r2.melhorSemana, 500);

  const r3 = registrarPartidaDesafio({ score: 800, seed }, hoje, semana);
  assert.equal(r3.bateuDia, true);
  assert.equal(r3.bateuSemana, true);
  assert.equal(r3.melhorDia, 800);
  assert.equal(r3.melhorSemana, 800);

  const st = getItem('pn_desafio');
  assert.equal(st.dia, hoje);
  assert.equal(st.semana, semana);
  assert.equal(st.melhorDia, 800);
  assert.equal(st.melhorSemana, 800);
});

test('virada de dia: recorde do dia zera, o da semana continua', () => {
  removeItem('pn_desafio');
  const seg = '2026-10-26';
  registrarPartidaDesafio({ score: 700, seed: sementeDoDia('2026-10-27') }, '2026-10-27', seg);

  // dia seguinte (ainda mesma semana)
  const reg = recordes('2026-10-28', seg);
  assert.equal(reg.melhorDia, 0, 'recorde de ontem some da leitura de hoje');
  assert.equal(reg.melhorSemana, 700, 'recorde da semana segue');

  // primeira partida de hoje não herda o de ontem
  const r = registrarPartidaDesafio({ score: 100, seed: sementeDoDia('2026-10-28') }, '2026-10-28', seg);
  assert.equal(r.bateuDia, true, 'primeiro do dia já é recorde');
  assert.equal(r.melhorDia, 100, 'não soma com o de ontem');
  assert.equal(r.melhorSemana, 700, 'semana continua de pé');
});

test('virada de semana: recorde semanal zera', () => {
  removeItem('pn_desafio');
  registrarPartidaDesafio({ score: 900, seed: sementeDoDia('2026-10-27') }, '2026-10-27', '2026-10-26');

  const novaSemana = '2026-11-02';
  const reg = recordes('2026-11-02', novaSemana);
  assert.equal(reg.melhorDia, 0, 'dia passado some');
  assert.equal(reg.melhorSemana, 0, 'semana passada zera');
});

test('chave de storage usa o prefixo pn_', () => {
  removeItem('pn_desafio');
  registrarPartidaDesafio({ score: 10, seed: sementeDoDia('2026-10-27') }, '2026-10-27', '2026-10-26');
  const raw = getItem('pn_desafio');
  assert.ok(raw && typeof raw === 'object', 'gravado sob pn_desafio (clearAll pn_)');
  const keys = Object.keys(raw);
  assert.ok(keys.includes('dia') && keys.includes('semana'), 'formato {dia, semana, ...}');
});
