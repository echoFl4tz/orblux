# ORBLUX — Revisão completa (auditoria de 26–28/10/2026)

Rodada de auditoria do ORBLUX em **26–27/10/2026**: endurecimento de
segurança, determinismo da simulação, correção da contabilidade por
corrida, versão desktop-only, percepção da loja e a análise de retenção
de jogadores (Maestria + métricas locais). Em **27–28/10/2026**, o
prompt grande de retenção foi executado fase a fase — títulos da
Maestria, missões semanais, Desafio do Dia local e métricas extras
(§7). Cada fase foi commitada, validada e publicada isoladamente. Este
documento é o mapa do que foi verificado, do que ficou pendente e de
como está a produção.

Produção: <https://echofl4tz.github.io/orblux/> (GitHub Pages, branch
`master`, sw `orblux-v22`).

---

## 1. Resultado da rodada 1 (estado final `10a64af`)

| Bateria | Comando | Resultado |
|---------|---------|-----------|
| Simulação do jogo inteiro | `node tests/smoke.mjs` | **69/69** |
| Testes unitários | `node --test tests/*.test.mjs` | **218/219** (1 falha pré-conhecida) |
| Referências internas | `node tools/validate-refs.mjs` | 1 falha pré-conhecida |
| Auditoria de UI | `node tools/audit-ui.mjs` | 1 falha pré-conhecida (CSS 141,7 KB < 150 KB) |

Resultado da **rodada 2** (prompt de retenção, estado final `427b98e`):
ver §7 — smoke 69/69 e unit 236/237, mesma única falha pré-conhecida.

Verificação visual em `localhost:8080` e produção (27/10/2026):
chip "Nv. 1" com barra no topbar, bloco "Próxima recompensa", painel de
fim de jogo com "+432 XP" e barra "Maestria · Nv. 4 → Gelo Polar
432/640", loja com "600 moedas" em destaque amarelo e Brasa Neon
"Comprada · Equipar" (recompensa concedida de verdade pela Maestria),
vitrine com chip "Sem compras em dinheiro" e novo texto do banner,
Ajustes > Dados com "4 sessões · 1 partidas · retorno 1d: 0 · 7d: 0".
Zero erros de console.

## 2. Falhas pré-existentes conhecidas (intocáveis)

| Ferramenta | Falha | Motivo |
|---|---|---|
| `node --test` | `run-hardening.test.mjs:96` | Fixture com CRLF no repo; o teste espera LF |
| `validate-refs.mjs` | `mailto:suporte@EXEMPLO.com` | Placeholder do documento legal, deliberado |
| `audit-ui.mjs` | `<img>` no splash | `<img>` de fallback a11y do splash; escolha consciente |

Nenhuma regressão foi introduzida: o padrão era "1 falha conhecida por
ferramenta" desde antes da rodada e continua igual (o smoke subiu de
64 para 69 asserts com os novos módulos).

## 3. Fases executadas

### Fase 1 — Segurança (`4ed4d52`)

- `submit_run` (migration `20261026090000`): teto de pontos por tempo
  (`run_max_pps` 3000 + slack 10000) e rate limit por usuário no
  relógio do servidor (`run_submit_gap_s` 9s). Antes aceitava 200.000
  pontos em 10s e spam de envio. Assinatura inalterada.
- Política `chat_messages_select`: `USING (true)` →
  `USING (not hidden)` — REST autenticado não lê mensagens ocultas.
- `js/ui/toasts.js`: `esc()` em title/desc/label + whitelist do ícone
  antes do `innerHTML` (defesa em profundidade contra XSS).
- CSP via `<meta>` em `index.html`: `script-src 'self'` + domínios de
  anúncio; sem scripts inline ou handlers `onclick`.
- `.github/workflows/pages.yml`: deploy manual com lista branca
  explícita (criado, não ativado).

### Fase 2 — Determinismo e contabilidade única (`a110308`)

- `js/core/loop.js`: simulação em **passo fixo 1/60** com acumulador
  (dt cortado em 50 ms, até 4 passos/quadro). Em 60/90/120 Hz a
  lógica roda o mesmo número de updates por segundo. O spawner da
  Corrida do Dia não foi tocado (acumula tempo, não quadros).
- `js/core/run-flow.js` (novo): contabilidade (stats, moedas, missões,
  ranking local) roda **uma vez por corrida**. Antes, morrer → reviver
  → morrer de novo creditava tudo em dobro. A 1ª morte mostra valores
  projetados sem creditar; recusar o revive descarrega a pendente.
