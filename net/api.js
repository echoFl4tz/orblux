/* =========================================================
   API SOCIAL — UMA interface, dois provedores (+ Null)

   Grupos: auth · profile · chat · clans · tournaments · ranking
   • MockProvider: simula o SERVIDOR inteiro em localStorage
     (latência, falhas, mensagens de outros jogadores, clãs
     fake, rollover de temporada). Padrão em localhost/?mock=1.
     Permite testar TODA a UI sem servidor.
   • SupabaseProvider: fala com o backend real (auth anônimo +
     RPCs/tables planejados em SOCIAL.md). UMD oficial pinado,
     carregado sob demanda de vendor/.
   • NullProvider: social desligado — toda chamada rejeita com
     SocialError('disabled') para a UI degradar sem travar.

   REGRAS: servidor é a fonte da verdade (regras em net/rules.js
   são o espelho/mock). Toda UI recebe dados prontos para exibir
   SEM innerHTML (o texto da rede entra via textContent).
   ========================================================= */

import { getItem, setItem, removeItem } from '../js/core/storage.js';
import { isMockProvider } from './flags.js';
import { supabaseSettings, SUPABASE_UMD_PATH } from './config.js';
import { seededRng, randInt, pick } from './rng.js';
import {
  CHAT, CLAN, validateChatMessage, validateClanName, validateClanTag,
  normalizeChat, validateNickname, AGE_BANDS, QUICK_PHRASES, QUICK_EMOJIS,
} from './rules.js';

export const TERMS_VERSION = '2026-10-14';   // versão dos Termos/Comunidade aceitos
const MOCK_KEY = 'pn_social_mock';

/** Erro de rede social com código estável (a UI mostra msg amigável). */
export class SocialError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'SocialError';
    this.code = code;
  }
}
const fail = (code, msg) => { throw new SocialError(code, msg); };

/* =========================================================
   MOCK PROVIDER — o "servidor" de mentira, completo
   ========================================================= */

const FAKE_SEED = 'orblux-fake-catalog-v1';
const WEEK_MS = 7 * 86400000;
const SEASON_REF = Date.UTC(2026, 0, 5, 3, 0, 0); // 2026-01-05 00:00 BRT (segunda)
const TZ_OFFSET_MS = 3 * 3600000;                 // America/Sao_Paulo fixo (UTC-3)

const BOT_NICKS = ['NeoPilot', 'Lia_Volt', 'DraCobra', 'KaiOrbit', 'ViviFlux', 'Zeca_Pulso',
  'NinaBeta', 'RafaCore', 'BiaNebula', 'TéoRush', 'SolMatrix', 'GuiQuantum', 'AnaPrisma', 'YuDelta'];
const CLAN_NAMES = [
  ['Orbitais', 'ORB', 'aberto'], ['Vulcânicos', 'VULC', 'solicitacao'], ['Neon Riders', 'NEON', 'aberto'],
  ['Pulsares', 'PULS', 'aberto'], ['Cometas Livres', 'CMT', 'convite'], ['Ecos do Vazio', 'ECO', 'aberto'],
  ['Titãs Quânticos', 'TQ', 'solicitacao'], ['Fênix Circuit', 'FNX', 'aberto'], ['Áurea Digital', 'AURE', 'aberto'],
  ['Sentinelas', 'SENT', 'solicitacao'], ['Íonico', 'ION', 'aberto'], ['Corvos Byte', 'CRVO', 'convite'],
];
const BOARD_NICKS = ['AuroraX', 'BoltMage', 'CyroNeon', 'DeltaKid', 'EchoSeven', 'Fluxo', 'GlitchBR',
  'HyperLia', 'IcePulse', 'JoltKid', 'Krono', 'Lumen', 'MonoWave', 'NovaZ', 'Onyx', 'Prisma9', 'Quasar',
  'RiftWalker', 'Solaris', 'TerraByte', 'Ultravioleta', 'Vórtice', 'WaveCore', 'Xeno', 'YaraLight', 'Zafira',
  'Ashen', 'Blip', 'CoreDump', 'Duna', 'Ember', 'FogoFátuo', 'Gamma', 'Halo', 'Íris', 'Juno', 'Kappa', 'Lua Cheia', 'Magno'];

function seasonWeekIdx(now) { return Math.floor((now - SEASON_REF) / WEEK_MS); }
function seasonStart(weekIdx) { return SEASON_REF + weekIdx * WEEK_MS; }
function seasonNumber(weekIdx) { return weekIdx + 1; }

class MockProvider {
  constructor(opts = {}) {
    this.provider = 'mock';
    this._latency = opts.latency === undefined ? [40, 220] : opts.latency;
    this._now = opts.now || (() => Date.now());
    this._botMs = opts.botIntervalMs === undefined
      ? (typeof window === 'undefined' ? 0 : 5500)
      : opts.botIntervalMs;
    this._rng = seededRng(opts.seed || 1337);
    this._listeners = { message: [], session: [] };
    this._offline = false;
    this._failNext = 0;
    this._botTimer = null;
    this._room = null;

    this.state = this._load();
    this._ensureCatalog();
  }

  /* ---------- persistência (localStorage com fallback memória) ---------- */
  _load() {
    const raw = getItem(MOCK_KEY);
    if (raw && raw.v === 1) return raw;
    return {
      v: 1, seq: 0, user: null, profile: null, recoveryCode: null, vault: {},
      taken: [], blocks: [], reports: [], hidden: {}, messages: {},
      lastSentAt: 0, recentSent: [], lastText: '',
      clans: { mineId: null, role: null, waitUntil: 0, created: null, requests: [], outgoing: [], invites: [], members: [] },
      catalog: null,
      tournament: { offsetWeeks: 0, claimed: {}, history: [] },
      runs: [],
    };
  }
  _save() { setItem(MOCK_KEY, this.state); }
  _id(p) { this.state.seq += 1; return `${p}${this.state.seq}_${Math.floor(this._rng() * 1e6).toString(36)}`; }

