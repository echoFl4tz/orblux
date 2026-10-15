# ORBLUX — Segurança de Dados (Google Play / Data Safety)

Guia para preencher o formulário **Dados e segurança** do Google Play Console.
Baseado no comportamento real do app (ver `js/core/state.js`, `js/ui/ranking.js`,
`js/monetization/ads.js`, a camada social em `net/api.js`/`SOCIAL.md` e `privacy.html`).

> Regra geral: **por padrão, o ORBLUX não coleta nem compartilha nenhum dado.**
> Tudo fica no `localStorage` do dispositivo. As linhas "coletado/compartilhado"
> só se aplicam se você ligar os recursos opcionais correspondentes.

---

## Declarações por tipo de dado

| Dado | Coletado? | Compartilhado? | Finalidade | Obrigatório? | Opção de exclusão |
|------|-----------|----------------|------------|--------------|-------------------|
| **Apelido** (local-only, padrão) | **Não** | **Não** | — (fica só no dispositivo) | Sim p/ o app funcionar (um valor é gerado automaticamente) | O jogador apaga em *Configurações → Apagar progresso* |
| **Apelido + pontuação** (ranking global — **desligado por padrão**) | Sim, **se ativado** | Sim, **se ativado** (exibido publicamente no ranking) | Funcionalidade do app (ranking online) | Não (só se o ranking global estiver ligado) | Remoção via e-mail de contato (`privacy.html`) ou apagando o progresso |
| **Perfil da comunidade** (conta anônima do Supabase: apelido social, país, faixa de idade, versão dos termos — **desligado por padrão**) | Sim, **se a comunidade for usada** | Não (perfil é privado; só apelido+pontuação vão ao ranking) | Funcionalidade do app (chat, clãs, torneios) | Não (só se o jogador criar perfil da comunidade) | *Configurações → Comunidade → Apagar conta da comunidade* (exclusão definitiva no servidor) |
| **Conteúdo gerado pelo usuário** (mensagens de chat, nomes/ícones de clã, denúncias — **desligado por padrão**) | Sim, **se a comunidade for usada** | Sim (mensagens visíveis a outros jogadores da sala) | Funcionalidade do app (comunidade) | Não | Chat: apagado automaticamente em 24 h; clã/demais: com a exclusão da conta |
| **Recorde, ranking local, conquistas, missões, configurações** | **Não** | **Não** | — (armazenamento local do dispositivo) | — | *Configurações → Apagar progresso* |
| **Dados de anúncios** (cookies de terceiros, ex.: Google AdSense) | Sim, **apenas com consentimento** | Sim (parceiros de anúncio) | Anúncios personalizados | Não (recusável no aviso de cookies) | "Só o essencial" no aviso; revogável limpando dados do site |
| **Dados de compra** (skins na Play Store) | **Não** (processados pela Google Play) | **Não** | — o app só recebe da Play Store a *lista de posse* das skins | — | Reembolso/revogação via conta Google; o app remove a skin na próxima sincronização |

> Nota sobre compras: o ORBLUX usa a **Google Play Billing** (via Digital Goods
> API em TWA). Dados de pagamento (cartão, conta Google) são tratados
> **inteiramente pela Google** — o app não recebe nem armazena nenhum deles.
> Por isso **não** se declara "Informações de compra" como coletada pelo app no
> formulário do Play Console. As skins são itens estéticos, sem loot box e sem
> assinatura (ver `SKINS_PLAY_CONSOLE.md`).

---

## Respostas sugeridas ao formulário

**Você coleta ou compartilha algum dado dos usuários?**
- **Não**, na configuração padrão (sem anúncios ativos e sem recursos sociais).
- **Sim**, apenas se você:
  1. Ativar o **ranking global** (flag `GLOBAL_RANKING_ENABLED` em `net/flags.js` —
     ver `SOCIAL.md`) →
     declara: *Apelido e pontuação — coletados e compartilhados — finalidade: funcionalidade do app.*
  2. Ativar os **anúncios** e o jogador **aceitar** o aviso de cookies →
     declara: *Dados de anúncios (cookies) — coletados e compartilhados — finalidade: anúncios.*
  3. Ligar a **Comunidade online** (chat/clãs/torneios — flags sociais + projeto Supabase,
     ver `SOCIAL.md`) → declara adicionalmente:
     - *Conta da comunidade (apelido, país, faixa de idade) — coletados, não compartilhados —
       finalidade: funcionalidade do app;*
     - *Conteúdo gerado pelo usuário (mensagens de chat, dados de clã) — coletados e
       compartilhados — finalidade: funcionalidade do app.*

**Dados criados pelo usuário (apelido e conteúdo):**
- Se **local-only**: *não coletado* (não sai do dispositivo).
- Se **enviado ao servidor** (ranking global ligado): *coletado e compartilhado*,
  finalidade **funcionalidade do app**, com contato para remoção em `privacy.html`.
- **Mensagens de chat** (comunidade ligada): *coletadas e compartilhadas* (visíveis a
  outros jogadores), com **retenção de 24 h** no servidor e exclusão junto com a conta.

**Contato para remoção de dados (obrigatório se coletar):**
- Preencha um e-mail válido em `privacy.html` (seção Contato). O caminho de
  exclusão de conta da comunidade está em *Configurações → Comunidade*
  (exigência da Play, `SOCIAL.md` §10).

---

## Notas de conformidade

- **Nenhuma conta, login, e-mail ou telefone** é solicitado ou armazenado.
- O **apelido não é validado como dado pessoal** quando local-only; mesmo assim,
  o app avisa "Não use seu nome real nem dados pessoais" no modal de apelido.
- **Conteúdo gerado pelo usuário exibido a outros** (ranking global) exige **moderação** —
  a UI já inclui link **"Denunciar"** por e-mail com o ID da entrada (`js/ui/ranking.js`).
- **Chat da comunidade** (se ligado): todo painel social tem **Denunciar** e **Bloquear**;
  a moderação combina filtro automático de palavras (servidor), ocultação por 3 denúncias
  distintas com *mute* de 24 h (Edge Function `chat-moderation`) e revisão manual —
  detalhes em `SOCIAL.md` §8. Mensagens são apagadas do servidor em 24 h.
- **Exclusão de conta** (exigência da Play para apps com UGC): disponível dentro do
  próprio jogo em *Configurações → Comunidade → Apagar conta da comunidade* —
  definitiva, sem exigir e-mail.
- A pontuação vem do **cliente e não é confiável**; o servidor deve impor limites
  (nome 3–12 chars, score máximo plausível, rate limit por IP) — ver comentários em `ranking.js`.
