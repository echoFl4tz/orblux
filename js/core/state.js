/* =========================================================
   Estado global — configurações, estatísticas, ranking,
   conquistas e missões diárias (salvo no localStorage)

   ⚠️ O prefixo das chaves é 'pn_' (legado do nome anterior
   "Pulso Neon") de propósito: mantê-lo preserva o recorde e o
   progresso de quem já jogou. NÃO renomear sem criar migração.
   ========================================================= */

import { getItem, setItem, removeItem, clearAll } from './storage.js';
import { emit } from './events.js';
import { validateNickname, generateDefaultNickname, NICK_MAX } from './nickname.js';
import { getSkin, PALETAS, RASTROS, AURAS } from '../game/skins.js';
import { MAX_COINS } from './economy.js';

const KEY_SETTINGS = 'pn_settings';
const KEY_STATS = 'pn_stats';
const KEY_RANKING = 'pn_ranking';
const KEY_ACHIEVEMENTS = 'pn_achievements';
const KEY_MISSIONS = 'pn_missions';
const KEY_CONSENT = 'pn_consent';
const KEY_TUTORIAL = 'pn_tutorial_done';
const KEY_PROFILE = 'pn_profile';
const KEY_SKINS = 'pn_skins';
const KEY_WALLET = 'pn_wallet';   // carteira de moedas (formato ver em wallet.js)
const KEY_VERSION = 'pn_version';

// v1 = legado "Pulso Neon" (ranking sem name, sem perfil)
// v2 = apelido (profile) + entradas de ranking com { score, date, name }
// v3 = skins (equipped/owned/custom/seen)
// v4 = carteira de moedas (pn_wallet) + skins.owned com origem { at, source }
const STORAGE_VERSION = 4;

/** Preferência do sistema "reduzir movimento" (a11y). Sem DOM no Node. */
function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch { return false; }
}

const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.7,
  // 1ª visita: respeita o que o usuário pediu no sistema operacional;
  // a escolha salva nos ajustes sempre sobrescreve este default.
  reduceMotion: prefersReducedMotion(),
  eventos: true,       // 1.1.0: eventos de partida (Configurações → Jogabilidade)
  highContrast: false,   // obstáculos com contorno branco extra (a11y)
  imageQuality: 'auto',  // qualidade de imagem: auto | alta | media | baixa (A7/HD)
  imageQualitySeed: null, // A8: 'sonda' = alta semeada, 'usuario' = escolha manual, 'healada' = sonda recuou
};

const DEFAULT_STATS = {
  best: 0,
  runs: 0,
  totalPickups: 0,
  totalPowerups: 0,
  bestCombo: 1,
  bestLevel: 1,
  totalTime: 0, // segundos totais jogados
  lastRunDay: '', // último dia (AAAA-MM-DD) com partida — bônus "1ª do dia"
  // 1.1.0 — contadores simples de drops/eventos (migração: spread acima)
  totalDrops: 0,
  dropKinds: {},      // { id: total coletado por tipo }
  eventsCompleted: 0, // eventos terminados (inclusive falhados)
  eventsClean: 0,     // tempestades superadas sem bater
  vistoDrops: [],     // ids já apresentados por toast (novelty única)
  vistoEventos: [],   // ids de eventos já apresentados
};

/** Versão de armazenamento gravada (ausente = 1, legado). */
function readVersion() {
  const v = getItem(KEY_VERSION);
  return typeof v === 'number' && v >= 1 ? v : 1;
}

/** Migra dados legados para o formato atual (idempotente). */
function migrateStorage() {
  const from = readVersion();
  if (from >= STORAGE_VERSION) return;

  // v1 -> v2: entradas do ranking ganham 'name' + garante perfil com apelido padrão
  const ranking = getItem(KEY_RANKING);
  if (Array.isArray(ranking)) {
    const clean = ranking
      .filter((r) => r && typeof r.score === 'number' && isFinite(r.score))
      .map((r) => ({
        score: Math.max(0, Math.floor(r.score)),
        date: typeof r.date === 'string' ? r.date : new Date().toISOString(),
        name: typeof r.name === 'string' && r.name ? r.name : 'Jogador',
      }));
    setItem(KEY_RANKING, clean);
  }
  const profile = getItem(KEY_PROFILE);
  if (!profile || typeof profile.nickname !== 'string') {
    setItem(KEY_PROFILE, { nickname: generateDefaultNickname(), createdAt: new Date().toISOString(), asked: false });
  }
  // v2 -> v3: inicializa estado de skins
  if (from < 3) {
    setItem(KEY_SKINS, { equipped: 'classic', owned: {}, custom: {}, seen: { classic: true } });
  }
  // v3 -> v4: carteira de moedas (pn_wallet) — criada por loadWallet() na
  // primeira leitura; entradas numéricas de skins.owned migram para
  // { at, source:'play' } dentro de loadSkins() (formato validado ali);
  // o bônus de missão legado vira moedas em missions.js (migrateLegacyBonus).
  setItem(KEY_VERSION, STORAGE_VERSION);
}

