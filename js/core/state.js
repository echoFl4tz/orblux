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

const KEY_SETTINGS = 'pn_settings';
const KEY_STATS = 'pn_stats';
const KEY_RANKING = 'pn_ranking';
const KEY_ACHIEVEMENTS = 'pn_achievements';
const KEY_MISSIONS = 'pn_missions';
const KEY_CONSENT = 'pn_consent';
const KEY_TUTORIAL = 'pn_tutorial_done';
const KEY_PROFILE = 'pn_profile';
const KEY_SKINS = 'pn_skins';
const KEY_VERSION = 'pn_version';

// v1 = legado "Pulso Neon" (ranking sem name, sem perfil)
// v2 = apelido (profile) + entradas de ranking com { score, date, name }
// v3 = skins (equipped/owned/custom/seen)
const STORAGE_VERSION = 3;

const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.7,
  haptics: true,
  reduceMotion: false,
  highContrast: false,   // obstáculos com contorno branco extra (a11y)
};

const DEFAULT_STATS = {
  best: 0,
  runs: 0,
  totalPickups: 0,
  totalPowerups: 0,
  bestCombo: 1,
  bestLevel: 1,
  totalTime: 0, // segundos totais jogados
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

  // possuídas: só ids válidos com timestamp numérico (a posse REAL é confirmada pelo billing)
  const owned = {};
  if (raw.owned && typeof raw.owned === 'object') {
    for (const [id, ts] of Object.entries(raw.owned)) {
      if (getSkin(id).id === id && typeof ts === 'number') owned[id] = ts;
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

/** @type {{
 *  settings: typeof DEFAULT_SETTINGS,
 *  stats: typeof DEFAULT_STATS,
 *  ranking: {score:number,date:string,name:string}[],
 *  achievements: Record<string, number>,
 *  missions: {date:string, list:any[], bonus:number},
 *  consent: boolean|null,
 *  tutorialDone: boolean,
 *  profile: {nickname:string, createdAt:string, asked:boolean},
 *  skins: {equipped:string, owned:Record<string,number>, custom:Record<string,object>, seen:Record<string,boolean>},
 * }} */
migrateStorage();
export const state = {
  settings: { ...DEFAULT_SETTINGS, ...(getItem(KEY_SETTINGS) || {}) },
  stats: { ...DEFAULT_STATS, ...(getItem(KEY_STATS) || {}) },
  ranking: sanitizeRanking(getItem(KEY_RANKING)),
  achievements: getItem(KEY_ACHIEVEMENTS) || {},
  missions: getItem(KEY_MISSIONS) || { date: '', list: [], bonus: 0 },
  consent: getItem(KEY_CONSENT),          // true = aceitou anúncios/cookies
  tutorialDone: !!getItem(KEY_TUTORIAL),
  profile: loadProfile(),
  skins: loadSkins(),
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
--------------------------------------------------------- */
export const saveSkins = () => setItem(KEY_SKINS, state.skins);

/** A skin é do jogador? (clássica sempre; demais só se compradas/confirmadas). */
export function ownsSkin(id) { return id === 'classic' || !!state.skins.owned[id]; }

/** Concede uma skin (chamado quando o billing confirma a compra). */
export function grantSkin(id) {
  const s = getSkin(id);
  if (!s || s.tier === 'free') return false;
  state.skins.owned[id] = Date.now();
  saveSkins();
  emit('skins:changed', { owned: true, id });
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

/** Apaga TODO o progresso — MAS mantém as skins COMPRADAS (dinheiro do jogador). */
export function resetAllProgress() {
  // skins compradas são dinheiro real: preservamos o mapa owned
  const prevOwned = { ...(state.skins?.owned || {}) };
  clearAll('pn_');
  state.settings = { ...DEFAULT_SETTINGS };
  state.stats = { ...DEFAULT_STATS };
  state.ranking = [];
  state.achievements = {};
  state.missions = { date: '', list: [], bonus: 0 };
  state.consent = null;
  state.tutorialDone = false;
  // perfil apagado: novo apelido padrão e volta a perguntar na próxima abertura
  state.profile = { nickname: generateDefaultNickname(), createdAt: new Date().toISOString(), asked: false };
  // skins: mantém as compradas; zera personalização e skin equipada (voltam ao padrão)
  state.skins = {
    equipped: 'classic',
    owned: prevOwned,
    custom: {},
    seen: { classic: true, ...Object.fromEntries(Object.keys(prevOwned).map((id) => [id, true])) },
  };
  saveSettings(); saveStats(); saveRanking(); saveAchievements(); saveMissions();
  setItem(KEY_PROFILE, state.profile);
  setItem(KEY_SKINS, state.skins);
  setItem(KEY_VERSION, STORAGE_VERSION);
  emit('state:reset');
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
