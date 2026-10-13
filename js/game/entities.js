/* =========================================================
   Entidades — criação e desenho das coisas do jogo
   (tamanhos em "unidades lógicas" multiplicados pela escala S)

   Legibilidade visual:
   - obstáculos: barra retangular vermelha / drone circular magenta
   - coletáveis: LOSANGO ciano (forma != obstáculos, não só cor)
   - power-ups: HEXÁGono verde/amarelo
   Performance: glows pré-renderizados em canvas offscreen
   (sem shadowBlur por frame nos objetos da tela).
   ========================================================= */

export const COLORS = {
  cyan: '#22e6ff',
  magenta: '#ff3df0',
  yellow: '#ffe45e',
  green: '#4dff9e',
  red: '#ff4d6d',
  white: '#ffffff',
};

// ---------------------------------------------------------
//  Criação
// ---------------------------------------------------------
export function createPlayer(x, y, r) {
  return {
    x, y, r,
    vx: 0, vy: 0,
    trail: [],          // últimas posições (rastro)
    invuln: 0,          // invulnerabilidade (s)
    shield: false,
    pulse: 0,           // fase da animação de brilho
  };
}

export function createObstacle(type, x, y, S, vy) {
  if (type === 'drone') {
    return { type, x, y, r: 13 * S, vy, swayAmp: 46 * S, swayFreq: 1.6 + Math.random() * 1.2, t: 0, phase: Math.random() * Math.PI * 2, baseX: x };
  }
  // 'bar' — barra horizontal que cai
  const w = (70 + Math.random() * 90) * S;
  return { type: 'bar', x: x - w / 2, y, w, h: 13 * S, vy, halfW: w / 2 };
}

export function createPickup(x, y, S) {
  return { x, y, r: 10 * S, vy: 150 * S, t: Math.random() * Math.PI * 2 };
}

export function createPowerup(kind, x, y, S) {
  // kind: 'shield' | 'x2'
  return { kind, x, y, r: 14 * S, vy: 170 * S, t: 0 };
}

// ---------------------------------------------------------
//  Colisões (formas simples e baratas)
// ---------------------------------------------------------
/** Círculo vs retângulo (ponto mais próximo). */
export function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= cr * cr;
}

export function circlesHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

// ---------------------------------------------------------
//  Glows pré-renderizados (cache offscreen — barato no mobile)
// ---------------------------------------------------------
const GLOW_SIZE = 96;
const glowCache = new Map();

function getGlow(color) {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = GLOW_SIZE;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(GLOW_SIZE / 2, GLOW_SIZE / 2, 0, GLOW_SIZE / 2, GLOW_SIZE / 2, GLOW_SIZE / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, `${color}88`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    glowCache.set(color, c);
  }
  return c;
}

function drawGlow(ctx, x, y, r, color, alpha = 0.85) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(getGlow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
//  Desenho
// ---------------------------------------------------------
export function drawPlayer(ctx, p, time, reduceMotion) {
  const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
  if (blink) return;

  // Rastro
  for (let i = 0; i < p.trail.length; i++) {
    const tp = p.trail[i];
    const k = i / p.trail.length;
    ctx.globalAlpha = k * 0.32;
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, p.r * k * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Brilho ambiente pulsante (sprite offscreen, não shadowBlur)
  const glow = reduceMotion ? p.r * 2.2 : p.r * (2.2 + Math.sin(time * 5) * 0.6);
  drawGlow(ctx, p.x, p.y, glow, COLORS.cyan, 0.8);

  // Corpo
  const grad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.15, p.x, p.y, p.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, COLORS.cyan);
  grad.addColorStop(1, COLORS.magenta);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();

  // Anel de escudo
  if (p.shield) {
    drawGlow(ctx, p.x, p.y, p.r * 2.6, COLORS.green, 0.6);
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8 + (reduceMotion ? 0 : Math.sin(time * 6) * 2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawObstacle(ctx, o) {
  if (o.type === 'bar') {
    drawGlow(ctx, o.x + o.w / 2, o.y + o.h / 2, o.w * 0.72, COLORS.red, 0.5);
    ctx.fillStyle = 'rgba(255, 77, 109, 0.22)';
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2.5;
    roundRect(ctx, o.x, o.y, o.w, o.h, o.h / 2);
    ctx.fill();
    ctx.stroke();
    // listra interna (reforça a forma retangular p/ daltonismo)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(o.x + 8, o.y + o.h * 0.35, Math.max(4, o.w - 16), 2);
  } else {
    drawGlow(ctx, o.x, o.y, o.r * 2.6, COLORS.magenta, 0.55);
    ctx.fillStyle = 'rgba(255, 61, 240, 0.25)';
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // "olho" do drone (marca a forma circular)
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPickup(ctx, pk, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 6 + pk.t) * 0.18;
  const r = pk.r * pulse;

  drawGlow(ctx, pk.x, pk.y, r * 2.4, COLORS.cyan, 0.7);

  // LOSANGO — forma própria dos coletáveis (nunca confundido com obstáculo)
  const grad = ctx.createRadialGradient(pk.x - r * 0.25, pk.y - r * 0.25, r * 0.12, pk.x, pk.y, r * 1.25);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, COLORS.cyan);
  grad.addColorStop(1, 'rgba(34,230,255,0.35)');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(34,230,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pk.x, pk.y - r * 1.25);
  ctx.lineTo(pk.x + r, pk.y);
  ctx.lineTo(pk.x, pk.y + r * 1.25);
  ctx.lineTo(pk.x - r, pk.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // centro pulsante
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(pk.x, pk.y, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPowerup(ctx, pw, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 5) * 0.15;
  const r = pw.r * pulse;
  const color = pw.kind === 'shield' ? COLORS.green : COLORS.yellow;

  drawGlow(ctx, pw.x, pw.y, r * 2.6, color, 0.75);

  // HEXÁGONO — forma própria dos power-ups
  ctx.fillStyle = 'rgba(13,16,36,0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = pw.x + Math.cos(a) * r;
    const py = pw.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // glifos vetoriais (sem emoji: renderizam igual em qualquer SO/fonte)
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.lineJoin = 'round';
  if (pw.kind === 'shield') drawShieldGlyph(ctx, pw.x, pw.y, r);
  else drawBoltGlyph(ctx, pw.x, pw.y, r);
}

/** Escudo (contorno). */
function drawShieldGlyph(ctx, cx, cy, r) {
  const k = r * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - k);
  ctx.lineTo(cx + k * 0.8, cy - k * 0.5);
  ctx.lineTo(cx + k * 0.8, cy + k * 0.15);
  ctx.quadraticCurveTo(cx + k * 0.8, cy + k * 0.75, cx, cy + k);
  ctx.quadraticCurveTo(cx - k * 0.8, cy + k * 0.75, cx - k * 0.8, cy + k * 0.15);
  ctx.lineTo(cx - k * 0.8, cy - k * 0.5);
  ctx.closePath();
  ctx.stroke();
}

/** Raio (preenchido). */
function drawBoltGlyph(ctx, cx, cy, r) {
  const k = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx + k * 0.3, cy - k);
  ctx.lineTo(cx - k * 0.55, cy + k * 0.15);
  ctx.lineTo(cx - k * 0.05, cy + k * 0.15);
  ctx.lineTo(cx - k * 0.3, cy + k);
  ctx.lineTo(cx + k * 0.55, cy - k * 0.15);
  ctx.lineTo(cx + k * 0.05, cy - k * 0.15);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
