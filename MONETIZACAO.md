# ORBLUX — Monetização (loja de skins · Google Play Billing)

> **Consulta à documentação oficial:** 14/10/2026 (data das buscas abaixo).
> Sempre que este arquivo e um prompt conflitarem, **a documentação oficial vence**.

Este projeto vende **skins 100% estéticas** (não alteram gameplay). Pagamentos reais
somente via **Google Play Billing** (Digital Goods API + Payment Request API no TWA).
Nunca Pix/Stripe/cartão próprio para bens digitais.

---

## 1. Fontes consultadas (links + o que confirmaram)

| Link | O que confirma | Data |
|------|----------------|------|
| https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing | Digital Goods API + Payment Request no TWA; detecção via `'getDigitalGoodsService' in window`; store id `https://play.google.com/billing`; Chrome 101+ Android/ChromeOS; SKU definido no Play Console | 14/10/2026 |
| https://developer.android.com/google/play/billing/lifecycle/one-time | **Compra não consumível precisa de `purchases.products.acknowledge` em até 3 dias** ou é reembolsada e revogada | 14/10/2026 |
| https://developer.android.com/google/play/billing/security | Reconhecimento no backend é mais seguro; sem isso, reembolso automático em 3 dias | 14/10/2026 |
| https://developer.android.com/google/play/billing | Billing Library 8+ obrigatória a partir de 31/08/2026 (contexto nativo); ecossistema Play Commerce | 14/10/2026 |
| https://support.google.com/googleplay/answer/2479637 | Política de reembolso: até 48h via Play; depois, falar com o desenvolvedor | 14/10/2026 |
| https://chromeos.dev/en/publish/testing-digital-goods-api | Testes com **license testing** (cartão de teste, sem cobrança real) | 14/10/2026 |
| https://github.com/chromeos/pwa-play-billing | Amostra oficial de referência (TWA + Digital Goods) | 14/10/2026 |

### Decisões que decorrem da documentação (e corrigem o prompt quando necessário)

1. **`acknowledge()` NÃO existe na API web (Digital Goods).** A interface web expõe
   `getDetails()`, `listPurchases()`, `listSubscriptions()` e `consume()` (só para
   **consumíveis**). No fluxo **Payment Request do TWA**, a compra de produto único é
   **reconhecida pela Play ao concluir o checkout** — não há chamada web de acknowledge.
   → **Skins são não consumíveis: NUNCA chamamos `consume()`** (isso permitiria revenda).
   → A **fonte da verdade é `listPurchases()`**. O endurecimento opcional (Etapa 5) usa
   `purchases.products.acknowledge` **no backend** via Play Developer API.
2. **Regra dos 3 dias** vale para o caminho nativo/ backend. No nosso caminho 100% web o
   reconhecimento é síncrono no checkout, mas ao ativar verificação por servidor devemos
   reconhecer lá imediatamente (ver §5).
3. **Preço sempre devolvido pelo Play** (`getDetails()` → `localizedPrice`). Código de UI
   **nunca** fixa "R$ 2,99"; os valores deste doc são só faixa a configurar no Console.

---

## 2. Catálogo (21 produtos)

- **1 skin grátis** `classic` ("Clássica"), sempre desbloqueada.
- **20 skins pagas** em 3 faixas (faixa = `tier`):
  - **A** (~R$ 2,99): Brasa Neon, Oceano, Menta Cristal, Rosa Quasar, Sol Dourado, Violeta Eclipse, Gelo Polar, Lima Ácida.
  - **B** (~R$ 4,99): Arco-Íris, Galáxia, Plasma, Lava Viva, Aurora Boreal, Cyberpunk, Neve Estelar, Samurai Neon.
  - **C** (~R$ 9,99): Supernova, Holograma, Dragão Cósmico, Lendária Orblux.
- **1 pacote** `bundle_collection` ("Coleção Completa", ~R$ 39,90) = todas as 20.

SKUs: `skin_<id>` (ex.: `skin_brasa_neon`); pacote `bundle_collection`.
Todos os produtos são **não consumíveis** (permanentes).

