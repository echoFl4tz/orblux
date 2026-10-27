/* =========================================================
   Input — teclado (WASD/setas) + ponteiro (mouse arrastando)
   Foco desktop; o arrasto do mouse move a orbe como alternativa
   ao teclado.
   ========================================================= */

import { emit } from './events.js';

const keys = new Set();

// Estado do ponteiro (arrastar): posição-alvo em coordenadas do canvas (CSS px)
const pointer = { active: false, x: 0, y: 0 };
let pointerId = null;      // só o mouse que começou o arrasto manda
let canvas = null;

const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function initInput(canvasEl) {
  canvas = canvasEl;

  window.addEventListener('keydown', (e) => {
    // Não rouba o foco de inputs reais (ex.: sliders das configurações)
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    const dir = KEY_MAP[e.code];
    if (dir) {
      keys.add(dir);
      e.preventDefault();
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      emit('input:pause');
      e.preventDefault();
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      // não duplica a ativação nativa de botões/links com foco
      const t = e.target;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.getAttribute?.('role') === 'button')) return;
      emit('input:confirm');
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) keys.delete(dir);
  });

  // Zera direções ao perder o foco (evita "andar sozinho" ao voltar p/ aba)
  window.addEventListener('blur', () => { keys.clear(); pointer.active = false; pointerId = null; });
  // visibilitychange cobre troca de aba sem blur — limpa igualmente
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { keys.clear(); pointer.active = false; pointerId = null; }
  });

  // ---- Ponteiro (mouse arrastando) ----
  const setTargetFromEvent = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (pointer.active) return;          // segundo ponteiro: ignora
    pointer.active = true;
    pointerId = e.pointerId;
    setTargetFromEvent(e);
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointer.active || e.pointerId !== pointerId) return;
    setTargetFromEvent(e);
    e.preventDefault();
  }, { passive: false });

  const endPointer = (e) => {
    if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
    pointer.active = false;
    pointerId = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  // captura solta sem pointerup (ex.: janela de permissão de toque)
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  // Sem menu de contexto dentro do canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Vetor de direção do teclado (-1..1 em cada eixo) normalizado.
 * @returns {{x:number, y:number}}
 */
export function getAxis() {
  let x = 0, y = 0;
  if (keys.has('left')) x -= 1;
  if (keys.has('right')) x += 1;
  if (keys.has('up')) y -= 1;
  if (keys.has('down')) y += 1;
  if (x !== 0 && y !== 0) { const inv = Math.SQRT1_2; x *= inv; y *= inv; }
  return { x, y };
}

/** @returns {{active:boolean, x:number, y:number}} alvo do arrasto */
export function getPointer() {
  return pointer;
}

export function resetInput() {
  keys.clear();
  pointer.active = false;
  pointerId = null;
}
