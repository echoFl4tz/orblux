/* =========================================================
   Estado global — configurações, estatísticas, ranking,
   conquistas e missões diárias (salvo no localStorage)
   ========================================================= */

import { getItem, setItem, removeItem, clearAll } from './storage.js';
import { emit } from './events.js';

const KEY_SETTINGS = 'pn_settings';
const KEY_STATS = 'pn_stats';
const KEY_RANKING = 'pn_ranking';
const KEY_ACHIEVEMENTS = 'pn_achievements';
const KEY_MISSIONS = 'pn_missions';
const KEY_CONSENT = 'pn_consent';
const KEY_TUTORIAL = 'pn_tutorial_done';

const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.7,
  haptics: true,
  reduceMotion: false,
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

/** @type {{
 *  settings: typeof DEFAULT_SETTINGS,
 *  stats: typeof DEFAULT_STATS,
 *  ranking: {score:number,date:string}[],
 *  achievements: Record<string, number>,
 *  missions: {date:string, list:any[], bonus:number},
 *  consent: boolean|null,
 *  tutorialDone: boolean,
 * }} */
export const state = {
  settings: { ...DEFAULT_SETTINGS, ...(getItem(KEY_SETTINGS) || {}) },
  stats: { ...DEFAULT_STATS, ...(getItem(KEY_STATS) || {}) },
  ranking: getItem(KEY_RANKING) || [],
  achievements: getItem(KEY_ACHIEVEMENTS) || {},
  missions: getItem(KEY_MISSIONS) || { date: '', list: [], bonus: 0 },
  consent: getItem(KEY_CONSENT),          // true = aceitou anúncios/cookies
  tutorialDone: !!getItem(KEY_TUTORIAL),
};

export const saveSettings = () => setItem(KEY_SETTINGS, state.settings);
export const saveStats = () => setItem(KEY_STATS, state.stats);
export const saveRanking = () => setItem(KEY_RANKING, state.ranking);
export const saveAchievements = () => setItem(KEY_ACHIEVEMENTS, state.achievements);
export const saveMissions = () => setItem(KEY_MISSIONS, state.missions);
export const saveConsent = (v) => { state.consent = v; setItem(KEY_CONSENT, v); };
export const markTutorialDone = () => { state.tutorialDone = true; setItem(KEY_TUTORIAL, true); };

export function resetTutorialFlag() {
  state.tutorialDone = false;
  removeItem(KEY_TUTORIAL);
}

/** Apaga TODO o progresso e restaura padrões. */
export function resetAllProgress() {
  clearAll('pn_');
  state.settings = { ...DEFAULT_SETTINGS };
  state.stats = { ...DEFAULT_STATS };
  state.ranking = [];
  state.achievements = {};
  state.missions = { date: '', list: [], bonus: 0 };
  state.consent = null;
  state.tutorialDone = false;
  saveSettings(); saveStats(); saveRanking(); saveAchievements(); saveMissions();
  emit('state:reset');
}

/** Registra uma partida no ranking local (top 20). Retorna a posição. */
export function addScoreToRanking(score) {
  state.ranking.push({ score, date: new Date().toISOString() });
  state.ranking.sort((a, b) => b.score - a.score);
  state.ranking = state.ranking.slice(0, 20);
  saveRanking();
  return state.ranking.findIndex((r) => r.score === score) + 1;
}

/** Data de hoje no formato YYYY-MM-DD (fuso local). */
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
