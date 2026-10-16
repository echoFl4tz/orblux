# ORBLUX — Camada SOCIAL ONLINE (Supabase)

> **Documento vivo.** Fases 0 a 8 concluídas em 16/10/2026. Este documento manda sobre
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
| **1 (concluída)** | Conta social: 1ª entrada social, faixa de idade, termos de Uso da Comunidade, apelido/skin/país, código de recuperação, **exclusão de conta** (ver §10) |
| **2 (concluída)** | Ranking global + `submit_run` anti-trapaça (validação plausibilidade no servidor); mantém ranking local como fallback (ver §10) |
| **3 (concluída)** | Chat global (salas/shards, realtime, denúncia, bloqueio, moderação) — ver §10 |
| **4 (concluída)** | Clãs (criar com moedas, entrada, cargos, elenco de emblema) — ver §10 |
| **5 (concluída)** | Torneios de clãs + **Corrida do Dia** com semente única (`net/rng.js` + `setSpawnerRng`) — ver §10 |
| **6 (concluída)** | Backend real no Supabase (migrações + Edge Functions + jobs) e integração economia/rede — ver §10 |
| **7 (concluída)** | Conformidade/loja: `privacy.html` sem CDN e com a camada social, `DATA_SAFETY.md` com UGC, checklist do Play Console — ver §10 |
| **8 (concluída)** | Testes finais e auditoria: `AUDITORIA.md` (inventário, matriz de conformidade, checklist de produção) + testes de vendor pinado e flags seguras — ver §10 |

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

## 3. Plano de dados (backend real — implementado nas fases 1..6)

Tabelas (todas com RLS; escrita **só** via funções `security definer`):

| Tabela | Colunas principais | Fase |
|--------|--------------------|------|
| `profiles` | `id uuid pk = auth.users.id`, `nickname citext unique`, `skin_id`, `country char(2)`, `age_band text check in ('menor13','13a17','18+')`, `terms_version`, `recovery_code text unique`, `created_at`, `deleted_at` (anonimização), `banned_until`, `muted_until` | 1 |
| `clans` | `id`, `nome unique`, `tag unique`, `descricao`, `tipo in (aberto,solicitacao,convite)`, `emblema jsonb` com **CHECK no elenco fechado** (`CLAN_ICONS`/`CLAN_COLORS`/`CLAN_FRAMES` de `net/rules.js` — nunca CSS arbitrário), `liga text default 'Bronze'` (6 ligas, move no fim da temporada), `lider_id`, `created_at` | 4, 6 |
| `clan_members` | `clan_id`, `user_id`, `papel in (lider,vice,membro)`, `contribuicao`, `ultimo_dia`, pk (clan,user) | 4 |
| `clan_requests` / `clan_invites` | fila de entrada (expiram em 7 dias via pg_cron) | 4, 6 |
| `runs` | `id`, `user_id`, `score`, `seconds`, `pickups`, `combo_max`, `level`, `seed text null`, `version`, `valid bool`, `created_at` (índices em user/at, at, seed) | 2, 5 |
| `chat_rooms` | `room text pk` (`global:pt-BR:<n>`), `occupancy int` | 3 |
| `chat_messages` | `id bigint`, `room`, `user_id`, `nick_snapshot`, `tag_snapshot`, `text` (≤200), `hidden bool`, `created_at` (retenção 24 h via pg_cron; ÚNICA tabela com política de SELECT, para o Realtime) | 3, 6 |
| `chat_reports` | `message_id`, `reporter_id`, `reason`, `acted bool` (fila da automação), `unique (message_id, reporter_id)` — 3 denúncias **distintas** ocultam | 3, 6 |
| `user_blocks` | `user_id`, `blocked_id`, `nick_snapshot` | 3 |
| `tournament_seasons` | `number int pk` (seg. 00:00 BRT), `starts_at`, `ends_at` | 5 |
| `tournament_contributions` | **pk (season_number, user_id)**, `clan_id`, `melhor_score`, `runs_validas` — 1 linha por jogador/temporada | 5 |
| `tournament_history` | **pk (season_number, user_id)**, `clan_id`, `posicao`, `liga`, `pontos`, `rewards jsonb`, `claimed bool`, `settled_at` — 1 recompensa por usuário/temporada | 5 |
| `server_wallets` + `coin_ledger` | carteira do SERVIDOR (só moedas de jogabilidade social: partidas e clã) e ledger idempotente `unique (user_id, reason, ref)` — ver `ECONOMIA.md` | 6 |
| `moderation_log` | fila de revisão do dono: `action in (hide,mute,ban,warn)`, `target_user_id`, `message_id`, `detail jsonb`, `by text` | 6 |
| `app_rules` | réguas em pares `chave/valor` (chat, clã, partida, torneio) — **semeadas com os MESMOS números de `net/rules.js`/`economy.js`** (paridade testada) | 6 |
| `clan_colors` / `clan_icons` / `clan_frames` | elenco fechado do emblema (índices 0..7/0..7/0..3) | 6 |
| `reserved_words` / `quick_phrases` / `quick_emojis` / `bad_words` | termos reservados de nome, catálogo de frases/emojis e lista de ofensas — **idênticos** aos de `net/rules.js`/`js/core/*` | 6 |

