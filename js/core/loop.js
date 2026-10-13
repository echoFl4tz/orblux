/* =========================================================
   Game loop — requestAnimationFrame + delta time
   (dt limitado para o jogo não "voar" ao voltar de aba)
   ========================================================= */

const MAX_DT = 0.05; // 50ms — evita teleporte após trocar de aba

let rafId = 0;
let last = 0;
let running = false;
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 60;

/**
 * @param {(dt:number, elapsed:number)=>void} update  lógica (dt em segundos)
 * @param {(elapsed:number)=>void} render  desenho
 */
export function startLoop(update, render) {
  if (running) return;
  running = true;
  last = performance.now();

  const frame = (now) => {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_DT) dt = MAX_DT;      // aba oculta / lag: corta o excesso
    if (dt < 0) dt = 0;

    // métrica leve de FPS (usada só para diagnóstico)
    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 1) { fps = Math.round(fpsFrames / fpsAccum); fpsAccum = 0; fpsFrames = 0; }

    try {
      update(dt, now / 1000);
      render(now / 1000);
    } catch (err) {
      console.error('[loop] erro no frame:', err);
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

export function stopLoop() {
  running = false;
  cancelAnimationFrame(rafId);
}

export function getFPS() { return fps; }
