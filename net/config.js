/* =========================================================
   CONFIGURAÇÃO DO SUPABASE (camada social)
   • A chave "anon" é PÚBLICA por design (segura no cliente).
   • A chave "service_role" NUNCA entra aqui nem no bundle:
     existe só no ambiente das Edge Functions.
   • Preencha url/anonKey antes de ligar as flags sociais
     (também pode sobrescrever em runtime via localStorage
     'pn_social_config' = { url, anonKey } em homologação).
   ========================================================= */

export const SUPABASE_CONFIG = {
  url: '',        // ex.: https://abcdefghij.supabase.co
  anonKey: '',    // chave anon (publishable) do projeto
};

/**
 * Cliente oficial @supabase/supabase-js — UMD local, versão PINADA
 * (2.117.2, publicada em 25/09/2026 — ≥14 dias, baixada de
 * jsdelivr/npm e verificada por SHA256 em SOCIAL.md).
 * Carregado sob demanda, só quando o provedor Supabase é usado.
 */
export const SUPABASE_VERSION = '2.117.2';
export const SUPABASE_UMD_PATH = '/vendor/supabase-js/supabase-2.117.2.min.js';

/** Lê a config efetiva (arquivo + eventual override local). */
export function supabaseSettings() {
  let ov = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('pn_social_config') : null;
    ov = raw ? JSON.parse(raw) : {};
  } catch { /* segue com o default */ }
  return {
    url: (ov && ov.url) || SUPABASE_CONFIG.url,
    anonKey: (ov && ov.anonKey) || SUPABASE_CONFIG.anonKey,
  };
}