Não existe `leaderboard_week` materializada: `ranking_top(scope,page,limit)`
calcula o melhor score de 7 dias (ou geral) por usuário em CTE — banco do
free não precisa de refresh de view materializada.

Princípios: `updated_at` com trigger; tudo validado em função; **nenhuma
política de escrita** — o cliente só chama RPCs; grants de tabela revogados
de `anon`/`authenticated` (sobra só o SELECT de `chat_messages`, exigido
pelo Realtime — doc oficial consultada 15/10/2026, §9).

## 4. Backend (RPCs / Edge Functions / pg_cron) — implementado na Fase 6

As 41 RPCs abaixo existem em `supabase/migrations/20261015030100_orblux_functions.sql`
(todas `security definer` com `search_path` fixo; grants: EXECUTE só para
`authenticated` — `anon`/`public` revogados; liquidação e moderação ficam com
`service_role`). Erros seguem o padrão **`raise '<codigo>|<mensagem pt-BR>'`**:
o `_rpc` do cliente separa o prefixo e repassa os códigos estáveis da UMA
interface (`muted`, `name-taken`, `insufficient-coins`, `already_claimed`…).

- **profile**: `profile_get/upsert/recover`, `profile_recovery_code`,
  `account_delete` (anonimiza + apaga UGC — exigência Play §7; o cliente
  encerra a sessão depois).
- **chat**: `chat_online/join/history/send/report`, `user_block/unblock/blocks`.
  `chat_send` aplica a régua completa de `net/rules.js` em SQL (vazio,
  200, quick_only p/ menor13, contato/ofensa, duplicata 30 s, cooldown 2 s,
  flood 15/min, CAPS) + mute/ban do banco; salas derivadas por shard
  (`app_room`, mesmo algoritmo do mock).
- **clãs**: `clan_search/get/mine/members/create/join/request/outgoing_requests/
  invite/requests/accept/decline/kick/promote/demote/transfer/leave/dissolve/update`.
  `clan_create` debita as 500 moedas **no servidor** (`server_wallets` +
  ledger idempotente `clan_create:<clan>`); saldo curto responde
  `insufficient-coins` com o quanto falta ("ganhe jogando" — nunca push de
  pagamento). A UI debita a carteira local só depois do sucesso.
- **torneios**: `tournament_current/group/my_contribution/rewards/claim`
  + `daily_race`. O resgate é a RPC `tournament_claim` (não uma Edge
  Function): idempotente por (temporada, usuário), 50 participação com 3+
  partidas válidas, 40–300 por posição, +150 **só por promoção REAL**
  (movimento de liga calculado no fim da temporada). `submit_run` só aceita
  `p_seed` igual à semente de hoje (`invalid-seed`).
- **ranking**: `ranking_top(scope,page,limit)` / `ranking_mine` (CTE com
  melhor score de 7 dias ou geral; sem view materializada).
- **integração economia/rede**: `submit_run` espelha `calcRunCoins`
  (`js/core/economy.js`: cap 120 + 15 recorde + 10 primeira do dia) no
  `server_wallets` do jogador — o servidor conhece o saldo social usado por
  clã/torneio; a carteira local do jogador continua sendo a verdade para
  skins/spend (ver `ECONOMIA.md`).
- **Edge Functions** (service_role no ambiente, nunca no repositório):
  `chat-moderation` (a cada 5 min: 3 denúncias distintas ⇒ oculta + mute
  24 h + registro em `moderation_log` para o dono revisar — decisão §8.5) e
  `tournament-rollover` (segunda 03:03 UTC = 00:03 BRT: chama
  `tournament_settle_last`, idempotente). Guia de deploy: `supabase/README.md`.
