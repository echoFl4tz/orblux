# ORBLUX — Eventos de partida e novos drops

Documento da arquitetura e do balanceamento de `FLAG_DROPS_NOVOS` e
`FLAG_EVENTOS` (lançamento 1.1.0). Números moram nas tabelas de configuração
dos módulos (`DROP_CONFIG` em `js/game/drops.js`, `EVENT_CONFIG` em
`js/game/eventos.js`): balancear mexendo em números, nunca em lógica.

## 1. Regras sagradas (resumo)

- **Determinismo preservado:** o spawner original (`spawner.js`) NÃO foi
  tocado. Com as flags desligadas, a sequência de barreiras/pulsos/drones é
  idêntica à de antes — provada por `tests/fixtures/spawner-snapshot.json`
  (gerado pré-mudanças por `tests/.gen-spawner-snapshot.mjs`) e comparada em
  `tests/drops-eventos.test.mjs`.
- **RNG próprio:** `rngDrops` e `rngEventos` são mulberry32 derivados da
  semente da partida por salt fixo (`"|drops"`, `"|eventos"`); sem semente,
  Math.random. Nunca consomem o rng do spawner.
- **Corrida do Dia (semente) desliga eventos e drops novos:** duas pessoas
  com a MESMA semente precisam da MESMA corrida independente de configuração
  pessoal — decidimos forçar off em runs com semente (mais simples e justo
  que sincronizar settings no ranking).
- **Ranking único:** sem separação. Os eventos/drops não multiplicam a
  pontuação base: Hora Dourada só multiplica coleta durante 8 s (com cap
  implícito pela duração), Tempestade paga bônus fixo de 150, Cristal/Nova
  têm teto por partida. Partidas com eventos ligados e desligados seguem
  comparáveis.
- **Sem compras/dark patterns:** nada aqui é vendido, sorteado com dinheiro
  ou vinculado a skin. Anúncio recompensado nunca interrompe evento.

## 2. Camadas (nada reescreve o que existe)

| Camada | Onde | Como |
|---|---|---|
| Efeitos temporários de drop | `g.dropFx = { kind: restante }` | `update()` lê com fallback `g.dropFx?.kind` |
| Mods de evento | `g.eventoMod = { obstMul, pickupMul, comboWindow, goldMul, safeCol }` | spawn/combo/coleta leem `\|\|` padrão |
| Spawn de drop | `g.drops[]` + timer próprio (`rngDrops`) | colisão própria no update, render próprio |
| Scheduler de evento | `updateEventos(g, dt)` | aviso 2 s → ativo → fim limpo |
| Escudo/x2 legados | intocados | spawner original continua sorteando os dois |

### Cap de efeitos simultâneos
No máximo **3** efeitos temporários (imã, fantasma, tempo, trava). Pegar um
já ativo **renova**; com 3 ativos, o novo substitui o mais antigo. Escudo e
x2 seguem o slot legado deles, sem mudar comportamento.

### Piedade (anti-frustração)
`g.dropSemTempo` cresce sem drop coletado; peso dos drops raros recebe
multiplicador `1 + min(1, semTempo/45)` — chance dobra no teto, **nunca é
garantida em sequência**. Vida cheia: Reparo sai do pool. Vida 1: peso do
Reparo dobra.

### Rota segura
Antes de qualquer padrão de barreira de evento (Tempestade), `temRotaSegura`
valida passagem ≥ `2*r + margem(0,35 s × velocidade)` — teste com 500+
sementes em níveis baixos/médios/altos.

## 3. Drops — tabela de balanceamento (final)

| Id | Nome | Efeito | Duração | Raridade | Peso | Nível mín. | Cooldown | Teto |
|---|---|---|---|---|---|---|---|---|
| `escudo` | Escudo (legado) | absorve 1 batida | até usar | comum | spawner original | — | — | — |
| `x2` | Dobro (legado) | dobra pontos | 8 s | comum | spawner original | — | — | — |
| `imã` | Ímã | atrai pulsos num raio de 150×S | 7 s | comum | 28 | 1 | 8 s | — |
| `coracao` | Reparo | +1 vida (máx. 3) | instant. | rara | 10 (×2 com 1 vida; 0 com vida cheia) | 2 | 10 s | — |
| `fantasma` | Fase | atravessa obstáculos; pisca nos últimos 1,5 s | 4 s | rara | 8 | 3 | 14 s | — |
| `tempo` | Câmara lenta | corredor a 70% por 5 s; **pontuação intacta** | 5 s | incomum | 16 | 2 | 10 s | — |
| `combo` | Trava de combo | congela o cronômetro de 3,5 s | 8 s | incomum | 16 | 2 | 10 s | — |
| `nova` | Nova | remove obstáculos/drones da tela; +30/item | instant. | rara | 7 | 3 | 15 s | 3/partida |
| `surto` | Surto de pulsos | fileira de 3 pulsos à frente | instant. | incomum | 15 | 1 | 6 s | — |
| `moeda` | Cristal | +3 moedas da partida | instant. | incomum | 10 | 2 | 12 s | 5/partida |

