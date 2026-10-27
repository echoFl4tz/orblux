# Roadmap de retenção — ORBLUX

Fonte: análise externa de retenção (pontos observáveis + recomendações).
Escopo: traduzir a análise para o estado real do código, separando o que já
existe do que falta. Nada aqui foi implementado; é um plano de produto.

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
- Verificar a percepção de "loja indisponível".
- Medir antes de mexer em balanceamento.

### P2 — Progressão permanente (Maestria)
- XP de maestria por jogar/completar desafios, com níveis e recompensas
  **cosméticas** (não poder). Títulos, emblemas, rastros, auras, skins.
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
- Mostrar pontuação, recorde, XP de maestria, moedas, missões concluídas,
  progresso p/ próxima recompensa + 3 ações: JOGAR NOVAMENTE / VER RECOMPENSAS / MENU.

## 5. Medição mínima (antes de crescer)
- Início de partida, conclusão de tutorial, duração de sessão, partidas por
  sessão, retorno D+1 e D+7, conclusão de missões, desbloqueios.
- Instrumentação local agregada primeiro; comparar antes/depois de cada mudança.

## 6. Regras do projeto (invioláveis)
- Determinismo da Corrida do Dia preservado (spawner intocado).
- localStorage sempre com prefixo `pn_`.
- Sem dependências/build novas; sem segredos no repo.
- UI em pt-BR, sem emojis; desktop-only (conversão já publicada).
