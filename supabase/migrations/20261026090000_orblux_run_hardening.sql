-- =========================================================
--  Auditoria 26/10/2026 (branch audit/orblux-full) —
--  ENDURECIMENTO de submit_run + política do chat.
--
--  Problemas cobertos (docs/REVISAO_COMPLETA.md S1 e S2):
--  1. submit_run validava só o teto ABSOLUTO de pontos
--     (run_max_score) — aceitava 199.999 pts em 10 s.
--     Agora há teto de pontos POR TEMPO (run_max_pps +
--     slack) e INTERVALO MÍNIMO entre envios por usuário
--     (run_submit_gap_s) — o relógio é o do SERVIDOR.
--  2. A política de SELECT de chat_messages era USING (true):
--     qualquer sessão autenticada lia via REST as mensagens
--     ocultadas pela moderação (hidden) e furava o filtro de
--     bloqueio da RPC chat_history. Apertada para
--     USING (not hidden) — o Realtime continua entregando
--     INSERTs novos (hidden = false).
--
--  Idempotente: create or replace + drop policy if exists.
--  NÃO concede privilégio novo (nenhum grant no arquivo) e
--  NÃO toca em determinismo/spawner (camada de servidor).
--  Espelho cliente (net/rules.js RUN) permanece intocado de
--  propósito: só evita envios impossíveis no mock; quem
--  decide é o servidor. Teste: tests/run-hardening.test.mjs.
-- =========================================================

-- réguas novas (espelho documentado em net/rules.js RUN no relatório)
insert into public.app_rules (k, v) values
  ('run_max_pps', '3000'),        -- teto de pontos por segundo da partida
  ('run_pps_slack', '10000'),     -- folga de arranque (segundos × pps + slack)
  ('run_submit_gap_s', '7')       -- segundos mínimos entre 2 envios (relógio do servidor; 7 < ~8s do ciclo mínimo reviver legítimo)
on conflict (k) do update set v = excluded.v;

-- =========================================================
-- submit_run — recriada com as duas checagens novas
-- (mesma assinatura: privilégios existentes persistem)
-- =========================================================
create or replace function public.submit_run(
  p_score int, p_seconds int, p_pickups int, p_combo_max int, p_level int,
  p_seed text, p_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles; score int; seconds int; pickups int; base int; bonus int := 0;
      best_prev int; run_id bigint; sn int; moedas int; p_clan text;
      last_at timestamptz;
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

  -- NOVO (auditoria): pontos POR TEMPO — ninguém marca mais que
  -- run_max_pps por segundo (+ slack de arranque). Mata o
  -- "score máximo em partida mínima".
  if score > seconds * public.app_rule_i('run_max_pps')
               + public.app_rule_i('run_pps_slack') then
    perform public.app_error('implausible', 'Pontuação fora do intervalo possível.');
  end if;

  -- NOVO (auditoria): rate limit por usuário no RELÓGIO DO SERVIDOR
  -- (o campo seconds é do cliente e não prova tempo decorrido).
  -- 7 s < ciclo mínimo do fluxo legítimo com reviver (anúncio 5 s +
  -- invuln 2,6 s + nova morte ≈ 8 s) — quem joga de verdade nunca
  -- esbarra; quem spamma envio cai aqui.
  select max(r.created_at) into last_at from public.runs r where r.user_id = p.id;
  if last_at is not null
     and now() - last_at < make_interval(secs => public.app_rule_i('run_submit_gap_s')) then
    perform public.app_error('rate_limit', 'Espere um instante antes de enviar de novo.');
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

-- =========================================================
-- política do chat: sem mudar a assinatura nem a interface.
-- O cliente lê SÓ por chat_history (RLS ignorada — definer);
-- a política fica para o Realtime (INSERT novo = hidden false).
-- =========================================================
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using (not hidden);
