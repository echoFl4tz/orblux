/* =========================================================
   Bus de eventos — comunicação simples entre módulos
   (jogo emite, UI escuta; sem dependências circulares)
   ========================================================= */

const listeners = new Map();

/**
 * Assina um evento. Retorna a função para cancelar a assinatura.
 * @param {string} evt
 * @param {(payload:any)=>void} fn
 */
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  listeners.get(evt)?.delete(fn);
}

export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      // Um listener com erro nunca pode derrubar o jogo
      console.error(`[events] erro no listener de "${evt}":`, err);
    }
  }
}
