/* =========================================================
   EVENTOS — eventos de partida da 1.1.0
   Camada ADITIVA: agem via g.eventoMod { obstMul, pickupMul,
   comboWindow, goldMul } lido por game.js com fallback (|| padrão).
   Regras (docs/EVENTOS-E-DROPS.md):
   • 1º evento só após 25 s e nível ≥2; depois intervalo ≥35 s;
   • máximo 1 ativo por vez; aviso de 2 s (toast + faixa + som);
   • fim limpo: mods zerados, timers fora, nada vaza;
   • pausa congela (update só roda em modo playing);
   • "Reduzir movimento": sem tremor/flash, só aviso estático e cor;
   • Corrida do Dia (runSeed) e ajuste "Eventos" desligam tudo;
   • RNG próprio (rngEventos, salt "|eventos") — nunca o do spawner.
   Balancear mexendo só em EVENT_CONFIG (dados), nunca em lógica.
   ========================================================= */

import { emit } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { state } from '../core/state.js';
import { hashSeed, mulberry32 } from '../../net/rng.js';
import { createPickup } from './entities.js';
import { floatText } from './particles.js';
import { difficultyParams } from './spawner.js';

/** Segundos de aviso antes do início (regra do design). */
const AVISO_S = 2;
/** Intervalo mínimo entre eventos (regra do design). */
const INTERVALO_MIN = 35;

// ---------------------------------------------------------
//  Tabela de balanceamento (dados; editar números aqui)
//  id, nome, desc (toast 1ª vez), cor, dur (s), nivelMin,
//  cd (cooldown por evento após usar)
//  Handlers em EFEITOS: { inicio(g), tick(g, dt), fim(g, limpo),
//  desenhar(ctx, g, time) }
// ---------------------------------------------------------
export const EVENT_CONFIG = [
  {
    id: 'chuva',
    nome: 'Chuva de Pulsos',
    desc: 'Muitos pulsos caem — monte combo e pontue forte',
    cor: '#7DF9FF',
    dur: 10, nivelMin: 2, cd: 40,
  },
  {
    id: 'tempestade',
    nome: 'Tempestade de Barreiras',
    desc: 'Barreiras com passagem larga — desvie sem bater e ganhe bônus',
    cor: '#FF6B6B',
    dur: 12, nivelMin: 3, cd: 55,
  },
  {
    id: 'hora_dourada',
    nome: 'Hora Dourada',
    desc: 'Cada pulso coletado vale 50% a mais de pontos',
    cor: '#FFD54A',
    dur: 8, nivelMin: 2, cd: 45,
  },
  // próximos eventos entram aqui um por commit
];

/** Handlers por id (adicionados junto do evento correspondente). */
export const EFEITOS = {};

// ---------- Chuva de Pulsos ----------
EFEITOS.chuva = {
  inicio(g) {
    g.eventoMod = { obstMul: 2.2 };        // barreiras raras durante o evento
    g.evAcc = 0;
  },
  tick(g, dt) {
    // clusters extras a cada 0,6 s com o rng dos eventos (nunca o do spawner)
    g.evAcc -= dt;
    if (g.evAcc <= 0) {
      g.evAcc = 0.6;
      const S = g.S;
      const margem = 40 * S;
      const n = rngEventos() < 0.4 ? 3 : 1;
      const x = margem + rngEventos() * (g.W - margem * 2);
      for (let i = 0; i < n; i++) {
        g.pickups.push(createPickup(x + (i - (n - 1) / 2) * 46 * S, -40 * S, S, rngEventos));
      }
    }
  },
  fim(g) {
    g.eventoMod = null;                    // limpeza explícita (encerrar já garante)
  },
};