- **pg_cron + pg_net + Vault** (`..._jobs.sql`): limpeza de `chat_messages` >
  24 h (a cada 15 min), expiração de pedidos/convites (diário), e os dois
  jobs HTTP acima; chat_messages entra na publicação `supabase_realtime`.
  Segredos (`orblux_project_url`, `orblux_edge_service_key`) ficam **no
  Vault** — sem eles os jobs HTTP ficam parados e a migração avisa.

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
3. **Fase 4 (RESOLVIDA em 14/10/2026)**: custo de criar clã =
   **500 moedas** (constante `CLAN.CREATE_COST_COINS = 500`,
   confirmado pelo usuário; carteira local, débito só após o
   servidor criar — moedas nunca se compram, ver §0/ECONOMIA).
4. **Fase 5 (RESOLVIDA em 15/10/2026)**: ligas = **8 clãs por
   grupo e 6 ligas** (Bronze→Lenda). Recompensas: a **temporada
   do clã paga moedas** no resgate (50 participação com 3+
   partidas, 40–300 por posição, +150 por promoção; uma vez por
   temporada, idempotente no servidor); a **Corrida do Dia não
   paga moedas** (só recorde do dia + contribuição ao clã).
5. **Fase 6 (RESOLVIDA em 15/10/2026 — §8.5)**: moderação = **automação +
   dono revisa**. A Edge Function `chat-moderation` roda a cada 5 min: 3
   denúncias **distintas** ocultam a mensagem e aplicam **mute de 24 h**,
   com registro em `moderation_log` (fila de revisão do dono — ver
   `supabase/README.md`). Contestações: link **"Contestar bloqueio"** no
   erro de mute/ban abre e-mail com ID da conta, apelido e punição; resposta
   esperada em até **7 dias** (`APPEAL` em `net/config.js`). Banimento
   manual é feito pelo dono no banco (`banned_until`).

## 9. Links consultados (14 e 15/10/2026)

| Assunto | URL | Data |
|---------|-----|------|
| Preços/limites free (500 MB, 50k MAU, 5 GB egress, pausa em 1 semana) | https://supabase.com/pricing | 14/10/2026 |
| Limites de Realtime (200 conexões, 100 msg/s, 2 M/mês) | https://supabase.com/docs/guides/realtime/rates-and-limits | 14/10/2026 |
| Auth anônima | https://supabase.com/docs/guides/auth/auth-anonymous | 14/10/2026 |
| Row Level Security (grants + políticas + security definer) | https://supabase.com/docs/guides/database/postgres/row-level-security | 15/10/2026 |
| Edge Functions (limites free) | https://supabase.com/docs/guides/functions | 14/10/2026 |
| pg_cron / Supabase Cron | https://supabase.com/docs/guides/cron | 14 e 15/10/2026 |
| Realtime postgres_changes (tabela na publicação) | https://supabase.com/docs/guides/realtime/postgres-changes | 14/10/2026 |
| Assinar mudanças no cliente (broadcast p/ escala) | https://supabase.com/docs/guides/realtime/subscribing-to-database-changes | 14/10/2026 |
| Database functions (RPC: security invoker/definer, revoke de `execute`) | https://supabase.com/docs/guides/database/functions | 14 e 15/10/2026 |
| Agendar Edge Functions com pg_cron + pg_net + Vault | https://supabase.com/docs/guides/functions/schedule-functions | 15/10/2026 |
| pg_net (async HTTP do Postgres) | https://supabase.com/docs/guides/database/extensions/pg_net | 15/10/2026 |
| Segredos de Edge Function (Vault) | https://supabase.com/docs/guides/functions/secrets | 15/10/2026 |
| Play — política de UGC (moderação, termos, denúncia, bloqueio) | https://support.google.com/googleplay/android-developer/answer/9876937 | 14/10/2026 |
| Play — exclusão de conta (in-app + link web) | https://support.google.com/googleplay/android-developer/answer/13327111 | 14/10/2026 |
| Play — User Data policy | https://support.google.com/googleplay/android-developer/answer/10144311 | 14/10/2026 |

## 10. Registro das fases concluídas

### Fase 1 — Conta social (14/10/2026)

- `index.html`: botão **Comunidade** no menu (`#btn-social`, oculto sem a flag),
  tela `#screen-social` com passos (fora → idade → termos → perfil → código →
  dentro), grupo **Comunidade** em Configurações (`#group-social`: status +
  atalho) e modal de confirmação de exclusão (`#modal-social-delete`).
  Link dos termos também no rodapé do menu.
