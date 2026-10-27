/* =========================================================
   SKINS SHOP — loja de skins (Etapa 4)
   • Grade com filtros (Todas/Minhas/À venda), detalhe com
     pré-visualização animada e fluxo de compra via billing.js.
   • Preço SEMPRE o devolvido pelo Google Play (nunca fixo).
   • Estados em pt-BR, sem alert(): cancelado é silencioso,
     pendente/erro/explicam; loja indisponível = vitrine.
   • Nunca aparece durante a partida (entrada só do menu).
   ========================================================= */

import { on } from '../core/events.js';
import { sfx, initAudio, resumeAudio } from '../core/audio.js';
import { showToast } from './toasts.js';
import {
  state, ownsSkin, equipSkin, markSkinSeen, setSkinCustom, resetSkinCustom, grantSkin,
} from '../core/state.js';
import * as wallet from '../core/wallet.js';
import {
  SKINS, BUNDLE_SKU, PALETAS, RASTROS, AURAS, getSkin, getSkinBySku, resolveLook,
} from '../game/skins.js';
import { drawPlayer } from '../game/entities.js';
import {
  isStoreAvailable, fetchPrices, purchase, restorePurchases, syncPurchases,
} from '../monetization/billing.js';

// ---------------------------------------------------------
//  Estado da loja
// ---------------------------------------------------------
let prices = {};                 // { sku: { localizedPrice, ... } } — só do provedor
let filter = 'todas';
let detailId = null;             // skin aberta no detalhe (null = grade)
let previewLook = null;          // look mostrado no preview (experimentar/custom)
let pendingSku = null;           // sku no modal de compra
let lastFocused = null;
let shopOpen = false;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------
//  Init / abertura
// ---------------------------------------------------------
export function initShop() {
  document.addEventListener('click', onShopClick);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Esc fecha os modais de compra (cancelamento silencioso no confirm)
    if (!$('modal-buy').hidden) { closeModal('modal-buy'); return; }
    if (!$('modal-buy-result').hidden) closeModal('modal-buy-result');
  });
  on('shop:open', openShop);
  on('state:reset', updateBadge);
  // saldo mudou (diária, missão, outra compra): atualiza o progresso do detalhe
  on('wallet:changed', () => {
    if (shopOpen && detailId) renderCoinsProgress(getSkin(detailId));
  });
  updateBadge();
}

async function openShop() {
  shopOpen = true;
  // fonte da verdade: sincroniza compras com o provedor e traz preços
  try { await syncPurchases(); } catch { /* offline: mantém cache */ }
  try { prices = await fetchPrices(); } catch { prices = {}; }
  renderShopStatus();
  renderGrid();
  updateBadge();          // primeira visita: o selo "Novo" do menu some
  for (const s of SKINS) markSkinSeen(s.id);
  updateBadge();
  if (detailId) openDetail(detailId, { keepTrial: true });
  else startPreview(null);
}

function updateBadge() {
  const badge = $('skins-badge');
  if (!badge) return;
  const hasNew = SKINS.some((s) => !state.skins.seen[s.id]);
  badge.hidden = !hasNew;
}

function renderShopStatus() {
  const st = $('shop-status');
  const chip = $('shop-store-chip');
  if (!isStoreAvailable()) {
    chip.hidden = false;
    st.hidden = false;
    st.textContent = 'Compras indisponíveis fora da Play Store (modo demonstração). '
      + 'Você pode ver e experimentar as skins, mas não comprá-las.';
  } else {
    chip.hidden = true;
    st.hidden = true;
    st.textContent = '';
  }
}

// ---------------------------------------------------------
//  Grade
// ---------------------------------------------------------
function priceOf(sku) {
  return prices[sku] && prices[sku].localizedPrice ? prices[sku].localizedPrice : '';
}

function stateClass(s) {
  if (state.skins.equipped === s.id) return 'is-eq';
  if (ownsSkin(s.id)) return 'is-owned';
  return isStoreAvailable() && priceOf(s.sku) ? 'is-price' : 'is-off';
}

function stateText(s) {
  if (state.skins.equipped === s.id) return '✓ Equipada';
  if (ownsSkin(s.id)) return 'Comprada · Equipar';
  const p = priceOf(s.sku);
  if (p) return p;
  return 'Indisponível'; // sem preço vindo da Play: nunca um valor fixo
}