---

## 3. Arquitetura de billing (Etapa 5)

`js/monetization/billing.js` — interface única, dois provedores:

- **PlayBillingProvider** (loja real, dentro do TWA na Play Store):
  - `getDigitalGoodsService('https://play.google.com/billing')`.
  - `getDetails(skus)` → preços localizados (`localizedPrice`).
  - `PaymentRequest([{ supportedMethods:['https://play.google.com/billing'], data:{ sku } }], …)`.
  - `listPurchases()` → fonte da verdade das compras (a cada abertura + ao abrir a loja).
  - **Sem `consume()`** (skins não consumíveis).
- **MockProvider** (apenas `localhost` ou `?debug=1`): simula catálogo, preços, compra,
  cancelamento, falha e restauração para testar toda a UI sem a Play Store.
- **Detecção automática:** sem `getDigitalGoodsService` (navegação comum / PWA fora da
  loja) → provedor "loja indisponível" (modo vitrine), **nunca falha**.

### Fonte da verdade e cache
- `listPurchases()` do Play manda. `localStorage` é só cache.
- Se o Play não confirmar a skin → remover do estado (exceto **offline**: manter cache por
  até **7 dias**).
- Ao **equipar**, revalidar contra o cache confirmado (não confiar em flag solta).

---

## 4. Risco residual (só cliente) — e por que é aceitável aqui

Sem verificação por servidor, um atacante poderia forçar uma flag em `localStorage`.
**Aceitável nesta versão** porque: (a) a fonte da verdade é `listPurchases()` do Play (o
cache forjado é descartado na próxima sincronização com a loja); (b) as skins são
**100% estéticas** — sem vantagem competitiva, sem economia, risco de dano **baixo**.
Ainda assim, o Etapa 5 deixa o **gancho de verificação por servidor pronto e desligado**.

---

## 5. Verificação por servidor (OPCIONAL, DESLIGADA)

Arquitetura recomendada se você quiser endurecer (documentada, código-gancho desligado):

1. Function serverless (ex.: Cloud Functions / Cloud Run) com **conta de serviço**.
2. `Purchases.products.get(token)` na **Play Developer API** valida estado + propriedade.
3. `Purchases.products.acknowledge` (não consumível) **imediatamente após conceder**.
4. O cliente manda o `purchaseToken`; o servidor responde `{ entitled: true }`.
5. Guardar `purchaseToken`↔`sku`↔usuário (aqui: anônimo por dispositivo).

**Risco residual se ficar só no cliente:** baixo (skins estéticas; cache é revalidado
contra o Play). Ative só se o volume justificar.

---

## 6. Segurança

- **Nunca commitar chaves.** A `apikey` do Supabase/conta de serviço fica fora do repo.
- **Não logar tokens de compra em produção.**
- Compras ficam **vinculadas à conta Google** da Play Store — trocar de conta muda as
  compras (informar na UI).

---

## 7. Não fazer (políticas / dark patterns)

- Sem loot box, sem sorteio pago, sem caixa-surpresa: cada skin é comprada diretamente.
- Sem contagem regressiva falsa, sem "oferta só hoje" fabricada.
- Sem botão de compra no meio da partida; no máximo **1 convite discreto por sessão**.
- Preço sempre o do Play (não fixo em reais no código).
- Textos não prometem vantagem nem raridade enganosa.

---

## 8. Teste manual guiado da loja (Etapa 8)

Automatizado: `node tests/skins-shop-ui.cjs` (27 asserções) +
`node --test tests/*.test.mjs` (unit). O roteiro abaixo é para o
**aparelho real com a Play Store** (conta de teste).

### 8.1 Demonstração sem loja (navegador)

1. Abra o app num navegador comum → menu → **Skins**.
2. Confira: selo "Novo" antes da 1ª visita; grade com 21 skins + pacote;
   preços "Indisponível" e compra desabilitada (chip "Loja indisponível").
3. Detalhe de uma skin: pré-visualização animada + "Experimentar"
   (não dá vantagem; nada muda na partida).

### 8.2 Mock de desenvolvimento (localhost)

