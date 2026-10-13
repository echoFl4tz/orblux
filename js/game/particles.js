/* =========================================================
   Partículas, textos flutuantes e screen shake
   Pools reutilizáveis (sem alocação por frame = sem vazamento)
   ========================================================= */

const POOL_SIZE = 140;
const TEXT_POOL = 14;

// ---- Partículas (pool fixo com flag "active") ----
const particles = new Array(POOL_SIZE).fill(null).map(() => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 2, color: '#fff',
}));
let pCursor = 0;

export function burst(x, y, color, count = 12, speed = 220, size = 3) {
  for (let i = 0; i < count; i++) {
    const p = particles[pCursor];
    pCursor = (pCursor + 1) % POOL_SIZE; // round-robin reutiliza as mais antigas
    const ang = Math.random() * Math.PI * 2;
    const spd = speed * (0.35 + Math.random() * 0.75);
    p.active = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * spd;
    p.vy = Math.sin(ang) * spd;
    p.maxLife = p.life = 0.4 + Math.random() * 0.45;
    p.size = size * (0.6 + Math.random() * 0.9);
    p.color = color;
  }
}

/** Explosão em anel (shield, power-up, reviver). */
export function ring(x, y, color, count = 18, speed = 300) {
  for (let i = 0; i < count; i++) {
    const p = particles[pCursor];
    pCursor = (pCursor + 1) % POOL_SIZE;
    const ang = (i / count) * Math.PI * 2;
    p.active = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed;
    p.maxLife = p.life = 0.55;
    p.size = 3.5;
    p.color = color;
  }
}

export function updateParticles(dt, friction = 1.6) {
  const damp = Math.max(0, 1 - friction * dt);
  for (const p of particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    p.vx *= damp; p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ctx) {
  for (const p of particles) {
    if (!p.active) continue;
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Textos flutuantes ("+30", "COMBO x3"...) ----
const texts = new Array(TEXT_POOL).fill(null).map(() => ({
  active: false, x: 0, y: 0, str: '', color: '#fff', life: 0, maxLife: 0, size: 18,
}));
let tCursor = 0;

export function floatText(x, y, str, color = '#ffe45e', size = 18) {
  const t = texts[tCursor];
  tCursor = (tCursor + 1) % TEXT_POOL;
  t.active = true;
  t.x = x; t.y = y; t.str = str; t.color = color; t.size = size;
  t.maxLife = t.life = 0.9;
}

export function updateTexts(dt) {
  for (const t of texts) {
    if (!t.active) continue;
    t.life -= dt;
    if (t.life <= 0) { t.active = false; continue; }
    t.y -= 46 * dt;
  }
}

export function drawTexts(ctx) {
  for (const t of texts) {
    if (!t.active) continue;
    const k = t.life / t.maxLife;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.font = `800 ${Math.round(t.size * (0.85 + (1 - k) * 0.35))}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 12;
    ctx.fillText(t.str, t.x, t.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

// ---- Screen shake ----
export const shake = { mag: 0 };

export function addShake(mag) {
  shake.mag = Math.min(18, shake.mag + mag);
}

export function updateShake(dt) {
  shake.mag = Math.max(0, shake.mag - dt * 34);
}

/** Retorna {x,y} do deslocamento atual (para aplicar no ctx). */
export function shakeOffset(reduceMotion) {
  if (reduceMotion || shake.mag <= 0.2) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * 2 * shake.mag,
    y: (Math.random() - 0.5) * 2 * shake.mag,
  };
}

export function resetFX() {
  particles.forEach((p) => (p.active = false));
  texts.forEach((t) => (t.active = false));
  shake.mag = 0;
}
