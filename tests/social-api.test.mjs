/* =========================================================
   CAMADA SOCIAL — regras + MockProvider (node:test)
   Valida o contrato da UMA interface (net/api.js) rodando
   100% offline com o MockProvider, mais as regras puras.
   ========================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeChat, containsOffense, containsContact, softenCaps,
  validateChatMessage, validateClanName, validateClanTag,
  CHAT, CLAN, QUICK_PHRASES,
} from '../net/rules.js';
import { createApi, resetApi, TERMS_VERSION } from '../net/api.js';
import { FLAG_DEFAULTS, flag, isMockProvider, setFlags, resetFlags } from '../net/flags.js';

/** Provedor mock limpo, sem latência e sem bots (testes determinísticos). */
function mockApi(now = 1760000000000) {
  resetApi();
  const nowFn = typeof now === 'function' ? now : () => now;
  const api = createApi({ provider: 'mock', latency: 0, botIntervalMs: 0, now: nowFn, seed: 4242 });
  api.__reset();
  return api;
}

/* ---------------- regras puras ---------------- */

test('normalizeChat desfaz acentos, caixa, leet e pontuação', () => {
  assert.equal(normalizeChat('P3RR0'), 'perro');             // leet 3→e, 0→o
  assert.equal(normalizeChat('  Olá,  Mundo! '), 'ola mundo'); // '!' NÃO vira 'i'
  assert.equal(normalizeChat('M.E.R.D.A'), 'm e r d a');      // letras ficam separadas...
  assert.ok(containsOffense('M.E.R.D.A'), '...mas o filtro pega na versão densa');
  assert.ok(containsOffense('c a r a l h o'));                // letras isoladas juntam
});

test('containsOffense pega palavrão, frase, colado e espaçado', () => {
  assert.ok(containsOffense('que merda de jogo'));
  assert.ok(containsOffense('seu .c.u.'));                    // letras isoladas → "cu"
  assert.ok(containsOffense('merdinha'));
  assert.ok(!containsOffense('boa partida!'));
  assert.ok(!containsOffense('luciano'));                     // não vira falso positivo
});

test('containsContact pega link, e-mail e telefone', () => {
  assert.ok(containsContact('entra em https://x.com'));
  assert.ok(containsContact('meu email é joao@x.com'));
  assert.ok(containsContact('chama no 11999998888'));
  assert.ok(!containsContact('manda o recorde!'));
});

test('softenCaps suaviza CAIXA ALTA excessiva, preserva "GG!"', () => {
  assert.equal(softenCaps('VAI JOGAR AGORA'), 'Vai jogar agora');
  assert.equal(softenCaps('GG!'), 'GG!');                // curto: não toca
});

test('validateChatMessage: códigos de erro esperados', () => {
  const base = { now: 1000000 };
  assert.equal(validateChatMessage('', base).code, 'empty');
  assert.equal(validateChatMessage('x'.repeat(201), base).code, 'too_long');
  assert.equal(validateChatMessage('https://a.com', base).code, 'blocked_contact');
  assert.equal(validateChatMessage('que otário', base).code, 'blocked_word');
  assert.equal(validateChatMessage('GG!', { ...base, mutedUntil: 2000000 }).code, 'muted');
  assert.equal(validateChatMessage('GG!', { ...base, bannedUntil: 2000000 }).code, 'banned');
  assert.equal(validateChatMessage('texto livre', { ...base, ageBand: 'menor13' }).code, 'quick_only');
  assert.equal(validateChatMessage('GG!', { ...base, ageBand: 'menor13' }).ok, true);
  assert.equal(validateChatMessage('boa!', { ...base, lastSentAt: 999500 }).code, 'rate_limit');
  assert.equal(validateChatMessage('GG!', { ...base, lastText: 'GG!' }).code, 'duplicate');
  const recent = Array.from({ length: CHAT.PER_MIN }, (_, i) => 1000000 - i * 1000);
  assert.equal(validateChatMessage('boa partida', { ...base, recentSent: recent }).code, 'flood');
  assert.equal(validateChatMessage('VAI JOGAR', base).value, 'Vai jogar');
  assert.ok(QUICK_PHRASES.includes('GG!'));
});

test('validação de nome e tag de clã', () => {
  assert.ok(validateClanName('Orbitais').ok);
  assert.ok(!validateClanName('Admin').ok);              // reservado
  assert.ok(!validateClanName('x').ok);                  // curto
  assert.ok(!validateClanName('otários').ok);            // ofensa
  assert.ok(validateClanTag('ORB').ok);
  assert.equal(validateClanTag('orb').value, 'ORB');
  assert.ok(!validateClanTag('OR').ok);                  // curto
  assert.ok(!validateClanTag('ADM').ok);                 // reservado
});

/* ---------------- flags ---------------- */