- `termos.html`: Termos de Uso da Comunidade (UGC, moderação, menores de 13,
  exclusão de conta, moedas) — exigência da política Play 9876937; fontes
  locais, sem CDN.
- `js/ui/social-ui.js` (novo): fluxo de 1ª entrada, `TERMS_VERSION` registrada
  no upsert, código de recuperação exibido uma vez (revelar de novo exige
  clique), sair, apagar conta (exclusão **final** — no mock apaga também o
  vault e o código), erros de digitação inline e tela "Tentar de novo" para
  rede. Flag `SOCIAL_ENABLED` desligada ⇒ botões ocultos e **nenhum listener**.
- `net/api.js`: `profile.getRecoveryCode()` (mock: estado; supabase: RPC
  `profile_recovery_code`); `deleteAccount` do mock descarta o snapshot do
  vault e o código (exclusão final fiel ao servidor real).
- `js/ui/screens.js`: `case 'social'`, `openModal/closeModal` exportados, Esc
  fecha `#modal-social-delete`.
- Teste: `tests/social-entry-ui.cjs` (Playwright: flag oculta/visível, fluxo
  completo, recuperar por código, apagar conta, 390x844 e 1280x720, zero erros
  de console).

### Fase 2 — Ranking global + submit_run (14/10/2026)

- `js/ui/ranking.js`: removido o fetch direto legado (`GLOBAL_RANKING` +
  `submitGlobalScore` — nunca tinham sido ligados); o ranking global agora
  passa pela UMA interface `net/api.js` e só aparece com a flag
  `GLOBAL_RANKING_ENABLED` (seletor Local/Global no topo da tela de ranking).
  Listas do servidor renderizadas com `textContent` (nunca `innerHTML`);
  sem perfil social: CTA "Entre na comunidade" (abre a tela da Fase 1);
  erro de rede: status + "Tentar de novo", ranking local intacto; paginação
  "Carregar mais" e linha "Sua posição: Nº de T".
- `net/rules.js`: `RUN` (MAX_SCORE 200 000, MIN_SECONDS 10, MAX_SECONDS
  7200) + `validateRun()` — espelho da régua do servidor (`submit_run`). O
  MockProvider passou a usá-la (códigos `implausible`/`too-short` iguais) e
  `submitRunGlobal` nem envia o impossível.
- `js/main.js`: `game:over` chama `submitRunGlobal(run)` fire-and-forget
  (flag desligada, sem perfil ou sem rede = silêncio; nunca atrasa nem quebra
  a UI). Submeter partida **não credita moedas locais** (sem double-dip;
  recompensas de temporada ficam para a Fase 5 — decisão §8.2).
- Docs: `README.md` e `DATA_SAFETY.md` apontam para as flags/`SOCIAL.md`
  (referências ao `GLOBAL_RANKING` legado removidas).
- Teste: `tests/ranking-global-ui.cjs` (28 checagens Playwright, incluindo
  partida curta que NÃO vai ao servidor) + `validateRun` unitário.
  Denúncia/bloqueio de linhas do ranking global: Fase 3 (bloqueio) e
  Fase 7 (conformidade).

### Fase 3 — Chat global (14/10/2026)

- `index.html`: botão **Chat** no menu (`#btn-chat`) + atalho em
  *Comunidade → perfil* (`#social-chat-open`), ocultos sem as flags;
  tela `#screen-chat` com 4 estados (loading → convite sem perfil →
  erro com "Tentar de novo" → sala), ícones `ic-chat`/`ic-send`, modal
  de **ações da mensagem** (denunciar com motivos / bloquear) e modal
  **Jogadores bloqueados** (com desbloquear).
- `js/ui/chat-ui.js` (novo): entrada `data-action="chat"`; `join` +
  `history` + `onMessage` (tempo real) pela UMA interface `net/api.js`;
  textos da rede só via `textContent` (nunca `innerHTML`); envio com
  régua local espelhando `net/rules.js` — erros **inline** sob o campo
  (vazio, cooldown de 2 s, duplicata, contato/ofensa, e também
  mute/ban vindos do servidor), nunca troca de tela; scroll automático
  só quando perto do fim; Esc fecha os modais; sair encerra assinatura
  e sala (`leave`). Flag desligada = botões ocultos e **nenhum
  listener**; `CHAT_ENABLED` exige `SOCIAL_ENABLED` (sem Comunidade não
  há CTA morto).
