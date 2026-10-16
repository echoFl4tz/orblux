import { equippedLook, drawSkinTrail, drawSkinAura, getBodySprite } from './skinrender.js';
import { THEME, rgba } from './theme.js';

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
  green: '#3DFFA2',   // token "power" do guia (escudos e power-ups)
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

export function createObstacle(type, x, y, S, vy, rand = Math.random) {
  if (type === 'drone') {
    return { type, x, y, r: 13 * S, vy, swayAmp: 46 * S, swayFreq: 1.6 + rand() * 1.2, t: 0, phase: rand() * Math.PI * 2, baseX: x };
  }
  // 'bar' — barra horizontal que cai
  const w = (70 + rand() * 90) * S;
  return { type: 'bar', x: x - w / 2, y, w, h: 13 * S, vy, halfW: w / 2 };
}

export function createPickup(x, y, S, rand = Math.random) {
  return { x, y, r: 10 * S, vy: 150 * S, t: rand() * Math.PI * 2 };
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

/** Corpo da orbe: caixa do sprite em função do raio (mesmo valor de SEMPRE). */
const ORB_CIRCLE = 0.49; // raio do círculo dentro da caixa do sprite (n)

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

/** Opacidade da orbe: pisca durante invulnerabilidade (piso 0.35). */
function blinkAlpha(p, time) {
  if (p.invuln <= 0) return 1;
  const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 16));
  return a < 0.35 ? 0.35 : a;
}

/** Raio da luz projetada: 24u ≈ orbe × 7,5 (§6). Exportado para o
 *  game.js recortar o blit do bloom só na área do brilho (A6). */
export function orbLightRadius(p) { return p.r * ORB_SCALE * 7.5; }

/** Luz projetada da orbe no chão (§6): raio 24u ≈ orbe × 7,5,
 *  opacidade 0,10, composição "lighter". Quem chama decide onde
 *  desenhar: no A5 ela entra no offscreen de bloom — §11: Alto em
 *  1/4 da resolução, Médio em 1/6, Baixo desligado. */
export function drawOrbLight(ctx, p, look, time) {
  const L = look || equippedLook();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, p.x, p.y, orbLightRadius(p), L.paleta.brilho, 0.10 * blinkAlpha(p, time));
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Orbe do jogador com a skin equipada.
 * A HITBOX NÃO MUDA: todo o raio visual deriva de p.r (raio base),
 * para QUALQUER skin — ver tests/skin-hitbox.test.mjs.
 * @param {object} [look]  look resolvido da skin (fallback: a equipada)
 */
export function drawPlayer(ctx, p, time, reduceMotion, look) {
  const L = look || equippedLook();
  const R = p.r * ORB_SCALE;   // visual = raio base * 1.25 (igual em todas as skins)

  // Rastro no estilo da skin (só primitivas de caminho — sem alocação)
  drawSkinTrail(ctx, p, L, time, reduceMotion);

  // Invulnerabilidade: pisca por opacidade — nunca some por completo (piso 0.35)
  const alpha = blinkAlpha(p, time);

  // Halo na cor da paleta da skin (sprite offscreen, sem pulso grande)
  drawGlow(ctx, p.x, p.y, R * 2.1, L.paleta.brilho, 0.72 * alpha);

  // Aura atrás do corpo (anel/pulsante/órbitas)
  drawSkinAura(ctx, p.x, p.y, R, L, time, reduceMotion, alpha);

  // Respiração 1 ± 0,03 em 1,6 s (seno, §6) — sem movimento reduzido
  const respira = reduceMotion ? 1 : 1 + Math.sin(time * (Math.PI * 2 / 1.6)) * 0.03;

  // Corpo pré-renderizado da skin (mesma caixa de SEMPRE — só muda a arte)
  // Squash & stretch: estica na direção do movimento (direção = rastro),
  // teto de 1.15 no eixo do movimento (§6)
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
    ctx.scale(respira * (1 + 0.15 * stretch), respira / (1 + 0.10 * stretch));
    ctx.drawImage(getBodySprite(L), -box / 2, -box / 2, box, box);
    ctx.restore();
  } else if (respira !== 1) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(respira, respira);
    ctx.drawImage(getBodySprite(L), -box / 2, -box / 2, box, box);
    ctx.restore();
  } else {
    ctx.drawImage(getBodySprite(L), p.x - box / 2, p.y - box / 2, box, box);
  }
  ctx.globalAlpha = 1;

  // Anel externo girando a 0,6 volta/s (§6): dois arcos com vão — sem
  // movimento reduzido o anel fica parado (mas continua visível)
  const ra = reduceMotion ? 0 : time * 0.6 * Math.PI * 2;
  ctx.globalAlpha = 0.5 * alpha;
  ctx.strokeStyle = L.paleta.brilho;
  ctx.lineWidth = Math.max(1.5, R * 0.11);
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 2.5, ra, ra + Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, R + 2.5, ra + Math.PI, ra + Math.PI * 1.85);
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

  // Escudo (§7): bolha "power" opacidade 0,25 com borda 0,7; treme
  // sutilmente (decorativo). A resistência é binária (1 golpe) — não
  // existe estado parcial, então a bolha é sempre desenhada cheia.
  if (p.shield) {
    const tremor = reduceMotion ? 0 : Math.sin(time * 31) * 0.8;
    const rs = R + 8 + tremor;
    drawGlow(ctx, p.x, p.y, R * 2.4, COLORS.green, 0.42);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rs, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rs, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------
//  Desenho — obstáculos (hitbox inalterada)
// ---------------------------------------------------------
const BAR_VIS_H = 21;    // altura visual da barreira (unidades lógicas)
const barGradCache = new Map();

/** Gradiente interno vertical da barreira (danger 100% → 60%, §7),
 *  definido em coordenadas 0→vh (posições independentes, cacheável). */
function getBarGradient(vh) {
  const key = Math.max(4, Math.round(vh));
  let grad = barGradCache.get(key);
  if (!grad) {
    grad = barGradTemplate(key);
    barGradCache.set(key, grad);
  }
  return grad;
}

/** Cria (uma vez) um gradiente vertical reutilizável no contexto do jogo.
 *  Cores prontas via rgba(): nenhum gradiente é criado por quadro. */
let _gradCtx = null;
function barGradTemplate(h) {
  if (!_gradCtx) {
    const c = document.createElement('canvas');
    if (!c.getContext) return null;
    _gradCtx = c.getContext('2d');
  }
  const grad = _gradCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(THEME.color.danger, 1));
  grad.addColorStop(1, rgba(THEME.color.danger, 0.6));
  return grad;
}

