/* =========================================================
   Apelido (nickname) - validacao centralizada, geracao padrao
   e escape de HTML. Usado por state.js, UI, ranking e share.
   Sem dependencias de DOM (rodavel em Node para testes).
   ========================================================= */

import { BADWORDS } from './badwords.js';

export const NICK_MIN = 3;
export const NICK_MAX = 12;

/** Remove acentos e baixa caixa (para comparacao). */
export function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove marcas/diacriticos
    .toLowerCase()
    .trim();
}

const BADWORD_SET = new Set(BADWORDS.map(normalize));
const BADWORD_PHRASES = BADWORDS.filter((w) => w.includes(' ')).map(normalize);
// termos de 5+ letras tambem casam como substring (pega formas coladas)
const BADWORD_SUB = [...BADWORD_SET].filter((w) => !w.includes(' ') && w.length >= 5);

// caracteres permitidos: letras (com acento), numeros, espaco, _ e -
const ALLOWED = /^[\p{L}\p{N} _-]+$/u;
const CONTROL = /[\x00-\x1F\x7F]/g;

function looksLikeContact(v) {
  const n = normalize(v);
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(v)   // e-mail
    || /https?:\/\/|www\.|\.com|\.net|\.org/.test(n)        // URL
    || /\d{7,}/.test(n);                                     // telefone (7+ digitos seguidos)
}

/**
 * Valida um apelido.
 * @param {string} raw
 * @returns {{ok:boolean, value:string, error:string}} error em pt-BR
 */
export function validateNickname(raw) {
  if (raw == null) return { ok: false, value: '', error: 'Digite um apelido.' };

  const value = String(raw)
    .replace(CONTROL, '')                  // remove caracteres de controle
    .replace(/\s+/g, ' ')                  // colapsa espacos repetidos
    .trim();

  if (!value) return { ok: false, value, error: 'Digite um apelido.' };
  if (value.length < NICK_MIN) return { ok: false, value, error: 'Use de ' + NICK_MIN + ' a ' + NICK_MAX + ' caracteres.' };
  if (value.length > NICK_MAX) return { ok: false, value, error: 'Use de ' + NICK_MIN + ' a ' + NICK_MAX + ' caracteres.' };

  // link / e-mail / telefone (mensagem especifica antes da generica)
  if (looksLikeContact(value)) {
    return { ok: false, value, error: 'Nao use links, e-mails nem telefones.' };
  }

  // fora do conjunto permitido (emojis, simbolos, pontuacao...)
  if (!ALLOWED.test(value)) {
    return { ok: false, value, error: 'Use so letras, numeros, espaco, "_" e "-".' };
  }

  // palavroes (sem acento/maiúscula, por palavra inteira + substrings longas)
  const norm = normalize(value);
  if (BADWORD_PHRASES.some((p) => norm.includes(p))) {
    return { ok: false, value, error: 'Escolha outro apelido.' };
  }
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => BADWORD_SET.has(t)) || BADWORD_SUB.some((w) => norm.includes(w))) {
    return { ok: false, value, error: 'Escolha outro apelido.' };
  }

  return { ok: true, value, error: '' };
}

/** Apelido padrao gerado na 1a abertura: "Jogador" + 4 digitos. */
export function generateDefaultNickname() {
  const n = Math.floor(1000 + Math.random() * 9000); // 1000..9999
  return 'Jogador' + n;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa HTML - use ANTES de qualquer innerHTML com dado de usuario/rede. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
