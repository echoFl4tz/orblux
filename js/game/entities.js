/* =========================================================
   Entidades — criação e desenho das coisas do jogo
   (tamanhos em "unidades lógicas" multiplicados pela escala S)

   Hierarquia visual (camadas, do fundo para a frente):
   fundo < decoração < pulsos/power-ups < obstáculos < orbe < partículas
   - obstáculos: TUBO vermelho (barra) / HEXÁGONO magenta (drone)
   - coletáveis: LOSANGO ciano
   - power-ups: hexágono verde (escudo) / estrela dourada (x2)

   A hitbox NÃO muda: só o desenho cresce, com o núcleo sólido
   alinhado à área real de colisão (leitura fiel da colisão).

   Performance: glows e corpos pré-renderizados em canvas offscreen
   (sem shadowBlur nem createRadialGradient por frame nos objetos).
   ========================================================= */

export const COLORS = {
  cyan: '#22e6ff',
  magenta: '#ff3df0',
  yellow: '#ffe45e',
  green: '#4dff9e',
  red: '#ff4d6d',
  orange: '#ff8a4d',
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
//  Sprites e glows pré-renderizados (cache offscreen — barato no mobile)
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

/** Brilho curto e nítido (sprite), alpha externo controlável. */
function drawGlow(ctx, x, y, r, color, alpha = 0.85) {
  if (alpha <= 0 || r <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(getGlow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

const SPRITE_SIZE = 160;
const spriteCache = new Map();
function getSprite(key, paint) {
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = SPRITE_SIZE;
    paint(c.getContext('2d'), SPRITE_SIZE);
    spriteCache.set(key, c);
  }
  return c;
}

/** Corpo da orbe: núcleo branco brilhante → ciano → magenta. */
const ORB_CIRCLE = 0.49; // raio do círculo dentro da caixa do sprite (n)
function getOrbSprite() {
  return getSprite('orb', (g, n) => {
    const grad = g.createRadialGradient(n * 0.4, n * 0.38, n * 0.05, n / 2, n / 2, n * 0.5);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.38, '#bdf8ff');
    grad.addColorStop(0.6, COLORS.cyan);
    grad.addColorStop(1, COLORS.magenta);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(n / 2, n / 2, n * ORB_CIRCLE, 0, Math.PI * 2);
    g.fill();
  });
}

/** Losango do pulso (coletável): gradiente ciano + centro claro. */
const PICK_CIRCLE = 0.44; // meia-largura do losango dentro da caixa (n)
function getPickupSprite() {
  return getSprite('pickup', (g, n) => {
    const cx = n / 2, cy = n / 2;
    const rx = n * PICK_CIRCLE, ry = rx * 1.25;
    const grad = g.createRadialGradient(cx - rx * 0.25, cy - ry * 0.3, rx * 0.12, cx, cy, ry);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, COLORS.cyan);
    grad.addColorStop(1, 'rgba(34,230,255,0.5)');
    g.fillStyle = grad;
    g.strokeStyle = 'rgba(190,248,255,0.95)';
    g.lineWidth = n * 0.028;
    g.beginPath();
    g.moveTo(cx, cy - ry);
    g.lineTo(cx + rx, cy);
    g.lineTo(cx, cy + ry);
    g.lineTo(cx - rx, cy);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(cx, cy, rx * 0.3, 0, Math.PI * 2);
    g.fill();
  });
}

// ---------------------------------------------------------
//  Desenho — orbe do jogador
// ---------------------------------------------------------
const ORB_SCALE = 1.25; // visual +25% (a hitbox/colisão continua p.r)

export function drawPlayer(ctx, p, time, reduceMotion) {
  const R = p.r * ORB_SCALE;

  // Rastro: mais longo e com fade suave (curva quadrada)
  for (let i = 0; i < p.trail.length; i++) {
    const tp = p.trail[i];
    const k = (i + 1) / p.trail.length;
    ctx.globalAlpha = k * k * 0.34;
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, p.r * (0.35 + k * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Invulnerabilidade: pisca por opacidade — nunca some por completo (piso 0.35)
  let alpha = 1;
  if (p.invuln > 0) {
    alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 16));
    if (alpha < 0.35) alpha = 0.35;
  }

  // Halo ciano constante (sprite offscreen, sem pulso grande)
  drawGlow(ctx, p.x, p.y, R * 2.1, COLORS.cyan, 0.72 * alpha);

  // Corpo pré-renderizado (sem gradiente radial por frame)
  // Squash & stretch: estica na direção do movimento (direção = rastro)
  const box = R / ORB_CIRCLE;
  let ang = 0, stretch = 0;
  if (!reduceMotion && p.trail.length >= 2) {
    const a = p.trail[p.trail.length - 2];
    const b = p.trail[p.trail.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const sp = Math.hypot(dx, dy);
    const k = Math.min(1, sp / Math.max(1, p.r * 0.30));
    if (k > 0.18) { ang = Math.atan2(dy, dx); stretch = k; }
  }
  ctx.globalAlpha = alpha;
  if (stretch > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.scale(1 + 0.16 * stretch, 1 / (1 + 0.10 * stretch));
    ctx.drawImage(getOrbSprite(), -box / 2, -box / 2, box, box);
    ctx.restore();
  } else {
    ctx.drawImage(getOrbSprite(), p.x - box / 2, p.y - box / 2, box, box);
  }
  ctx.globalAlpha = 1;

  // Anel externo sutil
  ctx.globalAlpha = 0.5 * alpha;
  ctx.strokeStyle = 'rgba(190,248,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Durante a invulnerabilidade: anel branco ao redor
  if (p.invuln > 0) {
    ctx.globalAlpha = 0.35 + 0.55 * alpha;
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Anel de escudo
  if (p.shield) {
    drawGlow(ctx, p.x, p.y, R * 2.6, COLORS.green, 0.6);
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R + 9 + (reduceMotion ? 0 : Math.sin(time * 6) * 2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------
//  Desenho — obstáculos (hitbox inalterada)
// ---------------------------------------------------------
const BAR_VIS_H = 21;    // altura visual do tubo (unidades lógicas)
const barGradCache = new Map();

/** Gradiente horizontal do tubo (#ff4d6d → #ff8a4d), cacheado por largura lógica. */
function getBarGradient(ctx, w, S) {
  const key = Math.round(w / S);
  let grad = barGradCache.get(key);
  if (!grad) {
    grad = ctx.createLinearGradient(0, 0, key * S, 0);
    grad.addColorStop(0, COLORS.red);
    grad.addColorStop(0.5, COLORS.orange);
    grad.addColorStop(1, COLORS.red);
    barGradCache.set(key, grad);
  }
  return grad;
}

function hexPath(ctx, cx, cy, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2 + rot;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * @param {{contrast?: boolean}} opts  alto contraste = contorno branco extra
 */
export function drawObstacle(ctx, o, opts = {}) {
  if (o.type === 'bar') {
    const S = o.h / 13;                    // escala lógica do objeto
    const vh = BAR_VIS_H * S;              // visual: ~21 unidades
    const cy = o.y + o.h / 2;              // centro = centro da hitbox
    const yTop = cy - vh / 2;

    // brilho curto do tubo (sprite offscreen — sem halo grande borrado)
    drawGlow(ctx, o.x + o.w / 2, cy, vh * 1.2, COLORS.red, 0.24);

    // tubo translúcido com contorno nítido de 3px (pontas arredondadas)
    const paint = (fill, stroke, lw) => {
      ctx.beginPath();
      roundRect(ctx, o.x, yTop, o.w, vh, vh / 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    };
    paint('rgba(255,77,109,0.30)', null, 0);
    if (opts.contrast) paint(null, '#ffffff', 6);            // contorno branco extra
    paint(null, getBarGradient(ctx, o.w, S), 3);             // contorno neon do tubo

    // núcleo interno claro — alinhado À HITBOX (13 unidades): é ele que "lê" como corpo sólido
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,226,220,0.85)';
    roundRect(ctx, o.x + vh * 0.4, cy - 1.75 * S, Math.max(4, o.w - vh * 0.8), 3.5 * S, 1.75 * S);
    ctx.fill();
  } else {
    // drone: HEXÁGONO magenta com núcleo claro girando devagar
    // (hexágono: contorno nítido, angular — nunca confundido com coletável)
    const rot = (o.phase || 0) + (o.t || 0) * 0.7;
    const R = o.r * 1.15;   // visual um pouco maior que a hitbox (perdão justo)

    drawGlow(ctx, o.x, o.y, R * 1.9, COLORS.magenta, 0.38);

    hexPath(ctx, o.x, o.y, R, rot);
    ctx.fillStyle = 'rgba(28,7,34,0.88)';
    ctx.fill();
    if (opts.contrast) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.5; ctx.stroke(); }
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 3;
    ctx.stroke();

    // núcleo claro (gira junto com o hexágono)
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.magenta;
    ctx.beginPath();
    ctx.arc(R * 0.16, 0, R * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------
//  Desenho — coletáveis
// ---------------------------------------------------------
const PICKUP_SCALE = 1.2;   // +20%
const POWER_SCALE = 1.3;    // +30%

export function drawPickup(ctx, pk, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 6 + pk.t) * 0.15;
  const twinkle = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 9 + pk.t * 2); // cintilar
  const wv = pk.r * PICKUP_SCALE * pulse;   // meia-largura visual

  drawGlow(ctx, pk.x, pk.y, wv * 2.7, COLORS.cyan, 0.85 * twinkle);

  const box = wv / PICK_CIRCLE;
  ctx.globalAlpha = twinkle;
  ctx.drawImage(getPickupSprite(), pk.x - box / 2, pk.y - box / 2, box, box);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
//  Desenho — power-ups
// ---------------------------------------------------------
function starPath(ctx, cx, cy, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawPowerup(ctx, pw, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 5) * 0.14;
  const R = pw.r * POWER_SCALE * pulse;
  const color = pw.kind === 'shield' ? COLORS.green : COLORS.yellow;

  drawGlow(ctx, pw.x, pw.y, R * 2.3, color, 0.7);

  // anel pulsante ao redor
  if (!reduceMotion) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 4 + (pw.kind === 'shield' ? 0 : 1.4));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pw.x, pw.y, R * 1.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (pw.kind === 'shield') {
    // HEXÁGONO verde com ícone de escudo
    hexPath(ctx, pw.x, pw.y, R, 0);
    ctx.fillStyle = 'rgba(10,26,18,0.92)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.8, R * 0.15);
    ctx.lineJoin = 'round';
    drawShieldGlyph(ctx, pw.x, pw.y, R);
  } else {
    // ESTRELA dourada com raio — silhueta própria do x2
    starPath(ctx, pw.x, pw.y, R, R * 0.46, 5);
    ctx.fillStyle = 'rgba(38,30,4,0.92)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = color;
    drawBoltGlyph(ctx, pw.x, pw.y, R * 0.96);
  }
}

/** Escudo (contorno). */
function drawShieldGlyph(ctx, cx, cy, r) {
  const k = r * 0.58;
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
  const k = r * 0.5;
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
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