function visibleSkins() {
  if (filter === 'minhas') return SKINS.filter((s) => ownsSkin(s.id));
  if (filter === 'venda') return SKINS.filter((s) => s.tier !== 'free' && !ownsSkin(s.id));
  return SKINS;
}

function renderGrid() {
  const grid = $('shop-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = visibleSkins();

  for (const s of list) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    const btn = document.createElement('button');
    btn.className = `skin-card ${stateClass(s)}`;
    btn.dataset.shop = 'open';
    btn.dataset.id = s.id;
    const preco = stateText(s);
    btn.setAttribute('aria-label',
      `Ver ${s.nome} — ${ownsSkin(s.id) || s.tier === 'free' ? preco : `preço ${preco}`}`);

    const cv = document.createElement('canvas');
    cv.className = 'skin-card-canvas';
    cv.width = 132; cv.height = 132;
    cv.setAttribute('aria-hidden', 'true');
    btn.appendChild(cv);

    const nome = document.createElement('span');
    nome.className = 'skin-card-name';
    nome.textContent = s.nome;
    btn.appendChild(nome);

    const tier = document.createElement('span');
    tier.className = 'skin-card-tier';
    tier.textContent = s.tier === 'free' ? 'Grátis' : s.raridade;
    btn.appendChild(tier);

    const estado = document.createElement('span');
    estado.className = 'skin-card-state';
    estado.textContent = preco;
    btn.appendChild(estado);

    li.appendChild(btn);
    grid.appendChild(li);
    paintCard(cv, resolveLook(s.id, state.skins.custom[s.id]));
  }

  // pacote "Coleção Completa" (fora do filtro "minhas", a não ser que já tenha tudo)
  const allOwned = SKINS.filter((s) => s.tier !== 'free').every((s) => ownsSkin(s.id));
  const showBundle = (filter === 'todas' || (filter === 'venda' && !allOwned))
    && (filter !== 'minhas' || allOwned);
  if (showBundle && list.length) {
    const li = document.createElement('li');
    li.className = 'shop-item shop-item-bundle';
    const btn = document.createElement('button');
    btn.className = `skin-card ${allOwned ? 'is-owned' : isStoreAvailable() && priceOf(BUNDLE_SKU) ? 'is-price' : 'is-off'}`;
    btn.dataset.shop = 'bundle';
    const bPrice = priceOf(BUNDLE_SKU);
    btn.setAttribute('aria-label', `Coleção Completa — 20 skins — ${allOwned ? 'completa' : bPrice || 'indisponível'}`);
    const t = document.createElement('span');
    t.className = 'skin-card-name';
    t.textContent = 'Coleção Completa';
    btn.appendChild(t);
    const d = document.createElement('span');
    d.className = 'skin-card-tier';
    d.textContent = '20 skins em um pacote';
    btn.appendChild(d);
    const e = document.createElement('span');
    e.className = 'skin-card-state';
    e.textContent = allOwned ? '✓ Completa' : (bPrice || 'Indisponível');
    btn.appendChild(e);
    li.appendChild(btn);
    grid.appendChild(li);
  }

  grid.hidden = list.length === 0;
}

/** Pinta o mini-retrato da skin (desenho único — animação é via CSS). */
function paintCard(canvas, look) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const fake = {
    x: canvas.width / 2, y: canvas.height / 2, r: canvas.width * 0.21,
    trail: [], invuln: 0, shield: false,
  };
  drawPlayer(g, fake, 0, true, look);
}

// ---------------------------------------------------------
//  Detalhe
// ---------------------------------------------------------
function openDetail(id, { keepTrial = false } = {}) {
  const s = getSkin(id);
  detailId = s.id;
  $('shop-grid').hidden = true;
  $('shop-detail').hidden = false;
  $('detail-nome').textContent = s.nome;
  $('detail-tier').textContent = s.tier === 'free' ? 'Grátis' : `${s.raridade}`;
  $('detail-desc').textContent = s.descricao;
  if (!keepTrial) {
    previewLook = ownsSkin(s.id)
      ? resolveLook(s.id, state.skins.custom[s.id])
      : resolveLook(s.id);
  }
  const pv = $('shop-preview');
  if (pv) pv.setAttribute('aria-label', `Pré-visualização da skin ${s.nome}`);
  renderDetailActions();
  renderCustom();
  startPreview(previewLook);
}

function closeDetail() {
  detailId = null;
  previewLook = null;
  $('shop-detail').hidden = true;
  $('shop-grid').hidden = false;
  renderGrid();
}

