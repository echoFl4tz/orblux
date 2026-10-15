# ORBLUX — Skins no Google Play Console

Passo a passo para publicar os **21 produtos da loja** e cumprir as exigências
da Play Store. Base oficial consultada em 14/10/2026 (links no fim e em
`MONETIZACAO.md`).

> **Regra de ouro da UI:** o app **nunca** mostra preço fixo em reais — sempre o
> `localizedPrice` devolvido pela Play Store (`js/ui/skins-shop.js` → `fetchPrices`).
> Os valores abaixo são **sugestão de faixa** para você digitar no Console.

---

## 1. Catálogo de produtos (criar no Console)

Tipo de todos: **Produto não consumível** (compra única, desbloqueio permanente).
As skins são **100% estéticas** — não alteram hitbox, velocidade, pontuação nem
dificuldade (garantido por teste: `tests/skin-hitbox.test.mjs`).

| # | SKU (ID do produto) | Nome exibido | Faixa | Preço sugerido | Descrição curada (para a ficha do produto) |
|---|---------------------|--------------|-------|----------------|-------------------------------------------|
| 1 | `skin_brasa_neon` | Brasa Neon | Bronze | R$ 2,99 | Faíscas incandescentes que se soltam a cada movimento. |
| 2 | `skin_oceano` | Oceano | Bronze | R$ 2,99 | Azul profundo com rastro de bolhas ascendentes. |
| 3 | `skin_menta_cristal` | Menta Cristal | Bronze | R$ 2,99 | Verde-água com estilhaços de cristal no rastro. |
| 4 | `skin_rosa_quasar` | Rosa Quasar | Bronze | R$ 2,99 | Magenta cósmico com aura pulsante. |
| 5 | `skin_sol_dourado` | Sol Dourado | Bronze | R$ 2,99 | Brilho quente de estrela, com contorno dourado. |
| 6 | `skin_violeta_eclipse` | Violeta Eclipse | Bronze | R$ 2,99 | Roxo sombrio envolto numa aura de eclipse. |
| 7 | `skin_gelo_polar` | Gelo Polar | Bronze | R$ 2,99 | Branco e azul claro com flocos de neve. |
| 8 | `skin_lima_acida` | Lima Ácida | Bronze | R$ 2,99 | Verde-limão elétrico com faíscas estáticas. |
| 9 | `skin_arco_iris` | Arco-Íris | Prata | R$ 5,99 | Cores rotativas num rastro em gradiente contínuo. |
| 10 | `skin_galaxia` | Galáxia | Prata | R$ 5,99 | Espiral roxa/azul com estrelas cintilando por dentro. |
| 11 | `skin_plasma` | Plasma | Prata | R$ 5,99 | Rastro ondulado com aura elétrica perante. |
| 12 | `skin_lava_viva` | Lava Viva | Prata | R$ 5,99 | Núcleo incandescente com rastro derretido. |
| 13 | `skin_aurora_boreal` | Aurora Boreal | Prata | R$ 5,99 | Verde, ciano e violeta em ondas dançantes. |
| 14 | `skin_cyberpunk` | Cyberpunk | Prata | R$ 5,99 | Ciano e rosa com um glitch discreto e periódico. |
| 15 | `skin_neve_estelar` | Neve Estelar | Prata | R$ 5,99 | Partículas de neve com aura suave e silenciosa. |
| 16 | `skin_samurai_neon` | Samurai Neon | Prata | R$ 5,99 | Vermelho e preto com rastro afiado de lâmina. |
| 17 | `skin_supernova` | Supernova | Ouro | R$ 9,99 | Explosão de luz ao coletar e aura grandiosa. |
| 18 | `skin_holograma` | Holograma | Ouro | R$ 9,99 | Translúcido, com linhas de varredura constantes. |
| 19 | `skin_dragao_cosmico` | Dragão Cósmico | Ouro | R$ 9,99 | Forma de escamas com rastro de fogo estelar. |
| 20 | `skin_orblux_lendaria` | Lendária Orblux | Ouro | R$ 9,99 | Todas as cores da marca, anel orbital duplo e coleta com onda de choque. |
| 21 | `bundle_collection` | Coleção Completa | Pacote | R$ 39,90 | As 20 skins do jogo com desconto. Compra única; libera todas as skins. |

- A skin **Clássica** (`classic`) é grátis e **não é produto** no Console.
- **Não** crie SKUs extras. O app valida tudo contra `js/game/skins.js`.
- Sugestão: use a tabela acima como checklist de criação (uma linha = um produto).

## 2. Como o app consome esses produtos

- TWA (Android) + **Digital Goods API** (`js/monetization/billing.js`).
- **Fonte da verdade** = `listPurchases()` a cada abertura e a cada visita à loja.
- Skins são **não consumíveis**: o app **nunca** chama `consume()`.
- Sem confirmação do Play, a posse é **revogada** (protege contra dados forjados).
- **"Restaurar compras"** existe na loja e em Configurações.