1. `http://localhost:8080/?debug=1` → Skins → comprar Supernova.
2. Confira: modal "Compra única, não recorrente" com preço; resultado
   "Skin liberada → Equipar agora?"; toast "Skin comprada!".
3. `?debug=1&mock=cancel` → cancelar fecha em silêncio (sem erro).
4. `?debug=1&mock=fail` → erro genérico com "Tentar de novo".
5. Personalizar a skin comprada (paleta/rastro/aura) e conferir que o
   preview reage na hora; "Restaurar padrão da skin" volta ao padrão.
6. Recarregar a página → posse, skin equipada e custom continuam.
7. Configurações → Compras → "Restaurar compras" (mostra o que o mock tem).

### 8.3 Aparelho com Play Store (teste interno)

Pré-requisitos: `SKINS_PLAY_CONSOLE.md` (produtos criados), testador de
licença adicionado, app instalado via teste interno.

1. Loja → comprar Brasa Neon (Bronze) → fluxo do Google Play abre.
2. Pagar com cartão de teste → ao voltar, skin liberada e equipável.
3. "Restaurar compras" noutro aparelho da mesma conta → skin volta.
4. Comprar o pacote "Coleção Completa" → as 20 skins ficam com você.
5. Cancelar no meio do pagamento do Play → fecha sem erro, sem skin.
6. Apagar o progresso (Configurações) → confirma o texto de que skins
   compradas **não** são apagadas; conferir na loja que continuam lá.
7. Modo avião → abrir a loja → cache offline (7 dias) sem apagar posse.

---

## 9. Moedas virtuais (sistema de moedas GRATUITAS)

**Consulta à documentação oficial:** 14/10/2026 — a única fonte que rege este
sistema é a **Política de Pagamentos** do Google Play (abaixo, verificada em
14/10/2026): moedas virtuais só podem circular **dentro** do app e todo
conteúdo pago passa pelo billing da própria Play. No ORBLUX as moedas nem são
vendidas — só se ganham jogando.

| Fonte | O que confirma (verificado na página) | Data |
|-------|----------------------------------------|------|
| https://support.google.com/googleplay/android-developer/answer/9858738?hl=pt-BR (Política de Pagamentos) | Compras dentro do app (incluindo **moedas virtuais**) só pelo sistema de faturamento do Google Play; proibido direcionar o usuário a outros meios de pagamento; moedas virtuais no app só podem ser usadas **dentro** do próprio app/jogo | 14/10/2026 |

Como o ORBLUX **nunca vende moedas** (elas só se ganham jogando) e todos os itens
de dinheiro real passam pelo Play Billing, o app cumpre esta política por
construção: não há nenhuma transação de dinheiro real fora da Play.

### Regras inegociáveis do ORBLUX

1. **Moedas NUNCA se compram com dinheiro real**, nem se vendem, trocam ou
   transferem. Não existe (e não será criado) nenhum produto in-app de moedas.
   Elas só se ganham **jogando** (partida, missões, conquistas, recompensa diária).
2. **Moedas são 100% virtuais, sem valor monetário** — texto exibido em
   Configurações → Moedas, nos Termos da loja e em `privacy.html`.
3. **Dois caminhos independentes por skin**: moedas (grátis, jogando) OU
   Google Play Billing (dinheiro real). Quem paga com dinheiro só **pula a
   espera**: nenhuma vantagem de jogo (skins são 100% estéticas; a skin
   equipada não altera ganhos — teste em `tests/economy.test.mjs`).
4. **Sem dark patterns**: sem contagem regressiva falsa, sem ofertas inventadas,
   sem pop-up de venda durante a partida e sem botão empurrando para pagar
   quando faltam moedas — mostra-se quanto falta e o jogador decide.
5. Dados da carteira são **100% locais** (`localStorage`, chave `pn_wallet`
   com checksum simples); nada sai do dispositivo.
6. `resetAllProgress` apaga moedas e skins compradas com moedas **por padrão**
   (texto explícito no modal) e **mantém sempre** as skins compradas com
   dinheiro (a Play as restaura).
