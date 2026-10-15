/* =========================================================
   REGRAS SOCIAIS compartilhadas (PURO, sem DOM)
   Este módulo é o ESPELHO cliente/mock das regras que no
   servidor real valem como SQL/Edge Functions — o servidor
   é a fonte da verdade; aqui servimos para:
   • MockProvider simular o servidor fielmente (sem rede);
   • testes (node:test) das regras sem banco;
   • feedback IMEDIATO na UI antes da confirmação do servidor.
   ========================================================= */

import { BADWORDS } from '../js/core/badwords.js';
import { validateNickname, NICK_MIN, NICK_MAX } from '../js/core/nickname.js';

/* ---------------- limites ---------------- */
export const CHAT = {
  MAX_LEN: 200,          // caracteres por mensagem
  COOLDOWN_MS: 2000,     // 1 mensagem a cada 2 s
  PER_MIN: 15,           // e no máx. 15 por minuto
  DUPLICATE_MS: 30000,   // repetição idêntica bloqueada por 30 s
  HISTORY_LIMIT: 50,     // páginas de histórico
  RETENTION_HOURS: 24,   // retenção por sala (pg_cron limpa)
  MAX_PER_ROOM: 500,     // teto de mensagens por sala
  SHARD_SIZE: 100,       // jogadores por shard de sala
  REPORTS_HIDE: 3,       // denúncias distintas ocultam a mensagem
};

export const CLAN = {
  MAX_MEMBERS: 30,
  NAME_MIN: 3,
  NAME_MAX: 20,
  TAG_MIN: 3,
  TAG_MAX: 4,
  SWITCH_WAIT_H: 24,     // espera p/ trocar de clã
  LEADER_INACTIVE_D: 14, // dias até repassar liderança
  CREATE_COST_COINS: 500, // sumidouro da economia (constante em economy.js, Fase 4)
};

/** Faixas de idade declaradas (perguntadas na 1ª entrada social). */
export const AGE_BANDS = ['menor13', '13a17', '18+'];

/* ---------------- partidas (ranking global) ---------------- */
export const RUN = {
  MAX_SCORE: 200000,   // plausibilidade máxima (ajustar só com o balanceamento)
  MIN_SECONDS: 10,     // partidas < 10 s não pontuam no global
  MAX_SECONDS: 7200,   // 2 h: acima disso é dado corrompido/adulterado
};

/**
 * Régua de plausibilidade de partida — ESPELHO da validação do servidor
 * (`submit_run` no SQL). O cliente usa para nem tentar enviar o impossível;
 * quem decide é o servidor.
 * @param {{score?:number, seconds?:number}} run
 * @returns {{ok:boolean, code:string, error:string, value:object}}
 */
export function validateRun(run = {}) {
  const score = Math.max(0, Math.floor(Number(run.score) || 0));
  const seconds = Math.max(0, Number(run.seconds) || 0);
  const value = { ...run, score, seconds };
  if (score > RUN.MAX_SCORE) {
    return { ok: false, code: 'implausible', error: 'Pontuação fora do intervalo possível.', value };
  }
  if (seconds < RUN.MIN_SECONDS) {
    return { ok: false, code: 'too-short', error: 'Partida curta demais para pontuar.', value };
  }
  if (seconds > RUN.MAX_SECONDS) {
    return { ok: false, code: 'too-long', error: 'Partida longa demais para pontuar.', value };
  }
  return { ok: true, code: 'ok', error: '', value };
}

/** Catálogo fixo de frases prontas (menores de 13: sem texto livre). */
export const QUICK_PHRASES = [
  'GG!', 'Boa!', 'Vamos jogar?', 'Boa partida!', 'Nossa!',
  'Até a próxima!', 'Valeu!', 'Boa sorte!', 'Que jogo!', 'Legal!',
];

/** Emojis pré-aprovados (única "fala" livre de menores de 13). */
export const QUICK_EMOJIS = ['👍', '🎉', '⚡', '🔥', '✨', '💜', '🏆', '🙌', '😃', '🌍'];

/* ---------------- normalização anti-burla ---------------- */
// '!' NÃO é leet: "Boa!" não pode virar "boai".
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', $: 's', '@': 'a' };

/**
 * Normaliza texto p/ filtro: baixa caixa, sem acentos, leet
 * básico desfeito e tudo que não for letra vira espaço
 * ("m.e.r.d.a" → "m e r d a"; "p3rr0" → "perro").
 */
