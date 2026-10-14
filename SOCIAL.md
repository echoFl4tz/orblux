# ORBLUX — Camada SOCIAL ONLINE (Supabase)

> **Documento vivo.** Fase 0 concluída em 14/10/2026. Este documento manda sobre
> qualquer instrução avulsa em caso de conflito. Cada fase só começa com a
> aprovação da anterior. Links consultados com data na seção 9.

## 0. Regras inegociáveis (do projeto)

1. O jogo é **100% jogável offline**. Online degrada com elegância: erro com
   "Tentar de novo", **nunca** trava, perde progresso ou atrasa a 1ª partida.
2. **O servidor é a fonte da verdade**: regras como RLS + funções SQL; nunca
   confiar no cliente (o mock em `net/api.js` existe para testar UI, não para
   valer).
3. Segurança/UGC primeiro: termos antes de criar UGC, denúncia, bloqueio,
   moderação, exclusão de conta, proteção de menores (faixa de idade).
4. **Sem pay-to-win**: recompensas sociais só moedas/estéticas (moedas nunca se
   compram — `ECONOMIA.md` §0).
5. pt-BR na interface, sem emojis de interface, texto da rede via `textContent`
   (nunca `innerHTML` sem escape).
6. Sem libs novas além de `@supabase/supabase-js` (UMD **pinado ≥14 dias**,
   arquivo local em `vendor/`, sem CDN em runtime) ou `fetch`/WebSocket puros.
7. **Nunca commitar chaves secretas**: a chave `anon` é pública por design e só
   ela vai ao cliente; `service_role` existe **somente** no ambiente das Edge
   Functions (`.env` local ignorado pelo git — `.gitignore` criado na Fase 0).

## 1. Mapa das fases (após aprovação de cada uma)

| Fase | Entrega |
|------|---------|
| **0 (esta)** | `SOCIAL.md`, `net/` (flags, rng, rules, config, api), spawner com rng injetável, testes de determinismo + contrato do mock |
| 1 | Conta social: 1ª entrada social, faixa de idade, termos de Uso da Comunidade, apelido/skin/país, código de recuperação, **exclusão de conta** |
| 2 | Ranking global + `submit_run` anti-trapaça (validação plausibilidade no servidor); mantém ranking local como fallback |
| 3 | Chat global (salas/shards, realtime, denúncia, bloqueio, moderação) |
| 4 | Clãs (criar com moedas, entrada, cargos, elenco de emblema) |
| 5 | Torneios de clãs + **Corrida do Dia** com semente única (`net/rng.js` + `setSpawnerRng`) |
| 6 | Integração economia/rede + segurança (mutirão/raid no servidor) |
| 7 | Conformidade/loja (Data Safety, UGC, exclusão de conta, termos) |
| 8 | Testes finais e auditoria |

## 2. Arquitetura do cliente (`pulso-neon/net/`)

```
UI (fases 1..5) ──► net/api.js ──► SupabaseProvider ──► backend real (RPC/tables)
                       │        └─► MockProvider ──► localStorage (servidor de mentira)
                       └─► NullProvider ──► SocialError('disabled') (degradação)
```

- **`net/api.js`** — UMA interface com grupos `auth · profile · chat · clans ·
  tournaments · ranking`. Todos os métodos são assíncronos e rejeitam com
  `SocialError` de `.code` estável (`offline`, `network`, `rate_limit`,
  `blocked_word`, `quick_only`, `switch_wait`, `already_claimed`, `disabled`…).
  - **MockProvider**: simula latência (40–220 ms), falhas (`__setFailNext`,
    `__setOffline`), mensagens de outros jogadores (bots), clãs fake (12),
    ranking fake (40 linhas), temporada semanal com **rollover** automático e
    `__rollover()` de teste; persiste em `pn_social_mock`. É o provedor padrão
    em localhost/`?mock=1`.
  - **SupabaseProvider**: `signInAnonymously()` real; demais grupos mapeiam
    para as RPCs planejadas (§4), com canal Realtime por sala
    (`chat.subscribe(room)`). UMD carregado sob demanda de
    `vendor/supabase-js/` — o bundle normal **não** carrega rede social.
- **`net/flags.js`** — flags `SOCIAL_ENABLED, CHAT_ENABLED, CLANS_ENABLED,
  TOURNAMENTS_ENABLED, GLOBAL_RANKING_ENABLED, TOURNAMENT_FLASH` — **todas
  desligadas por padrão**; quem liga é o dono do projeto. `?social=1` só vale
  em localhost. Override: `localStorage pn_social_flags`.