// ---------- Tempestade de Barreiras ----------
EFEITOS.tempestade = {
  inicio(g) {
    g.eventoMod = { obstMul: 1.8 };        // barreiras normais ~2x mais raras
    g.evAcc = 1.2;                         // primeira barra em ~1,2 s
  },
  tick(g, dt) {
    // barreiras do evento a cada 2,2 s: duas peças com passagem LARGA
    // telegrafada (rota segura garantida — validada em 500 sementes)
    g.evAcc -= dt;
    if (g.evAcc <= 0) {
      g.evAcc = 2.2;
      const S = g.S;
      const gapW = 210 * S;                // passagem ≥ 7× o raio do jogador
      const minC = 30 * S + gapW / 2;      // folga das laterais
      const maxC = g.W - 30 * S - gapW / 2;
      const cx = minC + rngEventos() * Math.max(0, maxC - minC);
      const dp = difficultyParams(g.elapsed, false);
      const vy = 260 * S * dp.speedMul;    // mesma velocidade das normais
      const y = -40 * S;
      const h = 16 * S;
      const wL = cx - gapW / 2;
      const wR = g.W - (cx + gapW / 2);
      g.obstacles.push(
        { type: 'bar', x: 0, y, w: wL, h, vy, halfW: wL / 2, evCx: cx, evGapW: gapW },
        { type: 'bar', x: cx + gapW / 2, y, w: wR, h, vy, halfW: wR / 2, evCx: cx, evGapW: gapW },
      );
    }
  },
  fim(g, limpo) {
    g.eventoMod = null;
    if (limpo) {
      // recompensa fixa com teto (bônus único por evento, nunca multiplicativo)
      g.score += 150;
      g.runStats.eventsClean = (g.runStats.eventsClean || 0) + 1;
      floatText(g.W / 2, g.H * 0.24, 'TEMPESTADE SUPERADA +150', '#FFE45E', 18);
      emit('game:score', { score: Math.floor(g.score) });
    }
  },
  desenhar(ctx, g) {
    // telegrafia: coluna translúcida da passagem da barreira mais baixa
    let alvo = null;
    for (const o of g.obstacles) {
      if (o.evCx != null && (!alvo || o.y > alvo.y)) alvo = o;
    }
    if (!alvo) return;
    const S = g.S;
    const gl = alvo.evCx - alvo.evGapW / 2;
    const gr = alvo.evCx + alvo.evGapW / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 107, 107, 0.08)';
    ctx.fillRect(gl, alvo.y, gr - gl, g.H - alvo.y);
    ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
    ctx.fillRect(gl - 2 * S, alvo.y, 2 * S, g.H - alvo.y);
    ctx.fillRect(gr, alvo.y, 2 * S, g.H - alvo.y);
    ctx.restore();
  },
};

// ---------- Hora Dourada ----------
EFEITOS.hora_dourada = {
  inicio(g) {
    // só a coleta vale ×1,5 (bônus fixos e near-miss intactos; cap pela
    // duração de8 s — nunca multiplica pontos/segundo indefinidamente)
    g.eventoMod = { goldMul: 1.5 };
  },
  fim(g) {
    g.eventoMod = null;
  },
  desenhar(ctx, g) {
    // tom quente sutil no mundo (≤8% de alfa — nunca ofusca o jogo)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 196, 64, 0.07)';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.restore();
  },
};

// ---------------------------------------------------------
//  Flag + RNG próprio
// ---------------------------------------------------------
let FLAG_EVENTOS = true;

/** Liga/desliga a camada de eventos (testes). */
export function setEventosOn(on) { FLAG_EVENTOS = !!on; }

/** Eventos ativos nesta partida? Corrida do Dia e ajuste desligam. */
export function eventosAtivos(g) {
  return FLAG_EVENTOS
    && state.settings.eventos !== false
    && !(g && g.runSeed);
}

let rngEventos = Math.random;

/** RNG dos eventos: mulberry32 derivado da semente por salt fixo. */
export function setEventosRng(seed) {
  rngEventos = seed != null ? mulberry32(hashSeed(String(seed) + '|eventos')) : Math.random;
}

