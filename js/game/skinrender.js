/* =========================================================
   SKIN RENDER — desenho da orbe com a skin equipada
   (corpo/aura/rastro pré-renderizados, sem alocação por frame)

   REGRAS
   • Hitbox IMUTÁVEL: todo o raio aqui deriva de p.r (raio base).
     Nada de shadowBlur nem createRadialGradient POR FRAME —
     gradientes vivem só nos sprites em cache offscreen.
   • Rastro e efeitos usam o pool de partículas existente (particles.js).
   • "Reduzir movimento": animações (pulsar, glitch, cor cíclica)
     viram estáticas.
   • Modo baixo desempenho: se FPS < 55, simplifica o rastro/aura
     automaticamente SEM trocar a skin.
   ========================================================= */

import { resolveLook } from './skins.js';
import { state } from '../core/state.js';
import { burst, ring, shockwave } from './particles.js';
import { getFPS } from '../core/loop.js';

// ---------------------------------------------------------
//  Look equipado (cacheado por skin + personalização)
// ---------------------------------------------------------
let lookKey = '';
let lookCache = null;

export function equippedLook() {
  const eq = state.skins.equipped || 'classic';
  const c = state.skins.custom[eq];
  const key = `${eq}|${c?.paleta || ''}|${c?.rastro || ''}|${c?.aura || ''}`;
  if (key !== lookKey) { lookKey = key; lookCache = resolveLook(eq, c); }
  return lookCache;
}

// ---------------------------------------------------------
//  Qualidade automática (FPS)
// ---------------------------------------------------------
let lowPerf = false;
let lastQCheck = 0;

function qualityTick() {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - lastQCheck < 1000) return;
  lastQCheck = now;
  try { lowPerf = getFPS() > 0 && getFPS() < 55; } catch { lowPerf = false; }
}
export function forceSkinQuality(low) { lowPerf = !!low; lastQCheck = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 1e9; }
export function skinQuality() { return lowPerf ? 'baixo' : 'alto'; }

// ---------------------------------------------------------
//  Sprites em cache (offscreen)
// ---------------------------------------------------------
const SPRITE = 160;
const BODY_CIRCLE = 0.49;          // raio do corpo dentro da caixa (igual ao clássico)
const bodyCache = new Map();

// ---- formas (todos os caminhos desenhados sobre o MESMO raio base) ----
function shapePath(g, forma, cx, cy, R) {
  g.beginPath();
  switch (forma) {
    case 'losango':
      g.moveTo(cx, cy - R); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R, cy);
      g.closePath();
      break;
    case 'hexagono':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      break;
    case 'estrela':
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? R : R * 0.46;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      break;
    case 'cristal':
      g.moveTo(cx, cy - R * 1.12);
      g.lineTo(cx + R * 0.72, cy - R * 0.16);
      g.lineTo(cx, cy + R * 1.12);
      g.lineTo(cx - R * 0.72, cy - R * 0.16);
      g.closePath();
      break;
    case 'gota':
      g.moveTo(cx, cy - R * 1.15);
      g.quadraticCurveTo(cx + R, cy - R * 0.2, cx, cy + R);
      g.quadraticCurveTo(cx - R, cy - R * 0.2, cx, cy - R * 1.15);
      g.closePath();
      break;
    case 'espiral':
    case 'escamas':
    default:
      g.arc(cx, cy, R, 0, Math.PI * 2);
      break;
  }
}

