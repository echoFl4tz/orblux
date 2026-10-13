/* =========================================================
   HUD — placar, combo, vidas, nível, power-ups e tutorial
   Atualiza o DOM somente quando algo muda (barato p/ mobile)
   ========================================================= */

import { on } from '../core/events.js';

let el = {};
let last = { score: -1, lives: -1, level: -1, combo: -1, mult: -1, frac: -1 };
let toastTimer = 0;

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
    tutorial: document.getElementById('tutorial'),
    tutorialText: document.getElementById('tutorial-text'),
  };

  on('game:start', () => {
    last = { score: -1, lives: -1, level: -1, combo: -1, mult: -1, frac: -1 };
    el.powerups.innerHTML = '';
    el.hud.hidden = false;
    el.tutorial.hidden = true;
  });

  on('game:score', ({ score }) => {
    if (score !== last.score) {
      last.score = score;
      el.score.textContent = score.toLocaleString('pt-BR');
    }
  });

  on('game:lives', ({ lives }) => {
    if (lives === last.lives) return;
    last.lives = lives;
    const full = '❤️'.repeat(Math.max(0, lives));
    const empty = '🖤'.repeat(Math.max(0, 3 - lives));
    el.lives.textContent = full + empty;
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

  on('game:powerup', ({ kind }) => {
    const chip = document.createElement('div');
    chip.className = 'power-chip';
    chip.id = `power-${kind}`;
    chip.textContent = kind === 'shield' ? '🛡️ ESCUDO' : '⚡ x2 (8s)';
    document.getElementById('power-shield')?.remove();
    document.getElementById('power-x2')?.remove();
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
  on('tutorial:done', () => showHudToast('VAMO LÁ! 🚀'));
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