// ---------------------------------------------------------
//  Estado da partida
// ---------------------------------------------------------
export function resetEventos(g) {
  g.evento = null;                 // { id, cfg, fase: 'aviso'|'ativo', resto, dur }
  g.eventoMod = null;              // mods aditivos vigentes (null = padrões)
  g.eventoCd = {};                 // cooldown por evento
  g.eventoUltimo = null;           // sem repetir o mesmo evento em sequência
  g.eventoHouveBatida = false;     // "sem arranhão" (tempestade)
  g.eventoProx = eventosAtivos(g) ? 25 : Infinity;
  if (g.runStats) {
    g.runStats.events = 0;
    g.runStats.eventsClean = 0;
  }
}

// ---------------------------------------------------------
//  Agendador
// ---------------------------------------------------------
function sortear(g) {
  const nivelOk = (c) => (c.nivelMin || 1) <= g.level && !g.eventoCd[c.id];
  const eleg = EVENT_CONFIG.filter((c) => nivelOk(c) && c.id !== g.eventoUltimo);
  const pool = eleg.length
    ? eleg
    : EVENT_CONFIG.filter(nivelOk);       // fallback: pode repetir, nunca trava
  if (!pool.length) return null;
  return pool[Math.floor(rngEventos() * pool.length)];
}

function avisar(g, cfg) {
  g.evento = { id: cfg.id, cfg, fase: 'aviso', resto: AVISO_S, dur: cfg.dur };
  sfx('evento');
  // novelty: toast de apresentação único por evento
  const vistos = state.stats.vistoEventos || [];
  if (!vistos.includes(cfg.id)) {
    state.stats.vistoEventos = [...vistos, cfg.id];
    emit('evento:first', { id: cfg.id, nome: cfg.nome, desc: cfg.desc });
  }
  emit('evento:aviso', { id: cfg.id, nome: cfg.nome, cor: cfg.cor });
}

function iniciar(g) {
  const ev = g.evento;
  ev.fase = 'ativo';
  ev.resto = ev.dur;
  g.eventoHouveBatida = false;
  const h = EFEITOS[ev.id];
  if (h && h.inicio) h.inicio(g);
  sfx('evento_start');
  emit('evento:inicio', { id: ev.id, nome: ev.cfg.nome, cor: ev.cfg.cor, dur: ev.dur });
}

function encerrar(g) {
  const ev = g.evento;
  const h = EFEITOS[ev.id];
  const limpo = !g.eventoHouveBatida;
  if (h && h.fim) h.fim(g, limpo);         // recompensas com teto moram no handler
  g.evento = null;
  g.eventoMod = null;                      // garantia: fim nunca vaza efeitos
  g.eventoUltimo = ev.id;
  g.eventoCd[ev.id] = ev.cfg.cd;
  g.eventoProx = INTERVALO_MIN + rngEventos() * 10;   // 35–45 s
  g.runStats.events = (g.runStats.events || 0) + 1;
  sfx('evento_end');
  emit('evento:fim', { id: ev.id, limpo });
}

/** Tick do scheduler (chamado pelo update do game.js; pausa congela junto). */
export function updateEventos(g, dt) {
  if (!eventosAtivos(g)) return;
  for (const k of Object.keys(g.eventoCd)) {
    g.eventoCd[k] -= dt;
    if (g.eventoCd[k] <= 0) delete g.eventoCd[k];
  }
  if (g.evento) {
    const ev = g.evento;
    ev.resto -= dt;
    if (ev.fase === 'aviso') {
      if (ev.resto <= 0) iniciar(g);
    } else {
      const h = EFEITOS[ev.id];
      if (h && h.tick) h.tick(g, dt);
      if (ev.resto <= 0) encerrar(g);
    }
    return;
  }
  g.eventoProx -= dt;
  if (g.eventoProx <= 0) {
    const cfg = sortear(g);
    if (cfg) avisar(g, cfg);
    else g.eventoProx = 8;                 // nada elegível: tenta de novo em8 s
  }
}

// ---------------------------------------------------------
//  Render (sobreposições por evento; saem limpas ao fim)
// ---------------------------------------------------------
export function drawEventoOverlay(ctx, g, time) {
  if (!g.evento || g.evento.fase !== 'ativo') return;
  const h = EFEITOS[g.evento.id];
  if (h && h.desenhar) h.desenhar(ctx, g, time);
}