- Menores de 13: campo de texto livre **oculto** — só frases
  prontas/emojis do catálogo (`QUICK_PHRASES`/`QUICK_EMOJIS`), por 1
  toque; menores de 13 **não escrevem texto livre** (Play UGC/Families).
- `net/api.js`: contrato do chat unificado — `chat.join(room)` já
  assina o tempo real da sala (mock: bots; supabase: canal
  `chat_messages` via Realtime, melhor esforço); `blocks()` devolve
  `[{id, nick}]` e `block(userId, nick)` congela o apelido (espelho do
  `nick_snapshot`); mock migra estado antigo (`blockedNicks`).
- `js/ui/screens.js`: `SCREEN_IDS.chat`, `case 'chat'` e
  `returnToMenu` fecha os modais do chat.
- Docs: §4 ganhou o contrato de `user_blocks` e a exigência da
  publicação `supabase_realtime`; §9 com 2 links de Realtime
  (14/10/2026).
- Teste: `tests/chat-ui.cjs` (33 checagens Playwright: flag oculta,
  convite, envio/cooldown/tempo real, denúncia com motivo, bloqueio +
  desbloquear, offline com retry, menor de 13 só com frases prontas,
  390x844/360x640/1280x720 sem overflow, zero erros de console) +
  unitário do contrato `blocks()`.
- **Produção segue com flags desligadas**: ligar o chat exige antes a
  decisão §8.1 (idade mínima 13 + LGPD/ECA, ver §6) e a moderação
  (Edge Function `chat-moderation`, Fase 6/§8.5).

### Fase 4 — Clãs (15/10/2026)

- `index.html`: botão **Clãs** no menu (`#btn-clans`) + atalho
  *Comunidade → perfil* (`#social-clans-open`), ocultos sem as flags;
  tela `#screen-clans` com 5 estados (loading → convite sem perfil →
  erro com "Tentar de novo" → fora de clã [busca] → meu clã); ícone
  `ic-flag`; modal **criar/editar clã** (nome, tag, descrição, tipo de
  entrada, elenco de emblema) e modal **confirmação** (sair/dissolver/
  expulsar).
- `js/ui/clans-ui.js` (novo): entrada `data-action="clans"`; todas as
  ações pela UMA interface `net/api.js` (mock valida como o servidor);
  texto da rede só via `textContent`; `CLANS_ENABLED` exige
  `SOCIAL_ENABLED` (sem Comunidade não há CTA morto); flag desligada =
  botões ocultos e **nenhum listener**; Esc fecha os modais; aviso de
  espera de 24 h após sair (a constante é só aviso — quem barra é o
  servidor).
- **Moedas (decisão §8.3, resolvida)**: criar clã custa
  `CLAN.CREATE_COST_COINS = 500` da carteira LOCAL (`pn_wallet`):
  o cliente só debita **depois** que o servidor confirma a criação
  (`wallet.spend` com rollback; se o débito local falhar, alerta em
  console e o clã segue — o servidor é a fonte da verdade). Sem saldo:
  botão inativo + "Faltam X moedas — ganhe jogando" (**nunca** push de
  pagamento). No backend real, `clan_create` debitará no banco
  (Fase 6/§7). Menores de 13 não criam clã (só entram por convite).
- **Emblema (elenco fechado)**: `net/rules.js` ganhou `CLAN_ICONS` (8),
  `CLAN_FRAMES` (4) e `CLAN_COLORS` (8) + `validateClanEmblem` — valores
  fora da paleta caem no padrão (imune a injeção de CSS); o mock valida
  em `clans.create`/`clans.update` e a UI renderiza com a paleta lida
  de novo. Cargos: líder (promover/rebaixar/expulsar/transferir/editar/
  dissolver) e vice (aceitar/recusar pedidos e expulsar membros);
  pedidos de entrada com aceitar/recusar; tipos de entrada aberto/
  solicitação/convite (convite = só visualizar na busca).
- `js/ui/screens.js`: `SCREEN_IDS.clans`, `case 'clans'` e
  `returnToMenu` fecha os modais dos clãs. `js/core/wallet.js` sem
  mudança (reuso de `spend`/`canAfford`/`getCoins`).
