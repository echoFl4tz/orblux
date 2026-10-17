# 🕹️ ORBLUX

Jogo arcade neon para navegador — **colete pulsos, acumule combos (até ×5) e desvie das barreiras**.
Partidas de 1 a 3 minutos, grátis, leve, funciona no celular e no computador.
100% HTML + CSS + JavaScript puro (sem frameworks, sem dependências, fontes auto-hospedadas).

> 📌 Renomeado de "Pulso Neon" para **ORBLUX**. O prefixo das chaves do `localStorage`
> permanece `pn_` de propósito, para não apagar o progresso de jogadores antigos.

---

## ▶️ Como rodar localmente

O projeto usa módulos ES e service worker, então precisa de um servidor (não funciona abrindo o arquivo com duplo clique).

**Opção 1 — Node (recomendado, já incluso):**

```bash
cd pulso-neon
node dev-server.mjs          # abre em http://localhost:8080
node dev-server.mjs 3000     # outra porta, se quiser
```

**Opção 2 — Python:**

```bash
python -m http.server 8080
```

**Opção 3 — Extensão "Live Server"** no VS Code (clique direito em `index.html` → *Open with Live Server*).

---

## 🚀 Como publicar de graça

Antes de publicar, troque os placeholders:
- `EXEMPLO.com` no `index.html` (canonical + Open Graph) e em `js/ui/share.js` (link ao compartilhar)
- `seu@email.com` no `privacy.html`

