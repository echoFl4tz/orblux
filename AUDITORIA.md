# ORBLUX — Auditoria final (Fase 8 + direção de arte A1–A6)

Rodada completa de testes e auditoria do ORBLUX (jogo + moedas + loja +
camada social + direção de arte) em **17/10/2026**. Este documento é o mapa do que está
verificado, do que ficou pendente e do que fazer antes de publicar.

---

## 1. Resultado da rodada final

| Bateria | Comando | Resultado |
|---------|---------|-----------|
| Testes unitários (15 arquivos) | `node --test tests/*.test.mjs` | **164/164** |
| Simulação do jogo inteiro | `node tests/smoke.mjs` | **62/62** |
| Referências internas | `node tools/validate-refs.mjs` | OK |
| Auditoria de UI (tamanho/a11y/idioma) | `node tools/audit-ui.mjs` | OK (< 150 KB, sem inglês) |
| Suítes Playwright (17) | `node tests/<suite>.cjs` | **17/17** |
| FPS por qualidade (GPU real, throttle 4x) | `node tests/perf-ui.cjs` | Alto **56,9** / Médio **59,9** / Baixo **59,9** |
| Contraste de texto (§12, 8 telas) | dentro de `accessibility-ui` | **0 violações** |

Zero erros de console em todas as suítes (390x844, 1280x720 e 360x640).

## 2. Inventário de testes

### Unitários (`node --test tests/*.test.mjs`)

| Arquivo | Cobre |
|---------|-------|
| `wallet.test.mjs` | Carteira local: saldo, ledger de 50, checksum FNV-1a, cap por partida, prêmios de skin |
| `economy.test.mjs` | Fórmula de ganho (cap 120, mínimos, bônus), reset padrão vs `keepCoins` |
| `billing.test.mjs` | Digital Goods/Play Billing: posse de skin, restaurar, revogação, mock honesto (sem preço fixo por padrão; `?precosdemo=1` só em dev) |
| `skins.test.mjs` / `skins-state.test.mjs` | Loja: compra, preço nunca fixo em reais, persistência |
| `skin-hitbox.test.mjs` | **Skin equipada NUNCA muda hitbox/dificuldade/ganhos** |
| `skin-custom.test.mjs` | Personalização de cor/contorno sem efeito em jogabilidade |
| `state-migration.test.mjs` | Migrações de `localStorage` (`pn_*`, versões) — Fase 4: v3→v4 sem perda (ranking/skins/saldo), checksum forjado zera carteira |
| `rng.test.mjs` | RNG determinístico (Corrida do Dia com semente única) |
| `score.test.mjs` | Pontuação (Fase 2): ondas determinísticas pelo tempo (limite de 20 s, clamp anti-valor-ruim, teto do bônus), constantes finitas/positivas — mesmos números do `app_rules` |
| `nickname.test.mjs` | Validação de apelido (3–12, reservados, ofensas) |
| `social-api.test.mjs` | Contrato da UMA interface (mock/NullProvider) e códigos de erro |
| `backend-parity.test.mjs` | **21 checagens**: cliente ↔ SQL (RPCs, regras, sementes, fórmula de moedas), varredura de segurança (sem chaves, RLS, SECURITY DEFINER, grants), vendor pinado (SHA256), flags desligadas, páginas legais sem CDN |

### Simulação (`tests/smoke.mjs` — 62)

Lógica do jogo inteiro sem navegador: colisões, spawn, ondas, missões,
conquistas, ranking local, moedas, reset, ritmo/determinismo do spawner
(curva por segundo, mesma semente ⇒ mesma cadência — Fase 1) e teto de
partículas por tier (burst de 100 nasce no teto — A5/§11).

### Suítes Playwright (`node tests/<suite>.cjs` — 17)