test('flags: tudo desligado por padrão (produção segue o dono)', () => {
  resetFlags();
  for (const [name, def] of Object.entries(FLAG_DEFAULTS)) {
    assert.equal(def, false, `${name} deve nascer desligada`);
    assert.equal(flag(name), false);
  }
  setFlags({ CHAT_ENABLED: true });
  assert.equal(flag('CHAT_ENABLED'), true);
  assert.equal(flag('CLANS_ENABLED'), false);
  resetFlags();
  assert.equal(flag('CHAT_ENABLED'), false);
});

test('em Node o provedor padrão é o mock (sem location)', () => {
  assert.equal(isMockProvider(), true);
  assert.equal(createApi().provider, 'mock');
});

/* ---------------- auth + perfil ---------------- */

test('auth: signIn cria sessão anônima persistente', async () => {
  const api = mockApi();
  assert.equal(await api.auth.session(), null);
  const s = await api.auth.signIn();
  assert.ok(s.userId && s.anon === true);
  assert.ok((await api.auth.session()).userId);
});

test('profile: apelido ÚNICO — colisão ganha sufixo #1234; re-salvar NÃO renomeia', async () => {
  const api = mockApi();
  await api.auth.signIn();
  const p1 = await api.profile.upsert({ nickname: 'NeoPilot', ageBand: '18+', skinId: 'classic' });
  assert.ok(p1.nickname.startsWith('NeoPilot#'), `colisão com bot deve sufixar (${p1.nickname})`);
  const p2 = await api.profile.upsert({ nickname: 'MeuNickLegal', ageBand: '18+' });
  assert.equal(p2.nickname, 'MeuNickLegal');
  const p3 = await api.profile.upsert({ nickname: 'MeuNickLegal', ageBand: '18+' });
  assert.equal(p3.nickname, 'MeuNickLegal', 're-salvar o próprio apelido não pode sufixar');
  assert.equal(p3.terms.version, TERMS_VERSION);
  assert.equal(p3.ageBand, '18+');
});

test('profile: faixa de idade é obrigatória', async () => {
  const api = mockApi();
  await api.auth.signIn();
  await assert.rejects(() => api.profile.upsert({ nickname: 'SemIdade' }), (e) => e.code === 'age-required');
  await assert.rejects(() => api.profile.upsert({ nickname: 'Ok!', ageBand: 'qualquer' }), (e) => e.code === 'age-required');
});

test('profile: recuperação por código e exclusão de conta', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Sobrevivente', ageBand: '18+' });
  const code = api.state.recoveryCode;
  assert.equal(code.length, 12);
  // simula aparelho novo: apaga tudo menos o "servidor" (vault)
  api.state.user = null; api.state.profile = null; api._save();
  await assert.rejects(() => api.profile.recover('XXXXXXXXXXXX'), (e) => e.code === 'invalid-code');
  const p = await api.profile.recover(code);
  assert.equal(p.nickname, 'Sobrevivente');
  await api.profile.deleteAccount();
  assert.equal(await api.profile.get(), null);
  // exclusão é FINAL: o código antigo não recupera mais nada (vault apagado)
  await assert.rejects(() => api.profile.recover(code), (e) => e.code === 'invalid-code');
});

test('profile: getRecoveryCode exige sessão e devolve o mesmo código do vault', async () => {
  const api = mockApi();
  await assert.rejects(() => api.profile.getRecoveryCode(), (e) => e.code === 'no-session');
  await api.__seedProfile({ nickname: 'CodigoTeste', ageBand: '18+' });
  const code = await api.profile.getRecoveryCode();
  assert.equal(code.length, 12);
  assert.equal(code, api.state.recoveryCode);
});

test('profile: getRecoveryCode some após apagar a conta', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'ApagouTeste', ageBand: '18+' });
  await api.profile.deleteAccount();
  await assert.rejects(() => api.profile.getRecoveryCode(), (e) => e.code === 'no-session');
});

/* ---------------- chat ---------------- */

test('chat: enviar, histórico, tempo real (onMessage) e limite de tamanho', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'JogadoraX', ageBand: '18+' });
  const recebidas = [];
  api.chat.onMessage((m) => recebidas.push(m));
  const { room } = await api.chat.join('global');
  assert.ok(room.startsWith('global:pt-BR:'));
  const msg = await api.chat.send('Boa partida!');
  assert.equal(msg.text, 'Boa partida!');
  assert.equal(msg.nick, 'JogadoraX');
  assert.equal(recebidas.length, 1);
  const hist = await api.chat.history({ room });
  assert.equal(hist.at(-1).text, 'Boa partida!');
  await assert.rejects(() => api.chat.send('x'.repeat(500)), (e) => e.code === 'too_long');
});