/** Sprite do corpo da skin (chave = skin + paleta + forma — recria só quando muda). */
export function getBodySprite(L) {
  const pal = L.paleta;
  const key = `${L.id}|${L.formaOrbe}|${pal.nucleo}${pal.meio}${pal.borda}${pal.brilho}`;
  let c = bodyCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d');
  const cx = SPRITE / 2, cy = SPRITE / 2, R = SPRITE * BODY_CIRCLE;

  const grad = g.createRadialGradient(cx - R * 0.22, cy - R * 0.26, R * 0.08, cx, cy, R);
  grad.addColorStop(0, pal.nucleo);
  grad.addColorStop(0.45, pal.meio);
  if (L.id === 'classic') {
    // reproduz fielmente o orbe original (ciano → magenta na borda)
    grad.addColorStop(0.6, pal.borda);
    grad.addColorStop(1, '#ff3df0');
  } else {
    grad.addColorStop(1, pal.borda);
  }
  g.fillStyle = grad;
  shapePath(g, L.formaOrbe, cx, cy, R);
  g.fill();
  g.strokeStyle = pal.brilho;
  g.lineWidth = SPRITE * 0.03;
  g.stroke();

  // ---- acentos por skin (identidade, sempre estáticos no sprite) ----
  if (L.id === 'galaxia') {           // estrelas internas
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399, rr = R * (0.3 + ((i * 37) % 60) / 100);
      g.beginPath();
      g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, SPRITE * 0.011, 0, Math.PI * 2);
      g.fill();
    }
  } else if (L.id === 'holograma') {  // linhas de varredura
    g.save();
    shapePath(g, L.formaOrbe, cx, cy, R);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = SPRITE * 0.014;
    for (let y = cy - R; y < cy + R; y += SPRITE * 0.05) {
      g.beginPath(); g.moveTo(cx - R, y); g.lineTo(cx + R, y); g.stroke();
    }
    g.restore();
  } else if (L.id === 'orblux_lendaria') { // anel interno duplo da marca
    g.lineWidth = SPRITE * 0.022;
    g.strokeStyle = pal.meio;                       // ciano
    g.beginPath(); g.arc(cx, cy, R * 0.66, 0.4, 2.6); g.stroke();
    g.strokeStyle = '#ff3df0';                      // magenta
    g.beginPath(); g.arc(cx, cy, R * 0.66, 3.5, 5.7); g.stroke();
  } else if (L.id === 'cyberpunk') {               // glitch estático discreto
    g.globalAlpha = 0.55;
    g.fillStyle = pal.borda;
    g.fillRect(cx - R * 0.7, cy - R * 0.34, R * 1.4, SPRITE * 0.018);
    g.fillStyle = pal.meio;
    g.fillRect(cx - R * 0.5, cy + R * 0.42, R * 1.0, SPRITE * 0.018);
    g.globalAlpha = 1;
  } else if (L.formaOrbe === 'escamas') {           // escamas do Dragão
    g.save();
    shapePath(g, L.formaOrbe, cx, cy, R);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = SPRITE * 0.02;
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const px = cx + col * R * 0.42 + (row % 2 ? R * 0.21 : 0);
        const py = cy + row * R * 0.34;
        g.beginPath();
        g.arc(px, py, R * 0.24, 0.2, Math.PI - 0.2);
        g.stroke();
      }
    }
    g.restore();
  }
  bodyCache.set(key, c);
  return c;
}

