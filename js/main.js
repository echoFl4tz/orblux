/* =========================================================
   ORBLUX — ponto de entrada (main.js)
   Liga todos os módulos: core, jogo, UI, ads e PWA.
   ========================================================= */

import { startLoop } from './core/loop.js';
import { on, emit } from './core/events.js';
import { state, saveStats, saveSettings, addScoreToRanking, saveWallet, todayKey } from './core/state.js';
import { initAudio, resumeAudio, sfx } from './core/audio.js';
import { initInput } from './core/input.js';
import { initGame, update, render, startGame, forceGameOver, revive, game } from './game/game.js';
import { initHud, hudTick } from './ui/hud.js';
import { initToasts, showToast } from './ui/toasts.js';
import { initScreens, applySettingsToUI, showGameOver, showScreen } from './ui/screens.js';
import { initAchievements, checkAchievements } from './ui/achievements.js';
import { initMissions, allMissionsDone } from './ui/missions.js';
import { initRanking, submitRunGlobal } from './ui/ranking.js';
import { initShare } from './ui/share.js';
import { initNickname } from './ui/nickname.js';
import { initShop } from './ui/skins-shop.js';
import { initWalletUI } from './ui/wallet-ui.js';
import { initSocialUI } from './ui/social-ui.js';
import { initChatUI } from './ui/chat-ui.js';
import { initClansUI } from './ui/clans-ui.js';
import { initTournamentUI } from './ui/tournament-ui.js';
import { initAds, onRunEnd as adsOnRunEnd, showRewarded } from './monetization/ads.js';
import { initBilling, syncPurchases } from './monetization/billing.js';
import * as wallet from './core/wallet.js';
import * as economy from './core/economy.js';
import { getApi } from '../net/api.js';
import { createRunFlow } from './core/run-flow.js';
import * as maestria from './core/maestria.js';
import * as metricas from './core/metricas.js';
import { burst, ring, shockwave, floatText, comboText, levelBanner, setPoolMax, countActive } from './game/particles.js';

/**
 * Sonda de desempenho (A8): aparelho bom já nasce em "Alta (HD)".
 * Roda uma vez, só se o jogador nunca escolheu a qualidade manualmente,
 * medindo fillRect + blit auto num canvas offscreen pequeno — o mesmo
 * tipo de trabalho do fundo do jogo. Renderização por software (ms
 * alto) e aparelhos com poucos núcleos/memória ficam em Automático.
 * Se a sonda errar, o jogo recua sozinho em partida (game.js, A8).
 */
function sondaQualidade() {
  const s = state.settings;
  if (s.imageQualitySeed === 'usuario' || s.imageQualitySeed === 'healada') return;
  // modo de teste/desenvolvimento (?debug=1) não semeia: as suítes
  // medem a adaptação automática e precisam do comportamento padrão
  if (/[?&]debug=1/.test(location.search || '')) return;
  try {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const x = c.getContext('2d');
    if (!x) return;
    const passo = () => {
      for (let i = 0; i < 3; i++) {
        x.fillStyle = i === 0 ? '#22E4FF' : i === 1 ? '#FF3DF0' : '#0A0F1E';
        x.fillRect((i * 97) % 500, (i * 53) % 280, 220, 140);
      }
      x.drawImage(c, 0, 0, 640, 360, 0, 0, 640, 360);
      x.drawImage(c, 0, 0, 640, 360, 4, 4, 632, 352);
    };
    for (let i = 0; i < 4; i++) passo();            // aquecimento (relógio da GPU)
    const t0 = performance.now();
    for (let i = 0; i < 8; i++) passo();
    const ms = (performance.now() - t0) / 8;
    const nucleos = navigator.hardwareConcurrency || 0;
    const memoria = navigator.deviceMemory || 0;    // Chrome expõe; 0 = desconhecida
    if (ms <= 4 && nucleos >= 4 && (memoria === 0 || memoria >= 4)) {
      s.imageQuality = 'alta';
      s.imageQualitySeed = 'sonda';
      saveSettings();
    }
  } catch { /* sonda é opcional: em qualquer erro, fica Automático */ }
}

