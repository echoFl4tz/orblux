# ORBLUX — Economia de moedas (grátis, só jogando)

> **Documento vivo:** as tabelas da seção 4 saem de `node tools/sim-economy.mjs`
> (reexecutar e colar ao mudar qualquer número).
> Compliance/monetização: `MONETIZACAO.md` §9 · Números do código: `js/core/economy.js`
> (um só lugar) · Preços em dinheiro **nunca** aparecem no código: a UI mostra o
> valor devolvido pelo Google Play.

---

## 0. Regras inegociáveis

1. Moedas **só se ganham jogando** (partida, missões, conquistas, recompensa
   diária). Nunca se compram, vendem, trocam ou transferem — não existe
   produto in-app de moedas (ver `MONETIZACAO.md` §9).
2. Moedas são **100% virtuais, sem valor monetário** (texto em
   Configurações → Moedas e nos Termos).
3. Nada muda gameplay: dificuldade, hitbox e pontuação **nunca** são
   ajustadas por economia — e a **skin equipada nunca altera quantas moedas
   se ganham** (`tests/economy.test.mjs`).
4. Sem dark patterns: sem contagem regressiva falsa, sem ofertas inventadas,
   sem pop-up de venda durante a partida e sem botão empurrando para pagar
   quando faltam moedas (mostra-se quanto falta e o jogador decide).
5. Tudo 100% local (`localStorage`, chave `pn_wallet` com checksum).

---

## 1. Fontes de moedas

| Fonte | Quando | Quanto |
|-------|--------|--------|
| **Partida** | ao final de cada partida (≥ 10 s) | fórmula da seção 2 (teto 120) |
| **Missões do dia** | ao concluir cada uma (3 por dia) | 25 (fácil) / 40 (média) / 60 (difícil) |
| **Conquistas** | 1 vez cada (14 no jogo) | 25 (pequena) / 40 (média) / 60 (grande) |
| **Recompensa diária** | 1× por dia, com sequência | 20, 25, 30, 35, 40, 50, 100 (dia 7; ciclo repete no 8) |

**O que NÃO paga moedas:** pulsos avulsos na partida (`COINS_PICKUP = false` —
os pulsos já entram na fórmula) e "dobrar com anúncio" (`COINS_AD_DOUBLE =
false`, decisão registrada na seção 7).

Bônus de partida: **+15** por bater recorde **existente** (recorde anterior > 0)
e **+10** pela 1ª partida do dia.

---

## 2. Fórmula por partida

```
coins = 0                                    se segundos < 10
coins = min(120, floor(pulsos×0.5) + floor(pontos/100) + floor(segundos/10))
coins += 15 se recordBroken                  (bônus SOMA depois do teto)
coins += 10 se firstRunToday                 (bônus SOMA depois do teto)
```

Implementação pura: `calcRunCoins()` em `js/core/economy.js`.

---

## 3. Preços em moedas (`SKIN_PRICES`)

| Faixa | Qtd | Preço em moedas | Preço em dinheiro |
|-------|----:|----------------:|-------------------|
| A (Bronze) | 8 | **600** | Play (localizedPrice) |
| B (Prata) | 8 | **1.500** | Play (localizedPrice) |
| C (Ouro) | 3 | **3.500** | Play (localizedPrice) |
| Lendária Orblux | 1 | **6.000** | Play (localizedPrice) |
| Pacote Coleção Completa | 20 | — (só dinheiro, decisão pendente §7) | Play (localizedPrice) |

Total da coleção em moedas: **33.300**. Cada skin tem **dois caminhos
independentes**: moedas (grátis, jogando) ou Play Billing (dinheiro real — só
pula a espera; skins são 100% estéticas).

Fora da coleção existe um sumidouro social: **criar um clã custa 500 moedas**
(`CLAN.CREATE_COST_COINS`, SOCIAL.md §8.3) — cerca de 1–3 dias de jogo; também
é pago só com moedas ganhas jogando, nunca com dinheiro.

---

## 4. Saída do simulador

*(Colado da saída real em 14/10/2026 de `node tools/sim-economy.mjs` —
reexecutar o simulador regenera; se divergir, o simulador vence.)*

<!-- SIM-INICIO -->
### 1. Ganho por partida

| Perfil | Pulsos | Pontos | Seg | Sem bônus | +1ª do dia | +recorde | Os dois |
|--------|-------:|-------:|----:|----------:|-----------:|---------:|--------:|
| Fraco (iniciante) | 15 | 800 | 35 | 18 | 28 | 33 | 43 |
| Médio (casual) | 40 | 2500 | 70 | 52 | 62 | 67 | 77 |
| Forte (viciado) | 70 | 6000 | 120 | 107 | 117 | 122 | 132 |
| *teto por partida* | — | — | — | **120** +25 | — | — | — |

### 2. Ganho por dia (partidas + 1ª do dia + 3 missões + recompensa diária do dia 1)

