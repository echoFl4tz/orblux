/* =========================================================
   HUD — placar, combo, vidas, nível, power-ups e tutorial
   Atualiza o DOM somente quando algo muda (barato p/ mobile)
   Vidas e power-ups usam o sprite SVG (sem emojis)
   ========================================================= */

import { on } from '../core/events.js';
import { game, POINTS_PER_LEVEL } from '../game/game.js';
import { zoneForLevel } from '../game/theme.js';

let el = {};
let last = { score: -1, lives: -1, level: -1, wave: -1, combo: -1, mult: -1, frac: -1, pct: -1 };
let toastTimer = 0;
let damageTimer = 0;
let livesTimer = 0;
let lastZone = -1;          // zona de cor vigente (glow do placar, §10)
let danoFlashes = [];       // timestamps dos flashes de dano (teto 3/s, §9)
let shatterTimer = 0;       // remove a classe de estilhaço do combo
let comboPulseAt = 0;       // último pulso do combo (throttle 333ms ≈ 3/s, §9)
let comboPopTimer = 0;      // remove a classe .pop do combo após o pulso

/** Ícone/label de cada power-up no chip do HUD (sprite SVG, sem emojis). */
const CHIP_MAP = {
  shield: { icone: 'ic-shield', label: 'ESCUDO' },
  x2: { icone: 'ic-bolt', label: 'x2' },
  // drops novos (1.1.0) entram aqui junto do drop correspondente
  ima: { icone: 'ic-magnet', label: 'ÍMÃ' },
  coracao: { icone: 'ic-repair', label: 'REPARO' },
  fantasma: { icone: 'ic-phase', label: 'FASE' },
};

/** Flash vermelho rápido nas bordas ao levar dano (respeita mov. reduzido no CSS). */
function flashDamage() {
  const d = el.damage;
  if (!d) return;
  // teto do guia (§9): nunca mais de 3 flashes por segundo
  const agora = performance.now();
  danoFlashes = danoFlashes.filter((t) => agora - t < 1000);
  if (danoFlashes.length >= 3) return;
  danoFlashes.push(agora);
  d.classList.remove('on');
  void d.offsetWidth;                  // reinicia a animação
  d.classList.add('on');
  clearTimeout(damageTimer);
  damageTimer = setTimeout(() => d.classList.remove('on'), 460);
}

