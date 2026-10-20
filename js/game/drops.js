/* =========================================================
   DROPS — novos drops (power-ups) da 1.1.0
   Camada ADITIVA sobre o spawner legado: escudo/x2 continuam
   sorteados por spawner.js intocado; este módulo cuida dos 8
   drops novos com RNG próprio (rngDrops, salt "|drops").
   Regras (docs/EVENTOS-E-DROPS.md):
   • cap de 3 efeitos temporários; drop já ativo só RENOVA;
   • piedade por tempo sem drop (nunca garante em sequência);
   • spawn nunca sobre barreira; raros exigem nível mínimo;
   • Corrida do Dia (runSeed) força tudo desligado (mesma
     semente ⇒ mesma corrida para todo mundo).
   Balancear mexendo só em DROP_CONFIG (dados), nunca em lógica.
   ========================================================= */

import { emit } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { state } from '../core/state.js';
import { hashSeed, mulberry32 } from '../../net/rng.js';
import { createPickup, circlesHit } from './entities.js';
import { ring, floatText, shockwave } from './particles.js';

/** Vidas máximas (espelha LIVES_START de game.js — constante local p/ não criar ciclo). */
const VIDAS_MAX = 3;
/** Cap de efeitos temporários simultâneos (regra do design). */
const MAX_FX = 3;

// ---------------------------------------------------------
//  Tabela de balanceamento (dados; editar números aqui)
//  id, nome, desc (toast 1ª vez), icone (sprite SVG), cor,
//  dur (s do efeito; 0 = instantâneo), raridade, peso (roleta),
//  nivelMin, cd (s de cooldown por kind), teto? (por partida),
//  som? (sfx específico)
// ---------------------------------------------------------
export const DROP_CONFIG = [
  {
    id: 'ima',
    nome: 'Ímã',
    desc: 'Atrai os pulsos próximos por alguns segundos',
    icone: 'ic-magnet',
    cor: '#22E6FF',
    dur: 7, raridade: 'comum', peso: 28, nivelMin: 1, cd: 8,
  },
  {
    id: 'coracao',
    nome: 'Reparo',
    desc: 'Recupera 1 vida (até o máximo de 3)',
    icone: 'ic-repair',
    cor: '#7CFFB2',
    dur: 0, raridade: 'rara', peso: 10, nivelMin: 2, cd: 10,
    soVidaBaixa: true,        // nunca aparece com vida cheia
    dobroVidaBaixa: true,     // com 1 vida a chance dobra
    som: 'drop_prot',
  },
  {
    id: 'fantasma',
    nome: 'Fase',
    desc: 'Atravessa obstáculos por alguns segundos',
    icone: 'ic-phase',
    cor: '#B18CFF',
    dur: 4, raridade: 'rara', peso: 8, nivelMin: 3, cd: 14,
  },
  {
    id: 'tempo',
    nome: 'Câmara lenta',
    desc: 'O mundo desacelera — a sua pontuação não muda',
    icone: 'ic-slow',
    cor: '#8FD8FF',
    dur: 5, raridade: 'incomum', peso: 16, nivelMin: 2, cd: 10,
    som: 'drop_tempo',
  },
  {
    id: 'combo',
    nome: 'Trava de combo',
    desc: 'Congela o cronômetro do combo por alguns segundos',
    icone: 'ic-lock',
    cor: '#5FF0E0',
    dur: 8, raridade: 'incomum', peso: 16, nivelMin: 2, cd: 10,
  },
  {
    id: 'nova',
    nome: 'Nova',
    desc: 'Limpa a tela e pontua por item removido',
    icone: 'ic-nova',
    cor: '#FFF4D6',
    dur: 0, raridade: 'rara', peso: 7, nivelMin: 3, cd: 15,
    teto: 3,               // no máximo 3 Novas por partida
  },
  {
    id: 'surto',
    nome: 'Surto de pulsos',
    desc: 'Solta uma fileira de pulsos à sua frente',
    icone: 'ic-surge',
    cor: '#22E6FF',
    dur: 0, raridade: 'incomum', peso: 15, nivelMin: 1, cd: 6,
  },
  // próximo drop entra aqui (cristal, último)
];