### Netlify (mais fácil)
1. Acesse [netlify.com](https://www.netlify.com) → *Add new site* → *Deploy manually*.
2. Arraste a **pasta `pulso-neon`** inteira na área de upload. Pronto.
3. Em *Site settings* → *Change site name* para um nome curto (ex.: `orblux`).

### Vercel
1. Suba a pasta para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → *Import* → framework: **Other** → *Deploy*. Sem build.

### GitHub Pages
1. Crie o repositório e suba a pasta.
2. *Settings* → *Pages* → Source: `main` / pasta `/ (root)`.
3. Em minutos o jogo estará em `https://SEU-USUARIO.github.io/REPO/`.

> PWA/offline: funciona em qualquer host com HTTPS (os gratuitos já têm).

---

## 💰 Como configurar os anúncios

Tudo está preparado; os placeholders somem quando o anúncio real entra.

### Google AdSense (banner + intersticial)
1. Crie sua conta em [adsense.google.com](https://adsense.google.com) e cadastre o domínio publicado.
2. No `index.html`, cole o snippet do AdSense no `<head>` (há um bloco de comentário indicando o lugar), trocando `ca-pub-XXXXXXXXXXXXXXXX` pelo seu ID.
3. Crie uma unidade de anúncio e cole o `<ins class="adsbygoogle" …>` dentro de `#ad-banner` (tela inicial). O placeholder some sozinho.
4. Em `js/monetization/ads.js`, ligue:
   ```js
   export const ADS = { enabled: true, client: 'ca-pub-XXXXXXXXXXXXXXXX', interstitialEvery: 3 };
   ```
5. Intersticial: cole a unidade dentro do `.ad-box-big` de `#ad-interstitial` (o fluxo de abertura/fechamento já existe e respeita o consentimento LGPD).

### Anúncio recompensado ("assistir e reviver")
- O fluxo completo já funciona com um anúncio de exemplo de 5 segundos (placeholder).
- Para vídeo real (AdSterra, Playwire, etc.), troque o conteúdo de `.ad-box-big` em `#ad-reward` pelo iframe/SDK do provedor e só chame o `onReward` quando o SDK disparar o evento de recompensa (o comentário no código marca o ponto).

### Consentimento (LGPD)
O banner de cookies aparece na 1ª visita. Sem aceite, os slots de anúncio ficam ocultos — ative a exibição apenas após consentimento conforme a política do AdSense.

---

## 🌍 Ranking global (opcional)

O ranking local (localStorage) já funciona. O ranking global faz parte da camada social (`SOCIAL.md`): ligue a flag `GLOBAL_RANKING_ENABLED` em `net/flags.js` (ou `?social=1` em localhost) e configure o Supabase em `net/config.js`. O envio da partida é automático ao fim de cada jogo (`submitRunGlobal` em `js/ui/ranking.js`), com plausibilidade validada no servidor (`net/rules.js`).

---

## 🧪 Testes e ferramentas

```bash
node tests/smoke.mjs           # simula o jogo inteiro: 62 testes (lógica, colisões, ranking, ritmo, ondas…)
node --test tests/*.test.mjs   # testes unitários: 164 (economia, skins, billing, backend-parity, score, migração, tema…)
node tools/validate-refs.mjs   # confere imports, IDs do HTML e assets
node tools/audit-ui.mjs        # QA: sem emojis/inglês na interface, aria, tokens, peso < 150 KB
node tools/gen-icons.mjs       # regenera os PNGs de ícone, maskable, apple-touch e og-image
node tools/fetch-fonts.mjs     # baixa as fontes (subset latin) e gera css/fonts.css
```

Suítes de navegador (17, Playwright — sobem o dev server sozinhas):
`wallet-ui`, `coins-ui`, `economy-ui`, `skins-shop-ui`, `nickname-ui`,
`menu-regression`, `social-entry-ui`, `ranking-global-ui`, `chat-ui`,
`clans-ui`, `tournament-ui`, `sw-update`, `responsive-ui`,
`accessibility-ui`, `style-dev-ui`, `scene-ui`, `perf-ui` — rode com `node tests/<suite>.cjs`.
A `perf-ui` abre janela (headed) de propósito: mede 55+ FPS com CPU
throttle 4x em GPU real, o cenário de celular de entrada.

O mapa completo (o que cada teste cobre, resultado da última rodada
íntegra e o checklist de produção) está em **`AUDITORIA.md`**.

### QA visual (redesign ORBLUX)
1. Abra `http://localhost:8080/tools/qa-sizes.html` — o jogo em iframes nos 6 tamanhos alvo
   (360×640, 390×844, 412×915, 768×1024, 1366×768, 1920×1080).
2. Em cada aba, rode no console `OX.auditLayout()` — deve retornar `{ ok: true }` (zero overflow-x).
3. Confira também: foco visível com Tab, Esc fechando modais, `Reduzir movimento` nas configurações.

Veja `STYLEGUIDE.md` para tokens e regras do design system.

---

## 📁 Estrutura

```
pulso-neon/
├── index.html            # sprite SVG, telas, HUD, modais de anúncio, banner LGPD
├── logo.svg              # logotipo de referência (orbe + ORB ciano + LUX magenta)
├── css/
│   ├── style.css         # design system (tokens em :root) + telas + HUD
│   └── fonts.css         # @font-face local (gerado por tools/fetch-fonts.mjs)
├── assets/fonts/         # woff2 auto-hospedados (Orblux Display + Orblux Sans)
├── js/
│   ├── main.js           # bootstrap + fluxo de fim de partida + OX.auditLayout()
│   ├── core/             # loop, input, áudio (Web Audio), storage, estado, eventos
│   ├── game/             # game.js (regras), entities, spawner (dificuldade), particles, tutorial
│   ├── ui/               # screens, hud, toasts, achievements, missions, ranking, share
│   └── monetization/ads.js
├── sw.js · manifest.webmanifest · favicon.svg · icons/ (PNGs da marca)
├── privacy.html          # Política de Privacidade (LGPD)
├── STYLEGUIDE.md         # tokens, componentes e regras do design system
├── AUDITORIA.md          # inventário de testes, matriz de conformidade e checklist de produção
├── dev-server.mjs        # servidor local sem dependências
└── tests/ · tools/       # smoke, auditorias, geradores e QA multi-tamanho
```

---

## 💡 Ideias para próximas atualizações

1. **Modos de jogo**: Clássico (atual), Turbo (tudo 2× mais rápido) e Espelho (controles invertidos).
2. **Temas visuais desbloqueáveis** (synthwave, space, candy) comprados com "energia" ganha no jogo.
3. **Missões semanais** além das diárias, com medalha exclusiva.
4. **Novos obstáculos**: lasers horizontais, perseguidores e paredes com portais.
5. **Power-up "ímã"** que puxa pulsos por alguns segundos.
6. **Modo diário** com semente fixa (todos jogam a mesma partida — ranking diário).
7. **Conquistas sociais**: "superei o recorde de X" com link direto.
8. **Board de recordes mundial** com nomes curtos (já com estrutura Supabase pronta).
9. **Beta PWA completo**: tela de "atualização disponível" e botão de instalar mais visível.
10. **A/B test** de velocidade inicial para refinar o balanceamento com dados reais.