/** Hachura diagonal (perigo = danger + hachura, §2): desenhada sobre o
 *  corpo já preenchido, dentro do clip, deslizando a 20 px/s. */
function hatchRect(ctx, x, y, w, h, off, passo, larg) {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = larg;
  ctx.beginPath();
  for (let i = -h - passo; i < w + h; i += passo) {
    ctx.moveTo(x + i - off, y + h);
    ctx.lineTo(x + i + h - off, y);
  }
  ctx.stroke();
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
 * @param {{contrast?: boolean, time?: number, reduceMotion?: boolean}} opts
 *   contrast = contorno branco extra (alto contraste); time/reduceMotion
 *   animam a hachura e o aviso de barreira. Só desenho: hitbox, velocidade
 *   e cadência do spawner ficam intactas.
 */
export function drawObstacle(ctx, o, opts = {}) {
  const t = opts.time || 0;
  if (o.type === 'bar') {
    const S = o.h / 13;                    // escala lógica do objeto
    const vh = BAR_VIS_H * S;              // visual: ~21 unidades
    const cy = o.y + o.h / 2;              // centro = centro da hitbox
    const yTop = cy - vh / 2;
    const raio = vh * 0.35;

    // sombra projetada leve (retângulo escuro deslocado — sem shadowBlur
    // por quadro)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    roundRect(ctx, o.x + 2, yTop + 4, o.w, vh, raio);
    ctx.fill();

    // corpo: danger com gradiente interno 100% → 60% (§7). translate
    // mantém o gradiente 0→vh alinhado à barreira em qualquer posição.
    ctx.save();
    ctx.translate(o.x, yTop);
    ctx.beginPath();
    roundRect(ctx, 0, 0, o.w, vh, raio);
    ctx.fillStyle = getBarGradient(vh);
    ctx.fill();

    // hachura diagonal animada a 20 px/s (perigo é sempre danger + hachura)
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 0, 0, o.w, vh, raio);
    ctx.clip();
    const passo = Math.max(8, 10 * S);
    hatchRect(ctx, 0, 0, o.w, vh,
      opts.reduceMotion ? 0 : (t * 20) % passo, passo, Math.max(2, 3 * S));
    ctx.restore();
    ctx.restore();

    // alto contraste (contorno branco extra) e borda #FF9AAE 1,5px (§7)
    if (opts.contrast) {
      ctx.beginPath();
      roundRect(ctx, o.x, yTop, o.w, vh, raio);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.beginPath();
    roundRect(ctx, o.x, yTop, o.w, vh, raio);
    ctx.strokeStyle = '#FF9AAE';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // aviso de barreira (§7): linha danger no topo com opacidade 0 → 0,6
    // enquanto a barreira ainda está acima da tela, sumindo em ~350 ms
    // após entrar. Posicional — sem estado novo e sem tocar no spawner.
    const tE = o.vy > 0 ? (0 - (o.y + vh)) / o.vy : 0;
    let av = 0;
    if (tE > 0) av = 0.6 * Math.max(0, Math.min(1, 1 - tE / 0.08));
    else if (tE > -0.35) av = 0.6 * (1 + tE / 0.35);
    if (av > 0.02) {
      ctx.globalAlpha = av;
      ctx.strokeStyle = THEME.color.danger;
      ctx.lineWidth = Math.max(2.5, 3 * S);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(o.x + 5, 8);
      ctx.lineTo(o.x + o.w - 5, 8);
      ctx.stroke();
      // pontas verticais marcam a extensão exata da barreira
      ctx.beginPath();
      ctx.moveTo(o.x + 3, 5);
      ctx.lineTo(o.x + 3, 12);
      ctx.moveTo(o.x + o.w - 3, 5);
      ctx.lineTo(o.x + o.w - 3, 12);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    }
  } else {
    // drone: HEXÁGONO perigoso — danger + hachura que gira junto (§2:
    // perigo é sempre danger + hachura; o hexágono distingue da barreira
    // retangular e o hachura distingue dos power-ups hexagonais)
    const rot = (o.phase || 0) + (o.t || 0) * 0.7;
    const R = o.r * 1.15;   // visual um pouco maior que a hitbox (perdão justo)

    drawGlow(ctx, o.x, o.y, R * 1.9, THEME.color.danger, 0.38);

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(rot);

    hexPath(ctx, 0, 0, R, 0);
    ctx.fillStyle = rgba(THEME.color.danger, 0.88);
    ctx.fill();
    // hachura acompanhando a rotação (mesmo deslize de 20 px/s)
    ctx.save();
    hexPath(ctx, 0, 0, R, 0);
    ctx.clip();
    hatchRect(ctx, -R, -R, R * 2, R * 2,
      opts.reduceMotion ? 0 : (t * 20) % 9, 9, Math.max(1.5, R * 0.12));
    ctx.restore();
    if (opts.contrast) {
      hexPath(ctx, 0, 0, R, 0);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5.5;
      ctx.stroke();
    }
    hexPath(ctx, 0, 0, R, 0);
    ctx.strokeStyle = '#FF9AAE';
    ctx.lineWidth = 2;
    ctx.stroke();

    // núcleo claro (gira junto com o hexágono)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.color.danger;
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
  // pulso de brilho de 1,2 s (§7); sem movimento reduzido fica fixo
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * (Math.PI * 2 / 1.2) + pk.t) * 0.15;
  const twinkle = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 9 + pk.t * 2); // cintilar
  const wv = pk.r * PICKUP_SCALE * pulse;   // meia-largura visual

  drawGlow(ctx, pk.x, pk.y, wv * 2.7, COLORS.cyan, 0.85 * twinkle);

  // losango girando a 0,25 volta/s (§7 e §12: recompensa é losango que
  // gira — com movimento reduzido para, mas a forma continua legível)
  const box = wv / PICK_CIRCLE;
  const rot = reduceMotion ? 0 : time * (Math.PI * 2 * 0.25) + pk.t;
  ctx.save();
  ctx.translate(pk.x, pk.y);
  ctx.rotate(rot);
  ctx.globalAlpha = twinkle;
  ctx.drawImage(getPickupSprite(), -box / 2, -box / 2, box, box);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
//  Desenho — power-ups
// ---------------------------------------------------------
export function drawPowerup(ctx, pw, time, reduceMotion) {
  const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 5) * 0.14;
  const R = pw.r * POWER_SCALE * pulse;
  // §7: TODO power-up é hexágono "power" com ícone interno e aura
  // pulsante — escudo ou raio (x2) se distinguem pelo ícone
  const color = COLORS.green;

  drawGlow(ctx, pw.x, pw.y, R * 2.3, color, 0.7);

  // aura pulsante ao redor
  if (!reduceMotion) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 4 + (pw.kind === 'shield' ? 0 : 1.4));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pw.x, pw.y, R * 1.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // HEXÁGONO power com ícone interno
  hexPath(ctx, pw.x, pw.y, R, 0);
  ctx.fillStyle = 'rgba(8,26,18,0.92)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.8, R * 0.15);
  ctx.lineJoin = 'round';
  if (pw.kind === 'shield') drawShieldGlyph(ctx, pw.x, pw.y, R);
  else drawBoltGlyph(ctx, pw.x, pw.y, R * 0.96);
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

// ---------------------------------------------------------
//  Decoração do menu (atrás do DOM do menu, nunca sobre o jogo)
// ---------------------------------------------------------
/** Decoração do menu: orbe com a SKIN EQUIPADA (respiração + anel). */
export function drawOrbDecor(ctx, x, y, r, time, reduceMotion, look) {
  const L = look || equippedLook();
  const breathe = reduceMotion ? 1 : 1 + Math.sin(time * 1.4) * 0.045;
  const R = r * breathe;

  drawGlow(ctx, x, y, R * 2.2, L.paleta.brilho, 0.55);
  drawSkinAura(ctx, x, y, R, L, time, reduceMotion, 1);
  const box = R / ORB_CIRCLE;
  ctx.drawImage(getBodySprite(L), x - box / 2, y - box / 2, box, box);

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, R + 3, 0, Math.PI * 2);
  ctx.stroke();

  // arcos magenta de sempre — exceto se a skin já tem aura de órbitas (evita duplicar)
  if (!reduceMotion && L.aura.tipo !== 'orbitas') {
    const a = time * 0.8;
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(x, y, R + 13, a, a + 1.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R + 13, a + Math.PI, a + Math.PI + 1.25); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
