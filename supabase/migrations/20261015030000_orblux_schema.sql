/* =========================================================
   ORBLUX — Fase 6 (camada social): ESQUEMA
   Tabelas + índices + triggers + RLS (leitura mínima).

   • Nenhuma política de ESCRITA para o cliente: toda escrita
     acontece em funções SECURITY DEFINER (migração ..._functions).
   • chat_messages tem política de SELECT (necessária para o
     Realtime entregar as mensagens ao assinante).
   • Servidor é a fonte da verdade (SOCIAL.md §0.2, §3).

   Como aplicar: ver supabase/README.md (supabase db push ou SQL Editor).
   ========================================================= */

-- extensões (relocatable; criadas no public para os tipos/funções
-- resolverem sem schema prefixado — search_path das funções = public)
create extension if not exists citext with schema public;
create extension if not exists unaccent with schema public;
create extension if not exists pgcrypto with schema public;

-- =========================================================
-- 1. Tabelas (SOCIAL.md §3)
-- =========================================================

-- perfil anônimo (uid = auth.users.id). O código de recuperação fica em
-- TEXTO PURO de propósito: a UI "Mostrar código" exige devolvê-lo (mesma
-- semântica do mock em localStorage); conta anônima, sem PII além do apelido.
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on update cascade,
  nickname        citext not null unique,
  skin_id         text,
  country         text check (country is null or country ~ '^[A-Z]{2}$'),
  age_band        text check (age_band is null or age_band in ('menor13', '13a17', '18+')),
  terms_version   text,
  terms_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,               -- anonimização (exclusão de conta)
  banned_until    timestamptz,
  muted_until     timestamptz,
  clan_wait_until timestamptz,               -- espera 24 h ao trocar de clã (CLAN.SWITCH_WAIT_H)
  recovery_code   text unique check (recovery_code is null or recovery_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$')
);

