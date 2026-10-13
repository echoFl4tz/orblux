/* =========================================================
   Tutorial — primeiras dicas interativas na 1ª partida
   (some sozinho quando o jogador aprende cada passo)
   Textos sem emojis; ícones vem do sprite SVG
   ========================================================= */

import { emit } from '../core/events.js';
import { markTutorialDone } from '../core/state.js';

const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;

const STEPS = [
  {
    id: 'move',
    text: `${icon('ic-play')}<span><b>Arraste o dedo</b> na tela para mover a orbe.<br>No computador: <b>WASD</b> ou <b>setas</b>.</span>`,
    done: (g) => g.moved,
  },
  {
    id: 'collect',
    text: `${icon('ic-pulse')}<span>Toque nos <b>pulsos brilhantes</b> para coletar pontos e aumentar o combo!</span>`,
    done: (g) => g.runStats.pickups >= 1,
  },
  {
    id: 'avoid',
    text: `${icon('ic-close')}<span>Desvie das <b>barras vermelhas</b>! Sobreviva 5 segundos para começar.</span>`,
    done: (g) => g.sinceHit >= 5 && g.elapsed >= 8,
  },
];

export const tutorial = {
  active: false,
  index: 0,
};

export function startTutorial() {
  tutorial.active = true;
  tutorial.index = 0;
  showStep();
}

export function skipTutorial() {
  if (!tutorial.active) return;
  tutorial.active = false;
  markTutorialDone();
  emit('tutorial:hide');
  emit('tutorial:done');
}

function showStep() {
  const step = STEPS[tutorial.index];
  if (!step) { finish(); return; }
  emit('tutorial:show', step.text);
}

function finish() {
  tutorial.active = false;
  markTutorialDone();
  emit('tutorial:hide');
  emit('tutorial:done');
}

/** Chamado a cada frame durante a partida. */
export function updateTutorial(g) {
  if (!tutorial.active) return;
  const step = STEPS[tutorial.index];
  if (!step) { finish(); return; }
  if (step.done(g)) {
    tutorial.index++;
    if (tutorial.index >= STEPS.length) finish();
    else showStep();
  }
}
