/* =========================================================
   Partículas, textos flutuantes, faixa de nível e screen shake
   Pools reutilizáveis fixos (sem alocação por frame = sem vazamento).
   Todos os efeitos novos respeitam "Reduzir movimento" (quem chama
   decide se dispara; o sweep estático é resolvido em levelBanner).
   ========================================================= */

/** §11: pool pré-alocado no teto do tier Alto (220); o tier em uso
    limita quantas ficam vivas ao mesmo tempo (220/120/40). */
const POOL_SIZE = 220;
let poolMax = POOL_SIZE;       // teto do tier vigente (setPoolMax)
let vivas = 0;                 // partículas ativas agora (gate de spawn)
/** Aplica o teto de partículas do tier (§11) — game.js chama por frame. */
export function setPoolMax(n) { poolMax = Math.max(1, Math.min(POOL_SIZE, n | 0)); }
/** Quantas partículas estão vivas (testes e diagnóstico). */
export function countActive() { return vivas; }
/** §9: com movimento reduzido o teto é 40 partículas vivas — limita
    quantas cada explosão pode nascer (o pool continua fixo). */
let poolReduzido = false;
export function setPoolReducido(v) { poolReduzido = !!v; }
const TEXT_POOL = 14;
const COMBO_POOL = 3;
const SHOCK_POOL = 4;

// ---- Partículas (pool fixo com flag "active") ----
const particles = new Array(POOL_SIZE).fill(null).map(() => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 2, color: '#fff',
}));
let pCursor = 0;

export function burst(x, y, color, count = 12, speed = 220, size = 3) {
  if (poolReduzido) count = Math.min(count, 4);   // §9: explosões curtas
  count = Math.min(count, poolMax - vivas);       // §11: teto do tier
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const p = particles[pCursor];
    pCursor = (pCursor + 1) % POOL_SIZE; // round-robin reutiliza as mais antigas
    const ang = Math.random() * Math.PI * 2;
    const spd = speed * (0.35 + Math.random() * 0.75);
    if (!p.active) vivas++;
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
  if (poolReduzido) count = Math.min(count, 6);   // §9: anel curto
  count = Math.min(count, poolMax - vivas);       // §11: teto do tier
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const p = particles[pCursor];
    pCursor = (pCursor + 1) % POOL_SIZE;
    const ang = (i / count) * Math.PI * 2;
    if (!p.active) vivas++;
    p.active = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed;
    p.maxLife = p.life = 0.55;
    p.size = 3.5;
    p.color = color;
  }
}

// ---- Onda de choque (anel de traço expandindo — quebra do escudo) ----
const shocks = new Array(SHOCK_POOL).fill(null).map(() => ({
  active: false, x: 0, y: 0, life: 0, maxLife: 0, maxR: 100, color: '#fff',
}));
let sCursor = 0;

export function shockwave(x, y, color, maxR = 120) {
  const s = shocks[sCursor];
  sCursor = (sCursor + 1) % SHOCK_POOL;
  s.active = true;
  s.x = x; s.y = y;
  s.maxLife = s.life = 0.42;
  s.maxR = maxR;
  s.color = color;
}