- Testes: `tests/clans-ui.cjs` (45 checagens Playwright: flag oculta,
  convite sem perfil, busca filtrando, custo em moedas com saldo
  insuficiente, criação com emblema + débito 600→100, pedidos,
  cargos, edição pelo líder, sair com espera de 24 h, offline com
  retry, entrar/solicitar/só-convite, menor de 13, 390x844 e
  1280x720 sem overflow, zero erros de console) + unitário do elenco
  fechado do emblema (`tests/social-api.test.mjs`).
- **Produção segue com flags desligadas**: ligar os clãs depende da
  Fase 6/§7 (débito de moedas no servidor + RPCs SQL com RLS) e das
  decisões §8 restantes.

### Fase 5 — Torneios de clãs + Corrida do Dia (15/10/2026)

- **Corrida do Dia** (mesmo percurso para todo mundo): cartão na tela
  de Ranking (`#daily-race`, com `TOURNAMENTS_ENABLED` +
  `GLOBAL_RANKING_ENABLED`). A **semente vem do servidor**
  (`tournaments.daily()` → `{date, seed, endsAt, melhorHoje}`; mock:
  `daily:AAAA-MM-DD` determinístico, servidor real: RPC `daily_race` em
  `America/Sao_Paulo`). `js/game/game.js` ganhou `startGame({seed})`:
  injeta `mulberry32(hashSeed(seed))` no spawner (`setSpawnerRng`) —
  a MESMA sequência de obstáculos em qualquer aparelho; sem semente =
  `Math.random` como antes; `quitToMenu` zera de volta. O payload de
  `game:over` carrega a `seed` usada; `submitRunGlobal` a envia ao
  servidor, que **só aceita a semente de hoje** (mock espelha com
  `invalid-seed`). Recompensa: **sem moedas** — só recorde do dia e
  contribuição ao clã (decisão §8.4).
