# Changelog — ORBLUX

## 1.0.0 — 18/10/2026 (lançamento)

Primeira versão pública.

### Jogo
- Arcade neon: pulsos, combos, níveis a cada 1000 pontos, ondas progressivas e 4 power-ups.
- Missões do dia, conquistas, ranking local (top 20) e recompensa diária.
- Loja de skins com carteira de moedas (ledger local), reviver com anúncio recompensado e dobrar moedas no fim de jogo (opcional).
- Tutorial na 1ª partida, pausa, contagem 3-2-1 ao voltar de outra aba e fim de jogo com recorde e estatísticas.

### Interface
- Menu com cascata de entrada (30ms), JOGAR em gradiente com respiração e coluna de pódio no desktop.
- HUD enxuto: onda em leitor de tela + toast, pips de vida, micro-barra de nível e barra de combo full-width.
- Bottom sheets no mobile (Ranking, Ajustes, Como jogar, Missões) e ranking em 2 colunas no desktop.
- Motion de 160ms na entrada / 120ms na saída; "Reduzir movimento" e alto contraste em Ajustes.

### Acessibilidade e privacidade
- Contraste ≥7:1 no texto grande, alvos ≥44×44, foco visível e anúncios em `aria-live`.
- LGPD: banner com opções de mesmo destaque e revisão a qualquer momento (Ajustes → Sobre).
- Grupo Sobre com versão, classificação livre, suporte e documentos.

### Técnico
- PWA offline (service worker com cache v12), splash inline sem flash branco e aviso de atualização com "Atualizar".
- Erro global em pt-BR com aviso único; screenshots no manifest para instalação.