- `js/main.js`: payload com `runId`/`revivePossible`; DPR por
  qualidade; `hudTick` 1× por quadro; overlay de boot sem `onclick`.
- `js/core/audio.js`: compressor no master, teto de 24 vozes,
  intervalo mínimo por efeito.
- `js/core/input.js`: 1 dedo só, `lostpointercapture`, limpeza no
  `visibilitychange`.

### Fase 2b — Versão desktop-only (`a9ed737`)

Removido tudo mobile: haptics (7 call sites), bottom sheets,
`safe-area env()`, `pointer: coarse`, `touch-action`, `viewport-fit`,
`orientationchange`, `isTouchDevice()`, duplo-toque. Textos
Toque/dedo/celular viram Clique/mouse/computador. `audit-ui` e
`accessibility-ui` afirmam a ausência de safe-area. SW v15.

### Fase 2c — Card visual da skin equipada (`17823d4`)

`renderMenuSkin()` no `js/ui/screens.js`: card clicável na coluna do
menu com a orbe real (`getBodySprite` em cache), nome, glow da paleta
e chevron; clique abre a loja via `data-action="skins"`. Roda no boot
e em `skins:changed`. SW v16.

### Fase 2d — Defeitos visuais reportados (`57b94b3`)

- `#ad-banner` só aparece com consentimento **e** `<ins>` real
  habilitado (`ADS.enabled`) — o placeholder de dev não vaza mais para
  jogadores.
- `#btn-skins` com `overflow: visible` — o selo "Novo" não é mais
  clipado. SW v17.

### Fase 3 — Análise de retenção (`10a64af`)

Implementação da análise de retenção colada pelo usuário (ordem de
prioridades dela): P1 (percepção da loja), P2 (progressão
permanente/Maestria), §4 (tela de resultados) e §5 (medição local) —
com status em `docs/ROADMAP_RETENCAO.md`.

- **Maestria** (`js/core/maestria.js`, novo): XP por partida
  (`xpDaPartida` = 10% do placar, piso 10, teto 500), creditado
  **1× por corrida** com dedupe por `runId` chamado dentro de
  `accountRun` (`js/main.js:172`) — reviver/replay nunca farmam XP.
  Curva `xpParaNivel(n) = 100 + (n-1)·40`; trilha de recompensas
  **só cosméticas** nos níveis 2/5/10/20/30/50 (Brasa Neon, Gelo
  Polar, Violeta Eclipse, Arco-Íris, Supernova, Lendária Orblux).
  Persistência: `pn_maestria { xp }`, sem cache (lê o storage a cada
  chamada). Emite `maestria:changed`.
- **Nova fonte `'maestria'`** (`js/core/state.js:131,371`): validada
  no load, marcada no `grantSkin`; skins conquistadas são apagadas
  junto com o XP no "Apagar progresso" (filtro em
  `resetAllProgress`), enquanto as de dinheiro são mantidas.
- **Correção crítica no billing** (`js/monetization/billing.js:249`):
  o loop de revogação da Play só poupava `source === 'coins'` — skins
  da Maestria seriam **revogadas** em Android com Play Billing
  confirmado. Agora `local = coins || maestria`.
- **Métricas locais** (`js/core/metricas.js`, novo): `pn_metricas`
  com sessões, partidas, retorno aproximado D1/D7 e partidas da
  sessão (vivo). `abrirSessao()` no boot (`js/main.js:80`),
  `registrarPartida()` em `game:start` (`js/main.js:245`), resumo em
  Ajustes > Dados (`#metrics-summary`). Anônimo, agregado, sem rede.
- **Percepção da loja** (`js/ui/skins-shop.js:107,116`): o card
  mostra o preço **em moedas** (`is-price is-coins`, amarelo) em vez
  de "Indisponível" — a compra com moedas nunca dependeu da Play.
  Chip virou "Sem compras em dinheiro" (`index.html:590`) e o banner
  explica que só o dinheiro depende da Play Store.
- **Fim de jogo** (`js/ui/screens.js:365` `renderMaestriaUI`, +3ª
  barra `#go-prog-maestria` e stat "+N XP") e **topbar** com chip
  `#maestria-chip` + bloco "Próxima recompensa" no menu
  (`index.html:178`).
