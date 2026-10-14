/* =========================================================
   Ranking local + estrutura pronta p/ ranking global
   Top 3 em pódio (ouro/prata/bronze neon), resto em lista
   ========================================================= */

import { state } from '../core/state.js';
import { on } from '../core/events.js';
import { validateNickname, escapeHtml } from '../core/nickname.js';

/* ------------------------------------------------------------------
   RANKING GLOBAL (opcional) — Supabase — DESLIGADO por padrão
   ------------------------------------------------------------------
   1) Crie um projeto grátis em https://supabase.com
   2) rode no SQL editor (com validação NO SERVIDOR — o cliente não é
      confiável: qualquer pessoa pode enviar qualquer pontuação):

      create table scores (
        id bigserial primary key,
        name text not null,
        score integer not null,
        created_at timestamp with time zone default now(),
        -- nome: 3..12 chars, sem links/e-mails
        constraint name_len check (char_length(name) between 3 and 12),
        constraint name_no_url check (name !~ 'https?://|www\.|@'),
        -- pontuação plausível (ajuste ao seu balanceamento)
        constraint score_range check (score between 0 and 200000)
      );
      alter table scores enable row security;
      create policy "leitura publica" on scores for select using (true);
      create policy "insert publico" on scores for insert with check (true);

   3) Aplique rate limit por IP/dispositivo no proxy/Edge Function do
      Supabase (ex.: máx. 10 inserções/min por IP). O score do cliente
      NÃO é confiável — trate a tabela como "diversão", não oficial.

   4) MODERAÇÃO (exigida pela Google Play para conteúdo gerado por
      usuários exibido a outros): cada linha do ranking global mostra um
      link "Denunciar" que abre e-mail com o ID da entrada. Configure
      MODERATION_EMAIL abaixo e apague linhas denunciadas no painel.

   5) Preencha url/key abaixo e ligue GLOBAL_RANKING.enabled = true.
------------------------------------------------------------------ */
export const GLOBAL_RANKING = {
  enabled: false,
  url: 'https://SEU-PROJETO.supabase.co/rest/v1/scores',
  key: 'SUA-CHAVE-ANON-PUBLICA', // chave "anon public" (segura p/ cliente)
  limit: 10,
  moderationEmail: 'moderacao@SEU-DOMINIO.com',
};

export function initRanking() {
  on('screen:ranking', () => { renderRanking(); });
  on('stats:changed', () => { renderRanking(); });
}

export function renderRanking() {
  const list = document.getElementById('ranking-list');
  const podium = document.getElementById('ranking-podium');
  const empty = document.getElementById('ranking-empty');
  if (!list) return;

  const rows = state.ranking.slice(0, 10);

  if (rows.length === 0) {
    list.innerHTML = '';
    if (podium) { podium.innerHTML = ''; podium.hidden = true; }
    if (empty) empty.hidden = false;
    if (GLOBAL_RANKING.enabled) fetchGlobal();
    return;
  }
  if (empty) empty.hidden = true;

  const me = state.profile?.nickname || 'Jogador';
  const nameOf = (r) => (typeof r.name === 'string' && r.name ? r.name : 'Jogador');

  // pódio: top 3 (ordem visual: prata, ouro, bronze)
  const hasPodium = rows.length >= 3;
  if (podium) {
    podium.hidden = !hasPodium;
    if (hasPodium) {
      podium.innerHTML = [1, 0, 2].map((i) => {
        const nm = nameOf(rows[i]);
        const mine = nm === me ? ' mine' : '';
        return `
        <div class="podium-slot podium-${i + 1}${mine}">
          <svg class="ic" aria-hidden="true"><use href="#ic-trophy"/></svg>
          <span class="pos">${i + 1}º</span>
          <span class="podium-name">${escapeHtml(nm)}</span>
          <span class="pts">${rows[i].score.toLocaleString('pt-BR')}</span>
        </div>`;
      }).join('');
    } else podium.innerHTML = '';
  }

  // lista: do 4º em diante (ou todas as posições se menos de 3 partidas)
  const rest = hasPodium ? rows.slice(3) : rows;
  const offset = hasPodium ? 3 : 0;
  list.innerHTML = rest.map((r, i) => {
    const d = new Date(r.date);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const nm = nameOf(r);
    const mine = nm === me ? ' class="mine"' : '';
    return `<li${mine}>
      <span><span class="rank-pos">${i + 1 + offset}º</span> <b>${r.score.toLocaleString('pt-BR')}</b> <span class="rank-name">${escapeHtml(nm)}</span></span>
      <span class="rank-date">${date}</span>
    </li>`;
  }).join('');

  if (GLOBAL_RANKING.enabled) fetchGlobal();
}

/** Busca o ranking global (desligado por padrão; falha silenciosa). */
async function fetchGlobal() {
  const list = document.getElementById('ranking-global-list');
  if (!list || !GLOBAL_RANKING.enabled) return;
  try {
    const res = await fetch(`${GLOBAL_RANKING.url}?select=id,name,score&order=score.desc&limit=${GLOBAL_RANKING.limit}`, {
      headers: { apikey: GLOBAL_RANKING.key, Authorization: `Bearer ${GLOBAL_RANKING.key}` },
    });
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    if (list) {
      // renderização segura: escapeHtml em todo dado vindo da rede; score é número
      list.innerHTML = rows.map((r, i) => {
        const nm = escapeHtml(String(r.name ?? '').slice(0, 12));
        const sc = Number(r.score) || 0;
        const id = escapeHtml(String(r.id ?? ''));
        const report = GLOBAL_RANKING.moderationEmail
          ? ` <a class="rank-report" href="mailto:${escapeHtml(GLOBAL_RANKING.moderationEmail)}?subject=${encodeURIComponent('Denúncia de ranking #')}${id}&body=${encodeURIComponent('Denuncio a entrada #' + id + ' do ranking global do ORBLUX.')}" aria-label="Denunciar esta entrada">Denunciar</a>`
          : '';
        return `<li><span><span class="rank-pos">${i + 1}º</span> <b>${nm}</b></span><span class="rank-date">${sc.toLocaleString('pt-BR')}${report}</span></li>`;
      }).join('');
    }
    const title = document.getElementById('ranking-global-title');
    if (title) title.hidden = false;
  } catch (err) {
    console.warn('[ranking] global indisponível:', err); // segue só com o local
  }
}

/** Envia uma pontuação ao ranking global (valida e sanitiza antes; desligado por padrão). */
export async function submitGlobalScore(name, score) {
  if (!GLOBAL_RANKING.enabled) return false;
  // nunca confie no cliente: valida nome e limita a pontuação antes de enviar
  const v = validateNickname(name);
  if (!v.ok) return false;
  const sc = Math.max(0, Math.min(200000, Math.floor(Number(score) || 0)));
  try {
    await fetch(GLOBAL_RANKING.url, {
      method: 'POST',
      headers: {
        apikey: GLOBAL_RANKING.key,
        Authorization: `Bearer ${GLOBAL_RANKING.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: v.value, score: sc }),
    });
    return true;
  } catch {
    return false;
  }
}
