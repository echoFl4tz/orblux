/* =========================================================
   BILLING — interface única de compras (Google Play Billing)
   Duas implementações atrás da mesma interface:
     • PlayBillingProvider  — dentro do TWA na Play Store (real)
     • MockProvider         — localhost / ?debug=1 (testar a UI sem loja)
     • indisponível         — navegador comum (modo vitrine, nunca falha)

   REGRAS
   • Pagamentos reais SÓ via Google Play (Digital Goods + Payment Request).
     Nunca Pix/Stripe/cartão próprio.
   • Skins são NÃO CONSUMÍVEIS: NUNCA chamamos consume() (isso seria
     revenda). A fonte da verdade é listPurchases() do Play.
   • Preço SEMPRE o devolvido pelo Play (localizedPrice) — nunca fixo.

   Ver MONETIZACAO.md (documentação oficial consultada).
   ========================================================= */

import { emit } from '../core/events.js';
import { state, grantSkin, revokeSkin } from '../core/state.js';
import { ALL_SKUS, BUNDLE_SKU, getSkinBySku, SKINS } from '../game/skins.js';

const STORE_ID = 'https://play.google.com/billing';
const MOCK_STORE_KEY = 'pn_mock_purchases';
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias de cache offline

/** @type {{id:'play'|'mock'|'none', available:boolean}} */
let provider = { id: 'none', available: false };
let svc = null;                 // Digital Goods Service (Play)
let lastSync = 0;               // timestamp da última confirmação do provedor
let offlineSince = null;        // quando ficou offline (p/ grace de 7 dias)

export function billingProviderId() { return provider.id; }
export function isStoreAvailable() { return provider.available; }

/* ---------------------------------------------------------
   Detecção / init
--------------------------------------------------------- */
export async function initBilling() {
  const q = typeof location !== 'undefined' ? location.search : '';
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const isLocal = ['localhost', '127.0.0.1', ''].includes(host);
  const forceNone = /[?&]nomock=1/.test(q);
  const forceMock = /[?&]mock=1/.test(q);
  const isDebug = /[?&]debug=1/.test(q) || isLocal;

  const playAvailable = await detectPlay();

  if (forceNone) provider = noneProvider();
  else if (forceMock) provider = mockProvider();
  else if (playAvailable) provider = playProvider();
  else if (isDebug) provider = mockProvider();   // dev local: mock p/ testar a UI
  else provider = noneProvider();                // navegador comum: vitrine

  return provider.id;
}

async function detectPlay() {
  if (typeof window === 'undefined' || !('getDigitalGoodsService' in window)) return false;
  try {
    svc = await window.getDigitalGoodsService(STORE_ID);
    return !!svc;
  } catch { svc = null; return false; }
}

/* ---------------------------------------------------------
   Provedor "indisponível" (vitrine) — nunca falha
--------------------------------------------------------- */
function noneProvider() {
  return {
    id: 'none', available: false,
    async getPrices() { return {}; },
    async buy() { return { status: 'unavailable' }; },
    async getPurchases() { return { status: 'offline', items: [] }; },
  };
}

/* ---------------------------------------------------------
   Provedor PLAY (Digital Goods + Payment Request)
--------------------------------------------------------- */
function playProvider() {
  return {
    id: 'play', available: true,

    /** Preços localizados (nunca fixos). */
    async getPrices(skus) {
      const out = {};
      try {
        const details = await svc.getDetails(skus);
        for (const d of details || []) {
          const p = (d.pricing && d.pricing[0]) || {};
          out[d.itemId] = {
            title: d.title || '',
            localizedPrice: p.localizedPrice || p.price || '',
            currency: p.currency || '',
          };
        }
      } catch (e) { console.warn('[billing] getDetails falhou:', e); }
      return out;
    },

    /** Compra via Payment Request do Google Play. */
    async buy(sku) {
      if (typeof PaymentRequest === 'undefined') return { status: 'unavailable' };
      try {
        const request = new PaymentRequest(
          [{ supportedMethods: [STORE_ID], data: { sku } }],
          { total: { label: 'ORBLUX', amount: { currency: 'BRL', value: '0.00' } } },
        );
        if (request.canMakePayment) {
          const can = await request.canMakePayment().catch(() => false);
          if (can === false) return { status: 'unavailable' };
        }
        const response = await request.show();
        // Conclui o checkout. A compra de produto único é reconhecida pela
        // Play ao concluir (a API web não expõe acknowledge — ver MONETIZACAO.md).
        await response.complete('success').catch(() => {});
        // Reconfirma via listPurchases (fonte da verdade)
        const owned = await this.getPurchases();
        if (owned.items.includes(sku)) return { status: 'ok', sku };
        // pode ainda estar pendente
        const pend = (owned.pending || []).includes(sku);
        return { status: pend ? 'pending' : 'ok', sku };
      } catch (e) {
        // usuário cancelou a folha de pagamento
        if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message || e)))) return { status: 'cancelled' };
        console.warn('[billing] compra falhou:', e);
        return { status: 'error' };
      }
    },

    /** Compras confirmadas pelo Play (fonte da verdade). */
    async getPurchases() {
      try {
        const list = await svc.listPurchases();
        const items = [];
        const pending = [];
        for (const p of list || []) {
          if (p.purchaseState === 'purchased') items.push(p.itemId);
          else if (p.purchaseState === 'pending') pending.push(p.itemId);
        }
        lastSync = Date.now(); offlineSince = null;
        return { status: 'ok', items, pending };
      } catch (e) {
        // offline / erro: informa, deixa o cache (com grace de 7 dias) decidir
        if (!offlineSince) offlineSince = Date.now();
        return { status: 'offline', items: [] };
      }
    },
  };
}

