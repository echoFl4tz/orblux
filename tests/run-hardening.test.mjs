/* =========================================================
   RUN HARDENING (auditoria 26/10/2026) — testa a migration
   supabase/migrations/20261026090000_orblux_run_hardening.sql
   SEM banco: lemos o arquivo e conferimos as checagens.

   O que falhava antes: submit_run aceitava score máximo
   (200.000) em partida de 10 s e aceitava envio repetido
   sem intervalo (spam de moedas); a política de SELECT do
   chat expunha mensagens ocultadas (hidden) via REST.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SQL = readFileSync(root + 'supabase/migrations/20261026090000_orblux_run_hardening.sql', 'utf8');
const SQL_FUNCS = readFileSync(root + 'supabase/migrations/20261015030100_orblux_functions.sql', 'utf8');

/** Espelho do "UMA interface" de códigos (tests/backend-parity.test.mjs). */
const UMA = new Set([
  'offline', 'network', 'no-session', 'disabled', 'invalid-code', 'age-required',
  'terms-required', 'nickname-required', 'invalid-nickname', 'implausible',
  'too-short', 'too-long', 'muted', 'banned', 'rate_limit', 'flood', 'quick_only',
  'empty', 'too_long', 'duplicate', 'blocked_contact', 'blocked_word',
  'name-taken', 'tag-taken', 'invalid-name', 'invalid-tag', 'already-in-clan',
  'switch_wait', 'needs_request', 'invite_only', 'age-restricted', 'not-member',
  'forbidden', 'not-found', 'no-clan', 'full', 'already_claimed', 'invalid-seed',
  'insufficient-coins', 'server',
]);

test('migration: submit_run recriada com teto de pontos por tempo', () => {
  assert.ok(
    SQL.includes('create or replace function public.submit_run('),
    'submit_run deve ser recriada (create or replace, mesma assinatura)',
  );
  assert.ok(SQL.includes('security definer'), 'submit_run precisa de security definer');
  assert.ok(SQL.includes('set search_path'), 'submit_run precisa de search_path fixo');
  // a checagem NOVA: score <= seconds × run_max_pps + run_pps_slack
  assert.ok(
    SQL.includes("score > seconds * public.app_rule_i('run_max_pps')"),
    'falta o teto de pontos por segundo (run_max_pps)',
  );
  assert.ok(SQL.includes("public.app_rule_i('run_pps_slack')"), 'falta o slack de arranque');
  // as checagens antigas continuam (nada foi removido)
  for (const k of ['run_max_score', 'run_min_seconds', 'run_max_seconds']) {
    assert.ok(SQL.includes(`app_rule_i('${k}')`), `checagem original ${k} removida`);
  }
});

test('migration: rate limit por usuário no relógio do servidor', () => {
  assert.ok(
    SQL.includes('select max(r.created_at) into last_at'),
    'falta ler o último envio do usuário',
  );
  assert.ok(
    SQL.includes("make_interval(secs => public.app_rule_i('run_submit_gap_s'))"),
    'falta o intervalo mínimo entre envios (run_submit_gap_s)',
  );
  // 9 s < run_min_seconds (10 s): partida real legítima nunca cai aqui
  const gap = SQL.match(/'run_submit_gap_s',\s*'(\d+)'/);
  assert.ok(gap, 'run_submit_gap_s deve estar semeada em app_rules');
  assert.ok(Number(gap[1]) < 10, 'gap deve ser menor que run_min_seconds (10 s)');
});

test('migration: réguas novas em app_rules (idempotente, on conflict)', () => {
  for (const [k, v] of [['run_max_pps', '3000'], ['run_pps_slack', '10000'],
    ['run_submit_gap_s', '9']]) {
    assert.ok(SQL.includes(`('${k}', '${v}')`), `app_rules['${k}'] = ${v} ausente`);
  }
  assert.ok(SQL.includes('on conflict (k) do update'), 'semeadura precisa ser idempotente');
});

test('migration: códigos de erro pertencem à UMA interface', () => {
  const codigos = [...SQL.matchAll(/app_error\('([a-z0-9_-]+)'/g)].map((m) => m[1]);
  assert.ok(codigos.length >= 4, `poucos códigos: ${codigos.length}`);
  for (const c of codigos) {
    assert.ok(UMA.has(c), `código '${c}' fora da UMA interface`);
  }
  assert.ok(codigos.includes('rate_limit'), 'spam deve cair em rate_limit');
  assert.ok(codigos.includes('implausible'), 'pontos por tempo impossível = implausible');
});

test('migration: política do chat apertada (sem hidden) e sem escrita', () => {
  assert.ok(
    SQL.includes('using (not hidden)'),
    'SELECT do chat deve excluir mensagens ocultadas (hidden)',
  );
  // varre o código SEM os comentários (o cabeçalho fala de "grant" em prosa)
  const semComent = SQL.replace(/--[^\n]*/g, '');
  assert.ok(!/for (insert|update|delete|all)/i.test(semComent), 'nenhuma política de escrita nova');
  assert.ok(!/grant\s/i.test(semComent), 'migration não concede privilégio novo');
});

test('paridade: a assinatura de submit_run não mudou (grants persistem)', () => {
  const assinatura = (sql) => (sql.match(
    /function public\.submit_run\(\s*p_score int, p_seconds int, p_pickups int, p_combo_max int, p_level int,\s*p_seed text, p_version text\s*\)/,
  ) || [])[0] || '';
  assert.ok(assinatura(SQL), 'assinatura da nova submit_run não reconhecida');
  assert.strictEqual(
    assinatura(SQL), assinatura(SQL_FUNCS),
    'assinatura divergente: os grants existentes não valeriam',
  );
});
