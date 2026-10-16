/* =========================================================
   BACKEND PARITY (Fase 6) — o SQL do Supabase tem que espelhar
   o cliente. Sem banco aqui: comparamos ARQUIVOS (node:test).

   • toda RPC chamada pelo SupabaseProvider existe no SQL (e é
     concedida ao authenticated);
   • seeds de app_rules == números de net/rules.js/nickname.js/
     economy.js; catálogos (frases, emojis, ícones, cores,
     molduras, BADWORDS, RESERVED) idênticos aos do cliente;
   • termos, fórmula de moedas da partida e constantes de
     torneio iguais às decisões registradas;
   • varredura de segurança: nenhuma chave/JWT no repo, config
     vazia, .gitignore cobre .env, SECURITY DEFINER + search_path
     em toda função, RLS em toda tabela, só política de SELECT.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CHAT, CLAN, RUN, QUICK_PHRASES, QUICK_EMOJIS, CLAN_ICONS, CLAN_FRAMES, CLAN_COLORS } from '../net/rules.js';
import { NICK_MIN, NICK_MAX } from '../js/core/nickname.js';
import { BADWORDS } from '../js/core/badwords.js';
import { CAP_POR_PARTIDA, BONUS_RECORDE, BONUS_PRIMEIRA_DIA } from '../js/core/economy.js';
import { TERMS_VERSION } from '../net/api.js';
import { SUPABASE_CONFIG, APPEAL, SUPABASE_UMD_PATH } from '../net/config.js';
import { FLAG_DEFAULTS } from '../net/flags.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const SQL_SCHEMA = read('supabase/migrations/20261015030000_orblux_schema.sql');
const SQL_FUNCS = read('supabase/migrations/20261015030100_orblux_functions.sql');
const SQL_JOBS = read('supabase/migrations/20261015030200_orblux_jobs.sql');
const API_JS = read('net/api.js');
const EDGE_MOD = read('supabase/functions/chat-moderation/index.ts');
const EDGE_ROLL = read('supabase/functions/tournament-rollover/index.ts');

/* ---------------- helpers de parsing ---------------- */