create table if not exists public.clans (
  id          text primary key default ('clan_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  nome        citext not null unique,
  tag         citext not null unique,
  descricao   text not null default '',
  tipo        text not null default 'aberto' check (tipo in ('aberto', 'solicitacao', 'convite')),
  emblema     jsonb not null default '{}'::jsonb,
  pais        text not null default 'BR' check (pais ~ '^[A-Z]{2}$'),
  liga        text not null default 'Bronze'
              check (liga in ('Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lenda')),
  lider_id    uuid references public.profiles (id) on delete set null on update cascade,
  nivel       int not null default 1,
  xp          int not null default 0,
  trofeus     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- unicidade por minúsculas (case-insensitive); acentos são conferidos
-- na função app_normalize do RPC (servidor manda; ver migração _functions)
create unique index if not exists clans_nome_lower_uq on public.clans (lower(nome::text));

create table if not exists public.clan_members (
  clan_id      text not null references public.clans (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade on update cascade,
  papel        text not null default 'membro' check (papel in ('lider', 'vice', 'membro')),
  contribuicao int not null default 0,
  ultimo_dia   bigint not null default 0,    -- espelho do mock (ms epoch)
  created_at   timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists clan_members_user_idx on public.clan_members (user_id);

-- fila de solicitações: recebidas pelo meu clã (clan_id = meu) e as que EU
-- enviei (user_id = eu) — cobre requests() e outgoingRequests() do cliente.
create table if not exists public.clan_requests (
  clan_id    text not null references public.clans (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists clan_requests_user_idx on public.clan_requests (user_id);

-- convites recebidos (um líder convida um jogador)
create table if not exists public.clan_invites (
  clan_id    text not null references public.clans (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists clan_invites_user_idx on public.clan_invites (user_id);

create table if not exists public.runs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade on update cascade,
  score      int not null check (score >= 0),
  seconds    int not null check (seconds >= 0),
  pickups    int not null default 0,
  combo_max  int not null default 0,
  level      int not null default 0,
  seed       text,
  version    text,
  week       int,                            -- nº da temporada na submissão
  valid      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists runs_user_at_idx on public.runs (user_id, created_at);
create index if not exists runs_at_idx on public.runs (created_at);
create index if not exists runs_seed_idx on public.runs (seed);

create table if not exists public.chat_rooms (
  room       text primary key,
  occupancy  int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id            bigint generated always as identity primary key,
  room          text not null,
  user_id       uuid not null references public.profiles (id) on delete cascade on update cascade,
  nick_snapshot text not null,
  tag_snapshot  text,
  text          varchar(200) not null,       -- CHAT.MAX_LEN (também validado no RPC)
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room, id);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id);

create table if not exists public.chat_reports (
  id          bigint generated always as identity primary key,
  message_id  bigint not null references public.chat_messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade on update cascade,
  reason      text not null default 'outro',
  acted       boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (message_id, reporter_id)           -- 1 denúncia por usuário/mensagem (3 DISTINCTAS ocultam)
);
create index if not exists chat_reports_msg_idx on public.chat_reports (message_id);

create table if not exists public.user_blocks (
  user_id       uuid not null references public.profiles (id) on delete cascade on update cascade,
  blocked_id    uuid not null,
  nick_snapshot text not null,               -- apelido congelado (lista permanece legível)
  created_at    timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

create table if not exists public.tournament_seasons (
  number    int primary key,                 -- nº da temporada (seg. 00:00 BRT; ver funções)
  starts_at timestamptz not null,
  ends_at   timestamptz not null
);
-- a LIGA é do clã, não da temporada (ver SOCIAL.md §3 — ajuste registrado na Fase 6)

create table if not exists public.tournament_contributions (
  season_number int not null,
  user_id       uuid not null references public.profiles (id) on delete cascade on update cascade,
  clan_id       text references public.clans (id) on delete set null,
  melhor_score  int not null default 0,
  runs_validas  int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (season_number, user_id)
);
create index if not exists tourney_contrib_clan_idx
  on public.tournament_contributions (season_number, clan_id);

create table if not exists public.tournament_history (
  season_number int not null,
  user_id       uuid not null references public.profiles (id) on delete cascade on update cascade,
  clan_id       text references public.clans (id) on delete set null,
  posicao       int,
  liga          text not null default 'Bronze',
  pontos        int not null default 0,
  rewards       jsonb not null,              -- {participacao, posicao, promocao, total}
  claimed       boolean not null default false,
  at            timestamptz not null default now(),
  primary key (season_number, user_id)       -- índice único ⇒ 1 recompensa por usuário/temporada
);
create index if not exists tourney_history_user_idx on public.tournament_history (user_id);

-- carteira do SERVIDOR (saldo social: criar clã, prêmios de torneio).
-- A carteira LOCAL do jogador continua em localStorage (ECONOMIA.md §0);
-- aqui o servidor é a fonte da verdade para o que exige servidor.
create table if not exists public.server_wallets (
  user_id    uuid primary key references public.profiles (id) on delete cascade on update cascade,
  balance    int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- ledger idempotente: unique (user, reason, ref) ⇒ 1 crédito/débito por evento
create table if not exists public.coin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade on update cascade,
  amount     int not null,                   -- sinal (+ ganho, − gasto)
  reason     text not null,                  -- 'partida' | 'torneio' | 'cla' | 'ajuste'
  ref        text not null,
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create index if not exists coin_ledger_user_idx on public.coin_ledger (user_id);

-- fila de revisão do dono (decisão §8.5: automação + revisão humana)
create table if not exists public.moderation_log (
  id             bigint generated always as identity primary key,
  action         text not null check (action in ('hide', 'mute', 'ban', 'warn')),
  target_user_id uuid references public.profiles (id) on delete set null on update cascade,
  message_id     bigint references public.chat_messages (id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists moderation_log_target_idx on public.moderation_log (target_user_id);

-- =========================================================
-- 2. Sementes de regras (espelho cliente — testado em
--    tests/backend-parity.test.mjs contra net/rules.js)
-- =========================================================

create table if not exists public.app_rules (
  k text primary key,
  v text not null
);

insert into public.app_rules (k, v) values
  ('chat_max_len', '200'),
  ('chat_cooldown_ms', '2000'),
  ('chat_per_min', '15'),
  ('chat_dup_ms', '30000'),
  ('chat_history_limit', '50'),
  ('chat_retention_hours', '24'),
  ('chat_max_per_room', '500'),
  ('chat_shard_size', '100'),
  ('chat_reports_hide', '3'),
  ('mute_hours', '24'),
  ('clan_max_members', '30'),
  ('clan_name_min', '3'),
  ('clan_name_max', '20'),
  ('clan_tag_min', '3'),
  ('clan_tag_max', '4'),
  ('clan_switch_wait_h', '24'),
  ('clan_create_cost', '500'),
  ('run_max_score', '200000'),
  ('run_min_seconds', '10'),
  ('run_max_seconds', '7200'),
  ('nick_min', '3'),
  ('nick_max', '12'),
  ('coin_run_cap', '120'),
  ('bonus_record', '15'),
  ('bonus_first_day', '10'),
  ('tourney_participacao', '50'),
  ('tourney_group_size', '8'),
  ('tourney_ligas', '6'),
  ('tourney_min_runs', '3'),
  ('reward_pos_1', '300'),
  ('reward_pos_2', '220'),
  ('reward_pos_3', '160'),
  ('reward_pos_4', '120'),
  ('reward_pos_5', '90'),
  ('reward_pos_else', '40'),
  ('reward_promocao', '150'),
  ('daily_prefix', 'daily:')
on conflict (k) do update set v = excluded.v;

-- paleta/ícones/molduras de emblema: elenco fechado (decisão Fase 4)
create table if not exists public.clan_colors (
  hex text primary key,
  ord int not null
);
insert into public.clan_colors (hex, ord) values
  ('#22e6ff', 0), ('#7cff6b', 1), ('#ffd166', 2), ('#ff6bd6', 3),
  ('#b98cff', 4), ('#ff8f5e', 5), ('#5ea2ff', 6), ('#f2f6ff', 7)
on conflict (hex) do nothing;

create table if not exists public.clan_icons (
  icon int primary key,
  name text not null
);
insert into public.clan_icons (icon, name) values
  (0, 'play'), (1, 'trophy'), (2, 'medal'), (3, 'shield'),
  (4, 'bolt'), (5, 'heart'), (6, 'flame'), (7, 'pulse')
on conflict (icon) do nothing;

create table if not exists public.clan_frames (
  frame int primary key
);
insert into public.clan_frames (frame) values (0), (1), (2), (3) on conflict do nothing;

create table if not exists public.reserved_words (
  word text primary key
);
insert into public.reserved_words (word) values
  ('adm'), ('admin'), ('moderador'), ('mod'), ('staff'),
  ('suporte'), ('oficial'), ('orblux'), ('google'), ('play')
on conflict do nothing;

-- catálogo de chat rápido (menores de 13 só usam isto)
create table if not exists public.quick_phrases (
  value text primary key
);
insert into public.quick_phrases (value) values
  ('GG!'), ('Boa!'), ('Vamos jogar?'), ('Boa partida!'), ('Nossa!'),
  ('Até a próxima!'), ('Valeu!'), ('Boa sorte!'), ('Que jogo!'), ('Legal!')
on conflict do nothing;

create table if not exists public.quick_emojis (
  value text primary key
);
insert into public.quick_emojis (value) values
  ('👍'), ('🎉'), ('⚡'), ('🔥'), ('✨'),
  ('💜'), ('🏆'), ('🙌'), ('😃'), ('🌍')
on conflict do nothing;

-- palavrões: MESMA lista de js/core/badwords.js (paridade garantida por teste;
-- a normalização acontece na carga — app_normalize é criada na migração seguinte)
create table if not exists public.bad_words (
  word text primary key
);
insert into public.bad_words (word) values
  ('caralho'), ('caralhudo'), ('porra'), ('puta'), ('puto'), ('putaria'),
  ('buceta'), ('boceta'), ('xoxota'), ('cuzao'), ('cuzinho'), ('cu'), ('pau no cu'),
  ('merda'), ('merdinha'), ('bosta'), ('bostada'), ('cagada'),
  ('foda-se'), ('fodase'), ('foder'), ('fudido'), ('fuder'), ('transar'),
  ('punheta'), ('gozado'), ('gozar'), ('chupa'), ('chupar'), ('penis'), ('vagina'),
  ('pqp'), ('vsf'), ('vtnc'), ('fdp'), ('krl'), ('ctputa'),
  ('otario'), ('otaria'), ('arrombado'), ('arrombada'), ('idiota'), ('imbecil'),
  ('babaca'), ('escroto'), ('escrota'), ('corno'), ('cornudo'), ('broxa'),
  ('sapatao'), ('sapatona'), ('veado'), ('viado'), ('viadao'), ('bicha'),
  ('macaco'), ('macaca')
on conflict do nothing;

-- =========================================================
-- 3. Triggers (updated_at)
-- =========================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_clans_touch on public.clans;
create trigger trg_clans_touch before update on public.clans
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_wallets_touch on public.server_wallets;
create trigger trg_wallets_touch before update on public.server_wallets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_rooms_touch on public.chat_rooms;
create trigger trg_rooms_touch before update on public.chat_rooms
  for each row execute function public.touch_updated_at();

-- =========================================================
-- 4. RLS: habilitado em tudo; ESCRITA só via RPC (definer).
--    Única política direta = leitura de chat_messages (Realtime).
-- =========================================================

alter table public.profiles enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_requests enable row level security;
alter table public.clan_invites enable row level security;
alter table public.runs enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.tournament_seasons enable row level security;
alter table public.tournament_contributions enable row level security;
alter table public.tournament_history enable row level security;
alter table public.server_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.moderation_log enable row level security;
alter table public.app_rules enable row level security;
alter table public.clan_colors enable row level security;
alter table public.clan_icons enable row level security;
alter table public.clan_frames enable row level security;
alter table public.reserved_words enable row level security;
alter table public.quick_phrases enable row level security;
alter table public.quick_emojis enable row level security;
alter table public.bad_words enable row level security;

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using (true);
