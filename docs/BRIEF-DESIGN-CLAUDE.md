# BRIEFING — Auditoria de design/layout do ORBLUX

> Documento para uma IA analisar o design e o layout do jogo e propor
> melhorias. É autocontido: tudo que a análise precisa está aqui
> (incluindo o estado atual de cada tela e as regras que não podem mudar).
> Responda em **português do Brasil**.

---

## 1. O que é o ORBLUX

Jogo arcade neon de navegador, mobile-first, grátis, 100% jogável sem pagar:

- **Mecânica**: você controla uma **orbe** num corredor cósmico infinito.
  Coleta **pulsos** (losangos ciano) que aumentam o **combo até x5**
  (sem coletar por 3,5 s o combo zera). Desvia de **barreiras** (barras
  vermelhas que descem e drones magenta que oscilam); bater custa 1 vida e
  zera o combo. **Power-ups**: escudo (hexágono verde, absorve 1 batida) e
  x2 (dobra pontos 8 s). A velocidade sobe a cada segundo; a cada 1000
  pontos você sobe de nível. Partidas de 1 a 3 minutos.
- **Público**: jogador casual, majoritariamente **celular** (360×640 a
  414×896), desktop em 2º lugar (1280×720+).
- **Modelo**: moedas do jogo são 100% grátis (missões diárias, ranking,
  conquistas) e compram **skins** cosméticas. Skins nunca alteram ganhos.
  Monetização real = anúncios (banner + recompensado) com consentimento
  LGPD. Interface toda em pt-BR, **sem emojis**.
- **Stack**: HTML + CSS + JavaScript puro (zero frameworks/libs), um
  `<canvas>` 2D de base 1280×720 escalado para a tela, PWA com service
  worker (funciona offline), ~165 testes unitários e 62 de smoke.
  Qualidade de imagem ajustável (Automática/Alta HD/Média/Baixa) em
  Configurações → Imagem; aparelho bom já nasce em Alta.

## 2. Identidade visual atual (tokens reais do CSS)

O design system usa CSS variables em `:root`:

| Papel | Valor |
|---|---|
| Fundo 0 / Fundo 1 | `#05060f` / `#0a0620` |
| Superfície (painel, "vidro") | `rgba(15,18,40,0.74)` + blur 14px + saturate 140% |
| Superfície (botão secundário) | `rgba(26,31,64,0.62)` |
| Linha/borda sutil | `rgba(154,166,200,0.18)` |
| Primário (ciano neon) | `#22e6ff` (glows `0 0 12px` e `0 0 30px` rgba ciano) |
| Secundário (magenta) | `#ff3df0`; para **texto** usa `#ff6ff5` (contraste ≥7:1) |
| Recompensa (dourado) | `#ffe45e` |
| Sucesso (verde) | `#4dff9e` |
| Perigo | `#ff4d6d`; para **texto** `#ff8095` (≥7:1) |
| Texto 1 / Texto 2 | `#f2f6ff` / `#9aa6c8` |
| Tipografia | Display "Orblux Display" (títulos, 800–900), Sans "Orblux Sans" (corpo); logo `clamp(2.6rem,11.5vw,4.6rem)` |
| Espaçamento | escala 4px (`--s1`..`--s8` = 4..32px) |
| Raios | 12 / 16 / 24 / full (pills) |
| Animação | `cubic-bezier(0.22,0.61,0.36,1)`, durações 0.12 / 0.2 / 0.35 s |

Ícones: sprite SVG inline, traço 2px, `currentColor` (~40 ícones).

**No canvas (fundo do jogo)**: "corrida de luz num túnel córmico" — anéis
de túnel, estrelas e poeira em paralaxe; **zonas de cor por nível** (zona 0
ciano frio → zona 3 âmbar quente, com crossfade); power-ups em hexágono
verde; pulsos em losango ciano.

## 3. Layout atual, tela a tela

Todas as telas de menu são "painéis de vidro" centralizados
(`width: min(92vw, 440px)`; wide 540; desktop 520/620; skins 760) com
cabeçalho (título + fechar), corpo com scroll próprio e rodapé de botões.