/** Bloco VALUES de um insert (do 'values' ao 'on conflict'/'$$'). */
function blocoValues(sql, tabela) {
  const i = sql.indexOf(`insert into public.${tabela}`);
  assert.ok(i >= 0, `insert de ${tabela} não encontrado`);
  const fim = sql.indexOf('on conflict', i);
  return sql.slice(i, fim > 0 ? fim : sql.length);
}
const strings = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);
const conjunto = (arr) => new Set(arr);
const mesmoConjunto = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** Nome de todas as funções criadas em um SQL. */
const funcoesDe = (sql) => [...sql.matchAll(/create or replace function public\.([a-z_0-9]+)\s*\(/g)].map((m) => m[1]);
/** RPCs que o cliente realmente chama. */
const rpcsDoCliente = [...API_JS.matchAll(/_rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]);

/* =========================================================
   1. RPCs: cliente ⊆ SQL, e concedidas ao authenticated
   ========================================================= */

test('toda RPC do SupabaseProvider existe no SQL', () => {
  const sql = conjunto(funcoesDe(SQL_FUNCS));
  assert.ok(rpcsDoCliente.length >= 40, `esperava ~41 RPCs, achei ${rpcsDoCliente.length}`);
  for (const nome of rpcsDoCliente) {
    assert.ok(sql.has(nome), `RPC '${nome}' chamada pelo cliente não existe no SQL`);
  }
});

test('toda RPC do cliente está nas listas de grant/revoke (bloco final do SQL)', () => {
  const fim = SQL_FUNCS.slice(SQL_FUNCS.indexOf('L. privilégios'));
  for (const nome of rpcsDoCliente) {
    assert.ok(fim.includes(`'${nome}'`), `'${nome}' fora das listas de privilégio`);
  }
  assert.ok(fim.includes('service_role'), 'liquidação deve ser do service_role');
  assert.ok(fim.includes("'tournament_settle_last'"));
  assert.ok(fim.includes("'app_chat_moderate'"));
});

/* =========================================================
   2. Seeds de app_rules == constantes do cliente
   ========================================================= */

function appRules() {
  const m = new Map();
  for (const [, k, v] of blocoValues(SQL_SCHEMA, 'app_rules').matchAll(/\('([a-z_0-9]+)',\s*'([^']*)'\)/g)) m.set(k, v);
  return m;
}

test('app_rules espelham net/rules.js (chat/clã/partida)', () => {
  const r = appRules();
  const esperado = {
    chat_max_len: CHAT.MAX_LEN, chat_cooldown_ms: CHAT.COOLDOWN_MS,
    chat_per_min: CHAT.PER_MIN, chat_dup_ms: CHAT.DUPLICATE_MS,
    chat_history_limit: CHAT.HISTORY_LIMIT, chat_retention_hours: CHAT.RETENTION_HOURS,
    chat_max_per_room: CHAT.MAX_PER_ROOM, chat_shard_size: CHAT.SHARD_SIZE,
    chat_reports_hide: CHAT.REPORTS_HIDE,
    clan_max_members: CLAN.MAX_MEMBERS, clan_name_min: CLAN.NAME_MIN,
    clan_name_max: CLAN.NAME_MAX, clan_tag_min: CLAN.TAG_MIN,
    clan_tag_max: CLAN.TAG_MAX, clan_switch_wait_h: CLAN.SWITCH_WAIT_H,
    clan_create_cost: CLAN.CREATE_COST_COINS,
    run_max_score: RUN.MAX_SCORE, run_min_seconds: RUN.MIN_SECONDS,
    run_max_seconds: RUN.MAX_SECONDS,
    nick_min: NICK_MIN, nick_max: NICK_MAX,
    coin_run_cap: CAP_POR_PARTIDA, bonus_record: BONUS_RECORDE,
    bonus_first_day: BONUS_PRIMEIRA_DIA,
    mute_hours: 24,                       // decisão §8.5: mute de 24 h
    tourney_group_size: 8, tourney_ligas: 6,   // decisão §8.4: 8 por grupo, 6 ligas
    tourney_min_runs: 3, tourney_participacao: 50,
    reward_pos_1: 300, reward_pos_2: 220, reward_pos_3: 160,
    reward_pos_4: 120, reward_pos_5: 90, reward_pos_else: 40,
    reward_promocao: 150,
    daily_prefix: 'daily:',
  };
  for (const [k, v] of Object.entries(esperado)) {
    assert.equal(r.get(k), String(v), `app_rules['${k}'] = ${r.get(k)}, esperado ${v}`);
  }
});

/* =========================================================
   3. Catálogos semeados == catálogos do cliente
   ========================================================= */

test('quick_phrases / quick_emojis == QUICK_* de rules.js', () => {
  const frases = strings(blocoValues(SQL_SCHEMA, 'quick_phrases'));
  const emojis = strings(blocoValues(SQL_SCHEMA, 'quick_emojis'));
  assert.ok(mesmoConjunto(conjunto(frases), conjunto(QUICK_PHRASES)),
    'frases prontas divergem de QUICK_PHRASES');
  assert.ok(mesmoConjunto(conjunto(emojis), conjunto(QUICK_EMOJIS)),
    'emojis divergem de QUICK_EMOJIS');
  assert.equal(QUICK_PHRASES.length, 10);
  assert.equal(QUICK_EMOJIS.length, 10);
});

test('clan_icons/clan_colors/clan_frames == elenco de rules.js', () => {
  const cores = [...blocoValues(SQL_SCHEMA, 'clan_colors')
    .matchAll(/\('(#[0-9a-f]{6})',\s*(\d+)\)/g)]
    .map((m) => ({ hex: m[1], ord: Number(m[2]) }))
    .sort((a, b) => a.ord - b.ord).map((c) => c.hex);
  assert.deepEqual(cores, CLAN_COLORS, 'paleta de cores divergente');

  const icones = [...blocoValues(SQL_SCHEMA, 'clan_icons')
    .matchAll(/\((\d+),\s*'([a-z]+)'\)/g)]
    .map((m) => ({ i: Number(m[1]), n: m[2] }))
    .sort((a, b) => a.i - b.i).map((c) => c.n);
  assert.deepEqual(icones, CLAN_ICONS, 'ícones divergentes');

  const molduras = [...blocoValues(SQL_SCHEMA, 'clan_frames').matchAll(/\((\d+)\)/g)]
    .map((m) => Number(m[1])).sort((a, b) => a - b);
  assert.equal(molduras.length, CLAN_FRAMES, 'quantidade de molduras');
  assert.deepEqual(molduras, [0, 1, 2, 3]);
});

test('bad_words == BADWORDS (como conjunto) e RESERVED de rules.js', () => {
  const sql = new Set(strings(blocoValues(SQL_SCHEMA, 'bad_words')));
  assert.ok(mesmoConjunto(sql, conjunto(BADWORDS)),
    `bad_words: SQL=${sql.size} cliente=${BADWORDS.size}`);

  // RESERVED é constante privada de rules.js — extraímos do fonte
  const src = read('net/rules.js');
  const m = src.match(/const RESERVED = \[([^\]]+)\]/);
  assert.ok(m, 'RESERVED não encontrado em rules.js');
  const reservadas = strings(m[1]);
  assert.ok(mesmoConjunto(conjunto(strings(blocoValues(SQL_SCHEMA, 'reserved_words'))), conjunto(reservadas)),
    'termos reservados divergem');
  assert.ok(reservadas.includes('orblux'));
});

/* =========================================================
   4. Versão dos Termos, fórmula de moedas e liquidação
   ========================================================= */

test('app_terms_version() == TERMS_VERSION do cliente', () => {
  const m = SQL_FUNCS.match(/function public\.app_terms_version\(\)[\s\S]{0,200}?select '([^']+)'::text/);
  assert.ok(m, 'app_terms_version não encontrada');
  assert.equal(m[1], TERMS_VERSION);
});