test('chat: rate limit (2s) e flood (15/min) com tempo controlado', async () => {
  let now = 1760000000000;
  const api = mockApi(() => now);
  await api.__seedProfile({ nickname: 'Ritmo', ageBand: '18+' });
  await api.chat.send('Boa!');
  await assert.rejects(() => api.chat.send('Boa de novo'), (e) => e.code === 'rate_limit');
  now += 2500;
  // 1ª "Boa!" + 14 = 15 na janela de 60 s (teto)
  for (let i = 0; i < CHAT.PER_MIN - 1; i++) {
    // sem dígitos: normalizeChat os remove e "numero 8"/"numero 9" colidiriam
    await api.chat.send(`Mensagem ${String.fromCharCode(97 + i)} agora`);
    now += 2500;
  }
  now += 2500; // passa do rate limit de 2 s; segue dentro dos 60 s -> flood
  await assert.rejects(() => api.chat.send('mais uma mensagem nova'), (e) => e.code === 'flood');
});

test('chat: menores de 13 só usam frases prontas/emojis', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'KidPlayer', ageBand: 'menor13' });
  await assert.rejects(() => api.chat.send('quero jogar com vocês'), (e) => e.code === 'quick_only');
  const ok = await api.chat.send('GG!');
  assert.equal(ok.text, 'GG!');
});

test('chat: denúncia oculta mensagem (3) e bloqueio filtra histórico', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Moderna', ageBand: '18+' });
  await api.chat.join('global');
  const m = await api.chat.send('mensagem para denunciar');
  const bot = api.__botSay();
  assert.ok(bot);
  await api.chat.report({ messageId: m.id, reason: 'ofensa' });
  assert.ok(!(await api.chat.history()).some((x) => x.id === m.id) === false, '1 denúncia ainda mostra');
  await api.chat.report({ messageId: m.id, reason: 'spam' });
  await api.chat.report({ messageId: m.id, reason: 'outro' });
  assert.ok(!(await api.chat.history()).some((x) => x.id === m.id), '3 denúncias ocultam no mock');
  await api.chat.block(bot.userId);
  assert.ok(!(await api.chat.history()).some((x) => x.userId === bot.userId), 'bloqueado some do meu chat');
  await api.chat.unblock(bot.userId);
  assert.ok((await api.chat.history()).some((x) => x.userId === bot.userId));
});

test('chat: mutado e banido não escrevem', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Silenciosa', ageBand: '18+' });
  api.state.profile.mutedUntil = Date.now() + 60000; api._save();
  await assert.rejects(() => api.chat.send('oi'), (e) => e.code === 'muted');
  api.state.profile.mutedUntil = 0;
  api.state.profile.bannedUntil = Date.now() + 60000; api._save();
  await assert.rejects(() => api.chat.send('oi'), (e) => e.code === 'banned');
});

/* ---------------- clãs ---------------- */

test('clãs: criar, regras (nome colidido, menor de 13, já em clã, espera de troca)', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Lidera', ageBand: '18+' });
  await assert.rejects(() => api.clans.create({ nome: 'Orbitais', tag: 'ZZZ' }), (e) => e.code === 'name-taken');
  const clan = await api.clans.create({ nome: 'Clã da Judit', tag: 'JUD', tipo: 'aberto' });
  assert.equal(clan.meuPapel, 'lider');
  assert.equal((await api.clans.mine()).id, clan.id);
  await assert.rejects(() => api.clans.create({ nome: 'Outro', tag: 'OTR' }), (e) => e.code === 'already-in-clan');

  await api.clans.leave();
  assert.equal(await api.clans.mine(), null);
  await assert.rejects(() => api.clans.create({ nome: 'Outro Clã', tag: 'OTR' }), (e) => e.code === 'switch_wait');
});

test('clãs: entrar em aberto, recusar solicitacao/convite e permissões', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'MembroNovo', ageBand: '18+' });
  const lista = await api.clans.search({ tipo: 'solicitacao' });
  assert.ok(lista.length > 0);
  await assert.rejects(() => api.clans.join(lista[0].id), (e) => e.code === 'needs_request');
  const convite = (await api.clans.search({ tipo: 'convite' }))[0];
  await assert.rejects(() => api.clans.join(convite.id), (e) => e.code === 'invite_only');
  const aberto = (await api.clans.search({ tipo: 'aberto' }))[0];
  const joined = await api.clans.join(aberto.id);
  assert.equal(joined.meuPapel, 'membro');
  // membro comum não gere
  await assert.rejects(() => api.clans.kick('bot_1'), (e) => e.code === 'forbidden');
});

