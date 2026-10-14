/* =========================================================
   Testes do catálogo de skins (Etapa 1)
   Garante: unicidade, campos obrigatórios, cores válidas, vocabulários
   consistentes e — o mais importante — que NENHUMA skin altera dados de
   gameplay (hitbox/raio/velocidade/pontuação).
   Runner: node:test. Uso: node --test tests/skins.test.mjs
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINS, BUNDLE_SKU, ALL_SKUS, TIERS, FORMAS, PALETAS, RASTROS, AURAS, COLETA_FX,
  getSkin, getSkinBySku, resolveLook,
} from '../js/game/skins.js';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HEX_OR_RGBA = /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\()/;

test('catálogo tem 21 produtos: 1 grátis + 20 pagas + 1 pacote', () => {
  const paid = SKINS.filter((s) => s.tier !== 'free');
  assert.equal(SKINS.length, 21);
  assert.equal(paid.length, 20);
  assert.equal(ALL_SKUS.length, 21); // 20 skins + pacote
  assert.ok(ALL_SKUS.includes(BUNDLE_SKU));
});

test('ids e SKUs são únicos e no formato esperado', () => {
  const ids = SKINS.map((s) => s.id);
  const skus = SKINS.map((s) => s.sku);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
  assert.equal(new Set(skus).size, skus.length, 'SKUs duplicados');
  for (const s of SKINS) {
    assert.equal(s.sku, s.id === 'classic' ? 'classic' : `skin_${s.id}`, `SKU fora do padrão: ${s.sku}`);
  }
  // SKUs de compra (pagas + pacote) únicos
  assert.equal(new Set(ALL_SKUS).size, ALL_SKUS.length);
});

test('campos obrigatórios presentes e preenchidos', () => {
  for (const s of SKINS) {
    for (const k of ['id', 'sku', 'nome', 'descricao', 'tier', 'raridade']) {
      assert.ok(typeof s[k] === 'string' && s[k].length > 0, `${s.id}.${k} ausente`);
    }
    assert.ok(TIERS[s.tier], `${s.id}: tier inválido "${s.tier}"`);
    assert.ok(FORMAS.includes(s.formaOrbe), `${s.id}: formaOrbe inválido "${s.formaOrbe}"`);
  }
});

test('skin clássica é grátis e sempre desbloqueada (não tem SKU de compra)', () => {
  const c = getSkin('classic');
  assert.equal(c.tier, 'free');
  assert.ok(!ALL_SKUS.includes(c.sku) || c.sku === 'classic');
  // getSkin devolve a clássica para id desconhecido (fallback seguro)
  assert.equal(getSkin('inexistente').id, 'classic');
});

test('cores em formato válido (hex ou rgba) em todas as paletas usadas', () => {
  const usedPaletas = new Set(SKINS.flatMap((s) => [s.paleta, ...(s.personalizacao?.paletasPermitidas || [])]));
  for (const key of usedPaletas) {
    const p = PALETAS[key];
    assert.ok(p, `paleta "${key}" não definida`);
    for (const c of [p.nucleo, p.meio, p.borda, p.brilho]) {
      assert.match(c, HEX, `paleta ${key}: cor inválida "${c}"`);
    }
  }
});

test('rastro/aura/partículas/coletaFx referenciam o vocabulário', () => {
  for (const s of SKINS) {
    assert.ok(RASTROS[s.rastro], `${s.id}: rastro "${s.rastro}" inválido`);
    assert.ok(AURAS[s.aura], `${s.id}: aura "${s.aura}" inválida`);
    assert.ok(COLETA_FX[s.particulas], `${s.id}: partículas "${s.particulas}" inválidas`);
    assert.ok(COLETA_FX[s.coletaFx], `${s.id}: coletaFx "${s.coletaFx}" inválido`);
    // personalização só usa vocabulário permitido
    for (const k of s.personalizacao.paletasPermitidas) assert.ok(PALETAS[k], `${s.id}: paleta personalizada "${k}"`);
    for (const k of s.personalizacao.rastros) assert.ok(RASTROS[k], `${s.id}: rastro personalizado "${k}"`);
    for (const k of s.personalizacao.auras) assert.ok(AURAS[k], `${s.id}: aura personalizada "${k}"`);
    // a paleta base da skin deve estar entre as permitidas
    assert.ok(s.personalizacao.paletasPermitidas.includes(s.paleta), `${s.id}: paleta base fora das permitidas`);
  }
});

test('NENHUMA skin contém campo que altere gameplay (hitbox/raio/velocidade/pontuação)', () => {
  const PROIBIDOS = [
    'r', 'raio', 'radius', 'hitbox', 'colisao', 'colisão', 'collision',
    'velocidade', 'speed', 'vy', 'vx', 'spawn', 'pontuacao', 'pontuação', 'score',
    'dificuldade', 'difficulty', 'dano', 'damage', 'invuln', 'escudo', 'shield', 'multiplicador', 'x2',
  ];
  for (const s of SKINS) {
    const chaves = Object.keys(s);
    for (const k of chaves) {
      assert.ok(!PROIBIDOS.includes(k.toLowerCase()), `${s.id}: contém campo de gameplay "${k}"`);
    }
    // profundidade: paleta/rastro/aura/etc. também não podem ter nada de gameplay
    for (const bloco of [s.paleta && PALETAS[s.paleta], s.rastro && RASTROS[s.rastro], s.aura && AURAS[s.aura]]) {
      if (!bloco) continue;
      for (const k of Object.keys(bloco)) {
        assert.ok(!PROIBIDOS.includes(k.toLowerCase()), `${s.id}: bloco com campo de gameplay "${k}"`);
      }
    }
  }
  // garante que resolveLook só devolve dados visuais
  const look = resolveLook('supernova', { paleta: 'sol', rastro: 'estrelas', aura: 'quente' });
  for (const k of Object.keys(look)) {
    assert.ok(!['r', 'radius', 'speed', 'score', 'hitbox'].includes(k), `resolveLook devolveu "${k}"`);
  }
});

test('getSkinBySku resolve SKUs reais e devolve null para desconhecido', () => {
  assert.equal(getSkinBySku('skin_brasa_neon').id, 'brasa_neon');
  assert.equal(getSkinBySku('classic').id, 'classic');
  assert.equal(getSkinBySku('sku_inexistente'), null);
});

test('faixas de preço mapeiam para os tiers usados (A, B, C + bundle)', () => {
  const tiers = new Set(SKINS.map((s) => s.tier));
  for (const t of ['free', 'A', 'B', 'C']) assert.ok(tiers.has(t), `tier "${t}" ausente`);
  assert.ok(TIERS.bundle);
  // cada faixa paga tem skins
  for (const t of ['A', 'B', 'C']) {
    assert.ok(SKINS.filter((s) => s.tier === t).length >= 4, `faixa ${t} com poucas skins`);
  }
});
