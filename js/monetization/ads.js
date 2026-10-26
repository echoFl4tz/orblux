/* =========================================================
   Anúncios — placeholders funcionais + integração pronta
   para Google AdSense / AdSterra (comentários no local certo)
   ========================================================= */

import { on } from '../core/events.js';
import { state, saveConsent } from '../core/state.js';
import { showToast } from '../ui/toasts.js';

/* ------------------------------------------------------------------
   CONFIGURAÇÃO — quando você colar seu código de anúncio real:
   1) ADS.enabled = true
   2) ADS.client = 'ca-pub-XXXXXXXXXXXXXXXX'
   3) cole o <script async> do AdSense no <head> do index.html
   4) preencha os slots em index.html (#ad-banner / #ad-interstitial)
------------------------------------------------------------------ */
export const ADS = {
  enabled: false,
  client: '',
  interstitialEvery: 3,   // intersticial a cada N partidas
};

let gamesSinceInterstitial = 0;
let countdownTimer = null;

// HTML original dos botões de anúncio (restaurados ao fechar/zerar)
const AD_CLOSE_HTML = 'Fechar em <span id="ad-countdown">5</span>s';
const AD_CLAIM_HTML = 'Resgatar em <span id="reward-countdown">5</span>s';

/**
 * Fecha qualquer modal de anúncio e para o timer de contagem.
 * Chamado ao voltar ao menu (returnToMenu) para nunca deixar um intersticial/
 * rewarded aberto ou com contagem rodando sobre o menu.
 */
export function closeAllAds() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  const inter = document.getElementById('ad-interstitial');
  const reward = document.getElementById('ad-reward');
  if (inter) inter.hidden = true;
  if (reward) reward.hidden = true;
  // restaura o texto/estado inicial dos botões (innerHTML foi trocado ao fim da contagem)
  const btnAd = document.getElementById('btn-close-ad');
  if (btnAd) { btnAd.disabled = true; btnAd.innerHTML = AD_CLOSE_HTML; }
  const btnClaim = document.getElementById('btn-claim-reward');
  if (btnClaim) { btnClaim.disabled = true; btnClaim.innerHTML = AD_CLAIM_HTML; }
}

export function initAds() {
  const banner = document.getElementById('ad-banner');

  // LGPD: sem consentimento, esconde os slots de anúncio
  if (state.consent === false && banner) banner.hidden = true;

  on('consent:answer', (accepted) => {
    saveConsent(accepted);
    const bannerEl = document.getElementById('cookie-banner');
    if (bannerEl) bannerEl.hidden = true;
    if (banner) banner.hidden = !accepted;
    showToast({
      icon: accepted ? 'ic-check' : 'ic-shield',
      title: accepted ? 'Obrigado!' : 'Tudo bem',
      desc: accepted ? 'Você pode apagar isso nas configurações.' : 'Só o essencial será usado.',
    });
  });

  /* ------------------------------------------------------------------
     BANNER (AdSense) — exemplo real de unidade responsiva:
     No index.html, dentro de #ad-banner, cole:

       <ins class="adsbygoogle"
            style="display:block"
            data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
            data-ad-slot="XXXXXXXXXX"
            data-ad-format="auto"
            data-full-width-responsive="true"></ins>
       <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>

     O placeholder some automaticamente quando existe conteúdo real:
  ------------------------------------------------------------------ */
  if (ADS.enabled && banner && banner.querySelector('ins')) {
    const hint = banner.querySelector('.ad-hint, .ad-label');
    if (hint) hint.remove();
  }
}

/** Chamado ao fim de cada partida pelo main.js (intersticial ocasional). */
export function onRunEnd() {
  gamesSinceInterstitial++;
  if (!ADS.enabled || state.consent !== true) return;
  if (gamesSinceInterstitial >= ADS.interstitialEvery) {
    gamesSinceInterstitial = 0;
    showInterstitial();
  }
}

// ---------------------------------------------------------
//  Intersticial (entre partidas) — placeholder com contagem
// ---------------------------------------------------------
export function showInterstitial() {
  const modal = document.getElementById('ad-interstitial');
  const btn = document.getElementById('btn-close-ad');
  if (!modal || !btn) return;

  modal.hidden = false;
  let secs = 5;
  btn.disabled = true;
  // restaura o template ANTES de localizar a contagem: no fim da
  // rodada anterior o innerHTML foi trocado e o span #ad-countdown
  // antigo ficava "desanexado" — o novo countdown não aparecia
  btn.innerHTML = AD_CLOSE_HTML;
  const cd = document.getElementById('ad-countdown');
  cd.textContent = secs;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secs--;
    cd.textContent = Math.max(0, secs);
    if (secs <= 0) {
      clearInterval(countdownTimer);
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-close"/></svg> Fechar';
    }
  }, 1000);

  btn.onclick = () => { modal.hidden = true; };
}

// ---------------------------------------------------------
//  Rewarded (anúncio recompensado) — placeholder funcional
// ---------------------------------------------------------
/** @param {()=>void} onReward chamado quando o jogador "assiste" o anúncio */
export function showRewarded(onReward) {
  const modal = document.getElementById('ad-reward');
  const btn = document.getElementById('btn-claim-reward');
  const text = document.getElementById('reward-ad-text');
  if (!modal || !btn) return;

  modal.hidden = false;
  let secs = 5;
  btn.disabled = true;
  // idem intersticial: template restaurado ANTES de achar o span da contagem
  btn.innerHTML = AD_CLAIM_HTML;
  const cd = document.getElementById('reward-countdown');
  cd.textContent = secs;
  text.innerHTML = 'Anúncio de exemplo rodando…<br>(no modo real, o vídeo do AdSense/AdSterra aparece aqui)';
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secs--;
    cd.textContent = Math.max(0, secs);
    if (secs <= 0) {
      clearInterval(countdownTimer);
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-check"/></svg> Resgatar recompensa';
    }
  }, 1000);

  /* ------------------------------------------------------------------
     REWARDED REAL (rede que suporta web rewarded, ex.: AdSterra):
       No modal, substitua o conteúdo de .ad-box-big pelo iframe do
       provedor e só libere o botão quando o SDK disparar o evento
       'onRewarded'. O fluxo de recompensa abaixo já está pronto.
  ------------------------------------------------------------------ */
  btn.onclick = () => {
    modal.hidden = true;
    clearInterval(countdownTimer);
    onReward?.();
  };
}