// ---------------------------------------------------------
//  Aura (atrás do corpo) — anel/pulsante/órbitas
// ---------------------------------------------------------
export function drawSkinAura(ctx, x, y, R, L, time, reduceMotion, alpha = 1) {
  const a = L.aura;
  if (!a || a.tipo === 'nenhuma' || !a.intensidade) return;
  const color = L.paleta.brilho;
  ctx.strokeStyle = color;
  if (a.tipo === 'anel') {
    ctx.globalAlpha = a.intensidade * 0.7 * alpha;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, R + 5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.tipo === 'pulsante') {
    const k = reduceMotion ? 1 : 1 + Math.sin(time * 4) * 0.14;
    const breathe = reduceMotion ? 0.6 : 0.5 + 0.25 * Math.sin(time * 4);
    ctx.globalAlpha = a.intensidade * breathe * alpha;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, R + 5 + k * 3, 0, Math.PI * 2);
    ctx.stroke();
    if (!reduceMotion && !lowPerf) {           // anel externo sutil
      ctx.globalAlpha = a.intensidade * 0.3 * alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, R + 14 + k * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (a.tipo === 'orbitas') {
    const ang = reduceMotion ? 0 : time * 0.9;
    ctx.globalAlpha = Math.max(0.45, a.intensidade) * alpha;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, R + 13, ang, ang + 1.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R + 13, ang + Math.PI, ang + Math.PI + 1.3); ctx.stroke();
    if (!lowPerf) {
      ctx.lineWidth = 2;
      ctx.globalAlpha = a.intensidade * 0.55 * alpha;
      ctx.beginPath(); ctx.arc(x, y, R + 20, -ang * 1.4, -ang * 1.4 + 1.0); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, R + 20, -ang * 1.4 + Math.PI, -ang * 1.4 + Math.PI + 1.0); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
//  Rastro (por estilo — formas simples, sem alocação)
// ---------------------------------------------------------
const RASTRO_STYLE = {
  pontos:    { shape: 'circulo',  cor: 'borda' },
  faisca:    { shape: 'circulo',  cor: 'brilho', escala: 0.55, flash: true },
  bolha:     { shape: 'bolha',    cor: 'meio',   escala: 0.85 },
  cristal:   { shape: 'diamante', cor: 'borda',  escala: 0.75 },
  floco:     { shape: 'estrela6', cor: 'brilho', escala: 0.8 },
  neve:      { shape: 'estrela6', cor: 'brilho', escala: 0.7,  onda: 0.6 },
  eletrico:  { shape: 'raio',     cor: 'borda',  escala: 0.8,  jitter: 1.6 },
  gradiente: { shape: 'circulo',  cor: 'borda',  ciclo: true },
  estrelas:  { shape: 'estrela5', cor: 'brilho', escala: 0.75 },
  ondulado:  { shape: 'circulo',  cor: 'meio',   escala: 0.8,  onda: 1.0 },
  ondas:     { shape: 'circulo',  cor: 'borda',  escala: 0.85, onda: 1.6 },
  derretido: { shape: 'gota',     cor: 'meio',   escala: 0.9 },
  glitch:    { shape: 'circulo',  cor: 'borda',  escala: 0.7,  jitter: 2.4, flash: true },
  afiado:    { shape: 'lamina',   cor: 'borda',  escala: 1.0 },
  explosao:  { shape: 'circulo',  cor: 'brilho', escala: 1.05, flash: true },
  varredura: { shape: 'circulo',  cor: 'meio',   escala: 0.9,  alpha: 0.22 },
  fogo:      { shape: 'gota',     cor: 'borda',  escala: 0.8,  flash: true },
  orbitas:   { shape: 'circulo',  cor: 'borda',  escala: 0.6,  orbita: true },
};

function colorOf(pal, which) {
  return which === 'nucleo' ? pal.nucleo
    : which === 'meio' ? pal.meio
    : which === 'brilho' ? pal.brilho
    : pal.borda;
}

function trailShape(ctx, shape, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  switch (shape) {
    case 'diamante':
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      break;
    case 'estrela5':
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.46;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'estrela6':
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x - r * 0.5, y - r * 0.87); ctx.lineTo(x + r * 0.5, y + r * 0.87);
      ctx.moveTo(x + r * 0.5, y - r * 0.87); ctx.lineTo(x - r * 0.5, y + r * 0.87);
      ctx.lineWidth = Math.max(1.4, r * 0.5);
      ctx.stroke();
      break;
    case 'gota':
      ctx.moveTo(x, y - r * 1.25);
      ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r);
      ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.25);
      ctx.closePath();
      ctx.fill();
      break;
    case 'lamina': {
      const w = r * 1.5;
      ctx.moveTo(x - w, y - r * 0.22); ctx.lineTo(x + w, y - r * 0.22);
      ctx.lineTo(x + w * 0.82, y + r * 0.22); ctx.lineTo(x - w * 0.82, y + r * 0.22);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'raio':
      ctx.lineWidth = Math.max(1.4, r * 0.4);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.15, y - r * 0.55);
      ctx.lineTo(x + r * 0.2, y + r * 0.35);
      ctx.lineTo(x + r, y - r * 0.2);
      ctx.stroke();
      break;
    case 'bolha':
      ctx.lineWidth = Math.max(1.3, r * 0.35);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
  }
}