- **`net/rules.js`** — regras puras (limites de chat, frases prontas,
  normalização anti-burla, validação de nome/tag de clã). Espelho cliente/mock;
  no servidor real a mesma régua vira SQL/Edge Function.
- **`net/rng.js`** — `mulberry32` + `hashSeed` (FNV-1a): semente determinística
  p/ a Corrida do Dia (Fase 5). **Não criptográfico.**
- **`js/game/spawner.js` + `entities.js`** — aceitam rng injetável
  (`setSpawnerRng(mulberry32(seed))`); padrão `Math.random` inalterado.
  Testado: mesma semente ⇒ sequência **idêntica** de obstáculos, pulsos e
  power-ups (`tests/rng.test.mjs`).

## 3. Plano de dados (backend real — implementado nas fases 1..5)

Tabelas (todas com RLS):

| Tabela | Colunas principais | Fase |
|--------|--------------------|------|
| `profiles` | `id uuid pk = auth.users.id`, `nickname citext unique`, `skin_id`, `country char(2)`, `age_band text check in ('menor13','13a17','18+')`, `terms_version`, `created_at`, `deleted_at` (anonimização), `banned_until`, `muted_until` | 1 |
| `clans` | `id`, `nome unique`, `tag unique`, `descricao`, `tipo in (aberto,solicitacao,convite)`, `emblema jsonb`, `nivel`, `xp`, `trofeus`, `lider_id`, `created_at` | 4 |
| `clan_members` | `clan_id`, `user_id`, `papel in (lider,vice,membro)`, `contribuicao`, `ultimo_dia`, pk composta | 4 |
| `clan_requests` / `clan_invites` | fila de entrada | 4 |
| `runs` | `id`, `user_id`, `score`, `seconds`, `pickups`, `combo_max`, `level`, `seed text null`, `version`, `week int`, `created_at`, `valid bool` | 2, 5 |
| `chat_rooms` | `room text pk` (`global:pt-BR:<n>`), `occupancy int` | 3 |
| `chat_messages` | `id bigint`, `room`, `user_id`, `nick_snapshot`, `tag_snapshot`, `text` (≤200), `created_at` (retenção 24 h via pg_cron) | 3 |
| `chat_reports` | `message_id`, `reporter_id`, `reason`, `created_at` (3 denúncias distintas ⇒ `hidden`) | 3 |
| `user_blocks` | `user_id`, `blocked_id` | 3 |
| `tournament_seasons` | `number pk`, `starts_at`, `ends_at`, `liga` | 5 |
| `tournament_contributions` | `season_id`, `clan_id`, `melhor_score`, `runs_validas` | 5 |
| `tournament_history` | `season_id`, `clan_id`, `posicao`, `rewards jsonb`, `claimed bool` (índice único ⇒ recompensa **uma vez só**) | 5 |
| `leaderboard_week` | view materializada por semana (`week`, `user_id`, `best_score`) | 2 |

Princípios: `updated_at` com trigger; tudo validado em função; **nenhuma
política de escrita para `anon` direta** — só `security definer` functions com
validação; índices em `runs(week)`, `chat_messages(room, created_at desc)`,
`clan_members(user_id)`.

## 4. Backend planejado (RPCs / Edge Functions / pg_cron)

- **RPCs (`security definer`)**: `profile_get/upsert/recover`,
  `account_delete` (anonimiza + apaga UGC — exigência Play §7),
  `submit_run` (valida plausibilidade: score ≤ 200 000, seconds ≥ 10, version
  conhecida; 120 moedas creditadas **no servidor** via ledger idempotente),
  `ranking_top(scope,page,limit)`, `ranking_mine`,
  `chat_send` (limites de `net/rules.js` em SQL + mute/ban), `chat_history`,
  `chat_report`, `user_block/unblock/blocks`,
  `clan_search/get/mine/members/create/join/request/invite/accept/decline/kick/
  promote/demote/transfer/leave/dissolve/update`,
  `tournament_current/group/my_contribution/rewards/claim` (claim idempotente).
- **Edge Functions** (service_role aqui, nunca no cliente): `chat-moderation`
  (fila de denúncias + mute/ban), `tournament-rollover` (segunda 00:03 BRT,
  grava `tournament_history` e recompensas), `season-claim`.
- **pg_cron**: limpeza de `chat_messages` > 24 h (a cada 15 min) e expiração de
  convites/requisições (diária). `cron.schedule` documentado em
  supabase.com/docs/guides/cron (consultado 14/10/2026).

## 5. Limites REAIS do plano gratuito (Supabase), consultados em 14/10/2026