- **Torneio de clãs**: botão `#btn-tournament` no menu + atalho
  "Torneio do clã" na tela do clã (ocultos sem
  `TOURNAMENTS_ENABLED`+`SOCIAL_ENABLED`); tela `#screen-tournament`
  com 5 estados (loading → convite sem perfil → erro com "Tentar de
  novo" → sem clã [CTA "Ver clãs"] → temporada). A temporada mostra
  liga (8 clãs por grupo, 6 ligas — decisão §8.4), classificação com
  meu clã destacado, minha contribuição (melhor partida da semana) e
  o resgate de recompensas de temporadas encerradas.
- **Moedas (decisão §8.4)**: temporada paga no resgate **50**
  (participação, com 3+ partidas válidas) + **40–300** (posição) +
  **150** (promoção) — servidor calcula e paga (mock: espelho); a UI
  credita a carteira LOCAL (`wallet.earn`, motivo `torneio`) só
  **DEPOIS** que o servidor confirma; resgate **idempotente** (uma vez
  por temporada, `already_claimed` no servidor). Bug de mock corrigido
  no caminho: `rewards()` agora lê `claimed[user:seasonId]` (mesma
  chave do `claimReward`) — antes o estado "coletada" nunca aparecia.
- `net/api.js`: `tournaments.daily()` nos provedores mock/supabase
  (`daily_race`); `submitRun` valida a semente do dia. `js/ui/ranking.js`:
  cartão da corrida, `jogarDiaria()` (mesma transição do botão Jogar:
  áudio + `startGame({seed})` + `showScreen(null)`) e `seed` no envio
  (gate: `GLOBAL_RANKING_ENABLED` **ou** `TOURNAMENTS_ENABLED`).
- `js/ui/tournament-ui.js` (novo): textContent sempre; erros de abrir
  degradam com "Tentar de novo"; flag desligada = botões ocultos e
  **nenhum listener**. `js/ui/screens.js`: `SCREEN_IDS.tournament`,
  `case 'tournament'`; css §16.
- Testes: `tests/tournament-ui.cjs` (30 checagens Playwright: flags,
  convites, semente do servidor em `game:over`, recorde do dia,
  sem-clã/CTA, grupo 8+1, contribuição, resgate único creditando a
  carteira, offline com retry, 390x844 e 1280x720 sem overflow, zero
  erros de console) + 2 unitários novos (participação/resgate
  idempotente + `coletada`; Corrida do Dia determinística com
  `invalid-seed` para semente velha) — 128 unitários.
- Docs: §4 com `daily_race` e a régua de segurança dos RPCs (Database
  functions, consultado 15/10/2026, ver §9).
- **Produção segue com flags desligadas**: ligar torneios exige a
  Fase 6/§7 (RPCs SQL com RLS, `tournament-rollover` como Edge
  Function e ledger de recompensas no servidor).

### Fase 6 — Backend real + integração economia/rede (15/10/2026)

- **`supabase/migrations/20261015030000_orblux_schema.sql`**: 20 tabelas
  com RLS, índices, triggers de `updated_at` e **sementes de paridade**
  (`app_rules` com os mesmos números de `net/rules.js`/`nickname.js`/
  `economy.js`; elenco do emblema, frases/emojis, reservados e 57
  ofensas idênticos aos do cliente). Grants de tabela revogados de
  `anon`/`authenticated`; única política de SELECT é a de
  `chat_messages` (exigência do Realtime — doc RLS 15/10/2026, §9).
- **`..._functions.sql`**: 41 RPCs `security definer` com `search_path`
  fixo, erros `'<codigo>|<mensagem pt-BR>'` (o `_rpc` do cliente
  separa o prefixo), helpers privados `app_*` revogados de
  `public`/`anon` (EXECUTE do cliente só nas RPCs; liquidação e
  moderação só com `service_role`). Destaques: `submit_run` espelha
  `calcRunCoins` no `server_wallets` (cap 120 + bônus); `clan_create`
  debita 500 com `insufficient-coins`; `tournament_claim` resgata de
  forma idempotente; `tournament_settle(_last)` liquida temporada +
  movimenta liga por GRUPO (8; promoção = top 5 com ≥6 clãs; 150 só
  por promoção real; exige ≥1 partida válida por membro);
  `app_chat_moderate` (3 denúncias distintas ⇒ oculta + mute 24 h +
  `moderation_log`); salas de chat por shard determinístico
  (`app_room`, mesmo hash do mock).
- **`..._jobs.sql`**: extensões `pg_cron`/`pg_net`, publicação Realtime
  de `chat_messages` e 4 jobs idempotentes — limpeza do chat (*/15 min,
  24 h), expiração de pedidos/convites (diário, 7 dias),
  `chat-moderation` (*/5 min) e `tournament-rollover` (seg.
  03:03 UTC = 00:03 BRT). Jobs HTTP só são agendados quando os
  segredos existem no **Vault** (`orblux_project_url`,
  `orblux_edge_service_key`); sem eles a migração emite NOTICE.
- **Edge Functions** `chat-moderation` e `tournament-rollover`
  (delgadas: leem `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` do
  ambiente e chamam a RPC certa via REST; gatilho HTTP exige a chave
  de serviço). `supabase/README.md`: passo a passo de deploy **sem
  nenhuma chave no git**.
- **Cliente (`net/api.js`)**: `_rpc` interpreta `codigo|mensagem`;
  `clans.outgoingRequests()` adicionado (a UI de clãs já o pedia);
  `_subChat` mapeia o payload snake_case do Realtime para o formato
  camel da UMA interface; `profile.deleteAccount` encerra a sessão
  depois do RPC. `net/config.js` ganhou `APPEAL`
  (e-mail de contestação + 7 dias).
- **Contestação (decisão §8.5)**: `js/ui/chat-ui.js` mostra o link
  **"Contestar bloqueio"** (`#chat-appeal`, junto a
  `#chat-send-error`) nos erros `muted`/`banned` — abre mailto com
  ID da conta, apelido, punição e prazo. CSS mínimo em
  `css/style.css`; `.gitignore` cobre `supabase/functions/.env`.
- **Testes**: `tests/backend-parity.test.mjs` (18 checagens — RPCs
  cliente ⊆ SQL + grants; sementes/catálogos == `rules.js` etc.;
  fórmula de moedas; liquidação; varredura de segurança: sem JWT/chave
  no repo, config vazia, SECURITY DEFINER + search_path em toda
  função, RLS em toda tabela, só política de SELECT, códigos de erro
  da UMA interface) + `tests/chat-ui.cjs` com o cenário de mute +
  contestação (+5 checagens; 38 no total).
- **Divergências conhecidas mock ↔ servidor** (o mock é de mentira; o
  servidor decide): ranking "semana" (mock escala por 0.4, servidor
  calcula melhor score real dos últimos 7 dias); "online agora" (mock
  usa hash fictício, servidor conta quem falou nos últimos 5 min);
  clãs/ranking fictícios do mock não existem no servidor; carteira do
  servidor só vê moedas de jogabilidade (missão/conquista/diária são
  locais — se o saldo extra local cobrir o clã mas o saldo social
  estiver abaixo de 500, aparece `insufficient-coins`, e é isso);
  `profile_recover` do servidor move a identidade inteira (clã e UGC
  junto); limite de 200 caracteres conta emojis como 2 no cliente
  (UTF-16) e como 1 no servidor — o cliente é mais estrito e sempre
  barra antes; bots de chat só existem no mock.
- **Produção segue com flags desligadas**: clãs/torneios já têm
  backend, mas ligar exige um projeto Supabase configurado
  (`supabase/README.md`) e o chat continua pendente da decisão §8.1
  (idade mínima 13 + LGPD/ECA, ver §6).

### Fase 7 — Conformidade/loja (15/10/2026)

- **`privacy.html` reescrito**: sem CDN (Google Fonts removido —
  fontes auto-hospedadas via `css/fonts.css`, igual a `termos.html`);
  nova **seção 7 "Comunidade online"** (o que vai ao servidor quando
  as flags sociais são usadas: perfil, chat com retenção de 24 h,
  denúncia/bloqueio/moderação, exclusão de conta, menores, desligar);
  seção de **exclusão de conta e de dados** (caminhos in-app:
  *Configurações → Apagar progresso* e *Configurações → Comunidade →
  Apagar conta da comunidade*); Google Fonts saiu da lista de
  terceiros (Supabase entrou como storage da comunidade); cross-link
  com os `termos.html`.
- **`DATA_SAFETY.md`**: linhas novas de UGC/conta social
  (perfil da comunidade e conteúdo gerado pelo usuário — coletado e
  compartilhado só com a comunidade ligada; chat com retenção de 24 h);
  cenário 3 no formulário (comunidade ligada); notas de conformidade
  de moderação, exclusão de conta e classificação.
- **`SKINS_PLAY_CONSOLE.md` §7**: checklist ganhou termos da
  comunidade publicados, exclusão de conta testada, classificação
  etária com UGC e decisão sobre a comunidade na build publicada.
- **Service worker**: `termos.html` entrou no pré-cache (páginas
  legais legíveis offline) — `CACHE_VERSION` de `orblux-v3` para
  `orblux-v4` (literal atualizado em `tests/sw-update.cjs`).
- **Teste**: `backend-parity.test.mjs` ganhou "páginas públicas sem
  CDN em runtime e com páginas legais ligadas" (varre `index.html`,
  `privacy.html` e `termos.html` sem comentários; `src=`/`href=`
  externos em script/stylesheet reprovam; exige `css/fonts.css`,
  cross-links e pré-cache das duas páginas legais).