  _ensureCatalog() {
    if (this.state.catalog) return;
    const rng = seededRng(FAKE_SEED);
    const clans = CLAN_NAMES.map(([nome, tag, tipo], i) => {
      const n = randInt(rng, 4, CLAN.MAX_MEMBERS);
      const members = [];
      for (let m = 0; m < n; m++) {
        members.push({
          userId: `bot_${i}_${m}`, nick: pick(rng, BOT_NICKS) + m,
          papel: m === 0 ? 'lider' : (m === 1 ? 'vice' : 'membro'),
          contribuicao: randInt(rng, 0, 900), ultimoDia: randInt(rng, 0, 6),
        });
      }
      return {
        id: `clan_${i}`, nome, tag, tipo,
        descricao: `Clã ${nome} — venha jogar junto!`,
        emblema: { icon: randInt(rng, 0, 7), cor: `hsl(${randInt(rng, 0, 359)},80%,60%)`, moldura: randInt(rng, 0, 3) },
        pais: 'BR', nivel: randInt(rng, 1, 20), xp: randInt(rng, 0, 9999),
        trofeus: randInt(rng, 40, 4800), liderId: members[0].userId, members,
      };
    });
    const bots = BOT_NICKS.map((nick, i) => ({
      id: `bot_${i}`, nick, tag: clans[i % clans.length].tag, skinId: 'classic', ageBand: '18+',
    }));
    const board = BOARD_NICKS.map((nick, i) => ({
      nick, score: 12000 - i * 260 + randInt(rng, -120, 120), at: Date.now() - i * 3600000,
    }));
    this.state.catalog = { clans, bots, board };
    this._save();
  }

  /* ---------- infra de "rede" ---------- */
  async _net() {
    if (this._latency) {
      const [lo, hi] = Array.isArray(this._latency) ? this._latency : [this._latency, this._latency];
      const ms = lo + this._rng() * Math.max(0, hi - lo);
      await new Promise((r) => setTimeout(r, ms));
    }
    if (this._offline) fail('offline', 'Você está sem conexão. Tente de novo.');
    if (this._failNext > 0) {
      this._failNext -= 1;
      fail('network', 'Falha de conexão. Tente de novo.');
    }
  }
  _requireProfile() {
    if (!this.state.user) fail('no-session', 'Entre na sua conta social primeiro.');
  }

  /* ---------- hooks de teste/desenvolvimento ---------- */
  __setOffline(on) { this._offline = !!on; }
  __setFailNext(n) { this._failNext = Math.max(0, n | 0); }
  __setNow(fn) { this._now = fn || (() => Date.now()); }
  __reset() { removeItem(MOCK_KEY); this.state = this._load(); this._ensureCatalog(); }
  __seedProfile(data) { // cria sessão+perfil direto (testes de UI)
    this.state.user = { id: 'mock_user_1', anon: true, createdAt: new Date(this._now()).toISOString() };
    this.state.recoveryCode = 'MOCK12345678';
    this.state.vault[this.state.recoveryCode] = null;
    return this.profile.upsert(data);
  }

  /* ================= auth ================= */
  get auth() {
    return {
      provider: 'mock',
      session: async () => {
        await this._net();
        return this.state.user ? { userId: this.state.user.id, anon: true } : null;
      },
      signIn: async () => {
        await this._net();
        if (!this.state.user) {
          this.state.user = { id: this._id('mock_user_'), anon: true, createdAt: new Date(this._now()).toISOString() };
          this.state.recoveryCode = this._makeRecoveryCode();
          this.state.vault[this.state.recoveryCode] = null;
          this._save();
          this._listeners.session.forEach((fn) => fn({ userId: this.state.user.id }));
        }
        return { userId: this.state.user.id, anon: true };
      },
      signOut: async () => {
        await this._net();
        this.state.user = null; this.state.profile = null; this._save();
        return true;
      },
      onSession: (fn) => { this._listeners.session.push(fn); return () => {}; },
    };
  }