Spawn: primeiro ~7 s, depois 9–13 s (timer próprio). Nasce a ≥90×S de
qualquer obstáculo (4 tentativas, senão desiste). Forma = categoria, cor =
papel (nunca vermelho em drop positivo). Toast curto na primeira vez de cada
um (`state.stats.vistoDrops`).

## 4. Eventos — tabela de balanceamento (final)

| Id | Nome | O que faz | Duração | Nível mín. | Cor |
|---|---|---|---|---|---|
| `chuva` | Chuva de Pulsos | pulsos ×2 em cadência, clusters; barreiras raras (`obstMul` 2.2) | 10 s | 2 | ciano |
| `tempestade` | Tempestade de Barreiras | cadência ×0.55 com passagem larga telegrafada; +150 se completar sem bater | 12 s | 3 | vermelho-suave (aviso) |
| `hora_dourada` | Hora Dourada | coleta vale ×1,5; fundo ganha tom quente (overlay ≤8% alfa) | 8 s | 2 | dourado |
| `comboFrenesi` | Frenesi de Combo | janela do combo 3,5→6 s; pulsos mais juntos | 10 s | 2 | lima-ciano |
| `apagao` | Apagão | fundo escurece 55%; pulsos ganham halo (sprites; sem shadowBlur) | 10 s | 4 | violeta |

Agendamento: 1º evento só após 25 s e nível ≥2; depois intervalo mínimo de
35 s; **máximo 1 ativo por vez**; aviso de 2 s (toast + faixa no topo + som).
"Reduzir movimento": sem tremor/flash — só aviso estático e cor.
Fim: toast "Evento encerrado", timers zerados, `eventoMod` nulo, cor de
fundo volta com o crossfade já existente (nenhum overlay vaza).
Pausa: o scheduler roda só em `mode === 'playing'` (pausa congela junto).

### Backlog (não implementado nesta versão)
- `ondas` (Maré de Drones): exige refatorar a IA de drones para fases
  sincronizadas sem quebrar o spawner legado.
- `gravidade` (Campo de Gravidade): força lateral na orbe encosta na regra
  "não alterar o que já existe" (movimento); adiado para revisão de física.
- `chefe` (Drone Mestre): entidade grande nova com padrões próprios — escopo
  de uma versão dedicada.

## 5. Integrações

- Missões: "Pegue 3 Ímãs", "Complete 2 eventos", "Sobreviva a uma
  Tempestade sem bater" (campos `magnets`, `events`, `stormClean`).
- Conquistas: `event_first` (Primeiro evento), `event_clean` (Sem arranhão),
  `drop_kinds` (Colecionador de drops — cada tipo 1×).
- Como jogar: seções "Drops" e "Eventos" com mini-ícones do sprite.
- Fim de jogo: chips "N eventos" e "N drops" nas estatísticas.
- Configurações → Jogabilidade: chave "Eventos" (ligada por padrão).
- Salvamento: contadores simples em `state.stats` (totalDrops, dropKinds,
  eventsCompleted, eventsClean, vistoDrops, vistoEventos) — migração por
  defaults defensivos (save antigo continua válido).
- Cristal: `run.crystals` vira +3 moedas cada no crédito da partida
  (`main.js`), sem tocar em `economy.js`.
- SW: `CACHE_VERSION` v13 com `drops.js`/`eventos.js` no PRECACHE.

## 6. Áudio e visual

- SFX novos sintetizados (WebAudio, mesmos buses): `drop` (arpejo curto),
  `drop_prot` (quadratura grave), `drop_tempo` (tom caindo), `evento`
  (aviso duplo), `evento_end` (resolução). Respeitam mudo/volume atuais.
- Glifos no canvas por traços (sem blur/shadowBlur): ferradura, coração
  geométrico, anel duplo, ampulheta, cadeado, estrela de 8 pontas, fileira
  de losangos, losango facetado. Entrada = fade de 400 ms (1 flash).
- Chips do HUD reaproveitam `.power-chip` com contagem radial `--p`.
  Sprite SVG ganha ícones `ic-magnet`, `ic-repair`, `ic-phase`, `ic-slow`,
  `ic-lock`, `ic-nova`, `ic-surge`, `ic-crystal` (traço 2px, currentColor).
