# ORBLUX — Google Play Store (TWA)

Como empacotar o ORBLUX como **Trusted Web Activity (TWA)** e publicar na Play
Store. Consultado em 14/10/2026 (links no fim).

> Por que TWA: a **Digital Goods API** (que o app usa para comprar skins via
> Google Play Billing) só existe dentro de um TWA publicado pela Play Store.
> No navegador comum a loja entra em **modo demonstração** (vitrine): dá para
> ver e experimentar as skins, mas não comprar — por design.

## 1. Pré-requisitos

- Site do jogo servido em **HTTPS** com certificado válido.
- `manifest.webmanifest` público (já existe na raiz do projeto).
- Node.js 18+ e a CLI do Bubblewrap:
  `npm i -g @bubblewrap/cli`
- Conta de desenvolvedor Google Play ativa (conta de pagamentos + identidade).

## 2. Digital Asset Links (obrigatório — sem ele aparece barra do navegador)

Crie `https://seudominio.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.seudominio.orblux",
    "sha256_cert_fingerprints": ["COLE_AQUI_O_SHA256_DO_SEU_KEYSTORE"]
}]
```

Gere o fingerprint com:
`keytool -list -v -keystore seu.keystore -alias orblux`

## 3. Gerar o projeto Android (TWA)

1. Edite `twa-manifest.json` trocando `seudominio.com`, `com.seudominio.orblux`
   e as URLs dos ícones pelos seus valores reais.
2. `bubblewrap init --manifest https://seudominio.com/manifest.webmanifest`
   (ou aponte a CLI para o `twa-manifest.json` já preenchido).
3. `bubblewrap build` → gera o `app-release-signed.aab`.
4. Teste no aparelho: `bubblewrap install` (o app deve abrir **sem** barra de
   navegador; se abrir com, revise o `assetlinks.json`).

## 4. Upload e produtos

1. Play Console → *Todos os apps → Adicionar app* → pacote `com.seudominio.orblux`.
2. Envie o AAB em *Testes internos* primeiro.
3. Crie os **21 produtos** com os SKUs exatos: `SKINS_PLAY_CONSOLE.md` (seção 1).
4. Adicione **testadores de licença** e instale o teste interno.
5. No aparelho de teste, abra o app publicado: a loja deve mostrar preços reais
   e a compra deve passar pelo fluxo do Google Play (não pelo mock).

## 5. Comportamento esperado por ambiente

| Ambiente | Provedor de compra | Preço |
|----------|--------------------|-------|
| Navegador comum | Vitrine (demonstração) | "Indisponível" — sem compra |
| TWA no ar (Play) | Google Play Billing (Digital Goods) | `localizedPrice` real do Play |
| `localhost/?debug=1` | MockProvider (dev/testes) | Preços simulados pt-BR |

## 6. Manutenção de versão

- `appVersionCode` sobe a cada release; `appVersionName` segue semântica simples.
- Mudou SKU/nome de produto? Atualize a tabela de `SKINS_PLAY_CONSOLE.md` e o
  catálogo em `js/game/skins.js` **na mesma release** (o app valida os SKUs).

## 7. Referências oficiais

- Bubblewrap CLI: https://github.com/ChromeLabs/bubblewrap
- TWA + Play: https://developer.chrome.com/docs/android/trusted-web-activity
- Digital Goods: https://developer.chrome.com/docs/web-platform/digital-goods
- Asset Links: https://developers.google.com/digital-asset-links/quickstart