/* ---------------------------------------------------------
   Provedor MOCK (localhost / ?debug=1) — simula a loja p/ testar a UI
   Controlável por query: ?mock=fail | ?mock=cancel
--------------------------------------------------------- */
function mockPriceFor(sku) {
  if (sku === BUNDLE_SKU) return 'R$ 39,90';
  const s = getSkinBySku(sku);
  if (!s) return '';
  return s.tier === 'A' ? 'R$ 2,99' : s.tier === 'B' ? 'R$ 4,99' : s.tier === 'C' ? 'R$ 9,99' : '';
}

function mockRead() {
  try { return JSON.parse(localStorage.getItem(MOCK_STORE_KEY) || '[]'); } catch { return []; }
}
function mockWrite(list) {
  try { localStorage.setItem(MOCK_STORE_KEY, JSON.stringify(list)); } catch { /* memória */ }
}

function mockProvider() {
  const mode = (typeof location !== 'undefined' && /[?&]mock=(fail|cancel)/.test(location.search))
    ? RegExp.$1 : 'ok';
  return {
    id: 'mock', available: true,

    async getPrices(skus) {
      const out = {};
      for (const sku of skus) out[sku] = { title: sku, localizedPrice: mockPriceFor(sku), currency: 'BRL' };
      return out;
    },

    async buy(sku) {
      if (mode === 'cancel') return { status: 'cancelled' };
      if (mode === 'fail') return { status: 'error' };
      const list = mockRead();
      if (!list.includes(sku)) list.push(sku);
      mockWrite(list);
      return { status: 'ok', sku };
    },

    async getPurchases() {
      lastSync = Date.now(); offlineSince = null;
      return { status: 'ok', items: mockRead(), pending: [] };
    },
  };
}

/* ---------------------------------------------------------
   API de alto nível (sincroniza com state.skins.owned)
--------------------------------------------------------- */

/** Preços de todos os SKUs de compra (idem ao catálogo). */
export async function fetchPrices() {
  if (!provider.available) return {};
  return provider.getPrices(ALL_SKUS);
}

/**
 * Sincroniza state.skins.owned com a fonte da verdade (provedor).
 * Se o provedor não confirmar, remove a skin (exceto offline ≤ 7 dias).
 */
export async function syncPurchases() {
  if (!provider.available) return { status: 'unavailable', owned: [] };
  const res = await provider.getPurchases();
  if (res.status === 'offline') {
    // mantém cache por até 7 dias; sinaliza para a UI
    const graceOk = offlineSince && (Date.now() - offlineSince) < OFFLINE_GRACE_MS;
    return { status: 'offline', owned: Object.keys(state.skins.owned), grace: graceOk };
  }
  const confirmed = new Set(res.items);
  // pacote "Coleção Completa": concede todas as pagas
  const bundleOk = confirmed.has(BUNDLE_SKU);
  if (bundleOk) {
    for (const s of SKINS) {
      if (s.tier !== 'free' && !state.skins.owned[s.id]) grantSkin(s.id);
    }
  }
  // concede o que o Play confirma
  for (const sku of confirmed) {
    const skin = getSkinBySku(sku);
    if (skin && skin.tier !== 'free' && !state.skins.owned[skin.id]) grantSkin(skin.id);
  }
  // remove o que o Play NÃO confirma (reembolso/revogação/conta trocada).
  // Skins compradas com MOEDAS (source 'coins') não são da Play Store:
  // o Play nada sabe sobre elas, então NUNCA são revogadas aqui.
  for (const id of Object.keys(state.skins.owned)) {
    const own = SKINS.find((s) => s.id === id);
    const ent = state.skins.owned[id];
    const boughtWithCoins = !!ent && typeof ent === 'object' && ent.source === 'coins';
    if (own && own.tier !== 'free' && !boughtWithCoins && !confirmed.has(own.sku) && !bundleOk) revokeSkin(id);
  }
  return { status: 'ok', owned: [...confirmed], pending: res.pending || [] };
}

/** Compra um SKU. Retorna { status, sku, message? }. */
export async function purchase(sku) {
  if (!provider.available) return { status: 'unavailable', sku };
  const res = await provider.buy(sku);
  if (res.status === 'ok') {
    await syncPurchases();            // confirma e grava (nunca confiar só no retorno)
    emit('billing:purchased', { sku });
  }
  return { ...res, sku };
}

/** Restaura compras (mesmo caminho da sincronização). */
export async function restorePurchases() {
  return syncPurchases();
}

/* ---------------------------------------------------------
   Gancho de verificação por servidor (OPCIONAL — DESLIGADO)
   Ver MONETIZACAO.md §5. Ative SERVER_VERIFY.enabled e aponte
   para a sua function serverless que valida via Play Developer API.
--------------------------------------------------------- */
export const SERVER_VERIFY = {
  enabled: false,
  endpoint: '',   // ex.: https://us-central1.<proj>.cloudfunctions.net/verifyPurchase
};
export async function verifyOnServer(_sku, _purchaseToken) {
  if (!SERVER_VERIFY.enabled || !SERVER_VERIFY.endpoint) return { entitled: false, skipped: true };
  // TODO(server): POST { sku, purchaseToken } → { entitled: boolean }
  return { entitled: false, skipped: true };
}