/** Efeito por id (adicionado junto do drop correspondente). */
export const EFEITOS = {};
/** Glifo canvas por id (mesmo formato dos ícones SVG, traço 2px). */
export const GLIFOS = {};

// ---------- Ímã ----------
EFEITOS.ima = (g, cfg) => ativarFx(g, 'ima', cfg.dur);

GLIFOS.ima = (ctx, x, y, r) => {
  // ferradura: pernas para cima + pontas transversais
  const w = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(x - w, y - r * 0.7);
  ctx.lineTo(x - w, y);
  ctx.quadraticCurveTo(x - w, y + r * 0.85, x, y + r * 0.85);
  ctx.quadraticCurveTo(x + w, y + r * 0.85, x + w, y);
  ctx.lineTo(x + w, y - r * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w - r * 0.3, y - r * 0.7); ctx.lineTo(x - w + r * 0.3, y - r * 0.7);
  ctx.moveTo(x + w - r * 0.3, y - r * 0.7); ctx.lineTo(x + w + r * 0.3, y - r * 0.7);
  ctx.stroke();
};

// ---------- Reparo ----------
EFEITOS.coracao = (g, cfg) => {
  if (g.lives < VIDAS_MAX) {
    g.lives += 1;
    floatText(g.player.x, g.player.y - 30 * g.S, '+1 VIDA', cfg.cor, 18);
    emit('game:lives', { lives: g.lives });
  } else {
    // segurança: o pool já exclui vida cheia; nunca desperdiça o drop
    g.score += 50;
  }
};

GLIFOS.coracao = (ctx, x, y, r) => {
  // coração geométrico (mesmo estilo do sprite)
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.lineTo(x - r * 0.95, y - r * 0.05);
  ctx.lineTo(x - r * 0.5, y - r * 0.8);
  ctx.lineTo(x, y - r * 0.35);
  ctx.lineTo(x + r * 0.5, y - r * 0.8);
  ctx.lineTo(x + r * 0.95, y - r * 0.05);
  ctx.closePath();
  ctx.stroke();
};

// ---------- Fase ----------
EFEITOS.fantasma = (g, cfg) => ativarFx(g, 'fantasma', cfg.dur);

GLIFOS.fantasma = (ctx, x, y, r) => {
  // anel duplo (fantasma/transpor)
  ctx.beginPath();
  ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
};

// ---------- Câmara lenta ----------
EFEITOS.tempo = (g, cfg) => ativarFx(g, 'tempo', cfg.dur);

GLIFOS.tempo = (ctx, x, y, r) => {
  // ampulheta: barras de topo/base + dois triângulos que se encontram
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y - r * 0.85);
  ctx.lineTo(x + r * 0.7, y - r * 0.85);
  ctx.moveTo(x - r * 0.7, y + r * 0.85);
  ctx.lineTo(x + r * 0.7, y + r * 0.85);
  ctx.moveTo(x - r * 0.6, y - r * 0.72);
  ctx.quadraticCurveTo(x, y, x - r * 0.6, y + r * 0.72);
  ctx.moveTo(x + r * 0.6, y - r * 0.72);
  ctx.quadraticCurveTo(x, y, x + r * 0.6, y + r * 0.72);
  ctx.stroke();
};

// ---------- Trava de combo ----------
EFEITOS.combo = (g, cfg) => ativarFx(g, 'combo', cfg.dur);