- **Menu** (`#screen-menu`): logo (orbe SVG + "RB" ciano / "LUX" magenta,
  letter-spacing largo) + tagline "Colete · Combine · Sobreviva". Abaixo,
  coluna central: chip de apelido ("Olá, **Jogador**" com lápis), card de
  recorde (troféu dourado + número), linha de moedas + botão recompensa
  diária, **botão JOGAR** grande (gradiente ciano→magenta), e grade de
  3 colunas de botões quadrados (68px, ícone em cima / rótulo embaixo):
  Como jogar, Ranking, Skins (+badge "Novo"), Comunidade/Chat/Clãs/Torneio
  (ocultos por padrão), Configurações, Instalar. Coluna lateral: card
  "Missões do dia" (acordeão com progresso), espaço de anúncio 320×100
  (oculto), rodapé com links Política/Termos.
  - **Desktop ≥960px**: vira grid 2 colunas (1.1fr/0.9fr): brand+main à
    esquerda, missões à direita, largura total 980px.
  - **Altura ≤540px** (celular deitado): esconde tagline e missões.
- **HUD** (durante partida): topo-esquerda "Pontos" + número grande; centro
  chips `NÍVEL` / `ONDA` + barra de combo com multiplicador; topo-direita
  botão de pausa; base-esquerda corações de vidas; power-ups ativos flutuando;
  toast central de eventos. Flash vermelho de dano na borda.
- **Como jogar**: lista com 5 mini-ilustrações SVG (orbe, pulso, barreira,
  escudo, drone) + texto curto.
- **Ranking**: abas ranking local/global + conquistas (badges) + missões.
- **Configurações**: seções (Áudio: música/soma; Jogo: vibração, reduzir
  movimento, contraste alto; Imagem: qualidade; Controles/privacidade),
  toggles e selects; reset com confirmação.
- **Skins**: grade de cards de skins (clássicas compradas com moedas +
  especiais); estado "comprada/equipada"; prévia da orbe colorida.
- **Fim de jogo**: placar gigante, "novo recorde!" (quando houver), stats
  (combo máx, tempo, pulsos), botões Jogar de novo / Compartilhar
  (WhatsApp, X, copiar) / Menu.
- **Pausa**: painel simples (Continuar / Reiniciar / Menu).
- **Comunidade / Chat / Clãs / Torneio** (ocultos, ativos com flag): telas
  de listas, busca, criação, sala — mesmo padrão de painel de vidro.
- **Extras**: banner de cookies (LGPD), toasts, modal de apelido, tela de
  tutorial na 1ª partida.

## 4. Regras que NÃO podem mudar nas sugestões

São invariantes do produto — qualquer proposta que os viole está descartada:

1. **Mecânica intocável**: hitboxes, velocidades, curvas de dificuldade,
   pontuação, RNG do spawner e semente das partidas não mudam por causa de
   visual. O visual tem RNG próprio separado.
2. **Performance**: 55+ FPS em aparelho modesto (Intel HD 4400 roda a
   56,9 FPS). Nada de filtros custosos em canvas (blur/bloom grandes),
   respeitar limite de partículas. Melhorias de UI em CSS são livres.
3. **Acessibilidade (WCAG)**: contraste texto/fundo ≥7:1 (grandes) e
   ≥4,5:1 (normais) — tokens de texto rosa/vermelho já existem para isso;
   alvos de toque ≥44×44px; foco visível ciano 2px com offset 2px;
   flashes no máx. 3/s; opção "Reduzir movimento" deve continuar
   reduzindo ≥30% da animação sem congelar nada.
4. **Sem libs novas**, sem frameworks, tudo offline-capaz (PWA).
5. **Mobile-first**: 360×640, 390×844 e 1280×720 sem overflow, com
   safe-area (notch).
6. **Interface 100% pt-BR, sem emojis**, sem dark patterns (sem preço
   falso, sem "jogue grátis" escondendo compra).
7. Não inventar telas novas obrigatórias nem exigir login.

## 5. O que JÁ foi feito (não propor de novo)