  _makeRecoveryCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
    let s = '';
    for (let i = 0; i < 12; i++) s += abc[randInt(this._rng, 0, abc.length - 1)];
    return s;
  }

  /* ================= profile ================= */
  get profile() {
    const self = this;
    return {
      get: async () => { await self._net(); return self.state.profile || null; },
      getRecoveryCode: async () => {
        await self._net();
        self._requireProfile();
        return self.state.recoveryCode || null;
      },
      upsert: async (input = {}) => {
        await self._net();
        self._requireProfile();
        const ageBand = AGE_BANDS.includes(input.ageBand) ? input.ageBand : null;
        if (!ageBand) fail('age-required', 'Informe a faixa de idade.');

        let nick = String(input.nickname || '').trim();
        if (!nick) fail('nickname-required', 'Digite um apelido.');
        const vNick = validateNickname(nick);
        if (!vNick.ok) fail('invalid-nickname', vNick.error);
        nick = vNick.value;
        // apelido ÚNICO no "servidor": se ocupado por outro, sufixo #1234
        const norm = normalizeChat(nick);
        const prevNick = self.state.profile ? self.state.profile.nickname : null;
        const ocupado = (t) => normalizeChat(t) === norm && t !== prevNick;
        if (self.state.taken.some(ocupado) || self.state.catalog.bots.some((b) => ocupado(b.nick))) {
          const used = new Set(self.state.taken.map(normalizeChat));
          const base = nick.slice(0, 8);
          let cand = `${base}#${randInt(self._rng, 1000, 9999)}`;
          let guard = 0;
          while (used.has(normalizeChat(cand)) && guard++ < 50) {
            cand = `${base}#${randInt(self._rng, 1000, 9999)}`;
          }
          nick = cand;
        }
        if (prevNick !== nick) self.state.taken.push(nick);

        const prev = self.state.profile || {};
        self.state.profile = {
          id: self.state.user.id,
          nickname: nick,
          skinId: typeof input.skinId === 'string' ? input.skinId : (prev.skinId || 'classic'),
          country: typeof input.country === 'string' ? input.country.slice(0, 2).toUpperCase() : null,
          ageBand,
          createdAt: prev.createdAt || new Date(self._now()).toISOString(),
          bannedUntil: prev.bannedUntil || 0,
          mutedUntil: prev.mutedUntil || 0,
          clanId: self.state.clans.mineId,
          terms: { version: TERMS_VERSION, at: new Date(self._now()).toISOString() },
        };
        if (input.acceptTerms === false) fail('terms-required', 'Aceite os Termos de Uso para continuar.');
        self.state.vault[self.state.recoveryCode] = { ...self.state.profile };
        self._save();
        return self.state.profile;
      },
      recover: async (code) => {
        await self._net();
        const key = String(code || '').trim().toUpperCase();
        const snap = self.state.vault[key];
        if (!snap) fail('invalid-code', 'Código inválido. Confira o código de recuperação.');
        self.state.user = { id: snap.id, anon: true, createdAt: snap.createdAt };
        self.state.profile = { ...snap };
        self.state.recoveryCode = key;
        self._save();
        return self.state.profile;
      },
      deleteAccount: async () => {
        await self._net();
        self._requireProfile();
        const id = self.state.user.id;
        // apaga dados sociais; preserva só o marcador p/ integridade de torneios
        // exclusão é FINAL: descarta também o snapshot do vault e o código
        if (self.state.recoveryCode) delete self.state.vault[self.state.recoveryCode];
        self.state.recoveryCode = null;
        self.state.profile = null;
        self.state.user = null;
        self.state.blocks = []; self.state.reports = [];
        self.state.messages = {}; self.state.clans = this._emptyClans();
        self.state.runs = [];
        self.state.deletedAt = new Date(self._now()).toISOString();
        self.state.deletedUserId = id;
        self._save();
        return { ok: true };
      },
    };
  }

  _emptyClans() {
    return { mineId: null, role: null, waitUntil: 0, created: null, requests: [], outgoing: [], invites: [], members: [] };
  }

  /* ================= chat ================= */
  get chat() {
    const self = this;
    const roomOf = (r) => (typeof r === 'string' && r ? r : self._room);
    return {
      catalog: { phrases: QUICK_PHRASES, emojis: QUICK_EMOJIS },
      online: async (room) => { await self._net(); return self._occupancy(roomOf(room)); },
      join: async (room = 'global') => {
        await self._net();
        self._requireProfile();
        const shard = self._pickShard(room);
        self._room = shard;
        self._startBots(shard);
        return { room: shard, online: self._occupancy(shard) };
      },
      leave: async () => { self._stopBots(); self._room = null; return true; },
      history: async ({ room, limit = CHAT.HISTORY_LIMIT } = {}) => {
        await self._net();
        const r = roomOf(room);
        const blocked = new Set(self.state.blocks);
        const all = (self.state.messages[r] || []);
        return all.filter((m) => !blocked.has(m.userId) && !self.state.hidden[m.id]).slice(-limit);
      },
      send: async (text, room) => {
        await self._net();
        self._requireProfile();
        const p = self.state.profile;
        const now = self._now();
        const v = validateChatMessage(text, {
          ageBand: p.ageBand, mutedUntil: p.mutedUntil, bannedUntil: p.bannedUntil,
          now, lastSentAt: self.state.lastSentAt, recentSent: self.state.recentSent,
          lastText: self.state.lastText,
        });
        if (!v.ok) fail(v.code, v.error);
        const r = roomOf(room);
        const msg = {
          id: self._id('m'), room: r, userId: p.id, nick: p.nickname,
          tag: self.state.clans.mineId ? self._myClanTag() : null,
          text: v.value, at: now, hidden: false,
        };
        if (!self.state.messages[r]) self.state.messages[r] = [];
        self.state.messages[r].push(msg);
        if (self.state.messages[r].length > CHAT.MAX_PER_ROOM) self.state.messages[r].shift();
        self.state.lastSentAt = now;
        self.state.recentSent = [...self.state.recentSent.filter((t) => now - t < 60000), now];
        self.state.lastText = v.value;
        self._save();
        self._listeners.message.forEach((fn) => fn(msg));
        return msg;
      },
      onMessage: (fn) => {
        self._listeners.message.push(fn);
        return () => { self._listeners.message = self._listeners.message.filter((f) => f !== fn); };
      },
      report: async ({ messageId, reason }) => {
        await self._net();
        self._requireProfile();
        const msg = self._findMessage(messageId);
        if (!msg) fail('not-found', 'Mensagem não encontrada.');
        self.state.reports.push({
          id: self._id('r'), messageId, reporterId: self.state.user.id,
          reason: String(reason || 'outro'), at: self._now(), frozen: { ...msg },
        });
        // No mock, cada denúncia conta (1 usuário só); o SERVIDOR REAL
        // conta usuários distintos (regra em net/rules.js CHAT.REPORTS_HIDE).
        const total = self.state.reports.filter((x) => x.messageId === messageId).length;
        if (total >= CHAT.REPORTS_HIDE) self.state.hidden[messageId] = true;
        self._save();
        return { ok: true, hidden: !!self.state.hidden[messageId] };
      },
      block: async (userId) => {
        await self._net();
        if (userId && !self.state.blocks.includes(userId)) self.state.blocks.push(userId);
        self._save();
        return true;
      },
      unblock: async (userId) => {
        await self._net();
        self.state.blocks = self.state.blocks.filter((x) => x !== userId);
        self._save();
        return true;
      },
      blocks: async () => { await self._net(); return [...self.state.blocks]; },
    };
  }

  _findMessage(id) {
    for (const list of Object.values(this.state.messages)) {
      const m = list.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  }
  _occupancy(room) {
    if (!room) return 0;
    let h = 0;
    for (let i = 0; i < room.length; i++) h = (h * 31 + room.charCodeAt(i)) >>> 0;
    return (h % CHAT.SHARD_SIZE);
  }
  _pickShard(room) {
    const n = 1 + (this._occupancy(room + ':probe') % 3);   // 3 shards fictícios
    return `${room}:pt-BR:${n}`;
  }
  _myClanTag() {
    const c = this._myClan();
    return c ? c.tag : null;
  }
  _startBots(room) {
    this._stopBots();
    if (!this._botMs) return;
    this._botTimer = setInterval(() => this.__botSay(room), this._botMs);
    if (this._botTimer && typeof this._botTimer.unref === 'function') this._botTimer.unref();
  }
  _stopBots() { if (this._botTimer) clearInterval(this._botTimer); this._botTimer = null; }
  __botSay(room) { // injeta mensagem de bot (demo/testes)
    const r = room || this._room;
    if (!r) return null;
    const bot = pick(this._rng, this.state.catalog.bots);
    const text = pick(this._rng, [...QUICK_PHRASES, 'Alguém jogando?', 'Bora uma partida?', 'Top!']);
    const msg = { id: this._id('bot'), room: r, userId: bot.id, nick: bot.nick, tag: bot.tag, text, at: this._now(), hidden: false };
    if (!this.state.messages[r]) this.state.messages[r] = [];
    this.state.messages[r].push(msg);
    this._save();
    this._listeners.message.forEach((fn) => fn(msg));
    return msg;
  }

  /* ================= clans ================= */
  get clans() {
    const self = this;
    return {
      search: async (q = {}) => {
        await self._net();
        const term = normalizeChat(q.nome || q.q || '');
        let list = self.state.catalog.clans
          .filter((c) => !term || normalizeChat(c.nome).includes(term) || normalizeChat(c.tag).includes(term))
          .filter((c) => !q.tipo || c.tipo === q.tipo)
          .filter((c) => !q.pais || c.pais === q.pais)
          .filter((c) => !q.vagas || c.members.length < CLAN.MAX_MEMBERS)
          .map((c) => self._publicClan(c));
        const mine = self._myClan();
        if (mine) list = [self._publicClan(mine), ...list.filter((c) => c.id !== mine.id)];
        return list;
      },
      get: async (id) => { await self._net(); const c = self._clanById(id); return c ? self._publicClan(c) : null; },
      mine: async () => { await self._net(); const c = self._myClan(); return c ? self._publicClan(c) : null; },
      members: async (id) => {
        await self._net();
        const c = self._clanById(id || self.state.clans.mineId);
        return c ? c.members.map((m) => ({ ...m })) : [];
      },
      create: async ({ nome, tag, descricao = '', tipo = 'aberto', emblema = {} } = {}) => {
        await self._net();
        self._requireProfile();
        const p = self.state.profile;
        if (p.ageBand === 'menor13') fail('age-restricted', 'Menores de 13 anos não criam clãs — entre por convite.');
        if (!p.terms || p.terms.version !== TERMS_VERSION) fail('terms-required', 'Aceite os Termos de Uso primeiro.');
        if (self.state.clans.mineId) fail('already-in-clan', 'Você já está em um clã. Saia primeiro.');
        if (self.state.clans.waitUntil > self._now()) fail('switch_wait', 'Aguarde a espera de troca de clã.');
        const vn = validateClanName(nome);
        if (!vn.ok) fail('invalid-name', vn.error);
        const vt = validateClanTag(tag);
        if (!vt.ok) fail('invalid-tag', vt.error);
        const takenN = self.state.catalog.clans.some((c) => normalizeChat(c.nome) === normalizeChat(vn.value));
        const takenT = self.state.catalog.clans.some((c) => normalizeChat(c.tag) === normalizeChat(vt.value));
        if (takenN) fail('name-taken', 'Já existe um clã com esse nome.');
        if (takenT) fail('tag-taken', 'Já existe um clã com essa tag.');
        const clan = {
          id: self._id('clan_'), nome: vn.value, tag: vt.value, tipo,
          descricao: String(descricao).slice(0, 160),
          emblema: { icon: emblema.icon | 0, cor: emblema.cor || '#22e6ff', moldura: emblema.moldura | 0 },
          pais: p.country || 'BR', nivel: 1, xp: 0, trofeus: 0,
          liderId: p.id, members: [{ userId: p.id, nick: p.nickname, papel: 'lider', contribuicao: 0, ultimoDia: 0 }],
        };
        self.state.catalog.clans.push(clan);
        self.state.clans.mineId = clan.id;
        self.state.clans.role = 'lider';
        self.state.clans.created = clan.id;
        self.state.profile.clanId = clan.id;
        self._save();
        return self._publicClan(clan);
      },
      join: async (id) => {
        await self._net();
        self._requireProfile();
        if (self.state.clans.mineId) fail('already-in-clan', 'Você já está em um clã.');
        if (self.state.clans.waitUntil > self._now()) fail('switch_wait', 'Aguarde a espera de troca de clã.');
        const c = self._clanById(id);
        if (!c) fail('not-found', 'Clã não encontrado.');
        if (c.members.length >= CLAN.MAX_MEMBERS) fail('full', 'Este clã está cheio.');
        if (c.tipo === 'solicitacao') fail('needs_request', 'Este clã entra por solicitação.');
        if (c.tipo === 'convite') fail('invite_only', 'Este clã aceita só por convite.');
        this._addMember(c, 'membro');
        return this._publicClan(c);
      },
      request: async (id) => {
        await self._net();
        self._requireProfile();
        if (self.state.clans.mineId) fail('already-in-clan', 'Você já está em um clã.');
        const c = self._clanById(id);
        if (!c) fail('not-found', 'Clã não encontrado.');
        self.state.clans.outgoing.push({ clanId: id, at: self._now(), status: 'pendente' });
        self._save();
        return { ok: true, status: 'pendente' };
      },
      outgoingRequests: async () => { await self._net(); return self.state.clans.outgoing.map((x) => ({ ...x })); },
      __botRequest: async () => { // demo: um bot pede para entrar no meu clã
        const bot = pick(self._rng, self.state.catalog.bots);
        self.state.clans.requests.push({ userId: bot.id, nick: bot.nick, at: self._now(), status: 'pendente' });
        self._save();
        return true;
      },
      invite: async (userId, clanId) => {
        await self._net();
        self._requireRole(['lider', 'vice'], clanId);
        self.state.clans.invites.push({ userId, clanId: clanId || self.state.clans.mineId, at: self._now() });
        self._save();
        return { ok: true };
      },
      requests: async (clanId) => {
        await self._net();
        // solicitações RECEBIDAS no meu clã (visão de gestão)
        if (clanId && clanId !== self.state.clans.mineId) fail('forbidden', 'Este clã não é o seu.');
        return self.state.clans.requests.map((x) => ({ ...x }));
      },
      acceptRequest: async (userId, clanId) => {
        await self._net();
        self._requireRole(['lider', 'vice'], clanId);
        const c = self._clanById(clanId || self.state.clans.mineId);
        if (!c) fail('not-found', 'Clã não encontrado.');
        if (c.members.length >= CLAN.MAX_MEMBERS) fail('full', 'Este clã está cheio.');
        this._addMember(c, 'membro', userId);
        self.state.clans.requests = self.state.clans.requests.filter((r) => r.userId !== userId);
        self._save();
        return this._publicClan(c);
      },
      declineRequest: async (userId) => {
        await self._net();
        self._requireRole(['lider', 'vice']);
        self.state.clans.requests = self.state.clans.requests.filter((r) => r.userId !== userId);
        self._save();
        return true;
      },
      kick: async (userId, clanId) => {
        await self._net();
        self._requireRole(['lider', 'vice'], clanId);
        const c = self._clanById(clanId || self.state.clans.mineId);
        if (!c) fail('not-found', 'Clã não encontrado.');
        const target = c.members.find((m) => m.userId === userId);
        if (!target) fail('not-member', 'Este jogador não está no clã.');
        if (target.papel === 'lider') fail('forbidden', 'Não se expulsa o líder.');
        if (target.papel === 'vice' && self.state.clans.role !== 'lider') fail('forbidden', 'Só o líder gerencia vice-líderes.');
        c.members = c.members.filter((m) => m.userId !== userId);
        self._save();
        return true;
      },
      promote: async (userId) => { await self._net(); self._requireRole(['lider']); return self._setRole(userId, 'vice'); },
      demote: async (userId) => { await self._net(); self._requireRole(['lider']); return self._setRole(userId, 'membro'); },
      transfer: async (userId) => {
        await self._net();
        self._requireRole(['lider']);
        const c = self._clanById(self.state.clans.mineId);
        const target = c && c.members.find((m) => m.userId === userId);
        if (!target) fail('not-found', 'Jogador não encontrado no clã.');
        const me = c.members.find((m) => m.userId === self.state.user.id);
        if (me) me.papel = 'membro';
        target.papel = 'lider';
        c.liderId = userId;
        self.state.clans.role = 'membro';
        self._save();
        return true;
      },
      leave: async () => {
        await self._net();
        self._requireProfile();
        const c = self._myClan();
        if (!c) fail('no-clan', 'Você não está em um clã.');
        if (self.state.clans.role === 'lider') {
          const other = c.members.find((m) => m.userId !== self.state.user.id);
          if (other) { other.papel = 'lider'; c.liderId = other.userId; }
          else { self.state.catalog.clans = self.state.catalog.clans.filter((x) => x.id !== c.id); }
        }
        c.members = c.members.filter((m) => m.userId !== self.state.user.id);
        self.state.clans.mineId = null;
        self.state.clans.role = null;
        self.state.clans.waitUntil = self._now() + CLAN.SWITCH_WAIT_H * 3600000;
        if (self.state.profile) self.state.profile.clanId = null;
        self._save();
        return true;
      },
      dissolve: async () => {
        await self._net();
        self._requireRole(['lider']);
        const c = self._clanById(self.state.clans.mineId);
        if (c) self.state.catalog.clans = self.state.catalog.clans.filter((x) => x.id !== c.id);
        self.state.clans = self._emptyClans();
        if (self.state.profile) self.state.profile.clanId = null;
        self._save();
        return true;
      },
      update: async (patch = {}) => {
        await self._net();
        self._requireRole(['lider']);
        const c = self._clanById(self.state.clans.mineId);
        if (!c) fail('no-clan', 'Você não está em um clã.');
        if (patch.descricao !== undefined) c.descricao = String(patch.descricao).slice(0, 160);
        if (patch.tipo && ['aberto', 'solicitacao', 'convite'].includes(patch.tipo)) c.tipo = patch.tipo;
        if (patch.emblema) c.emblema = { ...c.emblema, ...patch.emblema };
        if (patch.nome !== undefined) {
          const v = validateClanName(patch.nome);
          if (!v.ok) fail('invalid-name', v.error);
          c.nome = v.value;
        }
        self._save();
        return this._publicClan(c);
      },
      __botJoin: async () => { // demo: bot entra no meu clã
        const c = self._clanById(self.state.clans.mineId);
        if (!c) return null;
        const bot = pick(self._rng, self.state.catalog.bots);
        if (c.members.some((m) => m.userId === bot.id)) return null;
        this._addMember(c, 'membro', bot.id, bot.nick);
        self._save();
        return this._publicClan(c);
      },
    };
  }

  _addMember(c, papel, userId, nick) {
    const id = userId || this.state.user.id;
    const name = nick || (this.state.profile ? this.state.profile.nickname : 'Jogador');
    c.members.push({ userId: id, nick: name, papel, contribuicao: 0, ultimoDia: 0 });
    if (!userId) {
      this.state.clans.mineId = c.id;
      this.state.clans.role = papel;
      if (this.state.profile) this.state.profile.clanId = c.id;
    }
    this._save();
  }
  _setRole(userId, papel) {
    const c = this._clanById(this.state.clans.mineId);
    const m = c && c.members.find((x) => x.userId === userId);
    if (!m) fail('not-found', 'Jogador não encontrado no clã.');
    if (m.papel === 'lider') fail('forbidden', 'Não se rebaixa o líder.');
    m.papel = papel;
    this._save();
    return true;
  }
  _requireRole(roles, clanId) {
    this._requireProfile();
    const mine = this.state.clans.mineId;
    if (!mine) fail('no-clan', 'Você não está em um clã.');
    if (clanId && clanId !== mine) fail('forbidden', 'Este clã não é o seu.');
    if (!roles.includes(this.state.clans.role)) fail('forbidden', 'Você não tem permissão para isso.');
  }
  _clanById(id) {
    if (!id) return null;
    return this.state.catalog.clans.find((c) => c.id === id) || null;
  }
  _myClan() { return this._clanById(this.state.clans.mineId); }
  _publicClan(c) {
    return {
      id: c.id, nome: c.nome, tag: c.tag, tipo: c.tipo, descricao: c.descricao,
      emblema: { ...c.emblema }, pais: c.pais, nivel: c.nivel, xp: c.xp,
      trofeus: c.trofeus, vagas: Math.max(0, CLAN.MAX_MEMBERS - c.members.length),
      membros: c.members.length, meuPapel: this.state.clans.mineId === c.id ? this.state.clans.role : null,
    };
  }

  /* ================= tournaments ================= */
  get tournaments() {
    const self = this;
    return {
      current: async () => { await self._net(); return self._season(); },
      group: async () => {
        await self._net();
        const s = self._season();
        const rows = s.group.map((g) => ({ ...g }));
        rows.sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome));
        return rows.map((r, i) => ({ ...r, posicao: i + 1 }));
      },
      myContribution: async () => {
        await self._net();
        const best = self._seasonBestRun();
        return { melhorPartida: best ? best.score : 0, runsNaTemporada: self._seasonRuns().length };
      },
      rewards: async () => {
        await self._net();
        const list = self.state.tournament.history.slice(-6).reverse();
        return list.map((h) => ({ ...h, coletada: !!self.state.tournament.claimed[h.seasonId] }));
      },
      claimReward: async (seasonId) => {
        await self._net();
        self._requireProfile();
        const key = `${self.state.user.id}:${seasonId}`;
        if (self.state.tournament.claimed[key]) fail('already_claimed', 'Esta recompensa já foi coletada.');
        const h = self.state.tournament.history.find((x) => x.seasonId === seasonId);
        if (!h) fail('not-found', 'Temporada não encontrada.');
        self.state.tournament.claimed[key] = true;
        self._save();
        return { ok: true, coins: h.rewards.total, seasonId };
      },
      __rollover: async () => { // dev/teste: fecha a temporada atual e abre a próxima
        await self._net();
        self._settleSeason();
        self.state.tournament.offsetWeeks += 1;
        self._save();
        return self._season();
      },
    };
  }

  _seasonRuns() {
    const start = seasonStart(seasonWeekIdx(this._now()) + this.state.tournament.offsetWeeks);
    return this.state.runs.filter((r) => r.at >= start && r.valid);
  }
  _seasonBestRun() {
    const runs = this._seasonRuns();
    return runs.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
  }
  _season() {
    const weekIdx = seasonWeekIdx(this._now()) + this.state.tournament.offsetWeeks;
    const number = seasonNumber(weekIdx);
    const my = this._myClan();
    const others = this.state.catalog.clans
      .filter((c) => !my || c.id !== my.id)
      .slice()
      .sort((a, b) => randInt(seededRng(`${a.id}-${number}`), 0, 1) - randInt(seededRng(`${b.id}-${number}`), 0, 1))
      .slice(0, 8);
    const mk = (c) => ({
      clanId: c.id, nome: c.nome, tag: c.tag,
      pontos: randInt(seededRng(`${c.id}#${number}`), 400, 5200),
      membrosAtivos: Math.min(c.members.length, randInt(seededRng(`${c.id}%${number}`), 3, 12)),
    });
    const group = others.map(mk);
    if (my) {
      const mineScore = this._seasonRuns().reduce((s, r) => s + r.score, 0);
      group.push({
        clanId: my.id, nome: my.nome, tag: my.tag,
        pontos: randInt(seededRng(`${my.id}#${number}`), 300, 2600) + Math.floor(mineScore / 10),
        membrosAtivos: my.members.length, meuClan: true,
      });
    }
    return {
      id: `T${number}`,
      number,
      liga: ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lenda'][number % 6],
      startsAt: seasonStart(weekIdx),
      endsAt: seasonStart(weekIdx + 1),
      regras: { K: 5, minimoRuns: 3, membrosNovos24h: false },
      group,
    };
  }
  _settleSeason() {
    const s = this._season();
    const rows = s.group.slice().sort((a, b) => b.pontos - a.pontos);
    const pos = rows.findIndex((r) => r.meuClan) + 1;
    const meu = pos > 0 ? rows[pos - 1] : null;
    const runs = this._seasonRuns();
    const posReward = { 1: 300, 2: 220, 3: 160, 4: 120, 5: 90 }[pos] || 40;
    const rewards = {
      participacao: runs.length >= 3 ? 50 : 0,
      posicao: meu ? posReward : 0,
      promocao: meu && pos <= 5 ? 150 : 0,
    };
    rewards.total = rewards.participacao + rewards.posicao + rewards.promocao;
    this.state.tournament.history.push({
      seasonId: s.id, number: s.number, posicao: pos || null, pontos: meu ? meu.pontos : 0,
      liga: s.liga, rewards, at: this._now(),
    });
    this._save();
  }

  /* ================= ranking ================= */
  get ranking() {
    const self = this;
    return {
      submitRun: async (run = {}) => {
        await self._net();
        self._requireProfile();
        const score = Math.max(0, Math.floor(Number(run.score) || 0));
        const seconds = Math.max(0, Number(run.seconds) || 0);
        if (score > 200000) fail('implausible', 'Pontuação fora do intervalo possível.');
        if (seconds < 10) fail('too-short', 'Partida curta demais para pontuar.');
        const row = {
          id: self._id('run_'), userId: self.state.user.id,
          score, seconds, seed: run.seed || null, version: String(run.version || '0.0.0'),
          at: self._now(), valid: true,
        };
        self.state.runs.push(row);
        self._save();
        return { id: row.id, valid: true };
      },
      top: async ({ scope = 'alltime', page = 0, limit = 10 } = {}) => {
        await self._net();
        const weekly = scope === 'weekly';
        const from = self._now() - (weekly ? 7 * 86400000 : Infinity);
        const rows = self.state.catalog.board
          .filter((r) => r.at >= from)
          .map((r) => ({ nick: r.nick, tag: null, score: weekly ? Math.floor(r.score * 0.4) : r.score, at: r.at, isMe: false }));
        const mine = self.state.runs.filter((r) => r.valid && r.at >= from);
        const myBest = mine.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
        if (myBest && self.state.profile) {
          rows.push({
            nick: self.state.profile.nickname, tag: self._myClanTag(), score: myBest.score,
            at: myBest.at, isMe: true,
          });
        }
        rows.sort((a, b) => b.score - a.score);
        const start = page * limit;
        return {
          rows: rows.slice(start, start + limit).map((r, i) => ({ ...r, posicao: start + i + 1 })),
          total: rows.length,
          myRank: rows.findIndex((r) => r.isMe) + 1 || null,
        };
      },
      mine: async () => {
        await self._net();
        const best = self.state.runs.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
        return { melhor: best ? best.score : 0, partidas: self.state.runs.length };
      },
    };
  }
}