export function normalizeChat(s) {
  let t = String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  t = t.replace(/[013457$@]/g, (c) => LEET[c] || c);
  t = t.replace(/[^a-z]+/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const BAD_NORM = BADWORDS.map(normalizeChat);
const BAD_PHRASES = BAD_NORM.filter((w) => w.includes(' '));
const BAD_TOKENS = new Set(BAD_NORM.filter((w) => !w.includes(' ')));
const BAD_SUB = [...BAD_TOKENS].filter((w) => w.length >= 5);

/** Junta letras isoladas para desmontar "c u" → "cu" (máx. 4 passagens). */
function joinSingleLetters(s) {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/(^| )([a-z]) ([a-z])(?= |$)/g, '$1$2$3');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Contém ofensa/palavrão (palavra inteira + letras isoladas + substring ≥ 5)? */
export function containsOffense(text, list) {
  const norm = normalizeChat(text);
  if (!norm) return false;
  if (list) {                                   // lista extra (ex.: reservas de nome)
    const extra = list.map(normalizeChat);
    if (extra.some((w) => w && norm.includes(w))) return true;
  }
  if (BAD_PHRASES.some((p) => norm.includes(p))) return true;
  const dense = norm.replace(/ /g, '');         // "m e r d a" → "merda"
  const tokens = joinSingleLetters(norm).split(' ').filter(Boolean);
  return tokens.some((t) => BAD_TOKENS.has(t)) || BAD_SUB.some((w) => dense.includes(w));
}

/** Contém link, e-mail ou telefone? (bruto + normalizado p/ variações) */
export function containsContact(text) {
  const raw = String(text);
  const n = normalizeChat(text);
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)  // e-mail
    || /https?:\/\//i.test(raw) || /\bwww\./i.test(raw)       // link
    || /https?:|www /.test(n)                                  // link ofuscado
    || (raw.match(/\d/g) || []).length >= 7;                   // telefone
}

/** Suaviza CAIXA ALTA excessiva (> 60% das letras maiúsculas). */
export function softenCaps(text) {
  const t = String(text);
  const letters = t.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letters.length <= 4) return t;
  const up = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (up / letters.length > 0.6) {
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t;
}

/* ---------------- chat ---------------- */
/**
 * Valida mensagem de chat (espelho das regras do servidor).
 * @param {string} text
 * @param {{ageBand?:string, mutedUntil?:number, bannedUntil?:number,
 *          now?:number, lastSentAt?:number, recentSent?:number[],
 *          lastText?:string}} ctx
 * @returns {{ok:boolean, code:string, error:string, value:string}}
 */
export function validateChatMessage(text, ctx = {}) {
  const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
  const raw = String(text ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!raw) return { ok: false, code: 'empty', error: 'Digite uma mensagem.', value: '' };
  if (raw.length > CHAT.MAX_LEN) {
    return { ok: false, code: 'too_long', error: `Máximo de ${CHAT.MAX_LEN} caracteres.`, value: raw };
  }
  if (ctx.bannedUntil && ctx.bannedUntil > now) {
    return { ok: false, code: 'banned', error: 'Sua conta está suspensa no chat.', value: raw };
  }
  if (ctx.mutedUntil && ctx.mutedUntil > now) {
    return { ok: false, code: 'muted', error: 'Você está sem falar no chat por enquanto.', value: raw };
  }
  // menores de 13: só frases prontas/emojis do catálogo
  const quickOk = QUICK_PHRASES.includes(raw) || QUICK_EMOJIS.includes(raw);
  if (ctx.ageBand === 'menor13' && !quickOk) {
    return {
      ok: false, code: 'quick_only',
      error: 'Para sua segurança, você usa só frases prontas e emojis.',
      value: raw,
    };
  }
  if (containsContact(raw)) {
    return { ok: false, code: 'blocked_contact', error: 'Não envie links, e-mails ou telefones.', value: raw };
  }
  if (containsOffense(raw)) {
    return { ok: false, code: 'blocked_word', error: 'Sua mensagem contém termos não permitidos.', value: raw };
  }
  // duplicata: texto idêntico (só caixa) nos últimos 30 s — comparação
  // EXATA (a normalização remove dígitos e colidiria "nivel 2"/"nivel 9")
  if (ctx.lastText && String(ctx.lastText).toLowerCase() === raw.toLowerCase()) {
    return { ok: false, code: 'duplicate', error: 'Você acabou de enviar essa mensagem.', value: raw };
  }
  if (Number.isFinite(ctx.lastSentAt) && now - ctx.lastSentAt < CHAT.COOLDOWN_MS) {
    return { ok: false, code: 'rate_limit', error: 'Espere um instante antes de enviar de novo.', value: raw };
  }
  if (Array.isArray(ctx.recentSent)) {
    const perMin = ctx.recentSent.filter((t) => now - t < 60000).length;
    if (perMin >= CHAT.PER_MIN) {
      return { ok: false, code: 'flood', error: 'Muitas mensagens agora — respire um pouco.', value: raw };
    }
  }
  return { ok: true, code: 'ok', error: '', value: softenCaps(raw) };
}

/* ---------------- clãs ---------------- */
const RESERVED = ['adm', 'admin', 'moderador', 'mod', 'staff', 'suporte', 'oficial', 'orblux', 'google', 'play'];

/** Valida NOME de clã. */
export function validateClanName(raw) {
  const v = validateNickname(raw);          // mesma régua do apelido (3..12, sem contato/ofensa)
  if (!v.ok && v.error !== `Use de ${NICK_MIN} a ${NICK_MAX} caracteres.`) {
    return { ok: false, value: String(raw || '').trim(), error: v.error };
  }
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < CLAN.NAME_MIN || name.length > CLAN.NAME_MAX) {
    return { ok: false, value: name, error: `O nome do clã precisa de ${CLAN.NAME_MIN} a ${CLAN.NAME_MAX} caracteres.` };
  }
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) {
    return { ok: false, value: name, error: 'Use só letras, números, espaço, "_" e "-".' };
  }
  if (containsContact(name) || containsOffense(name)) {
    return { ok: false, value: name, error: 'Escolha outro nome.' };
  }
  const norm = normalizeChat(name);
  if (RESERVED.some((r) => norm.split(' ').includes(r) || norm.includes('orblux'))) {
    return { ok: false, value: name, error: 'Escolha outro nome (termos reservados).' };
  }
  return { ok: true, value: name, error: '' };
}