- **Bug de layout encontrado na validação**: `.screen` centralizava
  com `align-items: center`; quando o menu era mais alto que a
  janela, a topbar (chip da Maestria + moedas) ficava intocável
  acima da área de scroll. Corrigido com `align-items: safe center`
  (`css/style.css:123`) — browsers sem suporte caem no `center`.
- **SW v18** (`sw.js:11`): PRECACHE com os dois módulos novos.
- Testes novos: `tests/maestria.test.mjs` (7 — curva, teto/piso,
  1× por runId, recompensas no catálogo, sem cache) e
  `tests/metricas.test.mjs` (6 — primeira visita, retorno D1/D7,
  mesmo dia, contagens, dado corrompido). `smoke.mjs` +5 asserts
  (Etapa K estendida: XP/métricas creditados e apagados no reset).
  `tests/skins-shop-ui.cjs` atualizado para o novo texto de preço.

## 4. Regras invioláveis — estado

| Regra | Estado |
|---|---|
| Determinismo da Corrida do Dia (spawner intocado) | Mantido (Fase 2: passo fixo acumula tempo) |
| Prefixo `pn_` no localStorage | Mantido (`pn_maestria`, `pn_metricas`, `pn_desafio`) |
| Sem dependências/build novas | Mantido (HTML/CSS/JS puro) |
| Nunca commitar segredo | Mantido |
| UI pt-BR sem emojis | Mantido (audit-ui) |
| Recompensas da Maestria só cosméticas | Mantido (só skins; `skin-hitbox` cobre que skin não muda gameplay) |

## 5. Pendências (não faziam parte das rodadas)

- Suítes Playwright (`.cjs`) não rodaram nestas rodadas (requerem
  navegador dedicado); as asserções atualizadas de
  `skins-shop-ui.cjs` foram conferidas manualmente na validação
  visual, mas a suíte inteira deve ser executada antes da próxima
  publicação maior.
- Instrumentação restante da §5 do roadmap: apenas **duração de
  sessão** (tutorial, missões e desbloqueios entraram na §7).
- Backend/social (Fases 6–8 de `SOCIAL.md`) segue intocado: ranking
  global comparativo, Corrida do Dia de servidor com as flags ligadas,
  torneios de clãs e chat/clãs — ver limitações na §7. Nada disso foi
  simulado.

## 6. Commits da rodada 1

```
10a64af feat: maestria, metricas locais e correcao da percepcao da loja
57b94b3 fix: placeholder de anuncio escondido sem AdSense real e selo Novo sem clip
17823d4 feat: card visual da skin equipada no menu
a9ed737 fix: versao so desktop — removeu mobile, haptics, safe-area, bottom sheets
a110308 fix: passo fixo 1/60, contabilidade unica por corrida e input/audio
4ed4d52 fix(security): endurecimento de submit_run, politica do chat e CSP
```

## 7. Rodada 2 — prompt de retenção (27–28/10/2026)

Execução fase a fase do prompt grande de retenção (a Fase 1 — correções
de regressão e contradição do próprio prompt — já estava publicada com a
rodada 1). Cada fase: os 4 comandos da régua, commit em português, push
em `master` e verificação da produção (HTTP sem cache + `git ls-remote`),
com bump do `CACHE_VERSION` do `sw.js` a cada mudança de asset.

### Resultado final (28/10/2026, `427b98e`)

| Bateria | Comando | Resultado |
|---------|---------|-----------|
| Simulação do jogo inteiro | `node tests/smoke.mjs` | **69/69** |
| Testes unitários | `node --test tests/*.test.mjs` | **236/237** (1 falha pré-conhecida, §2) |
| Referências internas | `node tools/validate-refs.mjs` | 1 falha pré-conhecida (§2) |
| Auditoria de UI | `node tools/audit-ui.mjs` | 1 falha pré-conhecida (§2; peso do CSS aprovado) |

Produção verificada: `SW_PROD=orblux-v22`; `desafio.js` 200 e no
PRECACHE; `daily-local-play` e `missions-week-list` no HTML; hooks de
desafio/métricas presentes no `main.js`; `git ls-remote` = `427b98e`.

### Fase 2a — Títulos da Maestria (`03eaff2`, sw v20 no commit seguinte)

- `TITULOS` (8 faixas: Iniciante do Pulso → Orblux Supremo) e
  `tituloDeNivel()` em `js/core/maestria.js` — identidade permanente
  por nível, **cosmético puro**.
