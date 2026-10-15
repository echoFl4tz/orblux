# ORBLUX — camada social no Supabase (Fase 6)

Guia de implantação. **Nenhuma chave entra neste repositório** — nem aqui,
nem nas Edge Functions (o runtime injeta) nem no cliente (`net/config.js`
fica vazio; a configuração real é feita por você, fora do git).

Docs oficiais consultadas em **15/10/2026** (detalhe em `SOCIAL.md` §9):

- RLS — https://supabase.com/docs/guides/database/postgres/row-level-security
- Agendar Edge Functions — https://supabase.com/docs/guides/functions/schedule-functions
- pg_net — https://supabase.com/docs/guides/database/extensions/pg_net
- Cron (pg_cron) — https://supabase.com/docs/guides/cron
- Segredos de Edge Function — https://supabase.com/docs/guides/functions/secrets

## O que existe aqui

| Caminho | Papel |
| --- | --- |
| `migrations/20261015030000_orblux_schema.sql` | tabelas, índices, seeds (réguas de `net/rules.js`), RLS |
| `migrations/20261015030100_orblux_functions.sql` | 41 RPCs + helpers (toda leitura/escrita do cliente) |
| `migrations/20261015030200_orblux_jobs.sql` | pg_cron + pg_net + publicação Realtime |
| `functions/chat-moderation/` | mute automático p/ 3 denúncias (a cada 5 min) |
| `functions/tournament-rollover/` | liquida a temporada (seg. 00:03 BRT) |

## Passo a passo

1. **Projeto**: crie um projeto em https://supabase.com (plano free ativo —
   ver `SOCIAL.md` §8) e anote o *project ref*.

2. **Extensões** (Dashboard → Database → Extensions): habilite `pg_cron` e
   `pg_net`. (A migração 0003 também tenta criá-las; se o painel já as tiver,
   tudo bem — `if not exists` não duplica.)

3. **Segredos do agendador** (SQL Editor, RODAR UMA VEZ):

   ```sql
   select vault.create_secret('https://SEU-REF.supabase.co', 'orblux_project_url');
   select vault.create_secret('COLE_A_CHAVE_DE_SERVICO', 'orblux_edge_service_key');
   ```

   A chave de serviço fica só no Vault (não aparece em log nem no git).

4. **Migrações**, na ordem do nome do arquivo:
   `supabase db push` — ou cole os 3 arquivos no SQL Editor, um por vez.
   A 0003 é **idempotente**: se você rodá-la antes de criar os segredos, ela
   só avisa (`NOTICE`) — rode-a de novo depois do passo 3 para agendar os
   jobs HTTP.

5. **Edge Functions** (sem chaves no comando — elas são injetadas):

   ```bash
   supabase functions deploy chat-moderation tournament-rollover
   ```

6. **Cliente**: preencha `net/config.js` com a URL e a chave *publishable*
   (fora do git, ou aceitando o risco dela ser pública — ela é a chave de
   leitura do navegador; RLS + RPC revogadas protegem os dados).

7. **Conferência** (SQL Editor):

   ```sql
   select jobname, schedule from cron.job order by jobname;      -- 4 jobs
   select * from vault.decrypted_secrets where name like 'orblux_%';
   select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages';
   ```

## Regras de ouro

- Servidor é a fonte da verdade: o cliente só chama RPCs (nada de INSERT
  direto — não existe política de escrita; ver migração 0001).
- `revoke` de EXECUTE é por função: qualquer RPC nova tem que entrar nas
  listas do bloco final da migração 0002 (testado em
  `tests/backend-parity.test.mjs`).
- Nunca commite `.env`, chaves, `service_role` ou URL real de projeto.
- A economia de jogabilidade NÃO usa o servidor: carteira local continua
  sendo a verdade do jogador (ver `ECONOMIA.md`); o ledger do servidor só
  cobre clã/torneio.

## Moderação manual (revisão do dono — decisão §8.5)

A fila fica em `moderation_log`. Para contestações/banimentos manuais:

```sql
-- ver os casos recentes
select * from moderation_log order by created_at desc limit 20;
-- banir (horas) um usuário que repetiu ofensa
update profiles set banned_until = now() + interval '72 hours' where id = '...';
```
