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
