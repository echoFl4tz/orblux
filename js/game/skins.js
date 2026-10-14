/* =========================================================
   SKINS — catálogo de skins (dados puros, sem DOM/lógica)

   REGRAS INEGOCIÁVEIS
   - Skins são 100% ESTÉTICAS: NÃO contêm nenhum campo que altere
     hitbox, raio, velocidade, spawn, pontuação ou dificuldade.
     (A hitbox da orbe é sempre o raio base — ver teste em
     tests/skins.test.mjs e o desenho em entities.js, que usa p.r.)
   - Preços NÃO moram aqui: sempre exibimos o preço devolvido pelo
     Google Play (localizedPrice). Os "tier" indicam só a faixa a
     configurar no Play Console (ver MONETIZACAO.md).

   Vocabulários curados (paletas/rastros/auras) tornam a personalização
   (Etapa 2)Manageável e sempre legível — sem seletor de cor livre.
   ========================================================= */

/** Faixas de preço (sugestão p/ Play Console — a UI mostra o preço do Play). */
export const TIERS = {
  free: { id: 'free', rotulo: 'Grátis', ordem: 0 },
  A: { id: 'A', rotulo: 'Bronze', ordem: 1 },
  B: { id: 'B', rotulo: 'Prata', ordem: 2 },
  C: { id: 'C', rotulo: 'Ouro', ordem: 3 },
  bundle: { id: 'bundle', rotulo: 'Coleção', ordem: 4 },
};

export const BUNDLE_SKU = 'bundle_collection';

/** Formas de orbe suportadas pelo render (mesma hitbox circular). */
export const FORMAS = ['circulo', 'losango', 'hexagono', 'estrela', 'cristal', 'cometa', 'gota', 'escudo', 'espiral', 'escamas'];

/* ---------------------------------------------------------
   Vocabulários de personalização (curados, legíveis)
--------------------------------------------------------- */
// Cada paleta = 4 cores: núcleo (centro quente), meio, borda, brilho (halo).
export const PALETAS = {
  classica: { nome: 'Clássica', nucleo: '#ffffff', meio: '#bdf8ff', borda: '#22e6ff', brilho: '#22e6ff' },
  brasa: { nome: 'Brasa', nucleo: '#fff3c4', meio: '#ff9a3d', borda: '#ff4d2e', brilho: '#ff6a2e' },
  oceano: { nome: 'Oceano', nucleo: '#e6fbff', meio: '#37b6ff', borda: '#1552d6', brilho: '#2e8bff' },
  menta: { nome: 'Menta', nucleo: '#f0fff8', meio: '#5affc4', borda: '#12b98a', brilho: '#4affb0' },
  quasar: { nome: 'Quasar', nucleo: '#ffe6ff', meio: '#ff6ad5', borda: '#d61f9e', brilho: '#ff5ac8' },
  sol: { nome: 'Sol', nucleo: '#fffbe6', meio: '#ffd23d', borda: '#ff9e1f', brilho: '#ffe45e' },
  eclipse: { nome: 'Eclipse', nucleo: '#e9d8ff', meio: '#8a4dff', borda: '#3d1c8a', brilho: '#7b3dff' },
  gelo: { nome: 'Gelo', nucleo: '#ffffff', meio: '#cfefff', borda: '#7ec8ff', brilho: '#bfe6ff' },
  lima: { nome: 'Lima', nucleo: '#f4ffe6', meio: '#c4ff3d', borda: '#7bc41f', brilho: '#b8ff2e' },
  arcoiris: { nome: 'Arco-Íris', nucleo: '#ffffff', meio: '#ff5ea8', borda: '#5e8bff', brilho: '#8affd6' },
  galaxia: { nome: 'Galáxia', nucleo: '#e6e0ff', meio: '#6a4dff', borda: '#1c1160', brilho: '#7b5aff' },
  plasma: { nome: 'Plasma', nucleo: '#eaffff', meio: '#39f0ff', borda: '#0088ff', brilho: '#39d6ff' },
  lava: { nome: 'Lava', nucleo: '#fff0d6', meio: '#ff6a1f', borda: '#a81500', brilho: '#ff4d00' },
  aurora: { nome: 'Aurora', nucleo: '#eafff2', meio: '#4dffc3', borda: '#7b5aff', brilho: '#6affd6' },
  cyber: { nome: 'Cyber', nucleo: '#e6ffff', meio: '#22e6ff', borda: '#ff3df0', brilho: '#39f0ff' },
  neve: { nome: 'Neve', nucleo: '#ffffff', meio: '#dff2ff', borda: '#a8c8ff', brilho: '#cfe0ff' },
  samurai: { nome: 'Samurai', nucleo: '#ffe6e6', meio: '#ff3d3d', borda: '#1a0505', brilho: '#ff4d4d' },
  supernova: { nome: 'Supernova', nucleo: '#ffffff', meio: '#ffd23d', borda: '#ff3d6a', brilho: '#ff7b3d' },
  holograma: { nome: 'Holograma', nucleo: '#eaffff', meio: '#8affff', borda: '#3d9aff', brilho: '#8affea' },
  dragao: { nome: 'Dragão', nucleo: '#fff0d6', meio: '#ff8a2e', borda: '#a83d00', brilho: '#ff5e2e' },
  orblux: { nome: 'Orblux', nucleo: '#ffffff', meio: '#22e6ff', borda: '#ff3df0', brilho: '#22e6ff' },
};

