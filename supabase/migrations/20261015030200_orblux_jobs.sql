/* =========================================================
   ORBLUX — Fase 6: AGENDAMENTO (pg_cron + pg_net + Vault)
   Documentação oficial consultada em 15/10/2026:
   - https://supabase.com/docs/guides/functions/schedule-functions
     (pg_cron + pg_net chamando Edge Functions; segredos no Vault)
   - https://supabase.com/docs/guides/database/extensions/pg_net
     (create extension pg_net with schema "extensions"; net.http_post)
   - https://supabase.com/docs/guides/cron
     (cron.schedule(nome, 'min hora dia mes dow', comando))
   - https://supabase.com/docs/guides/database/postgres/row-level-security
     (grants + RLS; chat_messages mantém só o SELECT p/ Realtime)

   O QUE ESTE ARQUIVO CRIA
   1. extensões pg_cron e pg_net (se ainda não houver);
   2. publicação Realtime com chat_messages (mensagens ao vivo);
   3. 4 jobs — todos re-agendáveis com segurança (idempotentes):
      • orblux-chat-cleanup    */15 min  limpa mensagens > 24 h (CHAT.RETENTION_HOURS)
      • orblux-queue-expire    04:20 UTC expira pedidos/convites de clã > 7 dias
      • orblux-chat-moderation */5 min   chama Edge Function chat-moderation
      • orblux-tournament-roll 03:03 UTC segunda (00:03 BRT) chama Edge Function
                                tournament-rollover (liquida a temporada anterior)

   SEGREDOS (criados UMA vez no Dashboard/SQL Editor — nunca no git):
      select vault.create_secret('https://<REF>.supabase.co', 'orblux_project_url');
      select vault.create_secret('<chave de serviço>', 'orblux_edge_service_key');
   Sem eles os jobs HTTP ficam parados (o comando verifica antes de chamar)
   e a migração emite um NOTICE lembrando o passo.
   ========================================================= */

-- ---------------------------------------------------------
-- 1. extensões
-- ---------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_cron;                       -- objetos em cron.* (docs usam cron.schedule)
create extension if not exists pg_net with schema extensions; -- objetos em net.* (doc oficial)

-- ---------------------------------------------------------
-- 2. Realtime: chat_messages publicado (exigência da política
--    de SELECT da migração 0001 — o Realtime lê como authenticated)
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 3. agendador: localiza cron.schedule dinamicamente (o schema
--    do pg_cron varia entre instalações) e reagenda sem duplicar
-- ---------------------------------------------------------
create or replace function public.app_schedule_job(p_nome text, p_spec text, p_cmd text)
returns void language plpgsql security definer set search_path = public as $$
declare sch text;
begin
  select n.nspname into sch
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'schedule'
     and pg_get_function_identity_arguments(p.oid) = 'text, text, text'
   limit 1;
  if sch is null then
    raise exception 'pg_cron indisponível|Habilite a extensão pg_cron (Dashboard > Database > Extensions).';
  end if;
  begin
    execute format('select %I.unschedule(%L)', sch, p_nome);   -- some se já existir
  exception when others then null;                              -- primeiro agendamento
  end;
  execute format('select %I.schedule(%L, %L, %L)', sch, p_nome, p_spec, p_cmd);
end;
$$;
revoke execute on function public.app_schedule_job(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 4. jobs de SQL puro (sem HTTP)
-- ---------------------------------------------------------

-- retenção do chat: CHAT.RETENTION_HOURS = 24 h (net/rules.js)
select public.app_schedule_job(
  'orblux-chat-cleanup',
  '*/15 * * * *',
  $$delete from public.chat_messages where created_at < now() - interval '24 hours'$$);

-- pedidos/convites de clã velhos (7 dias) — fila não envelhece para sempre
select public.app_schedule_job(
  'orblux-queue-expire',
  '20 4 * * *',
  $$select public.app_expire_queues()$$);

-- ---------------------------------------------------------
-- 5. jobs HTTP (pg_net → Edge Functions) — guardados: só chamam
--    quando os segredos do Vault existem (ver cabeçalho)
-- ---------------------------------------------------------
do $do$
declare tem_vault boolean := to_regnamespace('vault') is not null;
          tem_url boolean := false; tem_chave boolean := false;
begin
  if tem_vault then
    select exists (select 1 from vault.decrypted_secrets
                    where name = 'orblux_project_url' and coalesce(decrypted_secret, '') <> '') into tem_url;
    select exists (select 1 from vault.decrypted_secrets
                    where name = 'orblux_edge_service_key' and coalesce(decrypted_secret, '') <> '') into tem_chave;
  end if;
  if not (tem_url and tem_chave) then
    raise notice 'ORBLUX: segredos do Vault ausentes — jobs HTTP adiados. Rode o passo 3 de supabase/README.md (vault.create_secret para orblux_project_url e orblux_edge_service_key).';
    return;
  end if;

  perform public.app_schedule_job(
    'orblux-chat-moderation',
    '*/5 * * * *',
    $$select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_project_url')
               || '/functions/v1/chat-moderation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_edge_service_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_edge_service_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000)$$);

  -- segunda 03:03 UTC = 00:03 BRT — liquida a temporada que acabou
  perform public.app_schedule_job(
    'orblux-tournament-roll',
    '3 3 * * 1',
    $$select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_project_url')
               || '/functions/v1/tournament-rollover',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_edge_service_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'orblux_edge_service_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)$$);
end;
$do$;

-- a função de agendar é só infraestrutura: dono/superuser (cron jobs
-- rodam como quem agendou = postgres); sem acesso de cliente
drop function if exists public.app_schedule_job(text, text, text);