GLIFOS.combo = (ctx, x, y, r) => {
  // cadeado: arco + corpo
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y - r * 0.1);
  ctx.lineTo(x - r * 0.45, y - r * 0.4);
  ctx.arc(x, y - r * 0.4, r * 0.45, Math.PI, 0, false);
  ctx.lineTo(x + r * 0.45, y - r * 0.1);
  ctx.stroke();
  ctx.strokeRect(x - r * 0.62, y - r * 0.1, r * 1.24, r * 0.95);
};

// ---------- Nova ----------
EFEITOS.nova = (g, cfg) => {
  // remove obstáculos e drones da tela; +30 por item (teto de 10 itens)
  const itens = g.obstacles.length;
  g.obstacles.length = 0;
  const pts = Math.min(itens, 10) * 30;
  g.score += pts;
  ring(g.player.x, g.player.y, cfg.cor, 20, 520);
  if (!g.reduceMotion) shockwave(g.player.x, g.player.y, cfg.cor, 220 * g.S);
  floatText(g.player.x, g.player.y - 40 * g.S, itens > 0 ? `NOVA! +${pts}` : 'NOVA!', cfg.cor, 22);
};

GLIFOS.nova = (ctx, x, y, r) => {
  // estrela de 8 pontas (explosão)
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.stroke();
};

// ---------- Surto de pulsos ----------
EFEITOS.surto = (g, cfg) => {
  const S = g.S;
  const base = 46 * S;
  const cx = Math.max(base, Math.min(g.W - base, g.player.x));
  const y = Math.max(-40 * S, g.player.y - 140 * S);
  // fileira de 3 pulsos acima do jogador (velocidades com jitter do rng próprio)
  for (let i = -1; i <= 1; i++) {
    g.pickups.push(createPickup(cx + i * base, y - Math.abs(i) * 18 * S, S, rngDrops));
  }
};

GLIFOS.surto = (ctx, x, y, r) => {
  // fileira de 3 losangos (pulsos extras)
  for (let i = -1; i <= 1; i++) {
    const lx = x + i * r * 0.78;
    const rr = i === 0 ? r * 0.52 : r * 0.42;
    ctx.beginPath();
    ctx.moveTo(lx, y - rr);
    ctx.lineTo(lx + rr * 0.72, y);
    ctx.lineTo(lx, y + rr);
    ctx.lineTo(lx - rr * 0.72, y);
    ctx.closePath();
    ctx.stroke();
  }
};

function byId(id) {
  return DROP_CONFIG.find((c) => c.id === id) || null;
}

// ---------------------------------------------------------
//  Flag + RNG próprio
// ---------------------------------------------------------
let FLAG_DROPS_NOVOS = true;

/** Liga/desliga a camada nova (testes e "Jogar sem eventos"). */
export function setDropsNovos(on) { FLAG_DROPS_NOVOS = !!on; }

/** Drops novos ativos nesta partida? Corrida do Dia sempre desliga. */
export function dropsAtivos(g) {
  return FLAG_DROPS_NOVOS && !(g && g.runSeed);
}

let rngDrops = Math.random;

/** RNG dos drops: mulberry32 derivado da semente por salt fixo (nunca o do spawner). */
export function setDropsRng(seed) {
  rngDrops = seed != null ? mulberry32(hashSeed(String(seed) + '|drops')) : Math.random;
}

/** Próximo intervalo entre drops (9–13 s, pelo rng próprio). */
export function nextDropTimer() {
  return 9 + rngDrops() * 4;
}

// ---------------------------------------------------------
//  Estado da partida
// ---------------------------------------------------------
export function resetDrops(g) {
  g.drops = [];
  g.dropFx = {};
  g.dropCd = {};
  g.dropCounts = {};
  g.dropSemTempo = 0;
  g.dropTimer = dropsAtivos(g) ? 7 : Infinity;
  if (g.runStats) {
    g.runStats.drops = 0;
    g.runStats.crystals = 0;
    g.runStats.dropsByKind = {};
  }
}

/** Restante (s) de um efeito temporário, ou 0. */
export function fx(g, kind) {
  return (g.dropFx && g.dropFx[kind]) || 0;
}