test('clãs: gestão (solicitação, expulsar, promover, transferir)', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Chefe', ageBand: '18+' });
  const clan = await api.clans.create({ nome: 'Guardiões', tag: 'GRD' });
  await api.clans.__botJoin();
  await api.clans.__botRequest();
  const reqs = await api.clans.requests(clan.id);
  assert.equal(reqs.length, 1);
  const membro = (await api.clans.members(clan.id)).find((m) => m.papel === 'membro');
  await api.clans.kick(membro.userId);
  assert.ok(!(await api.clans.members(clan.id)).some((m) => m.userId === membro.userId));
  await api.clans.acceptRequest(reqs[0].userId);
  const agora = await api.clans.members(clan.id);
  assert.ok(agora.some((m) => m.userId === reqs[0].userId));
  const novo = agora.find((m) => m.userId === reqs[0].userId);
  await api.clans.promote(novo.userId);
  assert.equal((await api.clans.members(clan.id)).find((m) => m.userId === novo.userId).papel, 'vice');
  await api.clans.transfer(novo.userId);
  assert.equal((await api.clans.mine()).meuPapel, 'membro');
  await assert.rejects(() => api.clans.dissolve(), (e) => e.code === 'forbidden');
});

test('clãs: menores de 13 não criam clã (só convite)', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'KidClan', ageBand: 'menor13' });
  await assert.rejects(() => api.clans.create({ nome: 'Clã Kids', tag: 'KID' }), (e) => e.code === 'age-restricted');
});

/* ---------------- torneios ---------------- */

test('torneios: temporada atual, grupo e recompensa ÚNICA (idempotente)', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Tornei', ageBand: '18+' });
  const t = await api.tournaments.current();
  assert.ok(t.id.startsWith('T') && t.endsAt > t.startsAt);
  assert.ok(t.group.length >= 5);
  const group = await api.tournaments.group();
  assert.equal(group[0].posicao, 1);
  // fim de temporada -> histórico com recompensa
  await api.tournaments.__rollover();
  const rewards = await api.tournaments.rewards();
  assert.equal(rewards.length, 1);
  const h = rewards[0];
  assert.ok(h.rewards.total >= 0);
  if (h.rewards.total > 0) {
    const got = await api.tournaments.claimReward(h.seasonId);
    assert.equal(got.coins, h.rewards.total);
    await assert.rejects(() => api.tournaments.claimReward(h.seasonId), (e) => e.code === 'already_claimed');
  }
  // nova temporada aberta
  const nova = await api.tournaments.current();
  assert.notEqual(nova.id, t.id);
});

/* ---------------- ranking ---------------- */

test('ranking: envio valida plausibilidade e o top mistura minhas partidas', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Corredora', ageBand: '18+' });
  await assert.rejects(() => api.ranking.submitRun({ score: 999999, seconds: 30 }), (e) => e.code === 'implausible');
  await assert.rejects(() => api.ranking.submitRun({ score: 100, seconds: 5 }), (e) => e.code === 'too-short');
  await api.ranking.submitRun({ score: 1500, seconds: 42, version: '1.0.0' });
  const mine = await api.ranking.mine();
  assert.equal(mine.melhor, 1500);
  const top = await api.ranking.top({ scope: 'alltime', page: 0, limit: 50 });
  assert.ok(top.rows.some((r) => r.isMe && r.score === 1500));
  assert.ok(top.myRank >= 1);
  const weekly = await api.ranking.top({ scope: 'weekly', limit: 50 });
  assert.ok(weekly.rows.some((r) => r.isMe));
});

/* ---------------- resiliência ---------------- */

test('falha de rede simulada e modo offline rejeitam com código estável', async () => {
  const api = mockApi();
  await api.__seedProfile({ nickname: 'Resiliente', ageBand: '18+' });
  api.__setFailNext(1);
  await assert.rejects(() => api.chat.history(), (e) => e.code === 'network');
  const ok = await api.chat.history();                    // próxima passa
  assert.ok(Array.isArray(ok));
  api.__setOffline(true);
  await assert.rejects(() => api.chat.history(), (e) => e.code === 'offline');
  api.__setOffline(false);
  assert.ok(Array.isArray(await api.chat.history()));
});

test('sem sessão: chat exige entrada; perfil volta null', async () => {
  const api = mockApi();
  assert.equal(await api.profile.get(), null);            // UI degrada sem travar
  await assert.rejects(() => api.chat.send('oi'), (e) => e.code === 'no-session');
});

test('NullProvider: social desligado rejeita tudo com "disabled"', async () => {
  const api = createApi({ provider: 'null' });
  assert.equal(api.provider, 'null');
  await assert.rejects(() => api.chat.send('oi'), (e) => e.code === 'disabled');
  await assert.rejects(() => api.clans.mine(), (e) => e.code === 'disabled');
  await assert.rejects(() => api.tournaments.current(), (e) => e.code === 'disabled');
  await assert.rejects(() => api.ranking.top(), (e) => e.code === 'disabled');
});
