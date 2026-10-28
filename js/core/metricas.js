/* =========================================================
   MÉTRICAS LOCAIS — linha de base de retenção
   (análise — "medição mínima antes de crescer")

   Contadores agregados e anônimos SOMENTE neste dispositivo:
   nada sai daqui, sem rede e sem identificador de pessoa.
   Chave: pn_metricas (entra no clearAll do "Apagar progresso").

   • sessões e partidas totais;
   • retorno após ≥1 dia (d1) e ≥7 dias (d7) desde a visita
     anterior (aproximação local de D+1/D+7);
   • partidas da sessão atual (vivo, não persistido);
   • tutorial concluído (0/1), missões concluídas (total) e
     desbloqueios de skin (total) — Fase 4 do prompt de retenção.
   ========================================================= */

import { getItem, setItem } from './storage.js';

const KEY = 'pn_metricas';
const DIA_MS = 86400000;

function load() {
  const raw = getItem(KEY) || {};
  const nat = (v) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return {
    sessoes: nat(raw.sessoes),
    partidas: nat(raw.partidas),
    ultimaSessao: typeof raw.ultimaSessao === 'string' ? raw.ultimaSessao : '',
    d1: nat(raw.d1),
    d7: nat(raw.d7),
    tutorial: nat(raw.tutorial) > 0 ? 1 : 0,
    missoes: nat(raw.missoes),
    desbloqueios: nat(raw.desbloqueios),
  };
}

function save(m) {
  setItem(KEY, {
    sessoes: m.sessoes,
    partidas: m.partidas,
    ultimaSessao: m.ultimaSessao,
    d1: m.d1,
    d7: m.d7,
    tutorial: m.tutorial,
    missoes: m.missoes,
    desbloqueios: m.desbloqueios,
  });
}

let partidasSessao = 0;   // vivo da sessão atual (não persiste)

/**
 * Abre a sessão (chamada no boot, antes de qualquer UI de Ajustes):
 * soma o retorno D1/D7 pela data da última visita e grava a nova.
 */
export function abrirSessao() {
  const m = load();
  const agora = Date.now();
  if (m.ultimaSessao) {
    const anterior = Date.parse(m.ultimaSessao);
    if (Number.isFinite(anterior)) {
      const dias = (agora - anterior) / DIA_MS;
      if (dias >= 1) m.d1 += 1;      // voltou depois de ≥1 dia
      if (dias >= 7) m.d7 += 1;      // voltou depois de ≥7 dias
    }
  }
  m.sessoes += 1;
  m.ultimaSessao = new Date(agora).toISOString();
  partidasSessao = 0;
  save(m);
}

/** Uma partida começou (chamado em 'game:start'). */
export function registrarPartida() {
  partidasSessao += 1;
  const m = load();
  m.partidas += 1;
  save(m);
}

/**
 * Tutorial concluído de verdade (tutorial:done — não conta o skip
 * nem o toggle de Ajustes). Idempotente: vira 1 e nunca volta a 0.
 */
export function registrarTutorial() {
  const m = load();
  if (m.tutorial) return;
  m.tutorial = 1;
  save(m);
}

/** Uma missão concluída (diária ou semanal — missions:completed). */
export function registrarMissao() {
  const m = load();
  m.missoes += 1;
  save(m);
}

/** Uma skin desbloqueada (skins:changed com owned:true — maestria/compra). */
export function registrarDesbloqueio() {
  const m = load();
  m.desbloqueios += 1;
  save(m);
}

/** Resumo somente-leitura (exibido em Ajustes > Dados). */
export function resumoMetricas() {
  const m = load();
  return { ...m, partidasSessao };
}