/* =========================================================
   SUPABASE PROVIDER — backend real
   (auth anônimo funcionando de verdade; os demais grupos
   mapeiam para as RPCs/tabelas planejadas em SOCIAL.md —
   validadas nas fases 1..5, quando as migrações existirem)
   ========================================================= */

let umdPromise = null;
function loadSupabaseUmd() {
  if (typeof window === 'undefined') {
    return Promise.reject(new SocialError('no-browser', 'Cliente Supabase só existe no navegador.'));
  }
  if (window.supabase) return Promise.resolve(window.supabase);
  if (umdPromise) return umdPromise;
  umdPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SUPABASE_UMD_PATH;
    s.async = true;
    s.onload = () => (window.supabase ? resolve(window.supabase) : reject(new SocialError('client-missing', 'Cliente Supabase indisponível.')));
    s.onerror = () => reject(new SocialError('client-missing', 'Não foi possível carregar o cliente social.'));
    document.head.appendChild(s);
  });
  return umdPromise;
}

class SupabaseProvider {
  constructor(opts = {}) {
    this.provider = 'supabase';
    const cfg = supabaseSettings();
    this.url = opts.url || cfg.url;
    this.anonKey = opts.anonKey || cfg.anonKey;
    this._client = null;
    this._listeners = { message: [], session: [] };
    this._channel = null;
  }
  async _sb() {
    if (this._client) return this._client;
    if (!this.url || !this.anonKey) {
      fail('not-configured', 'Servidor social não configurado (net/config.js).');
    }
    const supabase = await loadSupabaseUmd();
    this._client = supabase.createClient(this.url, this.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return this._client;
  }
  async _rpc(name, args = {}) {
    const sb = await this._sb();
    const { data, error } = await sb.rpc(name, args);
    if (error) {
      const code = error.code || error.message || 'server';
      fail(code, 'O servidor recusou a operação. Tente de novo.');
    }
    return data;
  }

  get auth() {
    const self = this;
    return {
      provider: 'supabase',
      session: async () => {
        const sb = await self._sb();
        const { data } = await sb.auth.getSession();
        return data.session ? { userId: data.session.user.id, anon: data.session.user.is_anonymous === true } : null;
      },
      signIn: async () => {
        const sb = await self._sb();
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) fail(error.message || 'auth', 'Não foi possível entrar. Tente de novo.');
        return { userId: data.user.id, anon: true };
      },
      signOut: async () => { const sb = await self._sb(); await sb.auth.signOut(); return true; },
      onSession: (fn) => {
        self._listeners.session.push(fn);
        self._sb().then((sb) => sb.auth.onAuthStateChange((_e, session) => {
          fn(session ? { userId: session.user.id, anon: true } : null);
        }));
        return () => {};
      },
    };
  }

