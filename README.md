# ORBLUX

Jogo arcade neon no navegador (PWA offline, 100% pt-BR, sem dependências externas). Colete pulsos, acumule combos e desvie das barreiras — partidas de 1 a 3 minutos no celular ou no computador.

## Rodar

```powershell
node dev-server.mjs 8080
```

Abra <http://localhost:8080>. Sem build: HTML + CSS + ES modules puros.

## Testes

```powershell
node tests/scene-ui.cjs        # cena e game feel
node tests/responsive-ui.cjs   # 360x640, 390x844 e 1280x720 sem overflow
node tests/accessibility-ui.cjs # contraste WCAG nas 8 telas
node tests/menu-regression.cjs # regressão do menu
node tests/economy-ui.cjs      # moedas, missões e ledger
```

Pré-requisito: `npm i -D playwright-chromium` (o dev server em :8080 sobe sozinho se preciso).

## Estrutura

- `index.html` — todas as telas (menu, HUD, pausa, fim de jogo, ajustes…)
- `css/style.css` — tema, motion e responsivo
- `js/game/` — loop, entidades, spawner, partículas
- `js/ui/` — telas, HUD, missões, ranking, loja, toasts
- `js/core/` — estado, áudio, entrada, carteira
- `sw.js` + `manifest.webmanifest` — PWA offline com aviso de atualização

## Público e conteúdo

Classificação livre, sem conteúdo impróprio, sem compras reais (moedas só jogando), anúncios apenas com consentimento (LGPD revisável em Ajustes → Sobre).
