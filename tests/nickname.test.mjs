/* =========================================================
   Testes do apelido (nickname) — valida validação, migração,
   geração padrão e escape de HTML.
   Runner: node:test (nativo, sem dependência). Uso:
     node --test tests/nickname.test.mjs
   (Equivalente a Vitest; roda também sob vitest se preferir.)
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNickname, normalize, generateDefaultNickname, escapeHtml,
  NICK_MIN, NICK_MAX,
} from '../js/core/nickname.js';

// ---------------------------------------------------------
//  validateNickname — limites
// ---------------------------------------------------------
test('validateNickname: limites de tamanho (3..12)', () => {
  assert.equal(validateNickname('ab').ok, false);                    // 2 -> curto
  assert.equal(validateNickname('Neo').ok, true);                    // 3 -> ok
  assert.equal(validateNickname('NeoPilotX123').ok, true);           // 12 -> ok
  assert.equal(validateNickname('NeoPilotX1234').ok, false);         // 13 -> longo
  assert.equal(NICK_MIN, 3);
  assert.equal(NICK_MAX, 12);
});

test('validateNickname: trim e colapso de espaços repetidos', () => {
  const r = validateNickname('  Neo   Pilot  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'Neo Pilot');
});

test('validateNickname: letras acentuadas são permitidas', () => {
  assert.equal(validateNickname('José Silva').ok, true);
  assert.equal(validateNickname('Ação').ok, true);
  assert.equal(validateNickname('Çãozinho').ok, true);
});

test('validateNickname: vazio / null', () => {
  assert.equal(validateNickname('').ok, false);
  assert.equal(validateNickname('   ').ok, false);
  assert.equal(validateNickname(null).ok, false);
  assert.equal(validateNickname(undefined).ok, false);
});

// ---------------------------------------------------------
//  validateNickname — bloqueios
// ---------------------------------------------------------
test('validateNickname: bloqueia emojis', () => {
  assert.equal(validateNickname('Neo😀').ok, false);
  assert.equal(validateNickname('🚀Runner').ok, false);
});

test('validateNickname: bloqueia URLs, e-mails e telefones', () => {
  assert.equal(validateNickname('site.com').ok, false);
  assert.equal(validateNickname('https://x.com').ok, false);
  assert.equal(validateNickname('a@b.com').ok, false);
  assert.equal(validateNickname('999999999').ok, false);   // 9 dígitos
  assert.equal(validateNickname('+55 11 99999-9999').ok, false);
});

test('validateNickname: bloqueia palavrões (com/sem acento e maiúscula)', () => {
  assert.equal(validateNickname('caralho').ok, false);
  assert.equal(validateNickname('CARALHO').ok, false);
  assert.equal(validateNickname('merda').ok, false);
  assert.equal(validateNickname('MERDA').ok, false);
  assert.equal(validateNickname('cuzão').ok, false);      // acentuado
  assert.equal(validateNickname('FODA-SE').ok, false);
});

test('validateNickname: não bloqueia apelidos inocentes que contenham letras de palavrões', () => {
  // "cu" aparece em "Luciano" mas é palavra INTEIRA que conta, não pedaço
  assert.equal(validateNickname('Luciano').ok, true);
  assert.equal(validateNickname('Amigo').ok, true);
  assert.equal(validateNickname('NeoPilot').ok, true);
});

// ---------------------------------------------------------
//  normalize + geração padrão + escape
// ---------------------------------------------------------
test('normalize: remove acentos e baixa caixa', () => {
  assert.equal(normalize('ÇÁÕ'), 'cao');
  assert.equal(normalize(' Olá  '), 'ola');
});

test('generateDefaultNickname: formato Jogador + 4 dígitos', () => {
  for (let i = 0; i < 20; i++) {
    assert.match(generateDefaultNickname(), /^Jogador\d{4}$/);
  }
});

test('escapeHtml: neutraliza HTML/JS injetado (aparece como texto)', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const escaped = escapeHtml(evil);
  assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!escaped.includes('<'));
  assert.equal(escapeHtml(`"a"&'b'`), '&quot;a&quot;&amp;&#39;b&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