  get profile() {
    return {
      get: () => this._rpc('profile_get'),
      getRecoveryCode: () => this._rpc('profile_recovery_code'),
      upsert: (input) => this._rpc('profile_upsert', {
        p_nickname: input.nickname, p_skin: input.skinId || null,
        p_country: input.country || null, p_age_band: input.ageBand,
        p_terms_version: TERMS_VERSION,
      }),
      recover: (code) => this._rpc('profile_recover', { p_code: code }),
      deleteAccount: () => this._rpc('account_delete'),
    };
  }

  get chat() {
    const self = this;
    return {
      catalog: { phrases: QUICK_PHRASES, emojis: QUICK_EMOJIS },
      online: (room) => this._rpc('chat_online', { p_room: room || null }),
      join: (room) => this._rpc('chat_join', { p_room: room || 'global' }),
      leave: async () => { await self._leaveChannel(); return true; },
      history: ({ room, before, limit = CHAT.HISTORY_LIMIT } = {}) => this._rpc('chat_history', {
        p_room: room, p_before: before || null, p_limit: limit,
      }),
      send: (text, room) => this._rpc('chat_send', { p_room: room || null, p_text: text }),
      onMessage: (fn) => {
        self._listeners.message.push(fn);
        return () => { self._listeners.message = self._listeners.message.filter((f) => f !== fn); };
      },
      subscribe: async (room) => { // Realtime: canal por sala (chamado pela UI ao abrir o chat)
        const sb = await self._sb();
        await self._leaveChannel();
        self._channel = sb.channel(`chat:${room}`, { config: { broadcast: { self: false } } });
        self._channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
          (payload) => { self._listeners.message.forEach((fn) => fn(payload.new)); });
        await self._channel.subscribe();
        return true;
      },
      report: ({ messageId, reason }) => this._rpc('chat_report', { p_message_id: messageId, p_reason: reason }),
      block: (userId) => this._rpc('user_block', { p_user_id: userId }),
      unblock: (userId) => this._rpc('user_unblock', { p_user_id: userId }),
      blocks: () => this._rpc('user_blocks'),
    };
  }
  async _leaveChannel() {
    if (this._channel) { try { await this._channel.unsubscribe(); } catch { /* ignore */ } this._channel = null; }
  }

  get clans() {
    return {
      search: (q = {}) => this._rpc('clan_search', {
        p_q: q.nome || q.q || null, p_tipo: q.tipo || null, p_pais: q.pais || null, p_vagas: !!q.vagas,
      }),
      get: (id) => this._rpc('clan_get', { p_id: id }),
      mine: () => this._rpc('clan_mine'),
      members: (id) => this._rpc('clan_members', { p_id: id || null }),
      create: (c) => this._rpc('clan_create', {
        p_nome: c.nome, p_tag: c.tag, p_descricao: c.descricao || '',
        p_tipo: c.tipo || 'aberto', p_emblema: c.emblema || {},
      }),
      join: (id) => this._rpc('clan_join', { p_id: id }),
      request: (id) => this._rpc('clan_request', { p_id: id }),
      invite: (userId, clanId) => this._rpc('clan_invite', { p_user_id: userId, p_clan_id: clanId || null }),
      requests: (clanId) => this._rpc('clan_requests', { p_clan_id: clanId || null }),
      acceptRequest: (userId, clanId) => this._rpc('clan_accept', { p_user_id: userId, p_clan_id: clanId || null }),
      declineRequest: (userId) => this._rpc('clan_decline', { p_user_id: userId }),
      kick: (userId, clanId) => this._rpc('clan_kick', { p_user_id: userId, p_clan_id: clanId || null }),
      promote: (userId) => this._rpc('clan_promote', { p_user_id: userId }),
      demote: (userId) => this._rpc('clan_demote', { p_user_id: userId }),
      transfer: (userId) => this._rpc('clan_transfer', { p_user_id: userId }),
      leave: () => this._rpc('clan_leave'),
      dissolve: () => this._rpc('clan_dissolve'),
      update: (patch) => this._rpc('clan_update', { p_patch: patch }),
    };
  }

  get tournaments() {
    return {
      current: () => this._rpc('tournament_current'),
      group: () => this._rpc('tournament_group'),
      myContribution: () => this._rpc('tournament_my_contribution'),
      rewards: () => this._rpc('tournament_rewards'),
      claimReward: (seasonId) => this._rpc('tournament_claim', { p_season_id: seasonId }),
    };
  }

  get ranking() {
    return {
      submitRun: (run) => this._rpc('submit_run', {
        p_score: run.score, p_seconds: run.seconds, p_pickups: run.pickups || 0,
        p_combo_max: run.comboMax || 1, p_level: run.level || 1,
        p_seed: run.seed || null, p_version: run.version || null,
      }),
      top: ({ scope = 'alltime', page = 0, limit = 10 } = {}) => this._rpc('ranking_top', {
        p_scope: scope, p_page: page, p_limit: limit,
      }),
      mine: () => this._rpc('ranking_mine'),
    };
  }
}

/* =========================================================
   NullProvider — social desligado (degradação elegante)
   ========================================================= */
function nullProvider() {
  const reject = () => Promise.reject(new SocialError('disabled', 'Recursos sociais desligados.'));
  const group = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? reject : undefined) });
  return {
    provider: 'null',
    auth: group, profile: group, chat: group, clans: group, tournaments: group, ranking: group,
  };
}

/* =========================================================
   Fábrica + singleton
   ========================================================= */
/**
 * Cria um provedor social.
 * @param {{provider?:'mock'|'supabase'|'null'}} opts
 */
export function createApi(opts = {}) {
  const kind = opts.provider || (isMockProvider() ? 'mock' : 'supabase');
  if (kind === 'mock') return new MockProvider(opts);
  if (kind === 'supabase') return new SupabaseProvider(opts);
  return nullProvider();
}

let singleton = null;

/** Instância única (escolhe provedor sozinho). */
export function getApi(opts) {
  if (!singleton) singleton = createApi(opts || {});
  return singleton;
}

/** Testes: descarta a instância atual. */
export function resetApi() { singleton = null; }