/** Lê e valida o estado de skins; descarta ids desconhecidos/corrompidos. */
function loadSkins() {
  const raw = getItem(KEY_SKINS);
  const def = { equipped: 'classic', owned: {}, custom: {}, seen: { classic: true } };
  if (!raw || typeof raw !== 'object') return def;

  // equipada: precisa ser um id de skin existente
  const equipped = (typeof raw.equipped === 'string' && getSkin(raw.equipped).id === raw.equipped)
    ? raw.equipped : 'classic';

  // possuídas: só ids válidos com { at: timestamp, source: 'coins'|'play'|'maestria' }.
  // Entrada NUMÉRICA legada (antiga "só Play") migra para source:'play'.
  // A posse REAL de compras com dinheiro é confirmada pelo billing.
  const owned = {};
  if (raw.owned && typeof raw.owned === 'object') {
    for (const [id, val] of Object.entries(raw.owned)) {
      if (getSkin(id).id !== id || id === 'classic') continue;   // clássica nunca entra no mapa
      if (typeof val === 'number' && isFinite(val)) {
        owned[id] = { at: Math.max(0, Math.floor(val)), source: 'play' };
      } else if (val && typeof val === 'object' && typeof val.at === 'number' && isFinite(val.at)
          && (val.source === 'coins' || val.source === 'play' || val.source === 'maestria')) {
        owned[id] = { at: Math.max(0, Math.floor(val.at)), source: val.source };
      }
    }
  }

  // personalização: só vocabulário permitido pela própria skin
  const custom = {};
  if (raw.custom && typeof raw.custom === 'object') {
    for (const [id, c] of Object.entries(raw.custom)) {
      if (getSkin(id).id !== id || !c || typeof c !== 'object') continue;
      custom[id] = {};
      if (c.paleta && PALETAS[c.paleta]) custom[id].paleta = c.paleta;
      if (c.rastro && RASTROS[c.rastro]) custom[id].rastro = c.rastro;
      if (c.aura && AURAS[c.aura]) custom[id].aura = c.aura;
    }
  }

  const seen = { classic: true };
  if (raw.seen && typeof raw.seen === 'object') {
    for (const id of Object.keys(raw.seen)) if (getSkin(id).id === id) seen[id] = true;
  }
  return { equipped, owned, custom, seen };
}

/** Lê e valida o perfil; corrige apelido inválido/corrompido sem quebrar. */
function loadProfile() {
  const p = getItem(KEY_PROFILE);
  const createdAt = p && typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString();
  const asked = !!(p && p.asked);
  let nickname = p && typeof p.nickname === 'string' ? p.nickname : '';
  const v = validateNickname(nickname);
  if (!v.ok) nickname = generateDefaultNickname();       // recupera de dado corrompido
  return { nickname: nickname.slice(0, NICK_MAX), createdAt, asked };
}

/* ---------------------------------------------------------
   WALLET (pn_wallet) — persistência da carteira de moedas

   Só a CAMADA DE ARMAZNAMENTO mora aqui (formato, validação,
   checksum e gravação) — o mesmo tratamento de state.skins.
   Toda MUTAÇÃO de moedas (earn/spend/diária/meta) passa
   exclusivamente por js/core/wallet.js.
--------------------------------------------------------- */

/** @returns {{coins:number,lifetimeEarned:number,lifetimeSpent:number,streak:number,lastClaimDate:string,goalSkinId:string|null,ledger:{t:number,delta:number,reason:string,ref:string}[]}} */
export function defaultWallet() {
  return {
    coins: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    streak: 0,
    lastClaimDate: '',
    goalSkinId: null,
    ledger: [],
  };
}

/** Checksum simples (FNV-1a) — proteção básica contra adulteração.
 *  Não é criptografia: moedas são cosméticas e não valem dinheiro. */