## 3. Testadores de licença

Console → *Configurações → Licenciamento → Testadores de licença* → adicione o
Google Account do seu dispositivo de teste. Comprados os produtos de teste, o
app em release testing mostra os preços reais e libera as skins na hora.

## 4. Política de reembolso e cancelamento (cole no Console)

> As compras são processadas pela Google Play. Reembolsos e cancelamentos seguem
> a Política de reembolsos do Google Play: peça em [play.google.com/store/account](https://play.google.com/store/account)
> (Compras → Encontre um pedido → Solicitar reembolso) ou pelo suporte do Google
> Play. As skins são itens digitais não consumíveis de uso imediato e permanente
> no aparelho. Ao ser reembolsada/revogada pela Play Store, a skin é removida
> automaticamente do jogo na próxima sincronização. Não há cobrança recorrente,
> assinatura, sorteio pago nem loot box.

## 5. Crianças e público-alvo (Families)

- O jogo **não coleta dados pessoais** (ver `DATA_SAFETY.md` e `privacy.html`).
- Skins são cosméticas, sem vantagem de jogo; **sem loot box, sem gacha,
  sem sorteio pago**; preço fixo e visível antes da compra.
- Se classificar o app para **Families**, o Play exige conformidade extra de
  anúncios e compras in-app — mantenha os anúncios desligados por padrão
  (`ADS.enabled = false`) enquanto decidir essa estratégia.
- Recomendação: classifique como **Teen (12+)** e marque que não direciona
  crianças; se mudar para Families, revise anúncios + consentimento parental.

## 6. Ficha da loja (sugestão pronta)

**Descrição curta (80 chars):**
> Arcade neon: colete pulsos, faç combos e desvie das barreiras. 20 skins estéticas à venda.

**Descrição completa:**
> ORBLUX é um arcade neon de uma só mão: colete pulsos, acumule combos, desvie
> das barreiras e destrave conquistas diárias.
>
> • 100% grátis para jogar — a skin Clássica vem com você.
> • Skins são 100% estéticas: não mudam a dificuldade nem a jogabilidade.
> • Compra única via Google Play, sem assinatura e sem renovação automática.
> • "Restaurar compras" recupera o que você já comprou em qualquer aparelho
>   da sua conta.
> • Sem loot box, sem sorteio pago, sem botão de compra durante a partida.
> • Seus dados ficam no seu aparelho (ver Política de Privacidade).

**Capturas sugeridas (mínimo 2 telas + 1 gráfico):** menu, partida com HUD,
loja de skins (grade), detalhe com personalização, conquistas.

## 7. Checklist manual (feito por você, no Console)

- [ ] Conta de pagamentos + identidade fiscal ativa
- [ ] App criado (pacote sugerido: `com.seudominio.orblux`) — ver `twa-manifest.json`
- [ ] Upload do AAB (TWA) — passos em `PLAY_STORE.md`
- [ ] 21 produtos criados com os SKUs exatos da tabela
- [ ] Preços e moeda (BRL) definidos por faixa
- [ ] Testadores de licença adicionados
- [ ] Política de reembolso (seção 4) colada
- [ ] Política de privacidade: URL do `privacy.html` publicado
- [ ] Termos da Comunidade: URL do `termos.html` publicado (exigível se o chat/UGC for ativado)
- [ ] Exclusão de conta no app visível e testada (*Configurações → Comunidade → Apagar conta da comunidade* — exigência da Play para apps com UGC)
- [ ] Data safety preenchido conforme `DATA_SAFETY.md`
- [ ] Classificação etária: no questionnaire de conteúdo, marcar que os jogadores podem **enviar conteúdo** e **interagir entre si** se a comunidade for ligada (puxa a nota para 12+/Teen — coerente com §5)
- [ ] Decisão sobre a **Comunidade online** ligada na build publicada (se ligada: servidor Supabase ativo, moderação ativa e seção 7 do `privacy.html` revisada)
- [ ] Público-alvo/classificação etária definido (seção 5)
- [ ] Ficha da loja (seção 6) preenchida
- [ ] Decisão sobre verificação por servidor (`SERVER_VERIFY.enabled`)

## 8. Referências oficiais (consultadas em 14/10/2026)

- Digital Goods API (TWA): https://developer.chrome.com/docs/web-platform/digital-goods
- Play Billing via Digital Goods: https://developer.chrome.com/docs/android/trusted-web-activity/digital-goods
- Google Play — reembolsos: https://support.google.com/googleplay/answer/2479637
- Play Console — produtos in-app: https://support.google.com/googleplay/android-developer/answer/9859455
- Families + compras: https://support.google.com/googleplay/android-developer/answer/9859153