function renderDetailActions() {
  const box = $('detail-actions');
  const note = $('detail-note');
  box.innerHTML = '';
  note.hidden = true;
  renderCoinsProgress(null);                 // esconde; volta se aplicável abaixo
  if (!detailId) return;
  const s = getSkin(detailId);
  const mkBtn = (label, cls, action) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.dataset.shop = action;
    b.dataset.id = detailId;           // id da skin aberta (o handler lê data-id)
    return b;
  };

  if (ownsSkin(s.id)) {
    if (state.skins.equipped === s.id) {
      const span = document.createElement('span');
      span.className = 'chip chip-success';
      span.innerHTML = '<svg class="ic ic-sm" aria-hidden="true"><use href="#ic-check2"/></svg> Equipada';
      box.appendChild(span);
    } else {
      box.appendChild(mkBtn('Equipar', 'btn-primary', 'equip'));
    }
    return;
  }

  // não possui: experimentar + DOIS caminhos (moedas grátis PRIMEIRO,
  // Play Billing como alternativa — sem priorizar o pagamento)
  box.appendChild(mkBtn('Experimentar', '', 'trial'));

  if (s.coinPrice) {
    const b = document.createElement('button');
    b.className = 'btn btn-coins';
    b.dataset.shop = 'buy-coins';
    const ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ic.setAttribute('class', 'ic ic-sm');
    ic.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ic-coin');
    ic.appendChild(use);
    b.appendChild(ic);
    b.appendChild(document.createTextNode(` Comprar por ${s.coinPrice} moedas`));
    box.appendChild(b);
    renderCoinsProgress(s);
  }

  const preco = priceOf(s.sku);
  if (preco) {
    box.appendChild(mkBtn(`Comprar por ${preco}`, 'btn-primary', 'buy'));
  } else {
    const b = mkBtn('Compras indisponíveis', 'btn-primary', 'noop');
    b.disabled = true;
    box.appendChild(b);
    note.hidden = false;
    note.textContent = isStoreAvailable()
      ? 'Preço indisponível no momento. Clique em Restaurar compras ou tente mais tarde.'
      : 'Compras disponíveis apenas na Play Store (esta é uma demonstração).';
  }
}

/**
 * Progresso honesto de compra com moedas: saldo vs preço, sem
 * contagem regressiva e sem botão empurrando para pagar — só o
 * quanto falta (o jogador decide).
 */
function renderCoinsProgress(s) {
  const box = $('detail-coins');
  if (!box) return;
  if (!s || !s.coinPrice || ownsSkin(s.id)) { box.hidden = true; return; }
  const saldo = wallet.getCoins();
  const falta = Math.max(0, s.coinPrice - saldo);
  const pct = Math.min(100, Math.floor((saldo / s.coinPrice) * 100));
  const fill = $('coins-progress-fill');
  if (fill) fill.style.width = `${pct}%`;
  const txt = $('detail-coins-text');
  if (txt) {
    txt.textContent = falta > 0
      ? `Suas moedas: ${saldo} de ${s.coinPrice} — faltam ${falta}. Ganhe jogando: partidas, missões e recompensa diária.`
      : `Suas moedas: ${saldo} de ${s.coinPrice} — você já pode comprar.`;
  }
  box.hidden = false;
}

/**
 * Compra com MOEDAS (grátis, só ganhas jogando). Gasto atômico:
 * wallet.spend valida → grava → concede a skin; falha = rollback.
 * Sem empurrão para pagar: se faltar, só mostramos quanto falta.
 */
function buyWithCoins(s) {
  if (!s || !s.coinPrice || ownsSkin(s.id)) return;
  const r = wallet.spend(s.coinPrice, 'skin', s.id, () => grantSkin(s.id, 'coins'));
  if (r.ok) {
    sfx('achievement');
    showToast({ icon: 'ic-coin', title: 'Skin comprada!', desc: `${s.nome} — ${s.coinPrice} moedas` });
    renderGrid();
    refreshDetail();
    return;
  }
  if (r.reason === 'insufficient') {
    showToast({
      icon: 'ic-coin',
      title: 'Moedas insuficientes',
      desc: `Faltam ${s.coinPrice - wallet.getCoins()} moedas — ganhe jogando.`,
    });
    renderCoinsProgress(s);
    return;
  }
  if (r.reason === 'busy') return;              // duplo toque: ignora
  showToast({ icon: 'ic-mission', title: 'Não foi possível concluir', desc: 'Tente de novo em instantes.' });
}

