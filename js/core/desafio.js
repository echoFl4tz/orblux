/* =========================================================
   DESAFIO DO DIA (local) — partidas reproduzíveis SEM servidor

   • A semente sai 100% do calendário ('dia-YYYY-MM-DD'): o mesmo
     mulberry32/hashSeed (net/rng.js) gera o MESMO percurso em
     qualquer aparelho que jogue no mesmo dia — sem backend e
     sem fingir ranking global (o ranking diário entre pessoas
     continua sendo trabalho do servidor: net/api.js, desligado).
   • Recorde do dia e da semana guardados em pn_desafio (prefixo
     pn_: entra no "Apagar progresso" via clearAll('pn_')).
   • Recomeço automático: virou o dia/semana, o recorde do período
     antigo some da leitura (o gravado é só histórico).
   • Módulo PURO: sem DOM, sem eventos — testável com node:test.
   ========================================================= */

import { getItem, setItem } from './storage.js';
import { todayKey, weekKey } from './state.js';

const KEY = 'pn_desafio';

/** Semente do dia: derivada só da data local (mesmo dia = mesma rota). */
export function sementeDoDia(hoje = todayKey()) {
  return `dia-${hoje}`;
}

function load() {
  const raw = getItem(KEY) || {};
  const nat = (v) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return {
    dia: typeof raw.dia === 'string' ? raw.dia : '',
    melhorDia: nat(raw.melhorDia),
    semana: typeof raw.semana === 'string' ? raw.semana : '',
    melhorSemana: nat(raw.melhorSemana),
  };
}

/**
 * Registra o resultado de uma partida do Desafio do Dia.
 * Só conta quando a corrida usou a semente de HOJE — corridas
 * normais retornam null e não tocam em nada.
 *
 * @param {{score?:number, seed?:string|null}} run
 * @returns {{bateuDia:boolean, bateuSemana:boolean,
 *            melhorDia:number, melhorSemana:number}|null}
 */
export function registrarPartidaDesafio(run = {}, hoje = todayKey(), semana = weekKey()) {
  if (!run || run.seed !== sementeDoDia(hoje)) return null;   // corrida normal: fora
  const pontos = Math.max(0, Math.floor(Number(run.score) || 0));
  const reg = load();
  const antesDia = reg.dia === hoje ? reg.melhorDia : 0;
  const antesSemana = reg.semana === semana ? reg.melhorSemana : 0;
  const novo = {
    dia: hoje,
    melhorDia: Math.max(antesDia, pontos),
    semana,
    melhorSemana: Math.max(antesSemana, pontos),
  };
  setItem(KEY, novo);
  return {
    bateuDia: pontos > antesDia,
    bateuSemana: pontos > antesSemana,
    melhorDia: novo.melhorDia,
    melhorSemana: novo.melhorSemana,
  };
}

/**
 * Recordes vigentes (o de dia/semana passados lê como 0).
 * Honestidade: são LOCAIS neste aparelho — nada aqui compara
 * jogadores (isso exige servidor).
 */
export function recordes(hoje = todayKey(), semana = weekKey()) {
  const reg = load();
  return {
    dia: hoje,
    melhorDia: reg.dia === hoje ? reg.melhorDia : 0,
    semana,
    melhorSemana: reg.semana === semana ? reg.melhorSemana : 0,
    semente: sementeDoDia(hoje),
  };
}