/** Valida TAG de clã (3-4 letras/números, sem ofensa/reservadas). */
export function validateClanTag(raw) {
  const tag = String(raw || '').trim();
  if (tag.length < CLAN.TAG_MIN || tag.length > CLAN.TAG_MAX) {
    return { ok: false, value: tag, error: `A tag precisa de ${CLAN.TAG_MIN} a ${CLAN.TAG_MAX} caracteres.` };
  }
  if (!/^[\p{L}\p{N}]+$/u.test(tag)) {
    return { ok: false, value: tag, error: 'Use só letras e números.' };
  }
  const norm = normalizeChat(tag);
  if (RESERVED.some((r) => norm === r)) {
    return { ok: false, value: tag, error: 'Escolha outra tag (termos reservados).' };
  }
  if (containsOffense(tag)) {
    return { ok: false, value: tag, error: 'Escolha outra tag.' };
  }
  return { ok: true, value: tag.toUpperCase(), error: '' };
}

/* ---------------- emblema de clã (elenco fechado) ---------------- */
// Cores em paleta FIXA: o servidor nunca aceita CSS arbitrário do cliente.
export const CLAN_ICONS = ['play', 'trophy', 'medal', 'shield', 'bolt', 'heart', 'flame', 'pulse'];
export const CLAN_FRAMES = 4;
export const CLAN_COLORS = ['#22e6ff', '#7cff6b', '#ffd166', '#ff6bd6', '#b98cff', '#ff8f5e', '#5ea2ff', '#f2f6ff'];

/**
 * Valida emblema (espelho do servidor): fora do elenco vira o padrão.
 * Nunca devolve valor arbitrário — imune a injeção de CSS.
 */
export function validateClanEmblem(raw = {}) {
  const icon = Number(raw.icon);
  const moldura = Number(raw.moldura);
  const cor = String(raw.cor || '').toLowerCase();
  return {
    ok: true,
    value: {
      icon: Number.isInteger(icon) && icon >= 0 && icon < CLAN_ICONS.length ? icon : 0,
      moldura: Number.isInteger(moldura) && moldura >= 0 && moldura < CLAN_FRAMES ? moldura : 0,
      cor: CLAN_COLORS.includes(cor) ? cor : CLAN_COLORS[0],
    },
    error: '',
  };
}

export { validateNickname };
