/* =========================================================
   Entidades — criação e desenho das coisas do jogo
   (tamanhos em "unidades lógicas" multiplicados pela escala S)
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

  // Brilho ambiente pulsante
  const glow = reduceMotion ? 18 : 18 + Math.sin(time * 5) * 6;
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = glow;

  // Corpo
  const grad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.15, p.x, p.y, p.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, COLORS.cyan);
  grad.addColorStop(1, COLORS.magenta);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Anel de escudo
  if (p.shield) {
    ctx.strokeStyle = COLORS.green;
    ctx.shadowColor = COLORS.green;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

export function drawObstacle(ctx, o) {
  ctx.shadowColor = o.type === 'drone' ? COLORS.magenta : COLORS.red;
  ctx.shadowBlur = 12;

  if (o.type === 'bar') {
    ctx.fillStyle = 'rgba(255, 77, 109, 0.22)';
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2.5;
    roundRect(ctx, o.x, o.y, o.w, o.h, o.h / 2);
    ctx.fill();
    ctx.stroke();
    // brilho interno
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(o.x + 8, o.y + o.h * 0.35, Math.max(4, o.w - 16), 2);
  } else {
    ctx.fillStyle = 'rgba(255, 61, 240, 0.25)';
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function drawPickup(ctx, pk, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 6 + pk.t) * 0.18;
  const r = pk.r * pulse;

  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 16;
  const grad = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, COLORS.cyan);
  grad.addColorStop(1, 'rgba(34,230,255,0.25)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pk.x, pk.y, r, 0, Math.PI * 2);
  ctx.fill();

  // anel externo fininho
  ctx.strokeStyle = 'rgba(34,230,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pk.x, pk.y, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawPowerup(ctx, pw, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 5) * 0.15;
  const r = pw.r * pulse;
  const color = pw.kind === 'shield' ? COLORS.green : COLORS.yellow;

  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(13,16,36,0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pw.x, pw.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(pw.kind === 'shield' ? '🛡️' : '⚡', pw.x, pw.y + 1);
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
