/* =========================================================
   HUD — placar, combo, vidas, nível, power-ups e tutorial
   Atualiza o DOM somente quando algo muda (barato p/ mobile)
   Vidas e power-ups usam o sprite SVG (sem emojis)
   ========================================================= */

import { on } from '../core/events.js';
import { game } from '../game/game.js';

let el = {};
let last = { score: -1, lives: -1, level: -1, combo: -1, mult: -1, frac: -1 };
let toastTimer = 0;
let damageTimer = 0;

/** Flash vermelho rápido nas bordas ao levar dano (respeita mov. reduzido no CSS). */
function flashDamage() {
  const d = el.damage;
  if (!d) return;
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
    last = { score: -1, lives: -1, level: -1, combo: -1, mult: -1, frac: -1 };
    el.powerups.innerHTML = '';
    el.damage?.classList.remove('on');
    el.hud.hidden = false;
    el.tutorial.hidden = true;
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
      // anima o coração recém-perdido
      const hearts = el.lives.querySelectorAll('.ic');
      hearts[lives]?.classList.add('hit');
    }
  });

  on('game:level', ({ level }) => {
    if (level === last.level) return;
    last.level = level;
    el.level.textContent = `NÍVEL ${level}`;
  });

  on('game:combo', ({ multiplier, frac }) => {
    if (multiplier !== last.mult) {
      last.mult = multiplier;
      el.combo.textContent = `x${multiplier}`;
      el.comboWrap.classList.toggle('hot', multiplier >= 2);
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
    const chip = document.createElement('div');
    chip.className = 'power-chip';
    chip.id = `power-${kind}`;
    chip.dataset.duration = String(duration || 8);
    chip.innerHTML = `
      <svg class="ic ic-sm" aria-hidden="true"><use href="#${kind === 'shield' ? 'ic-shield' : 'ic-bolt'}"/></svg>
      <span class="chip-label">${kind === 'shield' ? 'ESCUDO' : 'x2'}</span>
      ${kind === 'x2' ? `<span class="chip-time">${(duration || 8).toFixed(1)}s</span>` : ''}
      <span class="chip-bar"></span>`;
    el.powerups.appendChild(chip);
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

  // contagem regressiva do power-up x2 (valor real do jogo)
  if (game.x2Timer > 0 && game.mode === 'playing') {
    const chip = document.getElementById('power-x2');
    if (chip) {
      const time = chip.querySelector('.chip-time');
      if (time) time.textContent = `${game.x2Timer.toFixed(1)}s`;
      const bar = chip.querySelector('.chip-bar');
      if (bar) {
        const total = Number(chip.dataset.duration) || 8;
        bar.style.transform = `scaleX(${Math.max(0, Math.min(1, game.x2Timer / total))})`;
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