Já passou por aqui e está commitado — considere como ponto de partida, não
como achado novo:

- **Direção de arte A1–A6**: túnel córmico com zonas de cor por nível e
  crossfade; linguagem visual de perigo (barreira em vermelho danger +
  hachura diagonal animada + aviso no topo antes da entrada) e recompensa
  (hexágono verde "power"); partículas por evento; HUD com NÍVEL/ONDA;
  contraste WCAG conferido em 8 telas (0 violações).
- **A7/A8**: seletor de qualidade de imagem (Automática/Alta/Média/Baixa);
  aparelho bom já nasce em Alta (HD) por sonda de desempenho.
- **UX**: menu sem botão órfão (grade 3 colunas), safe-area em tudo,
  inputs ≥16px (sem zoom no teclado), toques ≥44px, banner de cookies,
  "Reduzir movimento", "Contraste alto", badge "Novo" em skins.

## 6. Onde queremos que a análise foque (nossas dúvidas)

Responda com opinião fundamentada, em ordem de prioridade:

1. **Menu**: a coluna central (apelido → recorde → moedas → JOGAR → grade)
   está hierarquicamente correta? O botão JOGAR destaca o suficiente? A
   grade 3×N de botões iguais parece "planilha" ou funciona? O card de
   missões na lateral some no mobile — onde ele deveria viver no celular?
2. **Identidade**: o menu usa os mesmos painéis de vidro de todas as
   outras telas — falta alma/perso­nalidade? O logo é forte o bastante?
   Dá pra evoluir a estética "neon genérico" para algo mais memorável
   sem perder acessibilidade/performance?
3. **HUD**: em 360px, score + chips + combo + pausa + vidas ficam
   poluídos? O que sumiria/embararia sem perder informação?
4. **Fim de jogo**: o placar gigante é o herói certo? A emoção de "novo
   recorde" está bem vendida? Compartilhar está no lugar certo?
5. **Painéis internos** (Ranking, Skins, Configurações): todos terem o
   mesmo card 440px tira hierarquia — propõe variações?
6. **Transições e motion**: as telas entram com fade+12px — é o tom certo
   para um jogo rápido? Alguma microinteração que valha a pena (count-up
   do placar, pulso do combo, etc.) respeitando "Reduzir movimento"?
7. **Cores**: a paleta (ciano + magenta + dourado + verde) está bem
   usada ou há papéis se misturando (ex.: dourado aparecendo em demasia)?

## 7. Formato da resposta desejado

- **Auditoria priorizada**: lista P0 (impacto alto, esforço baixo) / P1 /
  P2, uma linha por item: *problema → por quê → sugestão concreta*.
- Para cada sugestão, indique o **esforço**: `só CSS`, `CSS+HTML`,
  `toca canvas/JS` (esses últimos queremos poucos e bem justificados).
- **Wireframes em texto** (ASCII) para as 3 telas que você considerar mais
  importantes (provavelmente Menu mobile, Menu desktop e Fim de jogo).
- Se propor mudanças de cor/tipografia, liste os **tokens exatos**
  (hex + nome da variável) para eu aplicar direto.
- Cite sempre qual regra da seção 4 a sugestão respeita, e se ela passa
  em 360×640 AND 1280×720.
- Termine com as **3 mudanças de maior retorno** se só pudermos fazer
  três.

## 8. Anexos (capturas reais do jogo)

Sugestão: anexar estas imagens junto do briefing para a análise visual
(antes/depois da direção de arte e estado atual das telas):

- `docs/captures/direcao-a6/depois/menu-390x844.png` e `menu-1280x720.png`
- `docs/captures/direcao-a6/depois/partida20s-390x844.png` (HUD em partida)
- `docs/captures/direcao-a6/depois/ajustes-390x844.png`
- `docs/captures/etapa4/fim-de-jogo-390x844.png`
- `docs/captures/etapa4/loja-detalhe-390x844.png`
- `docs/captures/social-fase2/global-390x844.png` (ranking global)
- Opcional (estado antigo, para contraste): `docs/captures/direcao-a6/antes/menu-390x844.png`
