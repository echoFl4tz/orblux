/* =========================================================
   RNG COM SEMENTE — mulberry32 (rápido, determinístico, 32 bits)
   Usado pelo "desafio com semente" (Corrida do Dia): a MESMA
   semente produz exatamente a MESMA sequência de obstáculos,
   pulsos e power-ups em qualquer aparelho.
   ⚠️ NÃO é criptográfico — nunca usar para tokens/senhas.
   ========================================================= */

/**
 * FNV-1a: transforma texto (ex.: "2026-10-14") em semente uint32.
 * @param {string} str
 * @returns {number} inteiro 32 bits sem sinal
 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 — gerador pseudoaleatório com semente.
 * @param {number|string} seed
 * @returns {() => number} função que devolve números em [0, 1)
 */
export function mulberry32(seed) {
  let a = (typeof seed === 'number' && isFinite(seed)) ? seed >>> 0 : hashSeed(String(seed));
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cria um rng a partir de número OU texto ("2026-10-14"). */
export function seededRng(seed) {
  return typeof seed === 'number' ? mulberry32(seed) : mulberry32(hashSeed(String(seed)));
}

/** Inteiro aleatório INCLUSIVO entre min e max usando o rng informado. */
export function randInt(rng, min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** true com probabilidade p (0..1). */
export function chance(rng, p) {
  return rng() < p;
}

/** Escolhe um elemento da lista (0 se vazia). */
export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}