test('submit_run espelha calcRunCoins (cap + bônus, pickups ≥ 0)', () => {
  assert.ok(SQL_FUNCS.includes('floor(pickups * 0.5) + floor(score / 100) + floor(seconds / 10)'),
    'fórmula base da partida divergente');
  assert.ok(SQL_FUNCS.includes("app_rule_i('coin_run_cap')"), 'cap por partida ausente');
  assert.ok(SQL_FUNCS.includes("app_rule_i('bonus_record')"), 'bônus de recorde ausente');
  assert.ok(SQL_FUNCS.includes("app_rule_i('bonus_first_day')"), 'bônus 1ª do dia ausente');
  assert.ok(SQL_FUNCS.includes('pickups := greatest(0, coalesce(p_pickups, 0))'),
    'pickups precisa ser clampado em ≥ 0 (igual ao cliente)');
  assert.ok(SQL_FUNCS.includes("app_rule_i('run_min_seconds')"), 'partida < 10 s deve ser rejeitada');
});

test('liquidação usa as recompensas registradas e é idempotente', () => {
  for (const k of ['reward_pos_1', 'reward_pos_2', 'reward_pos_3', 'reward_pos_4',
    'reward_pos_5', 'reward_pos_else', 'reward_promocao', 'tourney_participacao', 'tourney_min_runs']) {
    assert.ok(SQL_FUNCS.includes(`'${k}'`), `constante '${k}' fora da liquidação`);
  }
  assert.ok(SQL_FUNCS.includes('on conflict (season_number, user_id) do nothing'),
    'tournament_history precisa ser idempotente');
  assert.ok(SQL_FUNCS.includes("'already', true"), 'liquidação repetida deve devolver already=true');
  assert.ok(SQL_FUNCS.includes('runs_validas > 0') || SQL_FUNCS.includes('m.runs > 0'),
    'recompensa exige partida válida (anti-abuse)');
});

/* =========================================================
   5. Varredura de segurança
   ========================================================= */

