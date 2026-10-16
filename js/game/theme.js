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
