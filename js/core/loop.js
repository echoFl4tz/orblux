/* =========================================================
   Game loop — requestAnimationFrame + passo FIXO de simulação
   (1/60 s com acumulador; dt real limitado a 50 ms para o
   jogo não "voar" ao voltar de aba). O passo fixo torna a
   simulação idêntica em 60, 90, 120 Hz — em telas rápidas
   o update roda o mesmo número de vezes por segundo do que
   em 60 Hz (e o spawner determinístico da Corrida do Dia,
   que acumula tempo, dispara nos MESMOS instantes).
   ========================================================= */

const STEP = 1 / 60;     // passo fixo da simulação (s)
const MAX_DT = 0.05;     // 50 ms — evita teleporte após trocar de aba
const MAX_STEPS = 4;     // teto de passos por quadro (anti "spiral of death")

let rafId = 0;
let last = 0;
let running = false;
let acc = 0;             // acumulador de tempo (s)
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 60;

/**
 * @param {(dt:number)=>void} update  lógica (SEMPRE dt = 1/60 s)
 * @param {(elapsed:number)=>void} render  desenho (1× por quadro real)
 */
export function startLoop(update, render) {
  if (running) return;
  running = true;
  last = performance.now();
  acc = 0;

  const frame = (now) => {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_DT) dt = MAX_DT;      // aba oculta / lag: corta o excesso
    if (dt < 0) dt = 0;

    // métrica leve de FPS (usada só para diagnóstico)
    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 1) { fps = Math.round(fpsFrames / fpsAccum); fpsAccum = 0; fpsFrames = 0; }

    // simulação em passo fixo: 0, 1 ou N updates de 1/60 s por quadro
    acc += dt;
    let steps = 0;
    try {
      while (acc >= STEP && steps < MAX_STEPS) {
        update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) acc = 0;   // atraso grande: descarta o resto (nunca persegue o atraso)
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