| Perfil | Partidas | Base das partidas | 1ª do dia | Missões (média) | Diária (dia 1) | **Total/dia** |
|--------|---------:|------------------:|----------:|----------------:|---------------:|--------------:|
| Fraco (iniciante) | 3 | 18 × 3 = 54 | 10 | 100 | 20 | **184** |
| Médio (casual) | 5 | 52 × 5 = 260 | 10 | 100 | 20 | **390** |
| Forte (viciado) | 8 | 107 × 8 = 856 | 10 | 100 | 20 | **986** |

### 3. Dias de jogo até comprar (preço ÷ total/dia; sem conquistas, que são eventuais)

| Item | Preço em moedas | Fraco (iniciante) | Médio (casual) | Forte (viciado) |
|------|----------------:|----------------:|----------------:|----------------:|
| Faixa A (8 skins) | 600 | 4 dias | 2 dias | 1 dia |
| Faixa B (8 skins) | 1.500 | 9 dias | 4 dias | 2 dias |
| Faixa C (3 skins) | 3.500 | 20 dias | 9 dias | 4 dias |
| Lendária (1 skin) | 6.000 | 33 dias | 16 dias | 7 dias |

### 4. Coleção completa só jogando (20 skins)

| Valor total | Fraco (iniciante) | Médio (casual) | Forte (viciado) |
|------------:|---------------:|---------------:|---------------:|
| 33.300 moedas | 181 dias | 86 dias | 34 dias |

### 5. Valores de referência

- Recompensa diária por dia de sequência: 20, 25, 30, 35, 40, 50, 100 (ciclo repete no dia 8).
- Missões: 25 (fácil) / 40 (média) / 60 (difícil) — 3 por dia.
- Conquistas (14 no total): 25 / 40 / 60 — uma vez cada.
- Piso de uma partida: 0 moedas (menos de 10 s). Teto: 120 + bônus.
<!-- SIM-FIM -->

---

## 5. Leitura das metas de tempo

- **Primeira conquista rápida:** 1 skin da faixa A em **1–4 dias** de jogo
  leve — o jogador entende o sistema já na primeira semana.
- **Progressão visível:** faixa B em **2–9 dias**, faixa C em **4–20 dias**.
- **Objivo maior:** a Lendária (**6.000**) leva **7–33 dias** — item de
  orgulho, não bloqueio.
- Coleção toda é um maratona (34–181 dias); ninguém precisa dela: há o
  caminho de dinheiro (Play) para quem quer tudo agora — **sem** vantagem de
  jogo, só espera pulada.
- Valores SEM limite de acumulação: o saldo nunca expira nem é taxado.

---

## 6. Detalhes técnicos

- Chave `pn_wallet` (localStorage), formato `{ v:4, c:checksum, d:{...} }`;
  checksum FNV-1a zera a carteira em caso de adulteração (aviso no console).
- Ledger das **50 últimas** transações `{ t, delta, reason, ref }`.
- Teto da carteira: **999.999** moedas (inteiros sempre).
- Gasto é **atômico**: valida saldo → grava → libera a contrapartida;
  qualquer falha = rollback total; trava anti-duplo-toque (`wallet.spend`).
- Missão/conquista **pagam antes de marcar como concluída**: falha de
  gravação deixa pendente e paga depois (nada se perde, nada duplica).
- `resetAllProgress` apaga moedas e skins com moedas **por padrão** (modal
  com texto explícito + opção de manter) e mantém **sempre** as skins
  compradas com dinheiro.
- Crédito da partida acontece **uma única vez** por `game:over` (inclusive
  após revive — ver `main.js` e `tests/economy-ui.cjs`).

---

## 7. Decisões pendentes (do usuário)

1. **Pacote Coleção Completa com moedas?** Padrão atual: **não** — o pacote
   só existe como produto Play (dinheiro). Criar uma rota de moedas para o
   pacote enfraqueceria o único item de receita.
2. **Moedas coletáveis na partida** (orbes douradas)? Padrão: **não**
   (`COINS_PICKUP = false`) — os pulsos já pagam na fórmula.
3. **"Dobrar com anúncio" ao fim da partida?** Padrão: **não**
   (`COINS_AD_DOUBLE = false`); além disso `ADS.enabled = false` hoje
   (decisão antiga da Etapa 5 do redesign ainda em aberto).
4. **Ajustar valores** de missões/conquistas/preços: tudo em
   `js/core/economy.js` + reexecutar o simulador.

---

## 8. Como validar

```powershell
node --test tests/economy.test.mjs   # fórmula, faixas, "skin nunca muda ganhos"
node --test tests/wallet.test.mjs    # carteira, gasto atômico, diária, reset
node tools\sim-economy.mjs           # regenera as tabelas da seção 4
node tests\economy-ui.cjs            # UI: missões pagam, preços no catálogo (390x844/1280x720)
```
