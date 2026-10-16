-- =========================================================
--  Fase 2 (melhorias): réguas de PONTUAÇÃO da partida
--  Espelho de net/rules.js (SCORE) — near miss + ondas.
--  Idempotente: sobrescreve com o valor canônico caso a
--  migração 0001 tenha publicado uma versão anterior.
--  Paridade testada em tests/backend-parity.test.mjs.
-- =========================================================

insert into public.app_rules (k, v) values
  ('score_pickup', '10'),
  ('score_near_miss', '15'),
  ('wave_seconds', '20'),
  ('wave_bonus', '10'),
  ('wave_bonus_max', '30'),
  ('score_max_mult', '5'),
  ('score_x2_factor', '2')
on conflict (k) do update set v = excluded.v;