export function updateParticles(dt, friction = 1.6) {
  const damp = Math.max(0, 1 - friction * dt);
  for (const p of particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; vivas--; continue; }
    p.vx *= damp; p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  // queda do tier em partida (§11): desliga o excesso, das mais antigas
  if (vivas > poolMax) {
    for (let i = 0; i < POOL_SIZE && vivas > poolMax; i++) {
      const p = particles[(pCursor + i) % POOL_SIZE];
      if (p.active) { p.active = false; vivas--; }
    }
  }
  for (const s of shocks) {
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) s.active = false;
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
  // ondas de choque por cima
  for (const s of shocks) {
    if (!s.active) continue;
    const k = 1 - s.life / s.maxLife;            // 0 → 1
    ctx.globalAlpha = Math.max(0, 0.8 * (1 - k));
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.maxR * (0.25 + 0.75 * k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Textos flutuantes ("+30", "ESCUDO!"...) ----
// Só desenhamos textos no canvas depois que as fontes carregarem
// (evita "piscar" com a fonte fallback nos primeiros frames)
let fontsReady = false;
if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { fontsReady = true; }).catch(() => { fontsReady = true; });
} else {
  fontsReady = true; // sem DOM (testes Node)
}
const DISPLAY_FONT = "'Orblux Display', sans-serif";

const texts = new Array(TEXT_POOL).fill(null).map(() => ({
  active: false, x: 0, y: 0, str: '', color: '#fff', life: 0, maxLife: 0, size: 18, curve: 0,
}));
let tCursor = 0;

export function floatText(x, y, str, color = '#ffe45e', size = 18) {
  const t = texts[tCursor];
  tCursor = (tCursor + 1) % TEXT_POOL;
  t.active = true;
  t.x = x; t.y = y; t.str = str; t.color = color; t.size = size;
  t.curve = (Math.random() - 0.5) * 26;          // leve curva horizontal
  t.maxLife = t.life = 0.9;
}

export function updateTexts(dt) {
  for (const t of texts) {
    if (!t.active) continue;
    t.life -= dt;
    if (t.life <= 0) { t.active = false; continue; }
    t.y -= 46 * dt;
  }
  if (combo.active) {
    combo.life -= dt;
    if (combo.life <= 0) combo.active = false;
  }
  if (banner.active) {
    banner.life -= dt;
    if (banner.life <= 0) banner.active = false;
  }
}

// ---- Combo em destaque (número grande ao centro-alto ao subir o multiplicador) ----
const combo = { active: false, x: 0, y: 0, str: '', color: '#ffe45e', life: 0, maxLife: 1, size: 46 };

export function comboText(x, y, str, color = '#ffe45e', size = 46) {
  combo.active = true;
  combo.x = x; combo.y = y; combo.str = str; combo.color = color;
  combo.size = size;                       // cresce com o multiplicador (game.js)
  combo.maxLife = combo.life = 1.0;
}

// ---- Faixa de nível/onda ("NÍVEL 3" ou "ONDA 5" cruzando a tela em ~0.8s) ----
const banner = { active: false, text: '', life: 0, maxLife: 0.8, W: 0, H: 0, still: false };

export function levelBanner(level, W, H, still = false) {
  banner.active = true;
  banner.text = `NÍVEL ${level}`;
  banner.W = W; banner.H = H;
  banner.still = still;                       // "Reduzir movimento": sem varredura
  banner.maxLife = banner.life = 0.8;
}

/** Faixa "ONDA N" — mesma linguagem visual da faixa de nível (Fase 2). */
export function waveBanner(wave, W, H, still = false) {
  banner.active = true;
  banner.text = `ONDA ${wave}`;
  banner.W = W; banner.H = H;
  banner.still = still;
  banner.maxLife = banner.life = 0.8;
}

export function drawTexts(ctx) {
  if (!fontsReady) return; // aguarda document.fonts.ready
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // textos flutuantes: pop de entrada + curva suave + fade
  for (const t of texts) {
    if (!t.active) continue;
    const k = t.life / t.maxLife;
    const age = 1 - k;
    // escala: cresce rápido no início e continua crescendo levemente
    const scale = age < 0.25
      ? 0.55 + 0.45 * (1 - Math.pow(1 - age / 0.25, 3))
      : 1 + (age - 0.25) * 0.22;
    const x = t.x + Math.sin(age * Math.PI) * t.curve;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.font = `800 ${Math.round(t.size * scale)}px ${DISPLAY_FONT}`;
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 12;
    ctx.fillText(t.str, x, t.y);
    ctx.shadowBlur = 0;
  }

  // combo grande semitransparente (pulso + fade; tamanho vindo de comboText)
  if (combo.active) {
    const k = combo.life / combo.maxLife;
    const age = 1 - k;
    const pulse = 1 + (1 - k) * 0.3 + Math.sin(age * 9) * 0.04;
    ctx.globalAlpha = Math.min(0.85, k * 1.5);
    ctx.font = `900 ${Math.round(combo.size * pulse)}px ${DISPLAY_FONT}`;
    ctx.fillStyle = combo.color;
    ctx.shadowColor = combo.color;
    ctx.shadowBlur = 22;
    ctx.fillText(combo.str, combo.x, combo.y);
    ctx.shadowBlur = 0;
  }

  // faixa de nível cruzando a tela
  if (banner.active) {
    const k = banner.life / banner.maxLife;
    const age = 1 - k;
    const bw = Math.min(banner.W * 0.86, 430);
    const cx = banner.still
      ? banner.W / 2
      : -bw / 2 + age * (banner.W + bw);       // varredura da esquerda p/ direita
    const y = banner.H * 0.42;
    const alpha = banner.still
      ? Math.min(1, k * 2)
      : Math.min(1, Math.pow(Math.sin(age * Math.PI), 0.7) * 1.6);
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = 'rgba(255,228,94,0.14)';
    ctx.fillRect(cx - bw / 2, y - 30, bw, 60);
    ctx.strokeStyle = '#ffe45e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, y - 30);
    ctx.lineTo(cx + bw / 2, y - 30);
    ctx.moveTo(cx - bw / 2, y + 30);
    ctx.lineTo(cx + bw / 2, y + 30);
    ctx.stroke();
    ctx.font = `900 32px ${DISPLAY_FONT}`;
    ctx.fillStyle = '#ffe45e';
    ctx.shadowColor = '#ffe45e';
    ctx.shadowBlur = 16;
    ctx.fillText(banner.text, cx, y + 2);
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
  vivas = 0;
  texts.forEach((t) => (t.active = false));
  shocks.forEach((s) => (s.active = false));
  combo.active = false;
  banner.active = false;
  shake.mag = 0;
}