export const RASTROS = {
  classico: { nome: 'Clássico', tipo: 'pontos' },
  faisca: { nome: 'Faíscas', tipo: 'faiscas' },
  bolha: { nome: 'Bolhas', tipo: 'bolhas' },
  cristal: { nome: 'Cristais', tipo: 'cristais' },
  floco: { nome: 'Flocos', tipo: 'flocos' },
  eletrico: { nome: 'Elétrico', tipo: 'eletrico' },
  gradiente: { nome: 'Gradiente', tipo: 'gradiente' },
  estrelas: { nome: 'Estrelas', tipo: 'estrelas' },
  ondulado: { nome: 'Ondulado', tipo: 'ondulado' },
  derretido: { nome: 'Derretido', tipo: 'derretido' },
  ondas: { nome: 'Ondas', tipo: 'ondas' },
  glitch: { nome: 'Glitch', tipo: 'glitch' },
  afiado: { nome: 'Afiado', tipo: 'afiado' },
  explosao: { nome: 'Explosão', tipo: 'explosao' },
  varredura: { nome: 'Varredura', tipo: 'varredura' },
  fogo: { nome: 'Fogo', tipo: 'fogo' },
  orbitas: { nome: 'Órbitas', tipo: 'orbitas' },
  neve: { nome: 'Neve', tipo: 'neve' },
};

export const AURAS = {
  nenhuma: { nome: 'Nenhuma', tipo: 'nenhuma', intensidade: 0 },
  suave: { nome: 'Suave', tipo: 'anel', intensidade: 0.4 },
  pulsante: { nome: 'Pulsante', tipo: 'pulsante', intensidade: 0.6 },
  sombria: { nome: 'Sombria', tipo: 'anel', intensidade: 0.5 },
  eletrica: { nome: 'Elétrica', tipo: 'pulsante', intensidade: 0.7 },
  quente: { nome: 'Quente', tipo: 'anel', intensidade: 0.6 },
  gelida: { nome: 'Gélida', tipo: 'anel', intensidade: 0.5 },
  grande: { nome: 'Grande', tipo: 'pulsante', intensidade: 0.8 },
  orbitas: { nome: 'Órbitas duplas', tipo: 'orbitas', intensidade: 0.7 },
};

/** Efeitos de coleta (partículas ao pegar um pulso). */
export const COLETA_FX = {
  classico: { nome: 'Clássico', tipo: 'padrao', cor: '#22e6ff' },
  explosao: { nome: 'Explosão', tipo: 'explosao', cor: '#ffd23d' },
  onda: { nome: 'Onda de choque', tipo: 'onda', cor: '#ff3df0' },
  estrela: { nome: 'Estrela', tipo: 'estrela', cor: '#ffe45e' },
  cristal: { nome: 'Cristal', tipo: 'cristal', cor: '#4affb0' },
  fogo: { nome: 'Fogo', tipo: 'fogo', cor: '#ff6a2e' },
  gelo: { nome: 'Gelo', tipo: 'cristal', cor: '#bfe6ff' },
  neon: { nome: 'Neon', tipo: 'padrao', cor: '#39f0ff' },
};

