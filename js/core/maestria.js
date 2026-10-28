/* =========================================================
   MAESTRIA — progressão permanente do jogador
   (análise de retenção — P2 "progressão permanente")

   • XP por partida, creditado UMA vez por corrida: a dedupe
     por runId aqui + a contabilidade única do run-flow fecham
     o farm via reviver/replay (ver js/core/run-flow.js).
   • Recompensas são SÓ cosméticas (skins conquistadas por
     HABILIDADE) — nunca vantagem de jogo (regra inviolável).
     A mesma skin também pode ser comprada com moedas: a
     maestria é o caminho de habilidade, a moeda o de economia.
   • Persistência: pn_maestria { xp } via storage.js (fallback
     em memória no modo privado). Entra no "Apagar progresso"
     pelo clearAll('pn_') de state.js.
   ========================================================= */

import { getItem, setItem } from './storage.js';
import { emit } from './events.js';
import { grantSkin, ownsSkin } from './state.js';

const KEY = 'pn_maestria';

/** XP necessário para ir do nível n ao n+1 (curva suave e linear). */
export const xpParaNivel = (n) => 100 + (n - 1) * 40;

/**
 * XP total acumulado para ALCANÇAR um nível (nível 1 = 0 XP;
 * nível 2 = 100; nível 5 = 640; nível 10 = 2.100).
 */
export function xpTotalParaNivel(n) {
  let total = 0;
  const alvo = Math.max(1, Math.floor(n));
  for (let i = 1; i < alvo; i++) total += xpParaNivel(i);
  return total;
}

/**
 * Nível derivado do XP total.
 * @param {number} xp @returns {{nivel:number, xpNoNivel:number, xpNecessario:number}}
 */
export function nivelDeXp(xp) {
  let nivel = 1;
  let resto = Math.max(0, Math.floor(xp || 0));
  while (resto >= xpParaNivel(nivel)) {
    resto -= xpParaNivel(nivel);
    nivel += 1;
  }
  return { nivel, xpNoNivel: resto, xpNecessario: xpParaNivel(nivel) };
}

/**
 * Trilha de recompensas — SÓ cosméticas, conquistas por habilidade.
 * Cada id existe no catálogo (tests/maestria.test.mjs garante).
 */
export const RECOMPENSAS = [
  { nivel: 2, skin: 'brasa_neon', nome: 'Brasa Neon' },
  { nivel: 5, skin: 'gelo_polar', nome: 'Gelo Polar' },
  { nivel: 10, skin: 'violeta_eclipse', nome: 'Violeta Eclipse' },
  { nivel: 20, skin: 'arco_iris', nome: 'Arco-Íris' },
  { nivel: 30, skin: 'supernova', nome: 'Supernova' },
  { nivel: 50, skin: 'orblux_lendaria', nome: 'Lendária Orblux' },
];

function load() {
  const raw = getItem(KEY);
  const xp = raw && Number.isFinite(raw.xp) ? Math.max(0, Math.floor(raw.xp)) : 0;
  return { xp };
}

/** XP total atual (fonte da verdade é o storage — sem cache para
    não ficar velho após "Apagar progresso" em outro módulo). */
export function xpAtual() { return load().xp; }

/** Progresso do nível atual. */
export function progresso() { return nivelDeXp(load().xp); }

/** Próxima recompensa ainda não conquistada (ou null se todas). */
export function proximaRecompensa() {
  const { nivel } = progresso();
  return RECOMPENSAS.find((r) => r.nivel > nivel) || null;
}

/**
 * XP de uma partida (puro, testável): 10% do placar, piso 10
 * (partida curta ainda progride) e teto 500 (farm rápido não compensa).
 */
export const xpDaPartida = (score) => Math.max(10, Math.min(500, Math.round((score || 0) / 10)));

let ultimoRunId = null;

/**
 * Creditado UMA vez por corrida (chamado dentro de accountRun,
 * no main.js — que só roda na morte final/desistência do revive).
 * Sobe de nível, concede as recompensas cruzadas e emite
 * 'maestria:changed' (a UI do menu re-renderiza).
 * @param {string|number|null} runId
 * @param {number} score
 * @returns {{xp:number, xpTotal:number, nivelAntes:number, nivel:number, subiu:boolean, recompensas:Array}|null}
 */
export function creditarPartida(runId, score) {
  if (runId !== null && runId !== undefined && runId === ultimoRunId) return null;
  ultimoRunId = runId === undefined ? null : runId;

  const reg = load();
  const xp = xpDaPartida(score);
  const antes = nivelDeXp(reg.xp);
  reg.xp += xp;
  setItem(KEY, { xp: reg.xp });
  const depois = nivelDeXp(reg.xp);

  const recompensas = [];
  if (depois.nivel > antes.nivel) {
    for (const r of RECOMPENSAS) {
      if (r.nivel > antes.nivel && r.nivel <= depois.nivel
          && !ownsSkin(r.skin) && grantSkin(r.skin, 'maestria')) {
        recompensas.push(r);
      }
    }
  }

  const res = {
    xp,
    xpTotal: reg.xp,
    nivelAntes: antes.nivel,
    nivel: depois.nivel,
    subiu: depois.nivel > antes.nivel,
    recompensas,
  };
  emit('maestria:changed', res);
  return res;
}