function boot() {
  // métricas locais de retenção (análise): abre a sessão e mede o
  // retorno D1/D7 — anônimas, somente neste dispositivo (metricas.js)
  metricas.abrirSessao();

  const canvas = document.getElementById('game-canvas');

  // ---- núcleo ----
  initGame(canvas);
  initInput(canvas);

  // ---- UI ----
  initToasts();
  initHud();
  initScreens();
  applySettingsToUI();
  initAchievements();
  initMissions();
  initRanking();
  initShare();
  initNickname();
  initWalletUI();
  initSocialUI();
  initChatUI();
  initClansUI();
  initTournamentUI();
  initShop();
  initAds();

  // ---- billing: fonte da verdade na abertura do app ----
  initBilling()
    .then(() => syncPurchases())
    .catch((err) => console.warn('[billing] sync inicial falhou:', err));

  // ---- áudio no 1º gesto (política de autoplay dos navegadores) ----
  const firstGesture = () => {
    initAudio();
    resumeAudio();
  };
  window.addEventListener('pointerdown', firstGesture);
  window.addEventListener('keydown', firstGesture);

  // ---- drops novos (1.1.0): toast de apresentação único por novelty ----
  on('drop:first', ({ nome, desc, icone }) => {
    showToast({ icon: icone || 'ic-bolt', title: `${nome}!`, desc });
  });
  on('evento:first', ({ nome, desc }) => {
    showToast({ icon: 'ic-pulse', title: `${nome}!`, desc });
  });

  // ---- fim de partida: estatísticas, ranking, missões, conquistas ----
  // Contabilidade ÚNICA por corrida (run-flow.js): a 1ª morte mostra o
  // painel com o reviver pendente; stats/moedas/missões/ranking só
  // rodamos na morte FINAL (ou quando o jogador desiste do revive).
  const runFlow = createRunFlow();

  /** Contabilidade completa de uma corrida (1× por runId). */
  const accountRun = (run) => {
    const st = state.stats;
    st.runs += 1;
    st.totalPickups += run.pickups;
    st.totalPowerups += run.powerups;
    st.bestCombo = Math.max(st.bestCombo, run.maxCombo);
    st.bestLevel = Math.max(st.bestLevel, run.level);
    st.totalTime = Math.round((st.totalTime || 0) + run.elapsed);
    // drops novos (1.1.0): totais simples para conquistas/"Como jogar"
    st.totalDrops = (st.totalDrops || 0) + (run.drops || 0);
    const kinds = run.dropsByKind || {};
    st.dropKinds = st.dropKinds || {};
    for (const k of Object.keys(kinds)) st.dropKinds[k] = (st.dropKinds[k] || 0) + kinds[k];
    st.eventsCompleted = (st.eventsCompleted || 0) + (run.events || 0);
    st.eventsClean = (st.eventsClean || 0) + (run.eventsClean || 0);
    const bestAnterior = st.best;
    const isRecord = run.score > st.best;
    if (isRecord) st.best = run.score;

    // ---- moedas da partida (ECONOMIA.md) ----
    const hoje = todayKey();
    const primeiraDoDia = st.lastRunDay !== hoje;
    st.lastRunDay = hoje;
    // Cristal (1.1.0): +3 moedas da partida por cristal coletado (teto 5)
    const cristais = Math.min(run.crystals || 0, 5);
    const ganho = economy.calcRunCoins({
      pickups: run.pickups,
      score: run.score,
      seconds: run.elapsed,
      recordBroken: isRecord && bestAnterior > 0,
      firstRunToday: primeiraDoDia,
    });
    const creditado = wallet.earn(ganho + cristais * 3, 'partida', `run-${st.runs}`);

    saveStats();

    // Maestria (retenção): XP permanente, creditado 1× por corrida —
    // a dedupe por runId em maestria.js + o run-flow fecham o farm.
    const mxp = maestria.creditarPartida(run.runId, run.score);

    const position = addScoreToRanking(run.score);
    emit('stats:changed');

    emit('missions:report', run);           // progresso das missões diárias
    const missionsAll = allMissionsDone();
    checkAchievements({ ...run, isRecord, missionsAll });

    if (isRecord) {
      sfx('record');
      const nick = state.profile?.nickname || 'Jogador';
      showToast({ icon: 'ic-trophy', title: `Novo recorde, ${nick}!`, desc: `${run.score.toLocaleString('pt-BR')} pontos` });
    }

    // subiu de nível na maestria: reconhecimento imediato (análise) —
    // as recompensas da trilha são SÓ cosméticas (skins por habilidade)
    if (mxp && mxp.subiu) {
      sfx('achievement');
      const nomes = mxp.recompensas.map((r) => r.nome);
      showToast({
        icon: 'ic-medal',
        title: `Maestria — nível ${mxp.nivel}`,
        desc: nomes.length
          ? `${nomes.slice(0, 2).join(' · ')} desbloqueada${nomes.length > 1 ? 's' : ''}`
          : `+${mxp.xp} XP nesta corrida`,
      });
    }
    return { position, bestAnterior, isRecord, granted: creditado.ok ? creditado.granted : 0, xpM: mxp };
  };

  on('game:over', (run) => {
    // leitura SEM mutar: o painel da 1ª morte precisa de recorde/gap
    const bestAnterior = state.stats.best;
    const isRecord = run.score > bestAnterior;

    const res = runFlow.onGameOver(run);
    if (res.flush) accountRun(res.flush);            // corrida abandonada antes do revive
    const fin = res.account && res.run ? accountRun(res.run) : null;

    // painel "Você ganhou N moedas" + dobrar: só quando creditamos de
    // verdade (morte final). Projeto exibido sem creditar abriria o
    // caminho dobrar+reviver = 3× as moedas.
    const projetado = economy.calcRunCoins({
      pickups: run.pickups, score: run.score, seconds: run.elapsed,
      recordBroken: isRecord && bestAnterior > 0,
      firstRunToday: state.stats.lastRunDay !== todayKey(),
    }) + Math.min(run.crystals || 0, 5) * 3;
    emit('wallet:run-coins', { coins: fin ? projetado : 0 });

    // melhor valor para o painel: com contabilidade, o novo recorde já
    // está gravado; sem (revive pendente), simula o efeito do placar
    const best = fin ? state.stats.best
      : (isRecord ? run.score : bestAnterior);
    showGameOver({
      ...run, best, bestAnterior, isRecord,
      position: fin ? fin.position : null,
      maestriaXp: fin && fin.xpM ? fin.xpM.xp : 0,   // XP creditado (0 = revive pendente)
    });
    adsOnRunEnd();

    // ranking global (camada social): fire-and-forget — flag desligada,
    // sem perfil ou sem rede = silencioso; nunca atrasa nem falha a UI.
    // Enviamos SEMPRE (inclusive a 1ª morte): o servidor guarda o melhor
    // e o intervalo (7 s) cobre o ciclo mínimo do revive.
    submitRunGlobal(run);
  });

  // jogador desistiu do revive (menu/replay): a corrida pendente é
  // contabilizada na hora, antes da próxima partida começar
  const flushPendente = () => { const f = runFlow.onRunBoundary(); if (f) accountRun(f); };
  // 'game:start': descarrega a corrida pendente e conta a partida
  // nova na linha de base de retenção (metricas.js — local/anônima)
  on('game:start', () => { flushPendente(); metricas.registrarPartida(); });
  on('game:quit', flushPendente);

  // ---- reviver via anúncio recompensado ----
  on('ads:rewarded-revive', () => {
    showRewarded(() => {
      if (revive()) showScreen(null);
    });
  });

  // ---- banner de cookies (LGPD) ----
  if (state.consent === null) {
    setTimeout(() => {
      const banner = document.getElementById('cookie-banner');
      if (banner) banner.hidden = false;
    }, 900);
  }

  // ---- game loop (passo fixo 1/60; hudTick 1× por QUADRO, não por passo) ----
  startLoop((dt) => { update(dt); }, (t) => { hudTick(); render(t); });

  // ---- sonda de qualidade (A8): depois do 1º quadro, sem atrasar o boot ----
  requestAnimationFrame(() => setTimeout(sondaQualidade, 350));

  // ---- splash some no 1º quadro com o menu pronto (Parte 2) ----
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('splash')?.remove()));

  // ---- PWA: registra o service worker e avisa quando há versão nova ----
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        // SW novo esperando (página já aberta): avisa e aplica no clique
        const vigia = () => {
          const novo = reg.installing;
          if (!novo) return;
          novo.addEventListener('statechange', () => {
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              showToast({
                icon: 'ic-restart',
                title: 'Versão nova disponível',
                desc: 'Clique em Atualizar — leva 2 segundos.',
                action: { label: 'Atualizar', fn: () => novo.postMessage({ type: 'SKIP_WAITING' }) },
                ms: 15000,
              });
            }
          });
        };
        if (reg.installing) vigia();
        reg.addEventListener('updatefound', vigia);
        // SW ativado após o clique: recarrega uma vez para servir o código
        // novo (na 1ª visita o claim() também dispara o evento — aí não recarrega)
        const jaControlava = !!navigator.serviceWorker.controller;
        let recarregou = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!jaControlava || recarregou) return;
          recarregou = true;
          location.reload();
        });
      } catch (err) {
        console.warn('[pwa] service worker não registrado:', err);
      }
    });
  }

  // ---- visibilidade: retoma áudio ao voltar para a aba ----
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeAudio();
  });

  // ---- erro global em pt-BR (Parte 2): um aviso educado, no máximo 1 a cada 4s ----
  let ultimoAvisoErro = 0;
  const avisaErro = (detalhe) => {
    console.error('[erro]', detalhe);
    const agora = performance.now();
    if (agora - ultimoAvisoErro < 4000) return;
    ultimoAvisoErro = agora;
    showToast({ icon: 'ic-close', title: 'Algo deu errado', desc: 'Tente de novo. Se persistir, recarregue a página.' });
  };
  window.addEventListener('error', (e) => avisaErro(e.message || 'erro de script'));
  window.addEventListener('unhandledrejection', (e) => avisaErro(String(e.reason ?? 'promessa rejeitada')));

  // ---- API de debug (somente localhost ou ?debug=1) ----
  const isDebug = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    || /[?&]debug=1/.test(location.search || '');
  if (isDebug) {
    // ?debug=1 também libera a carteira de QA (ganhar moedas p/ testar a UI).
    // Em localhost SEM o flag a API legada continua — só sem addCoins/getCoins.
    const ecoDebug = /[?&]debug=1/.test(location.search || '');
    window.OX = {
      version: '1.0.0',
      state,
      game,
      start: (opts = {}) => startGame(opts),
      advance: (seconds = 1) => {              // simula N segundos de jogo
        const steps = Math.round(seconds * 60);
        for (let i = 0; i < steps; i++) update(1 / 60);
      },
      endRun: () => forceGameOver(),
      ...(ecoDebug ? {
        addCoins: (n = 0, reason = 'debug') => wallet.earn(n, reason, 'ox'),
        getCoins: () => wallet.getCoins(),
        saveWallet,   // p/ testes: gravar alterações manuais no estado (ex.: ontem)
        economy,      // constantes/funções puras p/ testes de navegador (só ?debug=1)
        socialApi: () => getApi(),  // provedor social p/ testes de UI (só ?debug=1)
      } : {}),
      // captura/QA: emitir eventos e disparar FX de cena (sem tocar na lógica)
      emit,
      screen: (name = null) => showScreen(name),
      fx: { burst, ring, shockwave, floatText, comboText, levelBanner, setPoolMax, countActive },
      // QA de layout: OX.auditLayout() no console verifica overflow-x/altura
      // em todas as telas (use nos tamanhos: 360x640, 390x844, 412x915,
      // 768x1024, 1366x768 e 1920x1080, retrato e paisagem)
      auditLayout: () => {
        const issues = [];
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const ids = ['screen-menu', 'screen-howto', 'screen-ranking', 'screen-skins', 'screen-settings', 'screen-social', 'screen-chat', 'screen-clans', 'screen-tournament', 'screen-pause', 'screen-gameover'];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (!el) continue;
          const wasActive = el.classList.contains('active');
          el.classList.add('active');
          const panel = el.querySelector('.panel, .menu-wrap');
          if (panel) {
            const r = panel.getBoundingClientRect();
            if (r.left < -1 || r.right > vw + 1) {
              issues.push(`${id}: overflow horizontal (${Math.round(r.left)}..${Math.round(r.right)} em ${vw}px)`);
            }
          }
          if (!wasActive) el.classList.remove('active');
        }
        const docEl = document.documentElement;
        if (docEl.scrollWidth > vw) issues.push(`scrollWidth do documento ${docEl.scrollWidth} > ${vw}`);
        return { ok: issues.length === 0, issues, viewport: `${vw}x${vh}` };
      },
    };
    console.info('%c[ORBLUX] pronto', 'color:#22e6ff;font-weight:bold', `v${window.OX.version}`);
  }
}

try {
  boot();
} catch (err) {
  console.error('[boot] falha ao iniciar:', err);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;color:#fff;background:#05060f;font-family:sans-serif;padding:20px;text-align:center;z-index:99';
  overlay.textContent = 'Ops! Algo deu errado ao iniciar o jogo.';
  const btn = document.createElement('button');   // sem onclick inline (CSP)
  btn.textContent = 'Recarregar';
  btn.style.cssText = 'padding:12px 24px;font-size:1rem;color:#05060f;background:#22e6ff;border:0;border-radius:8px;cursor:pointer';
  btn.addEventListener('click', () => location.reload());
  overlay.appendChild(btn);
  document.body.appendChild(overlay);
}