export function walletChecksum(data) {
  const s = JSON.stringify(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Embala a carteira para gravação: { v, c: checksum, d: dados }. */
export function packWallet(wallet) {
  const d = {
    coins: wallet.coins,
    lifetimeEarned: wallet.lifetimeEarned,
    lifetimeSpent: wallet.lifetimeSpent,
    streak: wallet.streak,
    lastClaimDate: wallet.lastClaimDate,
    goalSkinId: wallet.goalSkinId,
    ledger: Array.isArray(wallet.ledger) ? wallet.ledger : [],
  };
  return { v: STORAGE_VERSION, c: walletChecksum(d), d };
}

function intOr(v, fallback = 0) {
  return (Number.isInteger(v) && v >= 0 && v <= 1e12) ? v : fallback;
}

/** Valida o formato ao carregar: números inteiros >= 0; lixo é descartado. */
function sanitizeWallet(raw) {
  const w = defaultWallet();
  if (!raw || typeof raw !== 'object') return w;
  w.coins = Math.min(MAX_COINS, intOr(raw.coins));
  w.lifetimeEarned = intOr(raw.lifetimeEarned);
  w.lifetimeSpent = intOr(raw.lifetimeSpent);
  w.streak = Math.min(100000, intOr(raw.streak));
  w.lastClaimDate = (typeof raw.lastClaimDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastClaimDate)) ? raw.lastClaimDate : '';
  if (typeof raw.goalSkinId === 'string') {
    const s = getSkin(raw.goalSkinId);
    w.goalSkinId = (s.id === raw.goalSkinId && s.tier !== 'free') ? s.id : null;
  }
  if (Array.isArray(raw.ledger)) {
    for (const item of raw.ledger.slice(-50)) {      // só as últimas 50 transações
      if (!item || typeof item !== 'object') continue;
      if (!Number.isInteger(item.t) || !Number.isInteger(item.delta) || item.delta === 0) continue;
      w.ledger.push({
        t: item.t,
        delta: item.delta,
        reason: typeof item.reason === 'string' ? item.reason.slice(0, 40) : '',
        ref: typeof item.ref === 'string' ? item.ref.slice(0, 60) : '',
      });
    }
  }
  return w;
}

/** Lê e valida a carteira. Checksum inválido => zera (aviso discreto, sem travar). */
export function loadWallet() {
  const payload = getItem(KEY_WALLET);
  if (!payload || typeof payload !== 'object' || !payload.d) return defaultWallet();
  if (payload.c !== walletChecksum(payload.d)) {
    console.warn('[wallet] checksum inválido — carteira zerada (dado adulterado/corrompido)');
    return defaultWallet();
  }
  return sanitizeWallet(payload.d);
}

/** Grava a carteira e confirma a leitura. Retorna false se não persistir
 *  (modo privado/quota) — o chamador decide o rollback. */
export function saveWallet() {
  const payload = packWallet(state.wallet);
  setItem(KEY_WALLET, payload);
  const back = getItem(KEY_WALLET);
  if (!back || back.c !== payload.c || walletChecksum(back.d) !== payload.c) return false;
  return true;
}

/** @type {{
 *  settings: typeof DEFAULT_SETTINGS,
 *  stats: typeof DEFAULT_STATS,
 *  ranking: {score:number,date:string,name:string}[],
 *  achievements: Record<string, number>,
 *  missions: {date:string, list:any[]},
 *  consent: boolean|null,
 *  tutorialDone: boolean,
 *  profile: {nickname:string, createdAt:string, asked:boolean},
 *  skins: {equipped:string, owned:Record<string,{at:number,source:'coins'|'play'}>, custom:Record<string,object>, seen:Record<string,boolean>},
 *  wallet: ReturnType<typeof defaultWallet>,
 * }} */
migrateStorage();
export const state = {
  settings: { ...DEFAULT_SETTINGS, ...(getItem(KEY_SETTINGS) || {}) },
  stats: { ...DEFAULT_STATS, ...(getItem(KEY_STATS) || {}) },
  ranking: sanitizeRanking(getItem(KEY_RANKING)),
  achievements: getItem(KEY_ACHIEVEMENTS) || {},
  missions: getItem(KEY_MISSIONS) || { date: '', list: [] },
  consent: getItem(KEY_CONSENT),          // true = aceitou anúncios/cookies
  tutorialDone: !!getItem(KEY_TUTORIAL),
  profile: loadProfile(),
  skins: loadSkins(),
  wallet: loadWallet(),                   // carteira de moedas (mutação só em wallet.js)
};

/** Descarta entradas corrompidas do ranking (não quebra o jogo). */
function sanitizeRanking(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.score === 'number' && isFinite(r.score))
    .map((r) => ({
      score: Math.max(0, Math.floor(r.score)),
      date: typeof r.date === 'string' ? r.date : new Date().toISOString(),
      name: typeof r.name === 'string' && r.name ? r.name : 'Jogador',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export const saveSettings = () => setItem(KEY_SETTINGS, state.settings);
export const saveStats = () => setItem(KEY_STATS, state.stats);
export const saveRanking = () => setItem(KEY_RANKING, state.ranking);
export const saveAchievements = () => setItem(KEY_ACHIEVEMENTS, state.achievements);
export const saveMissions = () => setItem(KEY_MISSIONS, state.missions);
export const saveConsent = (v) => { state.consent = v; setItem(KEY_CONSENT, v); };
export const markTutorialDone = () => { state.tutorialDone = true; setItem(KEY_TUTORIAL, true); };

export const saveProfile = () => setItem(KEY_PROFILE, state.profile);

/** Marca que a tela de apelido já foi mostrada (não aparece de novo). */
export const markProfileAsked = () => { state.profile.asked = true; saveProfile(); };

/**
 * Valida e salva o apelido. Entradas antigas do ranking mantêm o nome antigo.
 * @param {string} raw
 * @returns {{ok:boolean, value:string, error:string}}
 */
export function setNickname(raw) {
  const v = validateNickname(raw);
  if (!v.ok) return v;
  state.profile.nickname = v.value;
  saveProfile();
  emit('profile:changed', { nickname: v.value });
  return v;
}

export function resetTutorialFlag() {
  state.tutorialDone = false;
  removeItem(KEY_TUTORIAL);
}

/* ---------------------------------------------------------
   SKINS — posse, equipar, personalização
   A posse REAL vem do Google Play (billing.js → listPurchases);
   aqui só mantemos o cache e a interface.
   owned[id] = { at, source } — source: 'play' (dinheiro) | 'coins' (moedas)
--------------------------------------------------------- */
export const saveSkins = () => {
  setItem(KEY_SKINS, state.skins);
  const back = getItem(KEY_SKINS);           // confirmação de leitura (mesmo critério da carteira)
  return !!back && JSON.stringify(back) === JSON.stringify(state.skins);
};

/** A skin é do jogador? (clássica sempre; demais só se compradas/confirmadas). */
export function ownsSkin(id) { return id === 'classic' || !!state.skins.owned[id]; }

/** Origem da posse: 'coins' | 'play' | null (não possui). */
export function skinSource(id) {
  const own = state.skins.owned[id];
  return own && own.source ? own.source : null;
}

/**
 * Concede uma skin (billing → 'play'; compra com moedas → 'coins';
 * conquista de nível na Maestria → 'maestria').
 * Se a gravação falhar, desfaz e retorna false (gasto atômico com wallet).
 * @param {string} id @param {'play'|'coins'|'maestria'} [source]
 */
export function grantSkin(id, source = 'play') {
  const s = getSkin(id);
  if (!s || s.tier === 'free' || state.skins.owned[id]) return false;
  const src = source === 'coins' ? 'coins' : source === 'maestria' ? 'maestria' : 'play';
  state.skins.owned[id] = { at: Date.now(), source: src };
  if (!saveSkins()) {
    delete state.skins.owned[id];
    console.warn('[skins] falha ao gravar a posse — concessão desfeita');
    return false;
  }
  emit('skins:changed', { owned: true, id, source: src });
  return true;
}

/** Remove uma skin (ex.: compra reembolsada/revogada pelo Play). */
export function revokeSkin(id) {
  if (!state.skins.owned[id]) return;
  delete state.skins.owned[id];
  if (state.skins.equipped === id) state.skins.equipped = 'classic';
  saveSkins();
  emit('skins:changed', { owned: false, id });
}

/** Equipa uma skin (só se possuída). */
export function equipSkin(id) {
  const s = getSkin(id);
  if (!s || !ownsSkin(s.id)) return false;
  state.skins.equipped = s.id;
  saveSkins();
  emit('skins:changed', { equipped: s.id });
  return true;
}

/** Aplica personalização (só vocabulário permitido pela skin). */
export function setSkinCustom(id, c) {
  const skin = getSkin(id);
  if (!skin || !ownsSkin(skin.id)) return false;
  const cur = state.skins.custom[skin.id] || {};
  const next = { ...cur };
  if (c && c.paleta && PALETAS[c.paleta] && skin.personalizacao.paletasPermitidas.includes(c.paleta)) next.paleta = c.paleta;
  if (c && c.rastro && RASTROS[c.rastro] && skin.personalizacao.rastros.includes(c.rastro)) next.rastro = c.rastro;
  if (c && c.aura && AURAS[c.aura] && skin.personalizacao.auras.includes(c.aura)) next.aura = c.aura;
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
  state.skins.custom[skin.id] = next;
  saveSkins();
  emit('skins:changed', { custom: skin.id });
  return true;
}

/** Restaura a personalização padrão da skin. */
export function resetSkinCustom(id) {
  if (!state.skins.custom[id]) return;
  delete state.skins.custom[id];
  saveSkins();
  emit('skins:changed', { custom: id });
}

/** Marca a skin como já vista (remove o selo "novo"). */
export function markSkinSeen(id) {
  if (getSkin(id).id !== id || state.skins.seen[id]) return;
  state.skins.seen[id] = true;
  saveSkins();
}

/**
 * Apaga TODO o progresso.
 * - Skins compradas com DINHEIRO (Google Play) são mantidas sempre:
 *   o Play as restaura e é dinheiro do jogador.
 * - Skins conquistadas na MAESTRIA são apagadas junto com o XP
 *   (é progresso — dá para reconquistar jogando).
 * - Moedas e skins compradas com moedas são apagadas POR PADRÃO;
 *   `opts.keepCoins = true` (opção no modal) mantém moedas e as
 *   skins compradas com moedas também.
 * - Personalização e skin equipada voltam ao padrão sempre.
 * @param {{keepCoins?: boolean}} [opts]
 */
export function resetAllProgress(opts = {}) {
  const keepCoins = !!opts.keepCoins;
  // skins de DINHEIRO: preservadas; moedas (source 'coins') seguem a opção
  const prevOwned = { ...(state.skins?.owned || {}) };
  const prevWallet = state.wallet;      // capturado antes do clearAll (keepCoins)
  const keptOwned = {};
  for (const [id, ent] of Object.entries(prevOwned)) {
    const src = ent && typeof ent === 'object' ? ent.source : 'play';   // legado = dinheiro
    if (src === 'play') keptOwned[id] = ent;            // dinheiro: mantida sempre
    else if (src === 'coins' && keepCoins) keptOwned[id] = ent;   // moedas: pela opção
    // 'maestria': conquista de progresso — apagada junto com o XP
  }
  clearAll('pn_');
  state.settings = { ...DEFAULT_SETTINGS };
  state.stats = { ...DEFAULT_STATS };
  state.ranking = [];
  state.achievements = {};
  state.missions = { date: '', list: [] };
  state.consent = null;
  state.tutorialDone = false;
  // perfil apagado: novo apelido padrão e volta a perguntar na próxima abertura
  state.profile = { nickname: generateDefaultNickname(), createdAt: new Date().toISOString(), asked: false };
  // carteira: zerada por padrão; keepCoins preserva saldo/sequência/metas
  state.wallet = keepCoins ? prevWallet : defaultWallet();
  // skins: mantém as de dinheiro; zera personalização e skin equipada
  state.skins = {
    equipped: 'classic',
    owned: keptOwned,
    custom: {},
    seen: { classic: true, ...Object.fromEntries(Object.keys(keptOwned).map((id) => [id, true])) },
  };
  saveSettings(); saveStats(); saveRanking(); saveAchievements(); saveMissions();
  setItem(KEY_PROFILE, state.profile);
  setItem(KEY_SKINS, state.skins);
  saveWallet();
  setItem(KEY_VERSION, STORAGE_VERSION);
  emit('state:reset');
  emit('wallet:changed', { coins: state.wallet.coins, delta: 0, reason: 'reset', ref: '' });
}

/** Registra uma partida no ranking local (top 20), com o apelido do momento. */
export function addScoreToRanking(score) {
  const entry = {
    score: Math.max(0, Math.floor(score)),
    date: new Date().toISOString(),
    name: state.profile?.nickname || 'Jogador',
  };
  state.ranking.push(entry);
  state.ranking.sort((a, b) => b.score - a.score);
  state.ranking = state.ranking.slice(0, 20);
  saveRanking();
  return state.ranking.findIndex((r) => r === entry) + 1;
}

/** Data de hoje no formato YYYY-MM-DD (fuso local). */
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
