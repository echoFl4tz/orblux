/* =========================================================
   FEATURE FLAGS da camada social
   • TUDO desligado por padrão em produção: quem liga cada
     recurso é o dono do projeto (editando FLAG_DEFAULTS ou
     via localStorage pn_social_flags em homologação).
   • Em localhost (ou ?social=1 em localhost) o dev liga tudo
     sem tocar no arquivo.
   • Provedor: mock em localhost/?mock=1; supabase com
     ?nomock=1 ou override explícito (pn_social_provider).
   ========================================================= */

import { getItem, setItem, removeItem } from '../js/core/storage.js';

const KEY_FLAGS = 'pn_social_flags';
const KEY_PROVIDER = 'pn_social_provider';

export const FLAG_DEFAULTS = {
  SOCIAL_ENABLED: false,          // aba Social inteira
  CHAT_ENABLED: false,            // chat global
  CLANS_ENABLED: false,           // sistema de clãs
  TOURNAMENTS_ENABLED: false,     // torneios de clãs
  GLOBAL_RANKING_ENABLED: false,  // ranking global (substitui o antigo)
  TOURNAMENT_FLASH: false,        // torneio relâmpago de fim de semana
};

export const FLAG_NAMES = Object.keys(FLAG_DEFAULTS);

function isDevHost() {
  try {
    if (typeof location === 'undefined') return true;        // Node (testes)
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  } catch { return true; }
}

function search() {
  try { return (typeof location !== 'undefined' && location.search) || ''; } catch { return ''; }
}

/**
 * Valor de uma flag. Ordem: override local (localStorage) >
 * ?social=1 em dev > default (desligado).
 * @param {keyof FLAG_DEFAULTS} name
 * @returns {boolean}
 */
export function flag(name) {
  const ov = getItem(KEY_FLAGS);
  if (ov && typeof ov === 'object' && typeof ov[name] === 'boolean') return ov[name];
  if (isDevHost() && /[?&]social=1/.test(search())) return true;
  return FLAG_DEFAULTS[name] === true;
}

/** Lê todas as flags de uma vez (para a UI). */
export function allFlags() {
  const out = {};
  for (const n of FLAG_NAMES) out[n] = flag(n);
  return out;
}

/** Dev/testes: sobrescreve uma flag (persiste no dispositivo). */
export function setFlag(name, on) {
  const ov = getItem(KEY_FLAGS) || {};
  ov[name] = !!on;
  setItem(KEY_FLAGS, ov);
}

/** Dev/testes: sobrescreve várias flags de uma vez. */
export function setFlags(obj) {
  const ov = getItem(KEY_FLAGS) || {};
  for (const [k, v] of Object.entries(obj)) ov[k] = !!v;
  setItem(KEY_FLAGS, ov);
}

/** Volta ao default (desligado). */
export function resetFlags() { removeItem(KEY_FLAGS); }

/**
 * Qual provedor de rede usar.
 * - mock: localhost, ?mock=1 ou override 'mock'
 * - supabase: ?nomock=1, override 'supabase', ou produção com config preenchida
 * @returns {'mock'|'supabase'}
 */
export function isMockProvider() {
  const ov = getItem(KEY_PROVIDER);
  if (ov === 'mock') return true;
  if (ov === 'supabase') return false;
  if (/[?&]nomock=1/.test(search())) return false;
  if (/[?&]mock=1/.test(search())) return true;
  return isDevHost();
}

/** Override manual do provedor ('mock' | 'supabase' | null = automático). */
export function setProviderOverride(p) {
  if (p === 'mock' || p === 'supabase') setItem(KEY_PROVIDER, p);
  else removeItem(KEY_PROVIDER);
}