test('nenhuma chave/JWT no repositório (supabase, net, js, docs)', () => {
  const alvos = [];
  const ler = (rel) => { try { return read(rel); } catch { return null; } };
  for (const rel of ['SOCIAL.md', 'ECONOMIA.md', 'README.md', 'MONETIZACAO.md',
    'SKINS_PLAY_CONSOLE.md', 'index.html']) {
    const t = ler(rel); if (t !== null) alvos.push([rel, t]);
  }
  const varre = (dir) => {
    for (const nome of readdirSync(root + dir, { withFileTypes: true })) {
      const caminho = `${dir}/${nome.name}`;
      if (nome.isDirectory()) { if (nome.name !== '.temp') varre(caminho); }
      else if (/\.(sql|ts|md|toml|json|js|mjs|cjs|html|css)$/.test(nome.name)) {
        alvos.push([caminho, ler(caminho)]);
      }
    }
  };
  varre('supabase'); varre('net'); varre('js'); varre('tests');
  // agulha montada em partes: o próprio teste contém o texto literal,
  // então concatenamos para o scan não "encontrar" a si mesmo
  const agulhaJwt = 'eyJ' + 'hbGciOi';
  for (const [rel, texto] of alvos) {
    if (texto === null) continue;
    assert.ok(!texto.includes(agulhaJwt), `JWT encontrado em ${rel}`);
    assert.ok(!/service_role['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/.test(texto),
      `chave de serviço em ${rel}`);
  }
});

test('net/config.js segue vazio (url/anonKey sem valor real)', () => {
  assert.equal(SUPABASE_CONFIG.url, '', 'url do Supabase deve começar vazia');
  assert.equal(SUPABASE_CONFIG.anonKey, '', 'chave anon deve começar vazia');
  assert.ok(SUPABASE_UMD_PATH.startsWith('/vendor/'), 'cliente supabase-js precisa ser local (vendor)');
  assert.ok(APPEAL.email.includes('@'), 'e-mail de contestação precisa existir');
  assert.equal(APPEAL.prazoDias, 7, 'prazo de resposta da contestação = 7 dias');
});

test('.gitignore cobre .env e supabase/functions/.env', () => {
  const gi = read('.gitignore');
  assert.ok(gi.includes('.env'), '.gitignore deve ignorar .env');
  assert.ok(gi.includes('supabase/functions/.env'), '.gitignore deve ignorar supabase/functions/.env');
});

test('toda função do SQL é SECURITY DEFINER com search_path fixo', () => {
  for (const [nomeArq, sql] of [['functions', SQL_FUNCS], ['jobs', SQL_JOBS]]) {
    let idx = 0;
    while ((idx = sql.indexOf('create or replace function', idx)) >= 0) {
      const cab = sql.slice(idx, sql.indexOf('$$', idx));
      const nome = (cab.match(/function public\.([a-z_0-9]+)/) || [])[1] || '?';
      assert.ok(cab.includes('security definer'), `${nomeArq}: ${nome} sem security definer`);
      assert.ok(cab.includes('set search_path'), `${nomeArq}: ${nome} sem search_path fixo`);
      idx += 10;
    }
  }
});

test('RLS em toda tabela; única política é SELECT de chat_messages', () => {
  const tabelas = [...SQL_SCHEMA.matchAll(/create table if not exists public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
  assert.ok(tabelas.length >= 20, `poucas tabelas: ${tabelas.length}`);
  for (const t of tabelas) {
    assert.ok(SQL_SCHEMA.includes(`alter table public.${t} enable row level security;`),
      `tabela ${t} sem RLS`);
  }
  const politicas = [...SQL_SCHEMA.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)/g)]
    .map((m) => [m[1], m[2]]);
  assert.deepEqual(politicas, [['chat_messages_select', 'chat_messages']],
    'só o SELECT de chat_messages pode ter política direta');
  assert.ok(!/for (insert|update|delete|all)/i.test(SQL_SCHEMA), 'nenhuma política de escrita');
  assert.ok(SQL_SCHEMA.includes('to authenticated using (true)'), 'política do chat é para authenticated');
});

test('RPCs privadas: revoke de public/anon e grant só do authenticated', () => {
  const fim = SQL_FUNCS.slice(SQL_FUNCS.indexOf('L. privilégios'));
  assert.ok(fim.includes("revoke execute on function %s from public, anon"));
  assert.ok(fim.includes('grant execute on function %s to authenticated'));
  // helper interno não pode ser chamado pelo cliente
  assert.ok(fim.includes("p.proname like 'app\\_%'"), 'helpers app_* devem ser revogados');
});

test('Edge Functions: sem chave embutida e apontam para as RPCs certas', () => {
  for (const [nome, txt, rpc] of [
    ['chat-moderation', EDGE_MOD, 'app_chat_moderate'],
    ['tournament-rollover', EDGE_ROLL, 'tournament_settle_last'],
  ]) {
    assert.ok(txt.includes(`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`), `${nome}: precisa ler a chave do ambiente`);
    assert.ok(txt.includes(`/rest/v1/rpc/${rpc}`), `${nome}: precisa chamar ${rpc}`);
    assert.ok(!txt.includes('eyJ'), `${nome}: chave embutida`);
    assert.ok(txt.includes('Bearer'), `${nome}: Authorization`);
  }
});

test('jobs: agendamentos registrados e segredos só no Vault', () => {
  for (const spec of ['*/15 * * * *', '20 4 * * *', '*/5 * * * *', '3 3 * * 1']) {
    assert.ok(SQL_JOBS.includes(`'${spec}'`), `schedule ${spec} ausente`);
  }
  assert.ok(SQL_JOBS.includes('orblux_project_url') && SQL_JOBS.includes('orblux_edge_service_key'));
  assert.ok(SQL_JOBS.includes("name = 'orblux_project_url'"), 'job HTTP deve só rodar com o segredo pronto');
  assert.ok(SQL_JOBS.includes('add table public.chat_messages'), 'chat_messages precisa estar na publicação Realtime');
  assert.ok(SQL_JOBS.includes('pg_cron') && SQL_JOBS.includes('pg_net'));
});

test('códigos de erro do SQL pertencem à UMA interface', () => {
  const conhecidos = new Set([
    'offline', 'network', 'no-session', 'disabled', 'invalid-code', 'age-required',
    'terms-required', 'nickname-required', 'invalid-nickname', 'implausible',
    'too-short', 'too-long', 'muted', 'banned', 'rate_limit', 'flood', 'quick_only',
    'empty', 'too_long', 'duplicate', 'blocked_contact', 'blocked_word',
    'name-taken', 'tag-taken', 'invalid-name', 'invalid-tag', 'already-in-clan',
    'switch_wait', 'needs_request', 'invite_only', 'age-restricted', 'not-member',
    'forbidden', 'not-found', 'no-clan', 'full', 'already_claimed', 'invalid-seed',
    'insufficient-coins', 'server',
  ]);
  const codigos = [
    ...[...SQL_FUNCS.matchAll(/app_error\('([a-z0-9_-]+)'/g)].map((m) => m[1]),
    ...[...SQL_FUNCS.matchAll(/raise exception '([a-z0-9_-]+)\|/g)].map((m) => m[1]),
  ];
  assert.ok(codigos.length >= 30, `poucos códigos extraídos: ${codigos.length}`);
  for (const c of codigos) {
    assert.ok(conhecidos.has(c), `código '${c}' fora da UMA interface`);
  }
  assert.ok(codigos.includes('insufficient-coins'), 'novo código de clã sem saldo');
});

test('páginas públicas sem CDN em runtime e com páginas legais ligadas', () => {
  for (const nome of ['index.html', 'privacy.html', 'termos.html']) {
    // comentários removidos antes da varredura (o snippet do AdSense fica
    // comentado de propósito — só quem publica os anúncios o ativa)
    const limpo = read(nome).replace(/<!--[\s\S]*?-->/g, '');
    const tags = [
      ...[...limpo.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]),
      ...[...limpo.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]),
    ];
    for (const tag of tags) {
      if (/stylesheet/i.test(tag) || /<script/i.test(tag)) {
        assert.ok(!/\ssrc=["']https?:/i.test(tag), `${nome}: script externo em runtime: ${tag}`);
        assert.ok(!/href=["']https?:/i.test(tag) || !/stylesheet/i.test(tag),
          `${nome}: stylesheet externo em runtime: ${tag}`);
      }
    }
  }
  // páginas legais usam fontes auto-hospedadas (css/fonts.css)
  for (const nome of ['privacy.html', 'termos.html']) {
    assert.ok(read(nome).includes('css/fonts.css'), `${nome}: fontes locais (css/fonts.css)`);
  }
  // cross-links entre as páginas legais
  assert.ok(read('termos.html').includes('privacy.html'), 'termos linka privacy');
  assert.ok(read('privacy.html').includes('termos.html'), 'privacy linka termos');
  // páginas legais legíveis offline (pré-cache do service worker)
  const sw = read('sw.js');
  assert.ok(sw.includes("'./privacy.html'"), 'sw pré-cacheia privacy.html');
  assert.ok(sw.includes("'./termos.html'"), 'sw pré-cacheia termos.html');
});

test('vendor supabase-js pinado: SHA256 do arquivo == hash documentado', () => {
  const hashReal = createHash('sha256')
    .update(readFileSync(root + 'vendor/supabase-js/supabase-2.117.2.min.js'))
    .digest('hex');
  // o hash vive documentado em SOCIAL.md §3 — doc e arquivo precisam bater
  const doc = read('SOCIAL.md');
  const m = doc.match(/SHA256 `([0-9a-f]{64})`/);
  assert.ok(m, 'SOCIAL.md registra o SHA256 do vendor');
  assert.strictEqual(hashReal, m[1], 'arquivo do vendor != hash documentado em SOCIAL.md');
  // e o caminho configurado no cliente aponta para esse mesmo arquivo
  assert.ok(SUPABASE_UMD_PATH.includes('supabase-2.117.2.min.js'),
    `SUPABASE_UMD_PATH aponta para o arquivo pinado (atual: ${SUPABASE_UMD_PATH})`);
});

test('flags sociais desligadas por padrão (produção segura)', () => {
  for (const [nome, valor] of Object.entries(FLAG_DEFAULTS)) {
    assert.strictEqual(valor, false, `flag ${nome} deve nascer desligada em produção`);
  }
  // provedor: sem override, só localhost vira mock (net/flags.js); produção
  // com config vazia cai em NullProvider e degrada com 'disabled'
  assert.strictEqual(SUPABASE_CONFIG.url, '', 'net/config.js sem URL real');
  assert.strictEqual(SUPABASE_CONFIG.anonKey, '', 'net/config.js sem chave real');
});
