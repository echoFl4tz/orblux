# Roadmap de retenção — ORBLUX

Fonte: análise externa de retenção (pontos observáveis + recomendações).
Escopo: traduzir a análise para o estado real do código, separando o que já
existe do que falta. **Status (27/10/2026): P1 (loja), P2 (Maestria), §4
(tela de resultados) e §5 (medição local) implementados** — ver notas em
cada seção; o resto continua como plano de produto.

## 1. O que já existe e deve ser aproveitado

| Sistema | No código hoje | Observação |
|---|---|---|
| Loop principal (orbes + obstáculos) | `js/game/game.js` | Base sã; mantida |
| Combos (x5) | `js/game/` | Risco/recompensa |
| Power-ups (escudo, ímã, turbo, dreno) | drops atuais | Variedade por partida |
| Eventos aleatórios | chuva de pulsos etc. | Ritmo |
| Moedas + carteira | `js/core/` prefixo `pn_` | Sustenta progressão |
| Missões diárias | card no menu | Objetivo de curto prazo |
| Recompensa diária | presente/btn daily | Motivo de retorno |
| Skins (paleta/rastro/aura) | `skins.js` + `skinrender.js` | Coleção em potencial |
| Ranking local + estrutura global | `state.ranking` | Competição |
| Chat / clãs / torneios (estrutura) | UI presente | Depende de jogadores ativos |
| Corrida do Dia (mesma semente) | spawner determinístico | Diferencial arcade |

## 2. Riscos de retenção identificados

- Skins: já há catálogo e loja funcional (`skins-shop.js`), mas a percepção de
  "loja vazia/indisponível" precisa ser verificada na UI real.
- Muitos sistemas na tela inicial → risco de o jogador não saber por onde começar.
- Progressão "a longo prazo" depende só de recorde + skins.
- Equilíbrio (velocidade, janela de combo de 3,5 s, combos de evento+obstáculo)
  precisa de medição, não de ajuste por intuição.

## 3. Prioridades (ordem sugerida)

### P1 — Consolidar o que existe
- Garantir salvamento/recuperação, missões, moedas, ranking e Corrida do Dia
  ponta a ponta.
- ~~Verificar a percepção de "loja indisponível".~~ **Feito:** o card mostrava
  "Indisponível" sem preço da Play, mesmo com compra por moedas ativa no
  detalhe. Cards agora exibem o preço em moedas (destaque amarelo), o banner
  explica que só o DINHEIRO depende da Play e o chip virou "Sem compras em
  dinheiro" (`js/ui/skins-shop.js` stateText/stateClass/renderShopStatus).
- Medir antes de mexer em balanceamento.

### P2 — Progressão permanente (Maestria)
- ~~XP de maestria por jogar, com níveis e recompensas **cosméticas**.~~
  **Feito:** `js/core/maestria.js` — XP = 10% do placar (piso 10/teto 500),
  creditado 1× por corrida dentro de `accountRun` (dedupe por runId + run-flow);
  curva `xpParaNivel(n) = 100 + (n-1)·40`; trilha de recompensas nos níveis
  2/5/10/20/30/50 concede skins por habilidade (fonte `maestria` — imune a
  revogação do billing, apagada junto com o XP no reset); chip no topbar,
  bloco "Próxima recompensa" no menu, barra no fim de jogo e toast de nível.
- Regra: habilidade continua sendo o fator de pontuação; maestria só dá status.

### P3 — Skins como objetivos
- Raridade, prévia, desbloqueio claro (compra com moedas OU conquista de
  habilidade, ex.: 10.000 pts sem perder vida).
- Coleções temáticas (Neon, Abissal, Plasma, Cósmica, Relíquia).

### P4 — Identidade por partida (modificadores)
- Modos que mudam estratégia de verdade (Caçapa/Precisão/Sobrevivência/Frenesi),
  começar por UM bem feito.

### P5 — Corrida do Dia como competição
- Ranking diário/semanal/histórico, medalhas, tentativas limitadas, validação
  no servidor para reduzir fraude.
- Semente já é determinística — base pronta.

### P6 — Jornada dos 30 dias
- Missões encadeadas que ensinam mecânicas ("Primeiro Contato" → skin).
- Sem punição por dias sem jogar.

### P7 — Social
- Desafios por link, rivais, clãs com objetivos coletivos, torneios
  assíncronos. Não priorizar chat/clãs antes de provarem retenção.

### Depois: Temporadas
- 4 semanas, temática, trilha cosmética gratuita, sem vantagem comprável.

## 4. Tela de resultados (ganho rápido)
- ~~Mostrar pontuação, recorde, XP de maestria, moedas, missões concluídas,
  progresso p/ próxima recompensa~~ **Feito:** placar/recorde já existiam;
  agora há a linha "+N XP" (só quando creditado), as 3 barras de progresso
  (próxima skin, missões e maestria) e as ações JOGAR NOVAMENTE / MENU.

## 5. Medição mínima (antes de crescer)
- ~~Instrumentação local agregada primeiro~~ **Feito (base):**
  `js/core/metricas.js` — sessões, partidas, partidas/sessão e retorno
  aproximado D+1/D+7 (local e anônimo, `pn_metricas`), exibido em
  Ajustes > Dados. Falta instrumentar: conclusão de tutorial, duração de
  sessão, conclusão de missões e desbloqueios.
- Comparar antes/depois de cada mudança.

## 6. Regras do projeto (invioláveis)
- Determinismo da Corrida do Dia preservado (spawner intocado).
- localStorage sempre com prefixo `pn_`.
- Sem dependências/build novas; sem segredos no repo.
- UI em pt-BR, sem emojis; desktop-only (conversão já publicada).