/**
 * Ativa/renova um efeito temporário. Drop já ativo RENOVA o tempo
 * (não empilha); com o cap de 3 atingido, o mais antigo expira.
 */
export function ativarFx(g, kind, dur) {
  if (!g.dropFx) g.dropFx = {};
  // renovação reordena: a ordem das chaves = recência de ativação
  if (kind in g.dropFx) delete g.dropFx[kind];
  g.dropFx[kind] = dur;
  const ativos = Object.keys(g.dropFx);
  if (ativos.length > MAX_FX) {
    const maisAntigo = ativos.find((k) => k !== kind);
    if (maisAntigo) {
      delete g.dropFx[maisAntigo];
      emit('game:powerup:end', { kind: maisAntigo });
    }
  }
}

/** Tick dos drops: efeitos temporários, cooldowns, queda e idade. */
export function updateDrops(g, dt) {
  if (g.dropFx) {
    for (const kind of Object.keys(g.dropFx)) {
      g.dropFx[kind] -= dt;
      if (g.dropFx[kind] <= 0) {
        delete g.dropFx[kind];
        emit('game:powerup:end', { kind });
      }
    }
  }
  if (g.dropCd) {
    for (const k of Object.keys(g.dropCd)) {
      g.dropCd[k] -= dt;
      if (g.dropCd[k] <= 0) delete g.dropCd[k];
    }
  }
  if (g.dropSemTempo != null) g.dropSemTempo += dt;
  const lento = fx(g, 'tempo') > 0 ? 0.7 : 1;   // câmara lenta: queda a 70%
  for (const d of g.drops) {
    d.y += d.vy * dt * lento;
    if (d.glow > 0) d.glow -= dt;
  }
}

// ---------------------------------------------------------
//  Spawn (roleta ponderada + piedade + posição segura)
// ---------------------------------------------------------
function elegiveis(g) {
  const res = [];
  for (const cfg of DROP_CONFIG) {
    if ((cfg.nivelMin || 1) > g.level) continue;
    if (g.dropCd[cfg.id]) continue;
    if (cfg.teto && (g.dropCounts[cfg.id] || 0) >= cfg.teto) continue;
    if (cfg.soVidaBaixa && g.lives >= VIDAS_MAX) continue;
    res.push(cfg);
  }
  return res;
}

/** Peso final: piedade (raros dobram no teto; nunca garantido). */
function pesoDe(g, cfg) {
  let peso = cfg.peso;
  if (cfg.raridade !== 'comum') {
    peso *= 1 + Math.min(1, (g.dropSemTempo || 0) / 45);
  }
  if (cfg.dobroVidaBaixa && g.lives === 1) peso *= 2;
  return peso;
}

/** Sorteia e nasce um drop; posição nunca sobre barreira (4 tentativas). */
export function spawnDrop(g) {
  if (!dropsAtivos(g)) return false;
  const cands = elegiveis(g);
  if (!cands.length) return false;
  let total = 0;
  const pesos = cands.map((c) => { const p = pesoDe(g, c); total += p; return p; });
  let r = rngDrops() * total;
  let escolhido = cands[cands.length - 1];
  for (let i = 0; i < cands.length; i++) {
    r -= pesos[i];
    if (r <= 0) { escolhido = cands[i]; break; }
  }
  const S = g.S;
  const margem = 60 * S;
  let x = g.W / 2;
  let ok = false;
  for (let t = 0; t < 4; t++) {
    x = margem + rngDrops() * (g.W - margem * 2);
    // nasce no topo (y = -50*S): folga de 90*S da BORDA de qualquer barreira
    ok = g.obstacles.every((o) => {
      if (o.type === 'bar') {
        const dx = Math.max(0, Math.abs(x - (o.x + o.w / 2)) - o.w / 2);
        const dy = Math.max(0, Math.abs(-50 * S - (o.y + o.h / 2)) - o.h / 2);
        return Math.hypot(dx, dy) > 90 * S;
      }
      return Math.hypot(x - o.x, -50 * S - o.y) - o.r > 90 * S;
    });
    if (ok) break;
  }
  if (!ok) return false;                 // sem espaço: tenta no próximo timer
  g.drops.push({
    kind: escolhido.id, x, y: -50 * S, r: 13 * S, vy: 170 * S, t: 0, glow: 0.4,
  });
  g.dropCd[escolhido.id] = escolhido.cd;
  return true;
}

