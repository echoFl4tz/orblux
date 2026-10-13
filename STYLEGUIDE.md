# ORBLUX — Style Guide

Guia curto do design system. Tokens em `css/style.css` (`:root`); componentes são CSS puro, sem frameworks.

## 1. Tokens

### Cores
| Token | Valor | Uso |
|---|---|---|
| `--bg-0` / `--bg-1` | `#05060f` / `#0a0620` | fundo base / fundo inferior |
| `--primary` | `#22e6ff` (ciano) | ação primária, foco, links, coletáveis |
| `--secondary` | `#ff3df0` (magenta) | segunda cor da marca, drones, gradientes |
| `--reward` | `#ffe45e` (amarelo) | recompensas, combo, novos recordes |
| `--success` | `#4dff9e` (verde) | escudo, missão concluída, reviver |
| `--danger` | `#ff4d6d` (vermelho) | obstáculos, vidas, ações destrutivas |
| `--text-1` / `--text-2` | `#f2f6ff` / `#9aa6c8` | texto principal / secundário (AA) |
| `--surface-1` / `--surface-2` | `rgba(...)` | vidro de painéis / botões |
| `--surface-solid` | `#0d1024` | fallback sem `backdrop-filter` |

### Tipografia
- `--font-display` (**Orblux Display**, auto-hospedada): títulos, números, botões.
- `--font-sans` (**Orblux Sans**, auto-hospedada): textos corridos.
- Escala fluida: `--fs-logo`, `--fs-h2`, `--fs-body`, `--fs-score` (todas com `clamp()`).
- Números sempre com `font-variant-numeric: tabular-nums`.

### Espaço / raios / sombra
- Espaço: `--s1..--s8` (4→32px, múltiplos de 4).
- Raios: `--r-sm` 12 (botões), `--r-md` 16 (cards), `--r-lg` 24 (painéis), `--r-full`.
- Brilhos: `--glow-1/2` (ciano) e `--glow-pink-1/2` (magenta) — no máximo 2 camadas por elemento.

## 2. Componentes

| Classe | Papel |
|---|---|
| `.btn` | botão base (vidro, min 48px) |
| `.btn-primary` | gradiente ciano→magenta, brilho, texto escuro |
| `.btn-danger` / `.btn-success` | perigo / recompensa (borda + texto coloridos) |
| `.btn-ghost` / `.icon-btn` | fantasma / só-ícone (48px, precisa de `aria-label`) |
| `.panel` (+ `.panel-head/.panel-body/.panel-foot`) | painel de vidro padrão de todas as telas/modais |
| `.screen` | camada de tela; ativa com `.active` (via `showScreen`) |
| `.modal` | overlay escuro para confirmar/compartilhar/anúncios |
| `.chip` (+ `-reward`/`-success`) | etiqueta pequena (recompensa, nível, contador) |
| `.toast` | notificação no topo (máx. 3, barra de tempo) |
| `.record-card`, `.mission-row`, `.achievement`, `.podium-slot` | blocos do menu/ranking |
| `.hud-*` | placar, combo, vidas, power-ups, aviso de perigo |
| `.switch` / `.range` | toggle e slider nativos customizados |

## 3. Ícones
- Sprite SVG único no `index.html` (`<symbol id="ic-*">`, traço 2px, cantos arredondados).
- Uso: `<svg class="ic" aria-hidden="true"><use href="#ic-play"/></svg>`.
- **Proibido emoji na interface** (permitido só no texto de compartilhamento).
- Ícone sem texto visível ⇒ botão **precisa** de `aria-label`.

## 4. Regras de ouro
1. **Sem overflow-x** em nenhuma tela — rode `OX.auditLayout()` (deve retornar `{ok:true}`).
2. Alvos de toque ≥ 44px (padrão do projeto: 48–52px).
3. `prefers-reduced-motion` **e** a classe `.reduce-motion` desligam toda animação.
4. Foco: `:focus-visible` ciano 2px; modais/`role=dialog` recebem foco ao abrir e devolvem ao fechar.
5. Contraste AA em todo texto; nada de info só por cor (formas também mudam: losango=coletável, hexágono=power-up, barra/círculo=obstáculo).
6. Layout: `safe-area-inset` em toda tela fixa; alturas com `dvh`.
7. Fontes: só as 2 auto-hospedadas (`assets/fonts/*.woff2`, `font-display: swap`). Não adicionar fontes remotas (LGPD).
8. Peso: CSS + fontes + ícones vetoriais < 150 KB (audite com `node tools/audit-ui.mjs`).
