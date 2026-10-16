/* =========================================================
   THEME — tokens visuais centralizados (direção de arte
   "Corrida de luz num túnel cósmico", fase A1)
   Fonte da verdade: orblux-style-guide.md + orblux-theme.js.
   SÓ DESENHO: nada aqui pode alterar hitbox, velocidade,
   pontuação, RNG do spawner ou dificuldade.
   Página de referência: /dev/style (dev/style.html)
   ========================================================= */

export const THEME = {
  color: {
    bgDeep: '#05060F', bgMid: '#0B0E24',
    text: '#EAF6FF', textDim: '#9FB3CC',
    cyan: '#22E4FF', magenta: '#FF3DDC', gold: '#FFD84A',
    danger: '#FF3B5C', power: '#3DFFA2', violet: '#8A5CFF',
  },
  // zonas de cor por nível (troca suave em 1,5 s; após o 12, repete +15%)
  zones: [
    { from: 1,  bgTop: '#06142A', bgBottom: '#05060F', nebula: '#0E5C7A', grid: '#22E4FF' },
    { from: 4,  bgTop: '#120A2E', bgBottom: '#05060F', nebula: '#4B2BA8', grid: '#8A5CFF' },
    { from: 7,  bgTop: '#240A28', bgBottom: '#07050F', nebula: '#9A1F86', grid: '#FF3DDC' },
    { from: 10, bgTop: '#241406', bgBottom: '#0A0705', nebula: '#A8571A', grid: '#FFA63D' },
  ],
  // tamanhos em unidades u (ver unit())
  size: { orb: 3.2, pulse: 2.2, barrier: 1.8, trail: 14, halo: 10 },
  unit: (w, h) => Math.min(Math.max(Math.min(w, h), 360), 560) / 100,
  time: { micro: 90, short: 160, medium: 240, long: 400, zone: 1500, countUp: 800 },
  ease: {
    outCubic: [0.22, 1, 0.36, 1],
    inOutSine: [0.37, 0, 0.63, 1],
    // §8 do guia: backOut (overshoot ~1,56) e linear completam os tokens
    backOut: [0.34, 1.56, 0.64, 1],
    linear: [0, 0, 1, 1],
  },
  parallax: [0.02, 0.05, 0.25, 0.70],
  speedFactor: (level) => Math.min(1 + 0.04 * level, 1.6),
  quality: {
    high: { particles: 220, layers: 4, bloom: 1 / 4 },
    mid:  { particles: 120, layers: 3, bloom: 1 / 6 },
    low:  { particles: 40,  layers: 2, bloom: 0 },
  },
  combo: { tiers: [3, 5, 10, 20, 35, 50] },
};

/* ---------------------------------------------------------
   Helpers puros (testados em tests/theme.test.mjs)
   --------------------------------------------------------- */

/** Zona de cor para um nível — §3 do guia: 1-3, 4-6, 7-9, 10-12;
 *  depois do nível 12 repete do início com intensidade +15% por
 *  ciclo (teto 1,6 para o cenário não estourar a luminosidade).
 *  Sem RNG: mesmo nível ⇒ mesma zona (Corrida do Dia intacta). */
export function zoneForLevel(level) {
  const n = (Number.isFinite(level) && level >= 1) ? Math.floor(level) : 1;
  const index = Math.floor((n - 1) / 3) % 4;
  const ciclo = Math.floor((n - 1) / 12);
  return { index, zone: THEME.zones[index], intensity: Math.min(1 + 0.15 * ciclo, 1.6) };
}

/** Faixa de qualidade pela escala de resolução (A5 formaliza a régua
 *  de FPS): >= 0,85 Alto (4 camadas), >= 0,65 Médio (3), senão Baixo (2). */
export function tierForRes(res) {
  return (Number.isFinite(res) && res >= 0.85) ? 'high'
    : (Number.isFinite(res) && res >= 0.65) ? 'mid' : 'low';
}

/** '#RRGGBB' + alfa → 'rgba(...)' (cor pronta; nenhum gradiente por frame). */
export function rgba(hex, a) {
  const h = String(hex).replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(v, 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