Fonte: supabase.com/pricing e docs de limites (link §9).

| Recurso | Free | Impacto no ORBLUX |
|---------|------|-------------------|
| Banco | 500 MB (1 GB no free novo) | mensagens 24 h + runs: folga enorme p/ milhares de jogadores |
| Usuários ativos/mês | 50 000 MAU | auth anônima conta como MAU |
| Egress | 5 GB/mês | chat é o maior consumidor |
| Realtime | 200 conexões simultâneas, 100 mensagens/s, 2 M mensagens/mês | **shards de 100** por sala (`CHAT.SHARD_SIZE`); acima disso, subir plano |
| Edge Functions | 500 000 invocações/mês, 100 funções, 150 s wall/2 s CPU, 256 MB | rollover/moderação: folga |
| Storage | 1 GB | não usado hoje (emblemas são jsonb) |
| **Inatividade** | projeto **pausa após 1 semana sem uso** | risco real: manter vivo com um ping semanal (pg_cron não conta como uso) — decisão na Fase 1 |
| Projetos ativos | 2 | — |

**Custo esperado:** R$ 0 enquanto o free bastar; Pro US$ 25/mês ao estourar
Realtime/egress (avaliar antes de ligar flag em produção).

## 6. Segurança e compliance

- Cliente: só `anon`; UMD pinado **local** (`vendor/supabase-js/
  supabase-2.117.2.min.js`, publicado em 25/09/2026 — ≥14 dias — baixado de
  jsdelivr/npm, SHA256 `2eebfe06b1b5309985dc1526e8981ea3a18b71beeef83e7f38e04c303e142d6d`).
- `.env.example` documenta as variáveis; `.env` está no `.gitignore`.
- Google Play (§9 links): UGC exige termos antes de criar conteúdo, definição
  de conteúdo objeável, moderação ativa, **denúncia** e **bloqueio** de
  jogadores, filtro de conteúdo sexual incidental p/ menores; exigência de
  **exclusão de conta** in-app + link web (Data Safety). Chat só para ≥13
  (política Families/Google Play infantil) — menores de 13 usam **só frases
  prontas/emojis** (padrão do app: `QUICK_PHRASES`/`QUICK_EMOJIS`).
- Idade/LGPD/ECA Digital: **pendência da Fase 1** (confirmar exigência etária
  vigente antes de ligar chat em produção).

## 7. Como validar a Fase 0

```bash
node --test tests/rng.test.mjs tests/social-api.test.mjs   # 36 testes
node --test tests/*.test.mjs                                # bateria completa
node tests/smoke.mjs                                        # jogo continua íntegro
node tools/validate-refs.mjs && node tools/audit-ui.mjs
```
No navegador: `http://localhost:8080/?mock=1` (nenhuma UI social existe ainda —
a camada `net/` está pronta e testada; a interface vem nas fases 1..5).

## 8. Decisões pendentes (usuário decide antes das fases respectivas)

1. **Fase 1**: idade mínima do chat (13 recomendado p/ Families), servidor fixo
   ou shard por região, como manter o projeto free ativo (ping semanal).
2. **Fase 2**: valor exato de recompensa de ranking (hoje: moedas iguais às da
   partida, nunca dinheiro).
3. **Fase 4**: custo de criar clã em moedas (constante `CLAN.CREATE_COST_COINS`
   = 500, proposto).
4. **Fase 5**: tamanho dos grupos de liga (8 proposto) e número de ligas.
5. **Fase 6**: quem modera (só o dono hoje) e política de appeal de ban.

## 9. Links consultados (14/10/2026)

| Assunto | URL |
|---------|-----|
| Preços/limites free (500 MB, 50k MAU, 5 GB egress, pausa em 1 semana) | https://supabase.com/pricing |
| Limites de Realtime (200 conexões, 100 msg/s, 2 M/mês) | https://supabase.com/docs/guides/realtime/rates-and-limits |
| Auth anônima | https://supabase.com/docs/guides/auth/auth-anonymous |
| RLS/políticas | https://supabase.com/docs/guides/auth/policies |
| Edge Functions (limites free) | https://supabase.com/docs/guides/functions |
| pg_cron / Supabase Cron | https://supabase.com/docs/guides/cron |
| Play — política de UGC (moderação, termos, denúncia, bloqueio) | https://support.google.com/googleplay/android-developer/answer/9876937 |
| Play — exclusão de conta (in-app + link web) | https://support.google.com/googleplay/android-developer/answer/13327111 |
| Play — User Data policy | https://support.google.com/googleplay/android-developer/answer/10144311 |
