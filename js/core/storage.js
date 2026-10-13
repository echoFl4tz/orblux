/* =========================================================
   Storage — localStorage com fallback em memória
   (modo privado / storage bloqueado nunca quebra o jogo)
   ========================================================= */

const memory = new Map();
let warns = 0;

function warnOnce(msg) {
  if (warns < 3) { console.warn(msg); warns++; }
}

/** @param {string} key @returns {any|null} */
export function getItem(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    warnOnce('[storage] localStorage indisponível, usando memória');
    return memory.has(key) ? memory.get(key) : null;
  }
}

/** @param {string} key @param {any} value */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    warnOnce('[storage] falha ao gravar, usando memória');
    memory.set(key, value);
  }
}

/** @param {string} key */
export function removeItem(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  memory.delete(key);
}

/** Apaga todos os dados do jogo (usado em "Apagar progresso"). */
export function clearAll(prefix = 'pn_') {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  memory.clear();
}

export function storageAvailable() {
  try {
    const t = '__pn_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}