// ---------------------------------------------------------
//  Personalização (Etapa 2) — vocabulário curado por skin
// ---------------------------------------------------------
function renderCustom() {
  const cust = $('detail-custom');
  if (!cust) return;
  if (!detailId || !ownsSkin(detailId)) { cust.hidden = true; return; }
  cust.hidden = false;
  const s = getSkin(detailId);
  const cur = state.skins.custom[detailId] || {};
  const sel = {
    paleta: cur.paleta || s.paleta,
    rastro: cur.rastro || s.rastro,
    aura: cur.aura || s.aura,
  };

  // paletas: amostra circular com as 4 cores da paleta
  const pw = $('custom-paletas');
  pw.innerHTML = '';
  for (const pid of s.personalizacao.paletasPermitidas) {
    const p = PALETAS[pid];
    const b = document.createElement('button');
    b.className = `swatch${sel.paleta === pid ? ' active' : ''}`;
    b.dataset.shop = 'custom';
    b.dataset.kind = 'paleta';
    b.dataset.val = pid;
    b.setAttribute('aria-pressed', String(sel.paleta === pid));
    b.setAttribute('aria-label', `Paleta ${p.nome}`);
    const dot = document.createElement('span');
    dot.className = 'swatch-dot';
    dot.style.background = `conic-gradient(${p.nucleo} 0 25%, ${p.meio} 0 50%, ${p.borda} 0 75%, ${p.brilho} 0)`;
    const nm = document.createElement('span');
    nm.className = 'swatch-name';
    nm.textContent = p.nome;
    b.appendChild(dot);
    b.appendChild(nm);
    pw.appendChild(b);
  }

  renderChips($('custom-rastros'),
    s.personalizacao.rastros.map((k) => [k, RASTROS[k].nome]), sel.rastro, 'rastro');
  renderChips($('custom-auras'),
    s.personalizacao.auras.map((k) => [k, AURAS[k].nome]), sel.aura, 'aura');

  // "Restaurar padrão da skin" só aparece quando há algo customizado
  const rb = cust.querySelector('[data-shop="custom-reset"]');
  if (rb) rb.hidden = !state.skins.custom[detailId];
}

function renderChips(box, options, selected, kind) {
  box.innerHTML = '';
  for (const [val, nome] of options) {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.dataset.shop = 'custom';
    b.dataset.kind = kind;
    b.dataset.val = val;
    b.setAttribute('aria-pressed', String(selected === val));
    b.textContent = nome;
    box.appendChild(b);
  }
}

// ---------------------------------------------------------
//  Pré-visualização animada (canvas único — rácio só quando visível)
// ---------------------------------------------------------
const PV_POOL = 60;
const pvParts = new Array(PV_POOL).fill(null).map(() => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff',
}));
let pvCursor = 0;
let pvRaf = 0;
let pvLast = 0;
let pvT = 0;
let pvTrail = [];
let pvLastFx = 0;

function pvBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const p = pvParts[pvCursor];
    pvCursor = (pvCursor + 1) % PV_POOL;
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.7);
    p.active = true; p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.max = p.life = 0.5 + Math.random() * 0.4;
    p.size = 2 + Math.random() * 2;
    p.color = color;
  }
}

function pvCollectFx(x, y, look) {
  const fx = look.coletaFx;
  const small = state.settings.reduceMotion;
  pvBurst(x, y, fx.cor, small ? 4 : 12, small ? 90 : 160);
}

function startPreview(look) {
  previewLook = look || resolveLook(detailId || 'classic', state.skins.custom[detailId || 'classic']);
  if (!pvRaf) {
    pvLast = 0;
    pvRaf = requestAnimationFrame(pvFrame);
  }
}

function stopPreview() {
  if (pvRaf) { cancelAnimationFrame(pvRaf); pvRaf = 0; }
}

