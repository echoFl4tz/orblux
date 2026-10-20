# Changelog — ORBLUX

## 1.1.0 — 20/10/2026 (eventos de partida + drops)

### Novos drops (8, camada aditiva — o jogo base continua igual)
- **Ímã** (comum, nível 1): atrai pulsos próximos por 7 s.
- **Reparo** (rara, nível 2): recupera 1 vida; some com vida cheia, chance dobra com 1 vida.
- **Fase** (rara, nível 3): atravessa obstáculos por 4 s (orbe translúcida).
- **Câmara lenta** (incomum, nível 2): mundo a 70% por 5 s — a pontuação não muda.
- **Trava de combo** (incomum, nível 2): congela a janela do combo por 8 s.
- **Nova** (rara, nível 3): limpa a tela; +30 por item (teto de 10 itens); no máximo 3 por partida.
- **Surto de pulsos** (incomum, nível 1): solta uma fileira de 3 pulsos.
- **Cristal** (incomum, nível 2): vale 3 moedas ao fim da partida (teto de 5).
- Regras: no máximo 3 efeitos simultâneos (renovar não empilha), spawn nunca sobre barreira, RNG próprio separado do spawner (determinismo bit a bit do jogo base garantido por teste).

### Novos eventos de partida (5, com aviso de 2 s)
- **Chuva de Pulsos** (nível 2): clusters de pulsos e barreiras raras.
- **Tempestade de Barreiras** (nível 3): barreiras com passagem larga telegrafada; +150 pontos se completar sem bater.
- **Hora Dourada** (nível 2): coleta vale 50% a mais por 8 s.
- **Frenesi de Combo** (nível 2): janela do combo dobrada (3,5 → 6 s).
- **Apagão** (nível 4): luz cai; só pulsos e orbe brilham (halo barato em sprite).
- Regras: 1º evento após 25 s e nível ≥2, intervalo ≥35 s, no máximo 1 ativo, fim limpo, pausa respeitada, "Reduzir movimento" com versão calma.

### Integrações
- Missões diárias: Pegue 3 Ímãs, Complete 2 eventos, Sobreviva a uma Tempestade sem bater (recompensas inalteradas).
- Conquistas: Primeiro evento, Sem arranhão, Colecionador de drops.
- Como jogar: itens Drops e Eventos. Fim de jogo: chips "N drops" e "N eventos".
- Ajustes → Jogabilidade: interruptor Eventos (ligado por padrão).
- Estatísticas novas salvas: total de drops, tipos coletados, eventos completados e sem arranhão.
- Corrida do Dia (partida semeada) mantém tudo novo desligado — mesma semente, mesma corrida para todos.

### Técnico
- Service worker cache v13 (inclui `js/game/drops.js` e `js/game/eventos.js`).
- 26 testes novos (determinismo, cap de efeitos, rota segura em 500 sementes, scheduler) + smoke 62/62.

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