/**
 * Rastro com o estilo da skin. Só primitivas de caminho (zero alocação).
 * Respeita "Reduzir movimento" (sem onda/jitter/ciclo/flash) e o
 * modo baixo desempenho (menos pontos, sem extras).
 */
export function drawSkinTrail(ctx, p, L, time, reduceMotion) {
  qualityTick();
  const st = RASTRO_STYLE[L.rastro.tipo] || RASTRO_STYLE.pontos;
  const pal = L.paleta;
  const base = colorOf(pal, st.cor);
  const cycle = [pal.nucleo, pal.meio, pal.borda, pal.brilho];
  const n = p.trail.length;
  if (!n) return;
  const minI = lowPerf ? Math.floor(n * 0.5) : 0;   // baixo desempenho: corta a cauda
  const anim = !reduceMotion;

  for (let i = minI; i < n; i++) {
    const tp = p.trail[i];
    const k = (i + 1) / n;
    let a = k * k * 0.34 * (st.alpha || 1);
    let x = tp.x, y = tp.y;
    let r = p.r * (0.35 + k * 0.8) * (st.escala || 1);

    if (anim) {
      if (st.onda) y += Math.sin(time * 6 + i * 0.9) * r * 0.5 * st.onda;
      if (st.jitter && i % 2 === 0) {
        x += Math.sin(i * 7.13 + time * 37) * st.jitter;
        y += Math.cos(i * 5.71 + time * 31) * st.jitter;
      }
      if (st.orbita) {
        x += Math.cos(time * 5 + i * 1.7) * r * 0.8;
        y += Math.sin(time * 5 + i * 1.7) * r * 0.8;
      }
      if (st.flash) a *= 0.72 + 0.28 * Math.sin(time * 22 + i * 1.3);
    }
    if (a <= 0.02) continue;
    const color = (st.ciclo && anim) ? cycle[(i + Math.floor(time * 6)) % 4] : base;

    ctx.globalAlpha = Math.min(1, a);
    trailShape(ctx, st.shape, x, y, r, color);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
//  Efeito de coleta (pool de partículas existente)
// ---------------------------------------------------------
export function skinCollectFx(x, y, L, reduceMotion) {
  const fx = L.coletaFx;
  const cor = fx.cor;
  const small = reduceMotion;
  switch (fx.tipo) {
    case 'explosao':
      burst(x, y, cor, small ? 6 : 20, 300, 3.4);
      if (!small) shockwave(x, y, cor, 150);
      break;
    case 'onda':
      ring(x, y, cor, small ? 8 : 16, 260);
      if (!small) shockwave(x, y, cor, 130);
      break;
    case 'estrela':
      burst(x, y, cor, small ? 5 : 14, 230, 3);
      if (!small) burst(x, y, '#ffffff', 4, 110, 1.8);
      break;
    case 'cristal':
      burst(x, y, cor, small ? 5 : 13, 250, 2.6);
      if (!small) ring(x, y, cor, 8, 150);
      break;
    case 'fogo':
      burst(x, y, cor, small ? 5 : 15, 245, 3);
      if (!small) burst(x, y, '#ffe45e', 5, 130, 2);
      break;
    case 'gelo':
      burst(x, y, cor, small ? 5 : 12, 205, 2.8);
      if (!small) burst(x, y, '#ffffff', 5, 110, 1.8);
      break;
    default: // 'padrao' / neon
      burst(x, y, cor, small ? 6 : 14, 190, 2.6);
      if (!small) burst(x, y, '#ffffff', 5, 120, 1.8);
  }
}