export function initHud() {
  el = {
    hud: document.getElementById('hud'),
    score: document.getElementById('hud-score'),
    lives: document.getElementById('hud-lives'),
    level: document.getElementById('hud-level'),
    levelText: document.getElementById('hud-level-text'),
    levelFill: document.getElementById('hud-level-fill'),
    wave: document.getElementById('hud-wave'),
    comboWrap: document.getElementById('hud-combo-wrap'),
    combo: document.getElementById('hud-combo'),
    comboFill: document.getElementById('combo-fill'),
    powerups: document.getElementById('hud-powerups'),
    toast: document.getElementById('hud-toast'),
    damage: document.getElementById('damage-flash'),
    tutorial: document.getElementById('tutorial'),
    tutorialText: document.getElementById('tutorial-text'),
  };

  on('game:start', () => {
    last = { score: -1, lives: -1, level: -1, wave: -1, combo: -1, mult: -1, frac: -1, pct: -1 };
    el.powerups.innerHTML = '';
    el.damage?.classList.remove('on');
    el.hud.hidden = false;
    el.tutorial.hidden = true;
    if (el.wave) el.wave.textContent = `ONDA ${game.wave}`;
  });

  on('game:score', ({ score }) => {
    if (score !== last.score) {
      last.score = score;
      el.score.textContent = score.toLocaleString('pt-BR');
      // "pop" ao subir (a animação CSS respeita prefers-reduced-motion)
      el.score.classList.remove('pop');
      void el.score.offsetWidth; // reinicia a animação
      el.score.classList.add('pop');
    }
  });

  on('game:lives', ({ lives }) => {
    if (lives === last.lives) return;
    const lost = lives < last.lives && last.lives >= 0;
    last.lives = lives;
    let html = '';
    for (let i = 0; i < 3; i++) {
      const full = i < lives;
      html += `<svg class="ic${full ? '' : ' empty'}" aria-hidden="true"><use href="#${full ? 'ic-heart' : 'ic-heart-empty'}"/></svg>`;
    }
    el.lives.innerHTML = html;
    if (lost) {
      flashDamage();                    // flash vermelho nas bordas
      // pip recém-perdido se dissolve (200ms) + tremida de 2px no grupo (P1-4)
      el.lives.querySelectorAll('.ic')[lives]?.classList.add('hit');
      el.lives.classList.remove('hit');
      void el.lives.offsetWidth;        // reinicia a tremida
      el.lives.classList.add('hit');
      clearTimeout(livesTimer);
      livesTimer = setTimeout(() => el.lives.classList.remove('hit'), 220);
    }
  });

  on('game:level', ({ level }) => {
    if (level === last.level) return;
    last.level = level;
    if (el.levelText) el.levelText.textContent = `NÍV ${level}`;   // rótulo enxuto (P1-4)
    // glow do placar na cor da zona (§10) — só recalcula na troca de zona
    const z = zoneForLevel(level);
    if (z.index !== lastZone) {
      lastZone = z.index;
      el.score.style.setProperty('--zona', z.zone.grid);
    }
  });

  on('game:wave', ({ wave }) => {
    if (wave === last.wave) return;
    last.wave = wave;
    // onda virou sr-only (P1-4): o leitor de tela recebe o texto via
    // aria-live e o jogador vê um toast curto no centro
    if (el.wave) el.wave.textContent = `ONDA ${wave}`;
    showHudToast(`ONDA ${wave}`);
  });

  on('game:combo', ({ multiplier, frac }) => {
    if (multiplier !== last.mult) {
      // quebra de combo (§9): o contador estilhaça em fragmentos
      if (last.mult >= 2 && multiplier < last.mult) {
        el.comboWrap.classList.add('estilhaco');
        clearTimeout(shatterTimer);
        shatterTimer = setTimeout(() => el.comboWrap.classList.remove('estilhaco'), 350);
      }
      last.mult = multiplier;
      el.combo.textContent = `x${multiplier}`;
      el.comboWrap.classList.toggle('hot', multiplier >= 2);
      // pulso visual com teto de 3/s (P2): throttle de 333ms, classe .pop
      // separada do estado "hot" para o throttle não brigar com a cor
      const agora = performance.now();
      if (multiplier >= 2 && agora - comboPulseAt >= 333) {
        comboPulseAt = agora;
        el.comboWrap.classList.remove('pop');
        void el.comboWrap.offsetWidth;          // reinicia a animação
        el.comboWrap.classList.add('pop');
        clearTimeout(comboPopTimer);
        comboPopTimer = setTimeout(() => el.comboWrap.classList.remove('pop'), 140);
      }
    }
    const f = Math.round((frac || 0) * 100) / 100;
    if (f !== last.frac) {
      last.frac = f;
      el.comboFill.style.transform = `scaleX(${f})`;
    }
    el.comboWrap.style.opacity = multiplier > 1 ? '1' : '0.55';
  });

  on('game:powerup', ({ kind, duration }) => {
    document.getElementById(`power-${kind}`)?.remove();
    const info = CHIP_MAP[kind] || { icone: 'ic-bolt', label: kind };
    const chip = document.createElement('div');
    chip.className = 'power-chip';
    chip.id = `power-${kind}`;
    chip.dataset.duration = String(duration || 8);
    chip.innerHTML = `
      <svg class="ic ic-sm" aria-hidden="true"><use href="#${info.icone}"/></svg>
      <span class="chip-label">${info.label}</span>
      ${duration ? `<span class="chip-time">${Number(duration).toFixed(1)}s</span>` : ''}`;
    chip._p = 1;                          // cache da contagem radial (--p, P1-4)
    el.powerups.appendChild(chip);
    // drops instantâneos (duration 0): chip de confirmação que some sozinho
    if (!duration) setTimeout(() => chip.remove(), 1600);
  });
  on('game:shield', () => document.getElementById('power-shield')?.remove());
  on('game:powerup:end', ({ kind }) => document.getElementById(`power-${kind}`)?.remove());

  const hideHud = () => { el.hud.hidden = true; el.tutorial.hidden = true; };
  on('game:quit', hideHud);
  on('game:over', () => { el.hud.hidden = true; el.tutorial.hidden = true; });

  // toast de curta duração dentro do jogo ("NÍVEL 3", "VAMO LÁ!"...)
  on('hud:toast', ({ text }) => showHudToast(text));

  // tutorial
  on('tutorial:show', (html) => {
    el.tutorialText.innerHTML = html;
    el.tutorial.hidden = false;
  });
  on('tutorial:hide', () => { el.tutorial.hidden = true; });
  on('tutorial:done', () => showHudToast('VAMO LÁ!'));
}

