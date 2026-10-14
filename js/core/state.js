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

const KEY_SETTINGS = 'pn_settings';
const KEY_STATS = 'pn_stats';
const KEY_RANKING = 'pn_ranking';
const KEY_ACHIEVEMENTS = 'pn_achievements';
const KEY_MISSIONS = 'pn_missions';
const KEY_CONSENT = 'pn_consent';
const KEY_TUTORIAL = 'pn_tutorial_done';
const KEY_PROFILE = 'pn_profile';
const KEY_VERSION = 'pn_version';

// v1 = legado "Pulso Neon" (ranking sem name, sem perfil)
// v2 = apelido (profile) + entradas de ranking com { score, date, name }
const STORAGE_VERSION = 2;

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
  setItem(KEY_VERSION, STORAGE_VERSION);
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

/** Apaga TODO o progresso (inclui o perfil/apelido) e restaura padrões. */
export function resetAllProgress() {
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
  saveSettings(); saveStats(); saveRanking(); saveAchievements(); saveMissions();
  setItem(KEY_PROFILE, state.profile);
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