- Exibição: card `#maestria-next` do menu (substituiu o label
  genérico), `aria-label` do chip no topbar, linha do fim de jogo e
  toast de novo título quando a faixa muda.
- `tests/maestria.test.mjs` estendido (monotonicidade e bordas).
- Nota: este commit saiu **sem** bump do `CACHE_VERSION`; o `orblux-v20`
  da Fase 2b cobriu junto (lição da "correção sem bump" registrada).

### Fase 2b — Missões semanais (`1f6ee17`, sw v20)

- `weekKey()` em `js/core/state.js` (segunda-feira local); chave única
  `pn_missions` ganha o campo `semana { date, list }` com migração
  automática de save antigo — sem chave nova.
- 9 `WEEKLY_TEMPLATES` → pick semeado por semana (3 missões; ids `w_`
  não colidem com os diários); `applyProgress` cobre as DUAS listas;
  `complete()` paga pela tabela certa.
- `WEEKLY_MISSION_COINS = {60, 100, 160}` em `economy.js` — acima da
  diária e abaixo de 7× a diária (equilíbrio testado).
- Seção "Semana" no card de missões (`.missions-week-title`, colapsa
  junto com a diária).
- `tests/missions.test.mjs` novo: **7/7** (semana, pick determinístico,
  reporte duplo, migração, reset da semana e moedas).

### Fase 3 — Desafio do Dia local (`874b5ce`, sw v21)

- Novo `js/core/desafio.js`: semente 100% do calendário
  (`dia-YYYY-MM-DD`) — mesmo `mulberry32/hashSeed` gera o MESMO
  percurso em qualquer aparelho no mesmo dia, **sem servidor**;
  recordes locais do dia e da semana em `pn_desafio`, com reset
  automático por período (`registrarPartidaDesafio` retorna `null`
  para semente alheia — corrida normal não mexe em nada).
- Card `#daily-race`-vizinho `#daily-local` no Ranking registrado
  **antes** do gate de flags em `ranking.js` (sempre visível); botão
  `jogarDesafioLocal` → `startGame({ seed: sementeDoDia() })` — o
  MESMO mecanismo da Corrida do Dia do servidor. **Spawner intocado.**
- Hook em `accountRun` (`js/main.js`) com toast "Novo recorde do
  Desafio do Dia"; honestidade: sem ranking global fictício e sem
  moedas extras — recorde é local ("neste aparelho").
- `desafio.js` no PRECACHE; `tests/desafio.test.mjs`: **6/6**.

### Fase 4 — Métricas extras (`427b98e`, sw v22)

- `js/core/metricas.js` ganha `tutorial` (0/1, idempotente — só o
  `tutorial:done` real), `missoes` (diárias+semanais, via
  `missions:completed`) e `desbloqueios` (só `grantSkin`, cujo emit é
  `owned:true`) em `pn_metricas`.
- Hooks em `js/main.js` junto do `registrarPartida` existente; resumo
  em Ajustes > Dados (`#metrics-summary`), que re-renderiza a cada
  abertura da tela.
- `tests/metricas.test.mjs` +**4** (save antigo zerado, idempotência,
  persistência e validação de dado inválido).

### Limitações de backend (nada foi simulado)

| Item | Por que depende de backend | Estado |
|---|---|---|
| Ranking global comparativo | exige servidor como fonte da verdade (`net/api.js`, `SOCIAL.md` §4) | flag `GLOBAL_RANKING_ENABLED` desligada; card oculto |
| Corrida do Dia de servidor | semente diária entregue pelo servidor, com validação | `#daily-race` intacto e oculto (flags `TOURNAMENTS_ENABLED`/`GLOBAL_RANKING_ENABLED`) |
| Torneios de clãs, chat, clãs | presença, contas e moderação | não implementados, conforme proibição do prompt |
| Desafio do Dia — comparação e medalhas | rodada local não compara jogadores | só recorde local honesto; sem moedas extras |

Também segue pendente (não-frontend): duração de sessão nas métricas e
as suítes Playwright (§5).

### Commits da rodada 2

```
427b98e feat: metricas de tutorial, missoes concluidas e desbloqueios
874b5ce feat: Desafio do Dia local — rota fixa por data e recorde dia/semana
1f6ee17 feat: missoes semanais com reset na segunda e recompensoes proprias
03eaff2 feat: titulos da Maestria — identidade permanente por nivel
```