function pvFrame(ts) {
  const screen = $('screen-skins');
  if (!shopOpen || !screen || !screen.classList.contains('active') || !detailId) {
    pvRaf = 0;                       // fora da tela: para de gastar bateria
    return;
  }
  const dt = pvLast ? Math.min(0.05, (ts - pvLast) / 1000) : 0.016;
  pvLast = ts;
  pvT += dt;

  const cv = $('shop-preview');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || 340;
  if (cv.width !== Math.round(cw * dpr)) { cv.width = cv.height = Math.round(cw * dpr); }
  const W = cv.width, H = cv.height;
  const reduce = state.settings.reduceMotion;

  // fundo
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#080b1a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(34,230,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (H / 6) * i);
    ctx.lineTo(W, (H / 6) * i);
    ctx.stroke();
  }

  // orbe em trajetória em oito + rastro
  const cx = W / 2, cy = H / 2;
  const x = cx + Math.sin(pvT * 1.15) * W * 0.27;
  const y = cy + Math.sin(pvT * 2.3) * H * 0.19;
  pvTrail.push({ x, y });
  if (pvTrail.length > 13) pvTrail.shift();
  const p = {
    x, y, r: W * 0.072, trail: pvTrail, invuln: 0, shield: false,
  };

  // efeito de coleta periódico (pool local do preview)
  if (pvT - pvLastFx > 2.3) {
    pvLastFx = pvT;
    pvCollectFx(x, y, previewLook);
  }

  drawPlayer(ctx, p, pvT, reduce, previewLook);

  // partículas do preview
  for (const pt of pvParts) {
    if (!pt.active) continue;
    pt.life -= dt;
    if (pt.life <= 0) { pt.active = false; continue; }
    pt.vx *= 1 - 1.6 * dt; pt.vy *= 1 - 1.6 * dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * (pt.life / pt.max), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  pvRaf = requestAnimationFrame(pvFrame);
}

// ---------------------------------------------------------
//  Modais de compra
// ---------------------------------------------------------
function openModal(id) {
  const m = $(id);
  lastFocused = document.activeElement;
  m.hidden = false;
  const panel = m.querySelector('.panel');
  panel.setAttribute('tabindex', '-1');
  panel.focus({ preventScroll: true });
}
function closeModal(id) {
  const m = $(id);
  if (!m || m.hidden) return;
  m.hidden = true;
  if (lastFocused && lastFocused.isConnected) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
}

function openBuyModal(sku) {
  pendingSku = sku;
  const s = getSkinBySku(sku);
  $('buy-nome').textContent = sku === BUNDLE_SKU ? 'Coleção Completa — 20 skins' : (s ? s.nome : sku);
  const p = priceOf(sku);
  $('buy-preco').textContent = p || 'O preço será exibido pela Play Store.';
  const btn = $('buy-confirm');
  btn.disabled = false;
  btn.textContent = 'Comprar';
  openModal('modal-buy');
}

function openResult({ title, text, actions }) {
  $('buyr-title').textContent = title;
  $('buyr-text').textContent = text;
  const box = $('buyr-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.primary ? 'btn-primary' : ''}`;
    b.textContent = a.label;
    b.addEventListener('click', () => { closeModal('modal-buy-result'); a.act && a.act(); });
    box.appendChild(b);
  }
  openModal('modal-buy-result');
}

async function runPurchase() {
  const sku = pendingSku;
  if (!sku) return;
  const btn = $('buy-confirm');
  btn.disabled = true;
  btn.textContent = 'Abrindo a Play Store…';
  const res = await purchase(sku).catch(() => ({ status: 'error' }));
  const isBundle = sku === BUNDLE_SKU;

  if (res.status === 'ok') {
    closeModal('modal-buy');
    sfx('record');
    showToast({
      icon: 'ic-check2',
      title: isBundle ? 'Coleção completa liberada!' : 'Skin comprada!',
      desc: isBundle ? 'As 20 skins estão com você.' : (getSkinBySku(sku)?.nome || ''),
    });
    prices = await fetchPrices().catch(() => prices);
    renderShopStatus();
    if (isBundle) { renderGrid(); if (detailId) refreshDetail(); }
    else openResult({
      title: 'Skin liberada',
      text: 'Equipar agora?',
      actions: [
        { label: 'Equipar agora', primary: true, act: () => { equipSkin(getSkinBySku(sku).id); afterEquip(); } },
        { label: 'Agora não', act: () => { renderGrid(); if (detailId) refreshDetail(); } },
      ],
    });
  } else if (res.status === 'cancelled') {
    // cancelado pelo usuário: silencioso, sem mensagem de erro
    closeModal('modal-buy');
  } else if (res.status === 'pending') {
    closeModal('modal-buy');
    openResult({
      title: 'Pagamento pendente',
      text: 'Assim que o Google Play aprovar o pagamento, a skin será liberada automaticamente.',
      actions: [{ label: 'Entendi' }],
    });
  } else if (res.status === 'unavailable') {
    closeModal('modal-buy');
    renderShopStatus();
    openResult({
      title: 'Loja indisponível',
      text: 'Compras só funcionam na Play Store. Esta é uma demonstração da loja.',
      actions: [{ label: 'Entendi' }],
    });
  } else {
    // erro desconhecido: opção de tentar de novo
    closeModal('modal-buy');
    openResult({
      title: 'Não foi possível concluir',
      text: 'Houve um problema ao abrir o pagamento. Nada foi cobrado.',
      actions: [
        { label: 'Tentar de novo', primary: true, act: () => openBuyModal(sku) },
        { label: 'Fechar' },
      ],
    });
  }
}