### Fase 8 — Testes finais e auditoria (16/10/2026)

- **`AUDITORIA.md`** (novo): resultado da rodada final
  (149/149 unitários, 42/42 smoke, 12/12 suítes, refs/audit OK),
  inventário completo dos 12 arquivos `*.test.mjs` + 12 suítes
  Playwright (o que cada um cobre), **matriz de conformidade**
  (regras inegociáveis do projeto → garantia → teste que trava),
  pendências conhecidas (§8.1, projeto Supabase, Play Console,
  e-mail do dono, anúncios, divergências mock ↔ servidor) e
  checklist de produção em ordem sugerida.
- **Dois testes novos** em `backend-parity.test.mjs` (21 checagens):
  vendor `supabase-js` **pinado por SHA256** (arquivo em `vendor/`
  precisa bater com o hash documentado em §3 — rebaixamento ou troca
  não autorizada reprovam; `SUPABASE_UMD_PATH` precisa apontar para
  o mesmo arquivo) e **flags sociais desligadas por padrão**
  (`FLAG_DEFAULTS` todos `false` + `net/config.js` sem URL/chave).
- **Achado e correção da auditoria**: `menu-regression.cjs` era
  **dependente do calendário** — o conjunto real de missões do dia
  gira por data (`pickDaily`), e no dia 16/10 o run semeado preenchia
  3 barras no menu (diff ~13 > tolerância ~5.5 só no 390x844). O
  `SEED` da suíte agora **fixa um conjunto de missões com metas
  gigantes** (data = hoje, para não resetar): a suíte testa
  navegação, não o sorteio diário. Diffs caíram para ~1.2.
  `ranking-global-ui` teve um TimeoutError pontual sob carga
  (rodar as suítes em paralelo com a bateria pesada) e passou
  isolada e na rodada final.
- **`README.md`**: seção de testes reescrita (bateria + lista das
  12 suítes + ponteiro para `AUDITORIA.md`); árvore ganhou o doc.