/**
 * Chamado a cada frame pelo loop principal (barato: só escreve no DOM
 * quando o valor muda). Atualiza a contagem regressiva real do x2.
 * (O aviso de perigo virou chevrons desenhados no canvas — ver game.js)
 */
export function hudTick() {
  if (!el.hud || el.hud.hidden) return;

  // micro-barra do nível: fração atual dentro dos 1000 pontos (P1-4).
  // passo de 5%: no máximo 20 escritas de estilo por segundo.
  if (el.levelFill && game.score >= 0) {
    const pct = Math.round(((game.score % POINTS_PER_LEVEL) / POINTS_PER_LEVEL) * 20) / 20;
    if (pct !== last.pct) {
      last.pct = pct;
      el.levelFill.style.width = `${pct * 100}%`;
    }
  }

  // contagem regressiva do power-up x2 (valor real do jogo)
  if (game.x2Timer > 0 && game.mode === 'playing') {
    const chip = document.getElementById('power-x2');
    if (chip) {
      const time = chip.querySelector('.chip-time');
      if (time) time.textContent = `${game.x2Timer.toFixed(1)}s`;
      const total = Number(chip.dataset.duration) || 8;
      const pct = Math.round(Math.max(0, Math.min(1, game.x2Timer / total)) * 20) / 20;
      if (pct !== chip._p) {             // contagem radial via --p (P1-4)
        chip._p = pct;
        chip.style.setProperty('--p', String(pct));
      }
    }
  }

  // contagem radial dos drops temporários novos (leitura de g.dropFx)
  if (game.dropFx && game.mode === 'playing') {
    for (const kind of Object.keys(game.dropFx)) {
      const chip = document.getElementById(`power-${kind}`);
      if (!chip) continue;
      const resto = game.dropFx[kind];
      const time = chip.querySelector('.chip-time');
      if (time) time.textContent = `${Math.max(0, resto).toFixed(1)}s`;
      const total = Number(chip.dataset.duration) || 1;
      const pct = Math.round(Math.max(0, Math.min(1, resto / total)) * 20) / 20;
      if (pct !== chip._p) {
        chip._p = pct;
        chip.style.setProperty('--p', String(pct));
      }
    }
  }
}

export function showHudToast(text) {
  if (!el.toast) return;
  el.toast.hidden = false;
  el.toast.textContent = text;
  // reinicia a animação
  el.toast.style.animation = 'none';
  void el.toast.offsetWidth;
  el.toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1200);
}

export function updateHudMenuBest(best) {
  const e = document.getElementById('menu-best');
  if (e) e.textContent = (best || 0).toLocaleString('pt-BR');
}

/**
 * Zera todo o HUD e os estilos residuais deixados pela partida
 * (barra de combo, chips de power-up, dica de tutorial, flash de dano).
 * Chamado ao voltar ao menu para o HUD nunca reaparecer "sujo".
 */
export function resetHud() {
  if (!el || !el.hud) return;
  el.hud.hidden = true;
  el.tutorial.hidden = true;
  el.toast.hidden = true;
  clearTimeout(toastTimer);
  clearTimeout(damageTimer);
  clearTimeout(livesTimer);
  el.damage?.classList.remove('on');
  el.lives?.classList.remove('hit');
  el.powerups.innerHTML = '';
  // barra de combo e chips de volta ao estado neutro
  el.comboFill.style.transform = 'scaleX(1)';
  el.comboWrap.style.opacity = '1';
  el.comboWrap.classList.remove('hot');
  el.comboWrap.classList.remove('estilhaco');
  el.comboWrap.classList.remove('pop');
  clearTimeout(shatterTimer);
  clearTimeout(comboPopTimer);
  el.combo.textContent = 'x1';
  el.score.textContent = '0';
  if (el.levelText) el.levelText.textContent = 'NÍV 1';
  if (el.levelFill) el.levelFill.style.width = '0%';
  if (el.wave) el.wave.textContent = 'ONDA 1';
  el.lives.innerHTML = '';
  // zera o cache de "último valor" para o próximo jogo redesenhar do zero
  last = { score: -1, lives: -1, level: -1, wave: -1, combo: -1, mult: -1, frac: -1, pct: -1 };
}