/** Re-renderiza ações + personalização do detalhe aberto. */
function refreshDetail() {
  if (!detailId) return;
  renderDetailActions();
  renderCustom();
}

function afterEquip() {
  sfx('ui');
  renderGrid();
  if (detailId) {
    previewLook = resolveLook(detailId, state.skins.custom[detailId]);
    refreshDetail();
  }
}

async function doRestore() {
  const r = await restorePurchases().catch(() => ({ status: 'error' }));
  if (r.status === 'unavailable') {
    showToast({ icon: 'ic-skin', title: 'Loja indisponível', desc: 'Compras fora da Play Store não podem ser restauradas.' });
    return;
  }
  if (r.status === 'offline') {
    showToast({ icon: 'ic-skin', title: 'Sem conexão', desc: 'Tente restaurar quando voltar a internet.' });
    return;
  }
  const n = (r.owned || []).length;
  if (n) {
    showToast({ icon: 'ic-check2', title: 'Compras restauradas', desc: n === 1 ? '1 skin da loja.' : `${n} skins da loja.` });
    prices = await fetchPrices().catch(() => prices);
    renderShopStatus();
    renderGrid();
    if (detailId) {
      if (ownsSkin(detailId)) previewLook = resolveLook(detailId, state.skins.custom[detailId]);
      refreshDetail();
    }
  } else {
    showToast({ icon: 'ic-skin', title: 'Nenhuma compra encontrada', desc: 'Use a mesma conta da Play Store.' });
  }
}

// ---------------------------------------------------------
//  Cliques (delegação por data-shop)
// ---------------------------------------------------------
function onShopClick(e) {
  const el = e.target.closest('[data-shop]');
  if (!el) return;
  initAudio(); resumeAudio();
  const val = el.dataset.val;
  // ações do detalhe podem vir sem data-id: caem na skin aberta (detailId)
  const id = el.dataset.id || detailId;

  switch (el.dataset.shop) {
    case 'filter': {
      filter = val;
      document.querySelectorAll('.shop-filters .chip-btn').forEach((b) => {
        const on2 = b.dataset.val === filter;
        b.classList.toggle('active', on2);
        b.setAttribute('aria-pressed', String(on2));
      });
      sfx('ui');
      renderGrid();
      break;
    }
    case 'open': sfx('ui'); openDetail(id); break;
    case 'back': sfx('ui'); closeDetail(); stopPreview(); break;
    case 'equip': if (equipSkin(id)) { sfx('ui'); afterEquip(); } break;
    case 'trial': {
      sfx('ui');
      previewLook = resolveLook(detailId);
      startPreview(previewLook);
      showToast({ icon: 'ic-skin', title: 'Experimentando', desc: 'Só na pré-visualização — sem vantagem na partida.' });
      break;
    }
    case 'buy': sfx('ui'); openBuyModal(getSkin(detailId).sku); break;
    case 'buy-coins': sfx('ui'); buyWithCoins(getSkin(detailId)); break;
    case 'bundle': sfx('ui'); openBuyModal(BUNDLE_SKU); break;
    case 'custom': {
      sfx('ui');
      if (!setSkinCustom(detailId, { [el.dataset.kind]: val })) break;
      previewLook = resolveLook(detailId, state.skins.custom[detailId]);
      startPreview(previewLook);   // pré-visualização ao vivo reage na hora
      renderCustom();
      break;
    }
    case 'custom-reset': {
      sfx('ui');
      resetSkinCustom(detailId);
      previewLook = resolveLook(detailId);
      startPreview(previewLook);
      renderCustom();
      break;
    }
    case 'buy-confirm': sfx('ui'); runPurchase(); break;
    case 'buy-cancel': sfx('ui'); closeModal('modal-buy'); break;  // cancelar: silencioso
    case 'restore': case 'restore-settings': sfx('ui'); doRestore(); break;
    case 'noop': break;
    default: break;
  }
}