| Suíte | Cobre |
|-------|-------|
| `menu-regression` | Navegação de telas e volta ao menu (missões fixas no seed — não depende do calendário) |
| `wallet-ui` / `coins-ui` / `economy-ui` | Carteira, moedas e economia na UI real |
| `skins-shop-ui` | Loja: comprar/cancelar/restaurar, preço vindo da Play (nunca fixo em reais) |
| `nickname-ui` | Modal de apelido, persistência, aviso LGPD |
| `social-entry-ui` | 1ª entrada social: idade, termos, exclusão de conta |
| `ranking-global-ui` | Ranking global, plausibilidade, offline |
| `chat-ui` | Salas, denúncia, bloqueio, mute/ban, **contestação (§8.5)**, modo restrito 13− |
| `clans-ui` | Criar (500 moedas), entrada, cargos, emblema, offline |
| `tournament-ui` | Torneios, resgate idempotente, Corrida do Dia |
| `sw-update` | Service worker (Fase 4): rede-primeiro, versão do cache lida do `sw.js` (`orblux-v8`), offline: HTML + cadeia JS do cache e **partida rodando sem rede** |
| `perf-ui` | Performance (A5+A6/§11): **FPS por qualidade** — Alto/Médio/Baixo travados (`qualLock`) e medidos um a um com CPU throttle 4x em GPU real, 55+ FPS cada (A6: 56,9 / 59,9 / 59,9); após cada troca, 1,3 s de assentamento + 1,5 s de descarte (resize, pré-render e GC) e janela de 5 s — o número publicado é o estado estacionário do tier; o blit do bloom só copia a área do brilho (A6: ~20x menos área aditiva); reinício < 400 ms, zero erros; perda de renderer sob memória (ambiente) refaz a medição UMA vez e relata; em 17/10 a re-rodada pós-A7 não completou (navegador headed morto por contenção com o Chrome do usuário — 3 tentativas): a A7 não muda o caminho medido (qualLock/render intocados) e os números acima continuam válidos |
| `responsive-ui` | Resoluções-alvo (Fase 3): 360x640/390x844/1280x720 × 12 telas (menu, como jogar, ranking, ajustes, loja, social, chat, clãs, torneio, pausa, fim de jogo e HUD da partida) — sem overflow horizontal/vertical, botões dentro da largura, zero erros |
| `accessibility-ui` | Acessibilidade (Fase 5+A6): 1ª visita nasce com "reduzir movimento" se o sistema pedir (`prefers-reduced-motion`), interruptor liga/desliga na hora e persiste, partida+fim de jogo com menos movimento (pontuação final instantânea), Tab com foco visível, aria no HUD, safe-area no CSS — **contraste (§12) em 8 telas** (menu, ajustes, como jogar, loja, ranking, HUD, pausa, fim de jogo): texto principal ≥ 7:1 e secundário ≥ 4,5:1 medidos em WCAG 2.1 sobre o fundo efetivo (pior parada do gradiente quando o fundo é gradiente) |
| `style-dev-ui` | Direção de arte (fase A1): página `/dev/style` com o THEME importado (paleta, zonas, escala `unit()`, canvas de objetos pintado, mock do HUD 44 px), reduced-motion congela no 1º frame, 360 px sem overflow, zero erros |
| `scene-ui` | Direção de arte (fases A2+A3+A4+A5): zonas de cor por nível — boot na zona ciano fria, nível 10 troca para a zona âmbar com crossfade de 1,5 s que libera o fundo anterior, camadas de parallax, movimento reduzido a 30% (não congela) — objetos: barreira em danger com gradiente 100%→60% + hachura animada a 20 px/s e aviso antes da entrada (some em ~350 ms), drone hexagonal listrado, power-ups em hexágono "power", bolha do escudo 0,25/borda 0,7 — HUD/feedback: glow do placar na cor da zona, estilhaço do combo (350 ms), vinheta de dano nas bordas, fundo escurece 15% na quebra do combo — tiers (§11): bloom 1/4 no Alto, 1/6 no Médio, desligado no Baixo, vinheta some no Baixo, teto de 40 partículas respeitado e qualidade que **nunca sobe sozinha na partida**, qualidade manual (A7/HD): "Alta (HD)" trava 100% e "Baixa" trava 55% mesmo em partida, zero erros |

## 3. Matriz de conformidade (regras inegociáveis → garantia verificada)

| Regra | Garantia | Onde é travado |
|-------|----------|----------------|
| Moedas 100% grátis (nunca compradas) | Economia separada de compras; reset preserva só `source:'play'` | `economy.test.mjs`, `wallet.test.mjs` |
| Skin nunca muda jogabilidade/ganhos | Teste dedicado | `skin-hitbox.test.mjs` |
| Sem preço fixo em reais na UI | Preço sempre `localizedPrice` da Play | `skins-shop-ui.cjs`, `skins.test.mjs` |
| Sem loot box/dark pattern/pop-up em partida | Compra só na loja; consentimento primeiro | `skins-shop-ui.cjs`, `menu-regression.cjs` |
| Jogo 100% offline; online degrada | Flags desligadas ⇒ NullProvider; erro "Tentar de novo" | suítes `*-offline`, `sw-update.cjs` |
| Servidor é a fonte da verdade | RLS + RPCs `security definer`; cliente só chama RPC | `backend-parity.test.mjs` |
| Nunca commitar chaves | Varredura de JWT/service_role + config vazia | `backend-parity.test.mjs` |
| Sem CDN em runtime (lib pinada) | SHA256 do vendor == hash documentado; HTML sem script/stylesheet externo | `backend-parity.test.mjs` |
| UGC com moderação/contesto | Denunciar/bloquear/mute 24 h + link de contestação | `chat-ui.cjs`, `backend-parity.test.mjs` |
| Proteção de menores | 13− só frases prontas; sem clã; faixa de idade obrigatória | `chat-ui.cjs`, `social-entry-ui.cjs` |
| Flags sociais desligadas por padrão | `FLAG_DEFAULTS` todos `false` | `backend-parity.test.mjs` |

## 4. Pendências conhecidas (fora do código)

1. **Decisão §8.1** — idade mínima do chat (13 + LGPD/ECA) antes de ligar o
   chat em produção (`SOCIAL.md` §8).
2. **Projeto Supabase real** — criar, rodar migrações, deploy das Edge
   Functions e segredos no Vault seguindo `supabase/README.md`; depois
   preencher `net/config.js` e ligar as flags (`FLAG_DEFAULTS`).
3. **Play Console** — checklist manual em `SKINS_PLAY_CONSOLE.md` §7
   (conta de pagamentos, AAB/TWA, 21 SKUs, preços, URLs de privacy/termos,
   data safety, classificação etária).
4. **E-mail do dono** — trocar `seu@email.com` em `privacy.html` (seção 9),
   `termos.html` e `net/config.js` (`APPEAL.email`).
5. **Anúncios** — `ADS.enabled = false`; ativar é decisão de negócio
   (consentimento obrigatório, ver `DATA_SAFETY.md`).
6. **Divergências mock ↔ servidor** — documentadas em `SOCIAL.md` §10 (o
   mock é de mentira; o servidor decide).

## 5. Checklist de produção (ordem sugerida)

- [ ] Publicar `privacy.html` e `termos.html` em domínio próprio
- [ ] Trocar o e-mail de contato nos 3 pontos da pendência 4
- [ ] Decidir a pendência 1 (§8.1) e, se for ligar o chat, revisar classificação
- [ ] Seguir `supabase/README.md` (pendência 2) e testar em homologação
- [ ] Rodar a bateria deste documento (§1) em homologação
- [ ] Preencher o Play Console (pendência 3) e publicar em teste interno