// ---------------------------------------------------------
//  Coleta
// ---------------------------------------------------------
export function collectDrop(g, pw) {
  const cfg = byId(pw.kind);
  if (!cfg) return;
  const S = g.S;
  g.runStats.drops = (g.runStats.drops || 0) + 1;
  g.runStats.dropsByKind = g.runStats.dropsByKind || {};
  g.runStats.dropsByKind[cfg.id] = (g.runStats.dropsByKind[cfg.id] || 0) + 1;
  g.dropSemTempo = 0;                    // piedade recomeça ao ganhar qualquer drop
  if (cfg.teto) g.dropCounts[cfg.id] = (g.dropCounts[cfg.id] || 0) + 1;
  sfx(cfg.som || 'drop');
  if (state.settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(18); } catch { /* ignore */ }
  }
  const efeito = EFEITOS[cfg.id];
  if (efeito) efeito(g, cfg, pw);
  ring(pw.x, pw.y, cfg.cor, 14, 240);
  floatText(pw.x, pw.y - 20 * S, cfg.nome.toUpperCase(), cfg.cor, 16);
  // toast de apresentação único por novelty (salvo em state.stats)
  const vistos = state.stats.vistoDrops || [];
  if (!vistos.includes(cfg.id)) {
    state.stats.vistoDrops = [...vistos, cfg.id];
    emit('drop:first', { kind: cfg.id, nome: cfg.nome, desc: cfg.desc, icone: cfg.icone });
  }
  emit('game:powerup', { kind: cfg.id, duration: cfg.dur || 0 });
}

/** Colisão jogador × drops (chamado pelo update do game.js). */
export function tryCollectDrop(g, p) {
  for (let i = g.drops.length - 1; i >= 0; i--) {
    const d = g.drops[i];
    if (d.y > g.H + 40 * g.S) { g.drops.splice(i, 1); continue; }
    if (circlesHit(p.x, p.y, p.r, d.x, d.y, d.r)) {
      g.drops.splice(i, 1);
      collectDrop(g, d);
    }
  }
}

/** Atração do Ímã no raio configurado (0 = sem efeito). */
export function atracaoRaio(g) {
  return fx(g, 'ima') > 0 ? 150 * g.S : 0;
}

// ---------------------------------------------------------
//  Render (glifos por traço, sem blur; entrada com fade simples)
// ---------------------------------------------------------
export function drawDrops(ctx, g, time) {
  const S = g.S;
  for (const d of g.drops) {
    const cfg = byId(d.kind);
    if (!cfg) continue;
    if (d.glow > 0 && !g.reduceMotion) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.glow / 0.4) * 0.5;
      ctx.strokeStyle = cfg.cor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + (1 - d.glow / 0.4) * 10 * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = cfg.cor;
    ctx.fillStyle = cfg.cor;
    ctx.lineWidth = Math.max(1.5, 2 * S);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const glifo = GLIFOS[cfg.id];
    if (glifo) {
      glifo(ctx, d.x, d.y, d.r, time, g.reduceMotion);
    } else {
      // fallback: losango neutro (nenhum drop fica sem forma)
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - d.r);
      ctx.lineTo(d.x + d.r, d.y);
      ctx.lineTo(d.x, d.y + d.r);
      ctx.lineTo(d.x - d.r, d.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}