/* ---------------------------------------------------------
   Catálogo
--------------------------------------------------------- */
function skin(o) {
  // Preenche defaults seguros; nunca inclui nada de gameplay.
  return {
    id: o.id,
    sku: o.sku || `skin_${o.id}`,
    nome: o.nome,
    descricao: o.descricao,
    tier: o.tier,
    raridade: o.raridade,
    paleta: o.paleta,
    rastro: o.rastro,
    aura: o.aura,
    particulas: o.particulas,
    coletaFx: o.coletaFx,
    formaOrbe: o.formaOrbe || 'circulo',
    personalizacao: o.personalizacao || { paletasPermitidas: [o.paleta], rastros: [o.rastro], auras: [o.aura] },
  };
}

export const SKINS = [
  // ---- Grátis ----
  skin({
    id: 'classic', sku: 'classic', nome: 'Clássica', tier: 'free', raridade: 'Comum',
    descricao: 'A orbe original do Orblux. Sempre desbloqueada.',
    paleta: 'classica', rastro: 'classico', aura: 'suave', particulas: 'neon', coletaFx: 'classico', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['classica'], rastros: ['classico'], auras: ['nenhuma', 'suave'] },
  }),

  // ---- Faixa A (~R$ 2,99) ----
  skin({ id: 'brasa_neon', nome: 'Brasa Neon', tier: 'A', raridade: 'Bronze',
    descricao: 'Faíscas incandescentes que se soltam a cada movimento.',
    paleta: 'brasa', rastro: 'faisca', aura: 'quente', particulas: 'fogo', coletaFx: 'fogo', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['brasa', 'lava', 'sol'], rastros: ['faisca', 'derretido'], auras: ['quente', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'oceano', nome: 'Oceano', tier: 'A', raridade: 'Bronze',
    descricao: 'Azul profundo com rastro de bolhas ascendentes.',
    paleta: 'oceano', rastro: 'bolha', aura: 'gelida', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'gota',
    personalizacao: { paletasPermitidas: ['oceano', 'gelo', 'plasma'], rastros: ['bolha', 'ondulado'], auras: ['gelida', 'suave', 'nenhuma'] } }),
  skin({ id: 'menta_cristal', nome: 'Menta Cristal', tier: 'A', raridade: 'Bronze',
    descricao: 'Verde-água com estilhaços de cristal no rastro.',
    paleta: 'menta', rastro: 'cristal', aura: 'suave', particulas: 'cristal', coletaFx: 'cristal', formaOrbe: 'cristal',
    personalizacao: { paletasPermitidas: ['menta', 'lima', 'aurora'], rastros: ['cristal', 'faisca'], auras: ['suave', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'rosa_quasar', nome: 'Rosa Quasar', tier: 'A', raridade: 'Bronze',
    descricao: 'Magenta cósmico com aura pulsante.',
    paleta: 'quasar', rastro: 'gradiente', aura: 'pulsante', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['quasar', 'orblux', 'cyber'], rastros: ['gradiente', 'ondulado'], auras: ['pulsante', 'suave', 'nenhuma'] } }),
  skin({ id: 'sol_dourado', nome: 'Sol Dourado', tier: 'A', raridade: 'Bronze',
    descricao: 'Brilho quente de estrela, com contorno dourado.',
    paleta: 'sol', rastro: 'estrelas', aura: 'quente', particulas: 'estrela', coletaFx: 'estrela', formaOrbe: 'estrela',
    personalizacao: { paletasPermitidas: ['sol', 'brasa', 'supernova'], rastros: ['estrelas', 'faisca'], auras: ['quente', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'violeta_eclipse', nome: 'Violeta Eclipse', tier: 'A', raridade: 'Bronze',
    descricao: 'Roxo sombrio envolto numa aura de eclipse.',
    paleta: 'eclipse', rastro: 'gradiente', aura: 'sombria', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'hexagono',
    personalizacao: { paletasPermitidas: ['eclipse', 'galaxia', 'samurai'], rastros: ['gradiente', 'ondulado'], auras: ['sombria', 'suave', 'nenhuma'] } }),
  skin({ id: 'gelo_polar', nome: 'Gelo Polar', tier: 'A', raridade: 'Bronze',
    descricao: 'Branco e azul claro com flocos de neve.',
    paleta: 'gelo', rastro: 'floco', aura: 'gelida', particulas: 'cristal', coletaFx: 'gelo', formaOrbe: 'cristal',
    personalizacao: { paletasPermitidas: ['gelo', 'neve', 'oceano'], rastros: ['floco', 'neve'], auras: ['gelida', 'suave', 'nenhuma'] } }),
  skin({ id: 'lima_acida', nome: 'Lima Ácida', tier: 'A', raridade: 'Bronze',
    descricao: 'Verde-limão elétrico com faíscas estáticas.',
    paleta: 'lima', rastro: 'eletrico', aura: 'pulsante', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'losango',
    personalizacao: { paletasPermitidas: ['lima', 'menta', 'cyber'], rastros: ['eletrico', 'faisca'], auras: ['pulsante', 'eletrica', 'nenhuma'] } }),

  // ---- Faixa B (~R$ 4,99) ----
  skin({ id: 'arco_iris', nome: 'Arco-Íris', tier: 'B', raridade: 'Prata',
    descricao: 'Cores rotativas num rastro em gradiente contínuo.',
    paleta: 'arcoiris', rastro: 'gradiente', aura: 'pulsante', particulas: 'neon', coletaFx: 'estrela', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['arcoiris', 'aurora', 'orblux'], rastros: ['gradiente', 'ondulado'], auras: ['pulsante', 'suave', 'nenhuma'] } }),
  skin({ id: 'galaxia', nome: 'Galáxia', tier: 'B', raridade: 'Prata',
    descricao: 'Espiral roxa/azul com estrelas cintilando por dentro.',
    paleta: 'galaxia', rastro: 'estrelas', aura: 'sombria', particulas: 'estrela', coletaFx: 'estrela', formaOrbe: 'espiral',
    personalizacao: { paletasPermitidas: ['galaxia', 'eclipse', 'supernova'], rastros: ['estrelas', 'orbitas'], auras: ['sombria', 'grande', 'nenhuma'] } }),
  skin({ id: 'plasma', nome: 'Plasma', tier: 'B', raridade: 'Prata',
    descricao: 'Rastro ondulado com aura elétrica perante.',
    paleta: 'plasma', rastro: 'ondulado', aura: 'eletrica', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['plasma', 'cyber', 'oceano'], rastros: ['ondulado', 'eletrico'], auras: ['eletrica', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'lava_viva', nome: 'Lava Viva', tier: 'B', raridade: 'Prata',
    descricao: 'Núcleo incandescente com rastro derretido.',
    paleta: 'lava', rastro: 'derretido', aura: 'quente', particulas: 'fogo', coletaFx: 'fogo', formaOrbe: 'gota',
    personalizacao: { paletasPermitidas: ['lava', 'brasa', 'dragao'], rastros: ['derretido', 'fogo'], auras: ['quente', 'grande', 'nenhuma'] } }),
  skin({ id: 'aurora_boreal', nome: 'Aurora Boreal', tier: 'B', raridade: 'Prata',
    descricao: 'Verde, ciano e violeta em ondas dançantes.',
    paleta: 'aurora', rastro: 'ondas', aura: 'suave', particulas: 'neon', coletaFx: 'onda', formaOrbe: 'losango',
    personalizacao: { paletasPermitidas: ['aurora', 'menta', 'galaxia'], rastros: ['ondas', 'ondulado'], auras: ['suave', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'cyberpunk', nome: 'Cyberpunk', tier: 'B', raridade: 'Prata',
    descricao: 'Ciano e rosa com um glitch discreto e periódico.',
    paleta: 'cyber', rastro: 'glitch', aura: 'eletrica', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'hexagono',
    personalizacao: { paletasPermitidas: ['cyber', 'plasma', 'lima'], rastros: ['glitch', 'eletrico'], auras: ['eletrica', 'pulsante', 'nenhuma'] } }),
  skin({ id: 'neve_estelar', nome: 'Neve Estelar', tier: 'B', raridade: 'Prata',
    descricao: 'Partículas de neve com aura suave e silenciosa.',
    paleta: 'neve', rastro: 'neve', aura: 'suave', particulas: 'cristal', coletaFx: 'gelo', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['neve', 'gelo', 'aurora'], rastros: ['neve', 'floco'], auras: ['suave', 'gelida', 'nenhuma'] } }),
  skin({ id: 'samurai_neon', nome: 'Samurai Neon', tier: 'B', raridade: 'Prata',
    descricao: 'Vermelho e preto com rastro afiado de lâmina.',
    paleta: 'samurai', rastro: 'afiado', aura: 'sombria', particulas: 'fogo', coletaFx: 'fogo', formaOrbe: 'losango',
    personalizacao: { paletasPermitidas: ['samurai', 'eclipse', 'dragao'], rastros: ['afiado', 'glitch'], auras: ['sombria', 'quente', 'nenhuma'] } }),

  // ---- Faixa C (~R$ 9,99) ----
  skin({ id: 'supernova', nome: 'Supernova', tier: 'C', raridade: 'Ouro',
    descricao: 'Explosão de luz ao coletar e aura grandiosa.',
    paleta: 'supernova', rastro: 'explosao', aura: 'grande', particulas: 'estrela', coletaFx: 'explosao', formaOrbe: 'estrela',
    personalizacao: { paletasPermitidas: ['supernova', 'sol', 'galaxia'], rastros: ['explosao', 'estrelas'], auras: ['grande', 'quente', 'nenhuma'] } }),
  skin({ id: 'holograma', nome: 'Holograma', tier: 'C', raridade: 'Ouro',
    descricao: 'Translúcido, com linhas de varredura constantes.',
    paleta: 'holograma', rastro: 'varredura', aura: 'suave', particulas: 'neon', coletaFx: 'neon', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['holograma', 'cyber', 'plasma'], rastros: ['varredura', 'glitch'], auras: ['suave', 'eletrica', 'nenhuma'] } }),
  skin({ id: 'dragao_cosmico', nome: 'Dragão Cósmico', tier: 'C', raridade: 'Ouro',
    descricao: 'Forma de escamas com rastro de fogo estelar.',
    paleta: 'dragao', rastro: 'fogo', aura: 'quente', particulas: 'fogo', coletaFx: 'fogo', formaOrbe: 'escamas',
    personalizacao: { paletasPermitidas: ['dragao', 'lava', 'samurai'], rastros: ['fogo', 'derretido'], auras: ['quente', 'grande', 'nenhuma'] } }),
  skin({ id: 'orblux_lendaria', nome: 'Lendária Orblux', tier: 'C', raridade: 'Ouro',
    descricao: 'Todas as cores da marca, anel orbital duplo e coleta com onda de choque.',
    paleta: 'orblux', rastro: 'orbitas', aura: 'orbitas', particulas: 'neon', coletaFx: 'onda', formaOrbe: 'circulo',
    personalizacao: { paletasPermitidas: ['orblux', 'cyber', 'arcoiris'], rastros: ['orbitas', 'gradiente'], auras: ['orbitas', 'grande', 'nenhuma'] } }),
];

/* ---------------------------------------------------------
   Índices e helpers
--------------------------------------------------------- */
const byId = new Map(SKINS.map((s) => [s.id, s]));
const bySku = new Map(SKINS.map((s) => [s.sku, s]));

/** Todos os SKUs de skins individuais (sem o pacote). */
export const SKIN_SKUS = SKINS.filter((s) => s.tier !== 'free').map((s) => s.sku);
/** SKU do pacote "Coleção Completa". */
export const ALL_SKUS = [...SKIN_SKUS, BUNDLE_SKU];

export function getSkin(id) { return byId.get(id) || byId.get('classic'); }
export function getSkinBySku(sku) { return bySku.get(sku) || null; }
export function isPaid(s) { return s && s.tier !== 'free'; }

/** Resolve a paleta/rastro/aura efetivos de uma skin com uma personalização opcional. */
export function resolveLook(skinId, custom) {
  const s = getSkin(skinId);
  const c = custom || {};
  return {
    id: s.id,
    paleta: PALETAS[c.paleta] || PALETAS[s.paleta],
    rastro: RASTROS[c.rastro] || RASTROS[s.rastro],
    aura: AURAS[c.aura] || AURAS[s.aura],
    particulas: COLETA_FX[s.particulas] || COLETA_FX.classico,
    coletaFx: COLETA_FX[s.coletaFx] || COLETA_FX.classico,
    formaOrbe: s.formaOrbe,
  };
}
