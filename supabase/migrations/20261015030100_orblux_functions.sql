/* =========================================================
   ORBLUX — Fase 6 (camada social): FUNÇÕES (RPCs)
   Toda escrita/leitura do cliente passa por aqui (SECURITY
   DEFINER; RLS sem políticas de escrita — ver migração 0001).

   FORMATO DE ERRO: raise '<codigo>|<mensagem pt-BR>' — o
   SupabaseProvider (net/api.js) separa o prefixo para manter os
   códigos estáveis da UMA interface (muted, name-taken, ...).

   ESPELHO: as réguas vêm de app_rules (semeadas na migração 0001
   com os MESMOS números de net/rules.js); tests/backend-parity
   compara sementes, listas e nomes de funções com o cliente.
   Todas as funções são SECURITY DEFINER com search_path fixo.
   ========================================================= */

-- =========================================================
-- A. helpers básicos
-- =========================================================

create or replace function public.app_error(p_code text, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception '%', p_code || '|' || p_msg;
end;
$$;

create or replace function public.app_rule(p_k text) returns text
language sql stable security definer set search_path = public as $$
  select v from public.app_rules where k = p_k;
$$;

create or replace function public.app_rule_i(p_k text) returns int
language sql stable security definer set search_path = public as $$
  select v::int from public.app_rules where k = p_k;
$$;

-- versão vigente dos Termos (espelho de TERMS_VERSION em net/api.js)
create or replace function public.app_terms_version() returns text
language sql immutable security definer set search_path = public as $$
  select '2026-10-14'::text;
$$;

-- =========================================================
-- B. normalização anti-burla (espelho de net/rules.js)
-- =========================================================

-- chat: baixa caixa, sem acentos (unaccent ≈ NFD), leet desfeito
-- ('!' NÃO é leet), tudo que não for letra vira espaço
create or replace function public.app_normalize(p text) returns text
language sql stable security definer set search_path = public as $$
  select trim(regexp_replace(
    translate(lower(unaccent(coalesce(p, ''))), '013457$@', 'oieastsa'),
    '[^a-z]+', ' ', 'g'));
$$;

-- apelido/nome: só baixa caixa + sem acentos (dígitos preservados)
create or replace function public.app_normalize_nick(p text) returns text
language sql stable security definer set search_path = public as $$
  select btrim(lower(unaccent(coalesce(p, ''))));
$$;

-- junta letras isoladas ("c u" → "cu"), máx. 4 passagens
create or replace function public.app_join_letters(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare s text := coalesce(p, ''); nxt text; i int;
begin
  for i in 1..4 loop
    nxt := regexp_replace(s, '(^| )([a-z]) ([a-z])(?= |$)', '\1\2\3', 'g');
    exit when nxt = s;
    s := nxt;
  end loop;
  return s;
end;
$$;

-- link/e-mail/telefone (versão do CHAT — net/rules.js containsContact)
create or replace function public.app_contains_contact(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (coalesce(p, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}')
      or (coalesce(p, '') ~* 'https?:\/\/')
      or (coalesce(p, '') ~* '\bwww\.')
      or (public.app_normalize(p) ~ 'https?:|www ')
      or (length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) >= 7);
$$;

-- versão do APELIDO (js/core/nickname.js looksLikeContact — regras ligeiramente diferentes;
-- o e-mail é case-SENSÍVEL aqui, igual ao regex do cliente)
create or replace function public.app_contains_contact_nick(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (coalesce(p, '') ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}')
      or (public.app_normalize_nick(p) ~ 'https?:\/\/|www\.|\.com|\.net|\.org')
      or (public.app_normalize_nick(p) ~ '\d{7,}');
$$;

-- ofensa (versão do CHAT): frases no normalizado, token inteiro
-- (com letras isoladas juntadas) e substring >= 5 no denso
create or replace function public.app_contains_offense(p text) returns boolean
language sql stable security definer set search_path = public as $$
  with n as (select public.app_normalize(p) as v),
       w as (select public.app_normalize(b.word) as norm from public.bad_words b)
  select exists (
      select 1 from w, n
      where position(' ' in w.norm) > 0 and position(w.norm in n.v) > 0
    ) or exists (
      select 1 from n
      join lateral unnest(string_to_array(public.app_join_letters(n.v), ' ')) t on true
      join w on w.norm = t
      where position(' ' in w.norm) = 0
    ) or exists (
      select 1 from w, n
      where position(' ' in w.norm) = 0 and length(w.norm) >= 5
        and position(w.norm in replace(n.v, ' ', '')) > 0
    );
$$;

-- ofensa (versão do APELIDO — nickname.js): token split em [^a-z0-9]+,
-- substring >= 5 no normalizado do apelido
create or replace function public.app_contains_offense_nick(p text) returns boolean
language sql stable security definer set search_path = public as $$
  with n as (select public.app_normalize_nick(p) as v)
  select exists (
      select 1 from public.bad_words w, n
      where position(' ' in public.app_normalize_nick(w.word)) > 0
        and position(public.app_normalize_nick(w.word) in n.v) > 0
    ) or exists (
      select 1 from n
      join lateral unnest(regexp_split_to_array(n.v, '[^a-z0-9]+')) t on true
      join public.bad_words w on public.app_normalize_nick(w.word) = t
      where position(' ' in public.app_normalize_nick(w.word)) = 0
    ) or exists (
      select 1 from public.bad_words w, n
      where position(' ' in public.app_normalize_nick(w.word)) = 0
        and length(public.app_normalize_nick(w.word)) >= 5
        and position(public.app_normalize_nick(w.word) in n.v) > 0
    );
$$;

-- suaviza CAIXA ALTA excessiva (> 60% das letras maiúsculas)
create or replace function public.app_soften_caps(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare t text := coalesce(p, ''); letters text; up text;
begin
  letters := regexp_replace(t, '[^a-zA-ZÀ-ÿ]', '', 'g');
  if length(letters) <= 4 then return t; end if;
  up := regexp_replace(letters, '[^A-ZÀ-Þ]', '', 'g');
  if length(up)::numeric / length(letters) > 0.6 then
    return substr(t, 1, 1) || lower(substr(t, 2));
  end if;
  return t;
end;
$$;

-- hash estilo JS (h*31 + code) >>> 0 — espelho de _occupancy/_pickShard do mock
create or replace function public.app_js_hash(p text) returns bigint
language plpgsql immutable security definer set search_path = public as $$
declare h bigint := 0; i int;
begin
  for i in 1..length(coalesce(p, '')) loop
    h := (h * 31 + ascii(substr(p, i, 1))) % 4294967296;
  end loop;
  return h;
end;
$$;

-- sala derivada igual ao _pickShard do mock (base:pt-BR:n, n = 1..3):
-- aceita nulo, a base ('global') ou a sala já montada — a derivação é
-- determinística, então as três formas caem sempre na MESMA sala.
create or replace function public.app_room(p_room text) returns text
language sql immutable security definer set search_path = public as $$
  select split_part(coalesce(nullif(p_room, ''), 'global'), ':', 1)
         || ':pt-BR:'
         || (1 + ((public.app_js_hash(
              split_part(coalesce(nullif(p_room, ''), 'global'), ':', 1) || ':probe') % 100) % 3))::text;
$$;

-- =========================================================
-- C. sessão/perfil
-- =========================================================

create or replace function public.app_session_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    perform public.app_error('no-session', 'Entre na comunidade para continuar.');
  end if;
  return auth.uid();
end;
$$;

-- perfil atual (exige sessão + linha viva); usado por quase todos os RPCs
create or replace function public.app_profile_row() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  perform public.app_session_uid();
  select * into p from public.profiles where id = auth.uid();
  if not found or p.deleted_at is not null then
    perform public.app_error('no-session', 'Entre na comunidade para continuar.');
  end if;
  return p;
end;
$$;

create or replace function public.app_profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname::text,
    'skinId', coalesce(p.skin_id, 'classic'),
    'country', p.country,
    'ageBand', p.age_band,
    'createdAt', to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'bannedUntil', coalesce((extract(epoch from p.banned_until) * 1000)::bigint, 0),
    'mutedUntil', coalesce((extract(epoch from p.muted_until) * 1000)::bigint, 0),
    'clanId', (select m.clan_id from public.clan_members m where m.user_id = p.id limit 1),
    'terms', case when p.terms_version is null then null else
      jsonb_build_object('version', p.terms_version,
        'at', to_char(coalesce(p.terms_at, p.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    end
  );
$$;

-- =========================================================
-- D. temporadas / Corrida do Dia
-- (espelho de net/api.js: SEASON_REF 2026-01-05 00:00 BRT, semana de 7 dias)
-- =========================================================

create or replace function public.app_season_ref_ms() returns bigint
language sql immutable security definer set search_path = public as $$
  select (extract(epoch from timestamptz '2026-01-05 03:00:00+00') * 1000)::bigint;
$$;

create or replace function public.app_now_ms() returns bigint
language sql stable security definer set search_path = public as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

-- nº da temporada atual (weekIdx + 1, floor do decorrido / 7 dias)
create or replace function public.app_season_number() returns int
language sql stable security definer set search_path = public as $$
  select (((public.app_now_ms() - public.app_season_ref_ms()) / 604800000) + 1)::int;
$$;

create or replace function public.app_season_start_ms(p_number int) returns bigint
language sql immutable security definer set search_path = public as $$
  select public.app_season_ref_ms() + ((p_number - 1)::bigint * 604800000);
$$;

create or replace function public.app_ensure_season() returns int
language plpgsql security definer set search_path = public as $$
declare n int := public.app_season_number();
begin
  insert into public.tournament_seasons (number, starts_at, ends_at)
  values (n,
          to_timestamp(public.app_season_start_ms(n) / 1000.0),
          to_timestamp((public.app_season_start_ms(n) + 604800000) / 1000.0))
  on conflict (number) do nothing;
  return n;
end;
$$;

-- data local (America/Sao_Paulo) da Corrida do Dia
create or replace function public.app_daily_date() returns text
language sql stable security definer set search_path = public as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
$$;

-- =========================================================
-- E. validadores de texto (espelho de net/rules.js + js/core/nickname.js)
-- =========================================================

-- limpa igual a validateNickname: remove controle, colapsa espaços, trim
create or replace function public.app_text_clean(p text) returns text
language sql immutable security definer set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
$$;

-- devolve a mensagem de erro do apelido (validateNickname) ou NULL se ok
create or replace function public.app_nickname_problem(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := public.app_text_clean(p);
begin
  if v = '' then return 'Digite um apelido.'; end if;
  if length(v) < public.app_rule_i('nick_min') or length(v) > public.app_rule_i('nick_max') then
    return format('Use de %s a %s caracteres.', public.app_rule_i('nick_min'), public.app_rule_i('nick_max'));
  end if;
  if public.app_contains_contact_nick(v) then
    return 'Nao use links, e-mails nem telefones.';
  end if;
  if v !~ '^[\p{L}\p{N} _-]+$' then
    return 'Use so letras, numeros, espaco, "_" e "-".';
  end if;
  if public.app_contains_offense_nick(v) then
    return 'Escolha outro apelido.';
  end if;
  return null;
end;
$$;

-- nome de clã (validateClanName): aplica a régua do apelido filtrando o
-- erro de comprimento, depois as réguas próprias do clã
create or replace function public.app_clan_name_problem(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := public.app_text_clean(p);
      msg text; norm text;
begin
  msg := public.app_nickname_problem(v);
  if msg is not null and msg <> format('Use de %s a %s caracteres.',
        public.app_rule_i('nick_min'), public.app_rule_i('nick_max')) then
    return msg;
  end if;
  if length(v) < public.app_rule_i('clan_name_min') or length(v) > public.app_rule_i('clan_name_max') then
    return format('O nome do clã precisa de %s a %s caracteres.',
      public.app_rule_i('clan_name_min'), public.app_rule_i('clan_name_max'));
  end if;
  if v !~ '^[\p{L}\p{N} _-]+$' then
    return 'Use só letras, números, espaço, "_" e "-".';
  end if;
  if public.app_contains_contact(v) or public.app_contains_offense(v) then
    return 'Escolha outro nome.';
  end if;
  norm := public.app_normalize(v);
  if exists (select 1 from public.reserved_words r
             where r.word = any (string_to_array(norm, ' '))) or position('orblux' in norm) > 0 then
    return 'Escolha outro nome (termos reservados).';
  end if;
  return null;
end;
$$;

-- tag de clã (validateClanTag); devolve a tag em maiúsculas
create or replace function public.app_clan_tag_problem(p text, out value text, out error text)
language plpgsql stable security definer set search_path = public as $$
declare t text := btrim(coalesce(p, ''));
begin
  value := upper(t); error := null;
  if length(t) < public.app_rule_i('clan_tag_min') or length(t) > public.app_rule_i('clan_tag_max') then
    error := format('A tag precisa de %s a %s caracteres.',
      public.app_rule_i('clan_tag_min'), public.app_rule_i('clan_tag_max'));
    return;
  end if;
  if t !~ '^[\p{L}\p{N}]+$' then
    error := 'Use só letras e números.'; return;
  end if;
  if exists (select 1 from public.reserved_words r where r.word = public.app_normalize(t)) then
    error := 'Escolha outra tag (termos reservados).'; return;
  end if;
  if public.app_contains_offense(t) then
    error := 'Escolha outra tag.'; return;
  end if;
end;
$$;

-- emblema: elenco fechado (validateClanEmblem) — fora do elenco vira padrão
create or replace function public.app_validate_emblem(raw jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare icon int; moldura int; cor text;
begin
  icon := case when coalesce(raw ->> 'icon', '') ~ '^-?[0-9]+$' then (raw ->> 'icon')::int end;
  moldura := case when coalesce(raw ->> 'moldura', '') ~ '^-?[0-9]+$' then (raw ->> 'moldura')::int end;
  cor := lower(coalesce(raw ->> 'cor', ''));
  return jsonb_build_object(
    'icon', case when icon >= 0 and icon < (select count(*) from public.clan_icons) then icon else 0 end,
    'moldura', case when moldura >= 0 and moldura < (select count(*) from public.clan_frames) then moldura else 0 end,
    'cor', case when exists (select 1 from public.clan_colors c where c.hex = cor)
                then cor else (select hex from public.clan_colors where ord = 0) end
  );
end;
$$;

create or replace function public.app_clan_tipo(p text) returns text
language sql immutable security definer set search_path = public as $$
  select case when p in ('aberto', 'solicitacao', 'convite') then p else 'aberto' end;
$$;

-- =========================================================
-- F. helpers de clã / carteira
-- =========================================================

create or replace function public.app_my_clan() returns text
language sql stable security definer set search_path = public as $$
  select m.clan_id from public.clan_members m where m.user_id = auth.uid() limit 1;
$$;

create or replace function public.app_members_count(p_clan text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.clan_members where clan_id = p_clan;
$$;

create or replace function public.app_clan_json(p_clan text) returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from public.clans where id = p_clan)
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id, 'nome', c.nome::text, 'tag', c.tag::text, 'tipo', c.tipo,
    'descricao', c.descricao, 'emblema', c.emblema, 'pais', c.pais,
    'nivel', c.nivel, 'xp', c.xp, 'trofeus', c.trofeus,
    'vagas', greatest(0, public.app_rule_i('clan_max_members') - public.app_members_count(c.id)),
    'membros', public.app_members_count(c.id),
    'meuPapel', (select m.papel from public.clan_members m where m.clan_id = c.id and m.user_id = auth.uid())
  ) end from c;
$$;

-- papel exigido; devolve o id do meu clã (erros iguais ao mock)
create or replace function public.app_require_role(p_roles text[], p_clan_id text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_clan text; v_papel text;
begin
  perform public.app_profile_row();
  select m.clan_id, m.papel into v_clan, v_papel
    from public.clan_members m where m.user_id = auth.uid();
  if v_clan is null then perform public.app_error('no-clan', 'Você não está em um clã.'); end if;
  if p_clan_id is not null and p_clan_id <> v_clan then
    perform public.app_error('forbidden', 'Este clã não é o seu.');
  end if;
  if v_papel is null or not (v_papel = any (p_roles)) then
    perform public.app_error('forbidden', 'Você não tem permissão para isso.');
  end if;
  return v_clan;
end;
$$;

-- crédito idempotente na carteira do servidor (unique(user, reason, ref))
create or replace function public.app_wallet_earn(p_user uuid, p_amount int, p_reason text, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  if p_amount <= 0 then return; end if;
  insert into public.server_wallets (user_id, balance) values (p_user, 0)
    on conflict (user_id) do nothing;
  insert into public.coin_ledger (user_id, amount, reason, ref)
    values (p_user, p_amount, p_reason, p_ref)
    on conflict (user_id, reason, ref) do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.server_wallets set balance = balance + p_amount where user_id = p_user;
  end if;
end;
$$;

create or replace function public.app_tag_snapshot(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.tag::text from public.clan_members m
    join public.clans c on c.id = m.clan_id
   where m.user_id = p_user limit 1;
$$;

-- =========================================================
-- G. RPCs — perfil (5)
-- =========================================================

create or replace function public.profile_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found or p.deleted_at is not null then return null; end if;
  return public.app_profile_json(p);
end;
$$;

create or replace function public.profile_recovery_code() returns text
language plpgsql security definer set search_path = public as $$
declare p public.profiles; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      code text; guard int := 0;
begin
  p := public.app_profile_row();
  if p.recovery_code is not null then return p.recovery_code; end if;
  loop
    code := '';
    for i in 1..12 loop
      code := code || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where recovery_code = code);
    guard := guard + 1;
    if guard > 50 then perform public.app_error('server', 'Não foi possível gerar o código agora.'); end if;
  end loop;
  update public.profiles set recovery_code = code where id = p.id;
  return code;
end;
$$;

create or replace function public.profile_upsert(
  p_nickname text, p_skin text, p_country text, p_age_band text, p_terms_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.app_session_uid();
      msg text; nick text; norm text; base text;
      cand text; guard int := 0; p public.profiles; has_row boolean;
begin
  if p_age_band is null or p_age_band not in ('menor13', '13a17', '18+') then
    perform public.app_error('age-required', 'Informe a faixa de idade.');
  end if;
  nick := btrim(coalesce(p_nickname, ''));
  if nick = '' then perform public.app_error('nickname-required', 'Digite um apelido.'); end if;
  msg := public.app_nickname_problem(nick);
  if msg is not null then perform public.app_error('invalid-nickname', msg); end if;
  nick := public.app_text_clean(nick);

  -- apelido único: se normalizado ocupado por outro, sufixo #1234 (espelho do mock)
  norm := public.app_normalize(nick);
  if exists (select 1 from public.profiles t
             where t.id <> uid and public.app_normalize(t.nickname::text) = norm) then
    base := left(nick, 8);
    loop
      cand := base || '#' || (1000 + floor(random() * 9000)::int)::text;
      exit when not exists (select 1 from public.profiles t
                            where public.app_normalize(t.nickname::text) = public.app_normalize(cand));
      guard := guard + 1;
      if guard > 50 then perform public.app_error('invalid-nickname', 'Escolha outro apelido.'); end if;
    end loop;
    nick := cand;
  end if;

  if p_terms_version is null or btrim(p_terms_version) = '' then
    perform public.app_error('terms-required', 'Aceite os Termos de Uso para continuar.');
  end if;

  select exists (select 1 from public.profiles where id = uid) into has_row;
  if has_row then
    update public.profiles set
      nickname = nick,
      skin_id = case when p_skin is not null then left(p_skin, 32)
                     else coalesce(skin_id, 'classic') end,
      country = case when p_country ~ '^[A-Za-z]{2}$' then upper(p_country) else null end,
      age_band = p_age_band,
      terms_version = p_terms_version, terms_at = now(),
      deleted_at = null
    where id = uid;
  else
    insert into public.profiles (id, nickname, skin_id, country, age_band, terms_version, terms_at)
    values (uid, nick,
            case when p_skin is not null then left(p_skin, 32) else 'classic' end,
            case when p_country ~ '^[A-Za-z]{2}$' then upper(p_country) else null end,
            p_age_band, p_terms_version, now());
  end if;
  select * into p from public.profiles where id = uid;
  return public.app_profile_json(p);
end;
$$;

create or replace function public.profile_recover(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.app_session_uid();
      key text := upper(btrim(coalesce(p_code, '')));
      target public.profiles; mine public.profiles;
begin
  if key = '' then
    perform public.app_error('invalid-code', 'Código inválido. Confira o código de recuperação.');
  end if;
  select * into target from public.profiles where recovery_code = key and deleted_at is null;
  if not found then
    perform public.app_error('invalid-code', 'Código inválido. Confira o código de recuperação.');
  end if;
  if target.id = uid then return public.app_profile_json(target); end if;
  -- dispositivo novo: descarta o perfil local (fresco) e reatribui o recuperado
  select * into mine from public.profiles where id = uid;
  if found then
    delete from public.clan_requests where user_id = uid;
    delete from public.clan_invites where user_id = uid;
    delete from public.user_blocks where user_id = uid;
    delete from public.runs where user_id = uid;
    delete from public.chat_messages where user_id = uid;
    delete from public.chat_reports where reporter_id = uid;
    delete from public.clan_members where user_id = uid;
    delete from public.profiles where id = uid;
  end if;
  update public.profiles set id = uid where id = target.id;  -- FKs ON UPDATE CASCADE seguem
  select * into target from public.profiles where id = uid;
  return public.app_profile_json(target);
end;
$$;

create or replace function public.account_delete() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_clan text; v_papel text; other uuid;
begin
  p := public.app_profile_row();
  select m.clan_id, m.papel into v_clan, v_papel from public.clan_members m where m.user_id = p.id;
  if v_clan is not null then
    if v_papel = 'lider' then
      select m.user_id into other from public.clan_members m
       where m.clan_id = v_clan and m.user_id <> p.id order by m.created_at limit 1;
      if other is not null then
        update public.clan_members set papel = 'lider' where clan_id = v_clan and user_id = other;
        update public.clans set lider_id = other where id = v_clan;
      else
        delete from public.clans where id = v_clan;         -- clã só do líder: dissolve
      end if;
    end if;
    delete from public.clan_members where clan_id = v_clan and user_id = p.id;
  end if;
  -- UGC + dados de jogo (exclusão de conta — exigência Play §7)
  delete from public.chat_messages where user_id = p.id;
  delete from public.chat_reports where reporter_id = p.id;
  delete from public.user_blocks where user_id = p.id;
  delete from public.clan_requests where user_id = p.id;
  delete from public.clan_invites where user_id = p.id;
  delete from public.runs where user_id = p.id;
  -- perfil anonimizado (mantém só o marcador; carteira/torneios são progresso)
  update public.profiles set
    nickname = 'apagado-' || left(md5(p.id::text), 8),
    skin_id = null, country = null, age_band = null,
    terms_version = null, terms_at = null,
    banned_until = null, muted_until = null, clan_wait_until = null,
    recovery_code = null, deleted_at = now()
  where id = p.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================
-- H. RPCs — chat (8)
-- =========================================================

-- ocupação REAL: distintos que falaram na sala nos últimos 5 min
-- (o mock devolve um número fictício — só a UI de "online agora" usa)
create or replace function public.chat_online(p_room text) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from public.chat_messages
   where room = public.app_room(p_room)
     and created_at > now() - interval '5 minutes';
$$;

create or replace function public.chat_join(p_room text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare room text; online int;
begin
  perform public.app_profile_row();
  room := public.app_room(p_room);
  online := public.chat_online(room);
  insert into public.chat_rooms (room, occupancy) values (room, online)
    on conflict (room) do update set occupancy = excluded.occupancy;
  return jsonb_build_object('room', room, 'online', online);
end;
$$;

create or replace function public.chat_history(p_room text, p_before bigint, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', m.id,
      'room', m.room,
      'userId', m.user_id,
      'nick', m.nick_snapshot,
      'tag', m.tag_snapshot,
      'text', m.text,
      'at', (extract(epoch from m.created_at) * 1000)::bigint,
      'hidden', m.hidden
    ) as x
    from public.chat_messages m
    where m.room = public.app_room(p_room)
      and (p_before is null or m.id < p_before)
      and not m.hidden
      and not exists (select 1 from public.user_blocks b
                      where b.user_id = auth.uid() and b.blocked_id = m.user_id)
    order by m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  ) t;
$$;

create or replace function public.chat_send(p_room text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; txt text; room text; last text;
      last_at timestamptz; per_min int; mid bigint; quick_ok boolean;
begin
  p := public.app_profile_row();
  -- espelho do validateChatMessage: remove controle e trim (sem colapsar espaços)
  txt := btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', '', 'g'));
  if txt = '' then perform public.app_error('empty', 'Digite uma mensagem.'); end if;
  if length(txt) > public.app_rule_i('chat_max_len') then
    perform public.app_error('too_long', format('Máximo de %s caracteres.', public.app_rule_i('chat_max_len')));
  end if;
  if p.banned_until is not null and p.banned_until > now() then
    perform public.app_error('banned', 'Sua conta está suspensa no chat.');
  end if;
  if p.muted_until is not null and p.muted_until > now() then
    perform public.app_error('muted', 'Você está sem falar no chat por enquanto.');
  end if;
  if p.age_band = 'menor13' then
    select (txt in (select value from public.quick_phrases)
         or txt in (select value from public.quick_emojis)) into quick_ok;
    if not quick_ok then
      perform public.app_error('quick_only', 'Para sua segurança, você usa só frases prontas e emojis.');
    end if;
  end if;
  if public.app_contains_contact(txt) then
    perform public.app_error('blocked_contact', 'Não envie links, e-mails ou telefones.');
  end if;
  if public.app_contains_offense(txt) then
    perform public.app_error('blocked_word', 'Sua mensagem contém termos não permitidos.');
  end if;

  -- duplicata (comparação exata, só caixa), cooldown e teto por minuto
  select m.text, m.created_at into last, last_at
    from public.chat_messages m where m.user_id = p.id order by m.id desc limit 1;
  if last is not null and lower(last) = lower(txt) then
    perform public.app_error('duplicate', 'Você acabou de enviar essa mensagem.');
  end if;
  if last_at is not null and last_at > now() - (public.app_rule_i('chat_cooldown_ms') || ' milliseconds')::interval then
    perform public.app_error('rate_limit', 'Espere um instante antes de enviar de novo.');
  end if;
  select count(*) into per_min from public.chat_messages m
   where m.user_id = p.id and m.created_at > now() - interval '60 seconds';
  if per_min >= public.app_rule_i('chat_per_min') then
    perform public.app_error('flood', 'Muitas mensagens agora — respire um pouco.');
  end if;

  txt := public.app_soften_caps(txt);
  room := public.app_room(p_room);
  insert into public.chat_messages (room, user_id, nick_snapshot, tag_snapshot, text)
  values (room, p.id, p.nickname::text, public.app_tag_snapshot(p.id), left(txt, 200))
  returning id into mid;
  -- teto da sala (CHAT.MAX_PER_ROOM): mantém as N mais novas
  delete from public.chat_messages m
   where m.room = room
     and m.id < coalesce((select min(x.id) from (
           select id from public.chat_messages where room = room
           order by id desc limit public.app_rule_i('chat_max_per_room')) x), 0);
  return jsonb_build_object(
    'id', mid, 'room', room, 'userId', p.id, 'nick', p.nickname::text,
    'tag', public.app_tag_snapshot(p.id), 'text', txt,
    'at', public.app_now_ms(), 'hidden', false);
end;
$$;

create or replace function public.chat_report(p_message_id bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; hidden boolean; distinta int;
begin
  perform public.app_profile_row();
  uid := auth.uid();
  if not exists (select 1 from public.chat_messages where id = p_message_id) then
    perform public.app_error('not-found', 'Mensagem não encontrada.');
  end if;
  insert into public.chat_reports (message_id, reporter_id, reason)
  values (p_message_id, uid, left(coalesce(nullif(btrim(p_reason), ''), 'outro'), 40))
  on conflict (message_id, reporter_id) do nothing;
  -- 3 denúncias DISTINTAS ocultam (CHAT.REPORTS_HIDE); o mute vem da
  -- Edge Function chat-moderation (decisão §8.5: automação + revisão do dono)
  select count(distinct reporter_id) into distinta
    from public.chat_reports where message_id = p_message_id;
  if distinta >= public.app_rule_i('chat_reports_hide') then
    update public.chat_messages set hidden = true where id = p_message_id;
  end if;
  select m.hidden into hidden from public.chat_messages m where m.id = p_message_id;
  return jsonb_build_object('ok', true, 'hidden', coalesce(hidden, false));
end;
$$;

create or replace function public.user_block(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid; nick text;
begin
  uid := (public.app_profile_row()).id;
  if p_user_id is null or p_user_id = uid then
    perform public.app_error('not-found', 'Jogador não encontrado.');
  end if;
  select left(n.nickname::text, 16) into nick from public.profiles n where n.id = p_user_id;
  insert into public.user_blocks (user_id, blocked_id, nick_snapshot)
  values (uid, p_user_id, coalesce(nick, 'Jogador'))
  on conflict (user_id, blocked_id) do nothing;
  return true;
end;
$$;

create or replace function public.user_unblock(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := (public.app_profile_row()).id;
begin
  delete from public.user_blocks where user_id = uid and blocked_id = p_user_id;
  return true;
end;
$$;

create or replace function public.user_blocks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked_id, 'nick', b.nick_snapshot)), '[]'::jsonb)
    from public.user_blocks b where b.user_id = auth.uid();
$$;

-- moderação automática (decisão §8.5: automação + revisão do dono).
-- Chamada pela Edge Function chat-moderation (pg_cron */5 min): 3 denúncias
-- DISTINTAS não tratadas => oculta + mute 24 h + registro em moderation_log.
-- Idempotente: depois de agir, as denúncias do aviso viram `acted`.
create or replace function public.app_chat_moderate() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; feitos int := 0; mute_h int := public.app_rule_i('mute_hours');
begin
  for r in
    select cr.message_id, m.user_id, count(distinct cr.reporter_id) as denuncias
      from public.chat_reports cr
      join public.chat_messages m on m.id = cr.message_id
     where not cr.acted
     group by cr.message_id, m.user_id
    having count(distinct cr.reporter_id) >= public.app_rule_i('chat_reports_hide')
  loop
    update public.chat_messages set hidden = true where id = r.message_id;
    update public.profiles p
       set muted_until = greatest(coalesce(p.muted_until, now()),
                                  now() + (mute_h || ' hours')::interval)
     where p.id = r.user_id;
    update public.chat_reports set acted = true where message_id = r.message_id;
    insert into public.moderation_log (action, target_user_id, message_id, detail)
    values ('mute', r.user_id, r.message_id,
            jsonb_build_object('motivo', '3_denuncias', 'horas', mute_h,
                               'denuncias', r.denuncias, 'ocultou', true));
    feitos := feitos + 1;
  end loop;
  return jsonb_build_object('ok', true, 'acted', feitos);
end;
$$;

-- expiração da fila do clã (pedidos/convites velhos) — pg_cron diário.
create or replace function public.app_expire_queues() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  delete from public.clan_invites  where created_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  delete from public.clan_requests where created_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;

-- =========================================================
-- I. RPCs — clãs (19)
-- =========================================================

create or replace function public.clan_search(p_q text, p_tipo text, p_pais text, p_vagas boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare term text := public.app_normalize(p_q); mine text; out jsonb;
begin
  perform public.app_profile_row();
  mine := public.app_my_clan();
  select coalesce(jsonb_agg(s.x order by s.mine_first desc, s.nome), '[]'::jsonb) into out
  from (select public.app_clan_json(c.id) as x,
               (c.id = coalesce(mine, '')) as mine_first,
               c.nome::text as nome
          from public.clans c
         where (term is null or term = ''
                or position(term in public.app_normalize(c.nome::text)) > 0
                or position(term in public.app_normalize(c.tag::text)) > 0)
           and (p_tipo is null or c.tipo = p_tipo)
           and (p_pais is null or c.pais = p_pais)
           and (not coalesce(p_vagas, false)
                or public.app_members_count(c.id) < public.app_rule_i('clan_max_members'))
         limit 60) s;
  return out;
end;
$$;

create or replace function public.clan_get(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.app_profile_row();
  select public.app_clan_json(p_id) into out;
  return out;
end;
$$;

create or replace function public.clan_mine() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.app_profile_row();
  select public.app_clan_json(public.app_my_clan()) into out;
  return out;
end;
$$;

create or replace function public.clan_members(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare target text; out jsonb;
begin
  perform public.app_profile_row();
  target := coalesce(p_id, public.app_my_clan());
  if target is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id, 'nick', n.nickname::text, 'papel', m.papel,
    'contribuicao', m.contribuicao, 'ultimoDia', m.ultimo_dia)
    order by case m.papel when 'lider' then 0 when 'vice' then 1 else 2 end, n.nickname::text
  ), '[]'::jsonb) into out
  from public.clan_members m join public.profiles n on n.id = m.user_id
  where m.clan_id = target;
  return out;
end;
$$;

create or replace function public.clan_create(p_nome text, p_tag text, p_descricao text, p_tipo text, p_emblema jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles; msg text; tag_out text; tag_err text;
      nome text; tagv text; cid text; bal int; custo int := public.app_rule_i('clan_create_cost');
begin
  p := public.app_profile_row();
  if p.age_band = 'menor13' then
    perform public.app_error('age-restricted', 'Menores de 13 anos não criam clãs — entre por convite.');
  end if;
  if p.terms_version is null or p.terms_version <> public.app_terms_version() then
    perform public.app_error('terms-required', 'Aceite os Termos de Uso primeiro.');
  end if;
  if public.app_my_clan() is not null then
    perform public.app_error('already-in-clan', 'Você já está em um clã. Saia primeiro.');
  end if;
  if p.clan_wait_until is not null and p.clan_wait_until > now() then
    perform public.app_error('switch_wait', 'Aguarde a espera de troca de clã.');
  end if;

  msg := public.app_clan_name_problem(p_nome);
  if msg is not null then perform public.app_error('invalid-name', msg); end if;
  nome := public.app_text_clean(p_nome);
  select t.value, t.error into tag_out, tag_err from public.app_clan_tag_problem(p_tag) t;
  if tag_err is not null then perform public.app_error('invalid-tag', tag_err); end if;
  tagv := tag_out;

  if exists (select 1 from public.clans c where public.app_normalize(c.nome::text) = public.app_normalize(nome)) then
    perform public.app_error('name-taken', 'Já existe um clã com esse nome.');
  end if;
  if exists (select 1 from public.clans c where public.app_normalize(c.tag::text) = public.app_normalize(tagv)) then
    perform public.app_error('tag-taken', 'Já existe um clã com essa tag.');
  end if;

  -- moedas: o SERVIDOR debita (fonte da verdade); a UI local espelha depois
  insert into public.server_wallets (user_id, balance) values (p.id, 0) on conflict (user_id) do nothing;
  select w.balance into bal from public.server_wallets w where w.user_id = p.id for update;
  if bal < custo then
    perform public.app_error('insufficient-coins', format('Faltam %s moedas — ganhe jogando.', custo - bal));
  end if;

  cid := 'clan_' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  insert into public.clans (id, nome, tag, descricao, tipo, emblema, pais, lider_id)
  values (cid, nome, tagv, left(coalesce(p_descricao, ''), 160), public.app_clan_tipo(p_tipo),
          public.app_validate_emblem(coalesce(p_emblema, '{}'::jsonb)),
          coalesce(p.country, 'BR'), p.id);
  insert into public.clan_members (clan_id, user_id, papel) values (cid, p.id, 'lider');
  update public.server_wallets w set balance = w.balance - custo where w.user_id = p.id;
  insert into public.coin_ledger (user_id, amount, reason, ref) values (p.id, -custo, 'cla', cid)
    on conflict (user_id, reason, ref) do nothing;
  return public.app_clan_json(cid);
end;
$$;

create or replace function public.clan_join(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; c public.clans;
begin
  p := public.app_profile_row();
  if public.app_my_clan() is not null then
    perform public.app_error('already-in-clan', 'Você já está em um clã.');
  end if;
  if p.clan_wait_until is not null and p.clan_wait_until > now() then
    perform public.app_error('switch_wait', 'Aguarde a espera de troca de clã.');
  end if;
  select * into c from public.clans where id = p_id;
  if not found then perform public.app_error('not-found', 'Clã não encontrado.'); end if;
  if public.app_members_count(p_id) >= public.app_rule_i('clan_max_members') then
    perform public.app_error('full', 'Este clã está cheio.');
  end if;
  if c.tipo = 'solicitacao' then perform public.app_error('needs_request', 'Este clã entra por solicitação.'); end if;
  if c.tipo = 'convite' then perform public.app_error('invite_only', 'Este clã aceita só por convite.'); end if;
  insert into public.clan_members (clan_id, user_id, papel) values (p_id, p.id, 'membro');
  return public.app_clan_json(p_id);
end;
$$;

create or replace function public.clan_request(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public.app_profile_row();
  if public.app_my_clan() is not null then
    perform public.app_error('already-in-clan', 'Você já está em um clã. Saia primeiro.');
  end if;
  if not exists (select 1 from public.clans where id = p_id) then
    perform public.app_error('not-found', 'Clã não encontrado.');
  end if;
  insert into public.clan_requests (clan_id, user_id) values (p_id, p.id)
    on conflict (clan_id, user_id) do nothing;
  return jsonb_build_object('ok', true, 'status', 'pendente');
end;
$$;

create or replace function public.clan_outgoing() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'clanId', r.clan_id, 'at', (extract(epoch from r.created_at) * 1000)::bigint, 'status', 'pendente')
    order by r.created_at desc), '[]'::jsonb)
    from public.clan_requests r where r.user_id = auth.uid();
$$;

create or replace function public.clan_invite(p_user_id uuid, p_clan_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := public.app_require_role(array['lider', 'vice'], p_clan_id);
  if not exists (select 1 from public.profiles n where n.id = p_user_id and n.deleted_at is null) then
    perform public.app_error('not-found', 'Jogador não encontrado.');
  end if;
  insert into public.clan_invites (clan_id, user_id) values (cid, p_user_id)
    on conflict (clan_id, user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.clan_requests(p_clan_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cid text; out jsonb;
begin
  cid := public.app_require_role(array['lider', 'vice'], p_clan_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', r.user_id, 'nick', n.nickname::text,
    'at', (extract(epoch from r.created_at) * 1000)::bigint, 'status', 'pendente')
    order by r.created_at), '[]'::jsonb) into out
  from public.clan_requests r join public.profiles n on n.id = r.user_id
  where r.clan_id = cid;
  return out;
end;
$$;

create or replace function public.clan_accept(p_user_id uuid, p_clan_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid text; req boolean;
begin
  cid := public.app_require_role(array['lider', 'vice'], p_clan_id);
  if public.app_members_count(cid) >= public.app_rule_i('clan_max_members') then
    perform public.app_error('full', 'Este clã está cheio.');
  end if;
  select exists (select 1 from public.clan_requests r where r.clan_id = cid and r.user_id = p_user_id)
    into req;
  if not req then perform public.app_error('not-found', 'Solicitação não encontrada.'); end if;
  if exists (select 1 from public.clan_members m where m.user_id = p_user_id) then
    perform public.app_error('already-in-clan', 'Este jogador já está em um clã.');
  end if;
  insert into public.clan_members (clan_id, user_id, papel) values (cid, p_user_id, 'membro');
  delete from public.clan_requests r where r.clan_id = cid and r.user_id = p_user_id;
  return public.app_clan_json(cid);
end;
$$;

create or replace function public.clan_decline(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := public.app_require_role(array['lider', 'vice']);
  delete from public.clan_requests r where r.clan_id = cid and r.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.clan_kick(p_user_id uuid, p_clan_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text; papel text; meu text;
begin
  cid := public.app_require_role(array['lider', 'vice'], p_clan_id);
  select m.papel into papel from public.clan_members m
   where m.clan_id = cid and m.user_id = p_user_id;
  if papel is null then perform public.app_error('not-member', 'Este jogador não está no clã.'); end if;
  if papel = 'lider' then perform public.app_error('forbidden', 'Não se expulsa o líder.'); end if;
  select m.papel into meu from public.clan_members m
   where m.clan_id = cid and m.user_id = auth.uid();
  if papel = 'vice' and meu <> 'lider' then
    perform public.app_error('forbidden', 'Só o líder gerencia vice-líderes.');
  end if;
  delete from public.clan_members m where m.clan_id = cid and m.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.clan_promote(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text; papel text;
begin
  cid := public.app_require_role(array['lider']);
  select m.papel into papel from public.clan_members m
   where m.clan_id = cid and m.user_id = p_user_id;
  if papel is null then perform public.app_error('not-found', 'Jogador não encontrado no clã.'); end if;
  if papel = 'lider' then perform public.app_error('forbidden', 'Não se rebaixa o líder.'); end if;
  update public.clan_members m set papel = 'vice' where m.clan_id = cid and m.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.clan_demote(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text; papel text;
begin
  cid := public.app_require_role(array['lider']);
  select m.papel into papel from public.clan_members m
   where m.clan_id = cid and m.user_id = p_user_id;
  if papel is null then perform public.app_error('not-found', 'Jogador não encontrado no clã.'); end if;
  if papel = 'lider' then perform public.app_error('forbidden', 'Não se rebaixa o líder.'); end if;
  update public.clan_members m set papel = 'membro' where m.clan_id = cid and m.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.clan_transfer(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := public.app_require_role(array['lider']);
  if not exists (select 1 from public.clan_members m where m.clan_id = cid and m.user_id = p_user_id) then
    perform public.app_error('not-found', 'Jogador não encontrado no clã.');
  end if;
  update public.clan_members m set papel = 'membro' where m.clan_id = cid and m.user_id = auth.uid();
  update public.clan_members m set papel = 'lider' where m.clan_id = cid and m.user_id = p_user_id;
  update public.clans c set lider_id = p_user_id where c.id = cid;
  return true;
end;
$$;

create or replace function public.clan_leave() returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_clan text; v_papel text; other uuid;
begin
  p := public.app_profile_row();
  select m.clan_id, m.papel into v_clan, v_papel from public.clan_members m where m.user_id = p.id;
  if v_clan is null then perform public.app_error('no-clan', 'Você não está em um clã.'); end if;
  if v_papel = 'lider' then
    select m.user_id into other from public.clan_members m
     where m.clan_id = v_clan and m.user_id <> p.id order by m.created_at limit 1;
    if other is not null then
      update public.clan_members m set papel = 'lider' where m.clan_id = v_clan and m.user_id = other;
      update public.clans c set lider_id = other where c.id = v_clan;
    else
      delete from public.clans c where c.id = v_clan;
    end if;
  end if;
  delete from public.clan_members m where m.clan_id = v_clan and m.user_id = p.id;
  update public.profiles n set clan_wait_until = now()
    + (public.app_rule_i('clan_switch_wait_h') || ' hours')::interval
  where n.id = p.id;
  return true;
end;
$$;

create or replace function public.clan_dissolve() returns boolean
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := public.app_require_role(array['lider']);
  delete from public.clans c where c.id = cid;   -- membros/convites caem em cascata
  return true;
end;
$$;

create or replace function public.clan_update(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid text; msg text; nome_novo text; emblema jsonb; tipo_novo text;
begin
  cid := public.app_require_role(array['lider']);
  if p_patch ? 'descricao' then
    update public.clans c set descricao = left(coalesce(p_patch ->> 'descricao', ''), 160) where c.id = cid;
  end if;
  if p_patch ? 'tipo' then
    tipo_novo := public.app_clan_tipo(p_patch ->> 'tipo');
    update public.clans c set tipo = tipo_novo where c.id = cid;
  end if;
  if p_patch ? 'emblema' then
    select coalesce(c.emblema, '{}'::jsonb) || coalesce(p_patch -> 'emblema', '{}'::jsonb)
      into emblema from public.clans c where c.id = cid;
    update public.clans c set emblema = public.app_validate_emblem(emblema) where c.id = cid;
  end if;
  if p_patch ? 'nome' then
    msg := public.app_clan_name_problem(p_patch ->> 'nome');
    if msg is not null then perform public.app_error('invalid-name', msg); end if;
    nome_novo := public.app_text_clean(p_patch ->> 'nome');
    if exists (select 1 from public.clans c
               where c.id <> cid and public.app_normalize(c.nome::text) = public.app_normalize(nome_novo)) then
      perform public.app_error('name-taken', 'Já existe um clã com esse nome.');
    end if;
    update public.clans c set nome = nome_novo where c.id = cid;
  end if;
  return public.app_clan_json(cid);
end;
$$;

-- =========================================================
-- J. RPCs — torneios (6) + liquidação (2)
-- =========================================================

-- grupo do clã: 8 por fatia fixa por created_at (estável na temporada;
-- decisão §8.4 "8 clãs por grupo, 6 ligas"). p_focus = clã de referência.
create or replace function public.app_tourney_rows(p_season int, p_liga text, p_focus text)
returns table (clan_id text, nome text, tag text, pontos bigint, membros_ativos bigint, meu boolean)
language sql stable security definer set search_path = public as $$
  with ligados as (
    select c.id, c.nome::text as nome, c.tag::text as tag,
           row_number() over (order by c.created_at, c.id) - 1 as rn
      from public.clans c where c.liga = p_liga
  ),
  agregado as (
    select l.id, l.nome, l.tag, l.rn,
           coalesce((select sum(t.melhor_score) from public.tournament_contributions t
                      where t.season_number = p_season
                        and exists (select 1 from public.clan_members m
                                     where m.user_id = t.user_id and m.clan_id = l.id)), 0) as pontos,
           coalesce((select count(*) from public.tournament_contributions t
                      where t.season_number = p_season and t.runs_validas > 0
                        and exists (select 1 from public.clan_members m
                                     where m.user_id = t.user_id and m.clan_id = l.id)), 0) as ativos
      from ligados l
  )
  select a.id, a.nome, a.tag, a.pontos, a.ativos, (a.id = p_focus) as meu
    from agregado a
   where p_focus is not null
     and (a.rn / public.app_rule_i('tourney_group_size')) =
         ((select l2.rn from ligados l2 where l2.id = p_focus) /
          public.app_rule_i('tourney_group_size'));
$$;

-- linhas do grupo com posição (usado pelos RPCs e pela liquidação)
create or replace function public.app_tourney_ranked(p_season int, p_liga text, p_focus text)
returns table (clan_id text, nome text, tag text, pontos bigint, membros_ativos bigint, meu boolean, posicao bigint)
language sql stable security definer set search_path = public as $$
  select g.clan_id, g.nome, g.tag, g.pontos, g.membros_ativos, g.meu,
         row_number() over (order by g.pontos desc, g.nome) as posicao
    from public.app_tourney_rows(p_season, p_liga, p_focus => p_focus) g;
$$;

create or replace function public.tournament_current() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; liga text; focus text; out jsonb;
begin
  perform public.app_profile_row();
  n := public.app_ensure_season();
  focus := public.app_my_clan();
  select c.liga into liga from public.clans c where c.id = focus;
  liga := coalesce(liga, 'Bronze');
  select coalesce(jsonb_agg(jsonb_build_object(
      'clanId', g.clan_id, 'nome', g.nome, 'tag', g.tag, 'pontos', g.pontos,
      'membrosAtivos', g.membros_ativos,
      'meuClan', case when g.meu then true else null end)
    order by g.posicao), '[]'::jsonb) into out
  from public.app_tourney_ranked(n, liga, focus) g;
  return jsonb_build_object(
    'id', 'T' || n, 'number', n, 'liga', liga,
    'startsAt', public.app_season_start_ms(n),
    'endsAt', public.app_season_start_ms(n) + 604800000,
    'regras', jsonb_build_object('K', 5, 'minimoRuns', 3, 'membrosNovos24h', false),
    'group', out);
end;
$$;

create or replace function public.tournament_group() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; liga text; focus text; out jsonb;
begin
  perform public.app_profile_row();
  n := public.app_ensure_season();
  focus := public.app_my_clan();
  if focus is null then return '[]'::jsonb; end if;
  select c.liga into liga from public.clans c where c.id = focus;
  select coalesce(jsonb_agg(jsonb_build_object(
      'clanId', g.clan_id, 'nome', g.nome, 'tag', g.tag, 'pontos', g.pontos,
      'membrosAtivos', g.membros_ativos,
      'meuClan', case when g.meu then true else null end,
      'posicao', g.posicao)
    order by g.posicao), '[]'::jsonb) into out
  from public.app_tourney_ranked(n, coalesce(liga, 'Bronze'), focus) g;
  return out;
end;
$$;

create or replace function public.tournament_my_contribution() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'melhorPartida', coalesce((select max(t.melhor_score) from public.tournament_contributions t
                               where t.season_number = public.app_season_number()
                                 and t.user_id = auth.uid()), 0),
    'runsNaTemporada', coalesce((select sum(t.runs_validas) from public.tournament_contributions t
                                 where t.season_number = public.app_season_number()
                                   and t.user_id = auth.uid()), 0));
$$;

create or replace function public.tournament_rewards() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(h.x order by h.number desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'seasonId', 'T' || h.season_number, 'number', h.season_number,
      'posicao', h.posicao, 'pontos', h.pontos, 'liga', h.liga,
      'rewards', h.rewards,
      'at', (extract(epoch from h.at) * 1000)::bigint,
      'coletada', h.claimed) as x, h.season_number as number
    from public.tournament_history h
    where h.user_id = auth.uid()
    order by h.season_number desc
    limit 6
  ) h;
$$;

create or replace function public.tournament_claim(p_season_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; n int; h public.tournament_history; coins int;
begin
  p := public.app_profile_row();
  if p_season_id !~* '^T[0-9]+$' then
    perform public.app_error('not-found', 'Temporada não encontrada.');
  end if;
  n := substring(p_season_id from 2)::int;
  select * into h from public.tournament_history h
   where h.season_number = n and h.user_id = p.id;
  if not found then perform public.app_error('not-found', 'Temporada não encontrada.'); end if;
  -- UPDATE condicional ⇒ idempotente sob concorrência (already_claimed)
  update public.tournament_history h set claimed = true
   where h.season_number = n and h.user_id = p.id and h.claimed = false
   returning (h.rewards ->> 'total')::int into coins;
  if coins is null then
    perform public.app_error('already_claimed', 'Esta recompensa já foi coletada.');
  end if;
  perform public.app_wallet_earn(p.id, coins, 'torneio', 'T' || n);
  return jsonb_build_object('ok', true, 'coins', coins, 'seasonId', 'T' || n);
end;
$$;

create or replace function public.daily_race() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; melhor int;
begin
  p := public.app_profile_row();
  select coalesce(max(r.score), 0) into melhor from public.runs r
   where r.user_id = p.id and r.valid
     and r.seed = 'daily:' || public.app_daily_date();
  return jsonb_build_object(
    'date', public.app_daily_date(),
    'seed', 'daily:' || public.app_daily_date(),
    'endsAt', (extract(epoch from (( (now() at time zone 'America/Sao_Paulo')::date + 1)
                ::timestamp at time zone 'America/Sao_Paulo')) * 1000)::bigint,
    'melhorHoje', melhor);
end;
$$;

-- liquidação da temporada (chamada pela Edge Function tournament-rollover,
-- toda segunda 00:03 BRT via pg_cron; também chamável pelo dono no SQL Editor)
create or replace function public.tournament_settle(p_season int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; m record; pos bigint; pontos bigint; grupo_n bigint; pos_reward int;
      liga_c text; liga_idx int; promovido boolean; rewards jsonb; feitos int := 0;
      liga_ord constant text[] := array['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lenda'];
begin
  if exists (select 1 from public.tournament_history h where h.season_number = p_season) then
    return jsonb_build_object('ok', true, 'already', true, 'settled', 0);
  end if;
  for c in select cl.id, cl.liga from public.clans cl loop
    liga_c := c.liga;
    select g.posicao, g.pontos into pos, pontos
      from public.app_tourney_ranked(p_season, liga_c, c.id) g
     where g.clan_id = c.id;
    if pos is null then continue; end if;
    -- tamanho do GRUPO (fatia de 8, decisão §8.4): promoção/rebaixamento
    -- valem só em grupo com >= 6 clãs (não na liga inteira)
    select count(*) into grupo_n
      from public.app_tourney_ranked(p_season, liga_c, c.id) g;
    pos_reward := case when pos = 1 then public.app_rule_i('reward_pos_1')
                       when pos = 2 then public.app_rule_i('reward_pos_2')
                       when pos = 3 then public.app_rule_i('reward_pos_3')
                       when pos = 4 then public.app_rule_i('reward_pos_4')
                       when pos = 5 then public.app_rule_i('reward_pos_5')
                       else public.app_rule_i('reward_pos_else') end;
    liga_idx := array_position(liga_ord, liga_c);
    -- recompensa por USUÁRIO (anti-abuse: exige ao menos 1 partida válida;
    -- 150 = promoção REAL, não só posição)
    promovido := (pos <= 5 and grupo_n >= 6 and liga_idx < 6);
    for m in
      select cm.user_id, coalesce(t.runs_validas, 0) as runs
        from public.clan_members cm
        left join public.tournament_contributions t
          on t.user_id = cm.user_id and t.season_number = p_season
       where cm.clan_id = c.id
    loop
      if m.runs > 0 then
        rewards := jsonb_build_object(
          'participacao', case when m.runs >= public.app_rule_i('tourney_min_runs')
                               then public.app_rule_i('tourney_participacao') else 0 end,
          'posicao', pos_reward,
          'promocao', case when promovido then public.app_rule_i('reward_promocao') else 0 end);
        rewards := rewards || jsonb_build_object('total',
          (rewards ->> 'participacao')::int + (rewards ->> 'posicao')::int + (rewards ->> 'promocao')::int);
        insert into public.tournament_history
          (season_number, user_id, clan_id, posicao, liga, pontos, rewards)
        values (p_season, m.user_id, c.id, pos, liga_c, pontos, rewards)
        on conflict (season_number, user_id) do nothing;
        feitos := feitos + 1;
      end if;
    end loop;
    -- movimento de liga (só com o grupo >= 6 clãs; promoção vence rebaixamento)
    if grupo_n >= 6 then
      if promovido then
        update public.clans cl3 set liga = liga_ord[least(liga_idx + 1, 6)] where cl3.id = c.id;
      elsif pos >= grupo_n - 2 and liga_idx > 1 then
        update public.clans cl3 set liga = liga_ord[greatest(liga_idx - 1, 1)] where cl3.id = c.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'already', false, 'settled', feitos);
end;
$$;

create or replace function public.tournament_settle_last() returns jsonb
language sql security definer set search_path = public as $$
  select public.tournament_settle(public.app_season_number() - 1);
$$;

-- =========================================================
-- K. RPCs — partidas / ranking (3)
-- =========================================================

create or replace function public.submit_run(
  p_score int, p_seconds int, p_pickups int, p_combo_max int, p_level int,
  p_seed text, p_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles; score int; seconds int; pickups int; base int; bonus int := 0;
      best_prev int; run_id bigint; sn int; moedas int; p_clan text;
begin
  p := public.app_profile_row();
  pickups := greatest(0, coalesce(p_pickups, 0));
  seconds := greatest(0, coalesce(p_seconds, 0));
  score := greatest(0, coalesce(p_score, 0));
  if score > public.app_rule_i('run_max_score') then
    perform public.app_error('implausible', 'Pontuação fora do intervalo possível.');
  end if;
  if seconds < public.app_rule_i('run_min_seconds') then
    perform public.app_error('too-short', 'Partida curta demais para pontuar.');
  end if;
  if seconds > public.app_rule_i('run_max_seconds') then
    perform public.app_error('too-long', 'Partida longa demais para pontuar.');
  end if;
  -- Corrida do Dia: semente enviada tem que ser a de HOJE (servidor manda)
  if p_seed is not null and p_seed <> 'daily:' || public.app_daily_date() then
    perform public.app_error('invalid-seed', 'A semente não é a da corrida de hoje.');
  end if;

  -- espelho da economia local (ECONOMIA.md §6): cap 120 + bônus recorde/dia
  select coalesce(max(r.score), 0) into best_prev from public.runs r
   where r.user_id = p.id and r.valid;
  if best_prev > 0 and score > best_prev then
    bonus := bonus + public.app_rule_i('bonus_record');
  end if;
  if not exists (select 1 from public.runs r where r.user_id = p.id and r.valid
                 and r.created_at >= ((now() at time zone 'America/Sao_Paulo')::date)
                       ::timestamp at time zone 'America/Sao_Paulo') then
    bonus := bonus + public.app_rule_i('bonus_first_day');
  end if;
  base := least(public.app_rule_i('coin_run_cap'),
                floor(pickups * 0.5) + floor(score / 100) + floor(seconds / 10));
  moedas := base + bonus;

  sn := public.app_season_number();
  select m.clan_id into p_clan from public.clan_members m where m.user_id = p.id;
  insert into public.runs (user_id, score, seconds, pickups, combo_max, level, seed, version, week)
  values (p.id, score, seconds, coalesce(p_pickups, 0), coalesce(p_combo_max, 1),
          coalesce(p_level, 1), p_seed, p_version, sn)
  returning id into run_id;

  insert into public.tournament_contributions (season_number, user_id, clan_id, melhor_score, runs_validas)
  values (sn, p.id, p_clan, score, 1)
  on conflict (season_number, user_id) do update set
    melhor_score = greatest(public.tournament_contributions.melhor_score, excluded.melhor_score),
    runs_validas = public.tournament_contributions.runs_validas + 1,
    clan_id = excluded.clan_id;

  perform public.app_wallet_earn(p.id, moedas, 'partida', run_id::text);
  return jsonb_build_object('id', run_id, 'valid', true);
end;
$$;

create or replace function public.ranking_top(p_scope text, p_page int, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare janela interval; lim int; ofs int; out jsonb;
begin
  perform public.app_profile_row();
  janela := case when p_scope = 'weekly' then interval '7 days' else interval '100 years' end;
  lim := least(greatest(coalesce(p_limit, 10), 1), 50);
  ofs := greatest(coalesce(p_page, 0), 0) * lim;
  with best as (
    select distinct on (r.user_id) r.user_id, r.score, r.created_at
      from public.runs r
     where r.valid and r.created_at > now() - janela
     order by r.user_id, r.score desc, r.created_at desc
  ),
  ranked as (
    select b.user_id, b.score, b.created_at,
           row_number() over (order by b.score desc, b.created_at) as posicao
      from best b join public.profiles n on n.id = b.user_id and n.deleted_at is null
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'nick', n.nickname::text, 'tag', public.app_tag_snapshot(r.user_id), 'score', r.score,
        'at', (extract(epoch from r.created_at) * 1000)::bigint,
        'isMe', r.user_id = auth.uid(), 'posicao', r.posicao)
        order by r.posicao), '[]'::jsonb)
      from ranked r join public.profiles n on n.id = r.user_id
     where r.posicao > ofs and r.posicao <= ofs + lim),
    'total', (select count(*) from ranked),
    'myRank', (select r2.posicao from ranked r2 where r2.user_id = auth.uid()))
  into out;
  return out;
end;
$$;

create or replace function public.ranking_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'melhor', coalesce(max(r.score), 0),
    'partidas', count(*)::int)
  from public.runs r where r.user_id = auth.uid() and r.valid;
$$;

-- =========================================================
-- L. privilégios (SOCIAL.md §4): sem EXECUTE público; as RPCs só
--    para o papel autenticado; liquidação só para o service_role
--    (Edge Function) e para o dono (postgres).
-- =========================================================

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and (p.proname like 'app\_%' escape '\'
            or p.proname in (
              'profile_get', 'profile_recovery_code', 'profile_upsert', 'profile_recover', 'account_delete',
              'chat_online', 'chat_join', 'chat_history', 'chat_send', 'chat_report',
              'user_block', 'user_unblock', 'user_blocks',
              'clan_search', 'clan_get', 'clan_mine', 'clan_members', 'clan_create', 'clan_join',
              'clan_request', 'clan_outgoing', 'clan_invite', 'clan_requests', 'clan_accept',
              'clan_decline', 'clan_kick', 'clan_promote', 'clan_demote', 'clan_transfer',
              'clan_leave', 'clan_dissolve', 'clan_update',
              'tournament_current', 'tournament_group', 'tournament_my_contribution',
              'tournament_rewards', 'tournament_claim', 'daily_race',
              'submit_run', 'ranking_top', 'ranking_mine',
              'tournament_settle', 'tournament_settle_last'))
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;

  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and p.proname in (
              'profile_get', 'profile_recovery_code', 'profile_upsert', 'profile_recover', 'account_delete',
              'chat_online', 'chat_join', 'chat_history', 'chat_send', 'chat_report',
              'user_block', 'user_unblock', 'user_blocks',
              'clan_search', 'clan_get', 'clan_mine', 'clan_members', 'clan_create', 'clan_join',
              'clan_request', 'clan_outgoing', 'clan_invite', 'clan_requests', 'clan_accept',
              'clan_decline', 'clan_kick', 'clan_promote', 'clan_demote', 'clan_transfer',
              'clan_leave', 'clan_dissolve', 'clan_update',
              'tournament_current', 'tournament_group', 'tournament_my_contribution',
              'tournament_rewards', 'tournament_claim', 'daily_race',
              'submit_run', 'ranking_top', 'ranking_mine')
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and p.proname in ('tournament_settle', 'tournament_settle_last', 'app_chat_moderate')
  loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
