/* =========================================================
   Ranking local + estrutura pronta p/ ranking global
   ========================================================= */

import { state } from '../core/state.js';
import { on } from '../core/events.js';

/* ------------------------------------------------------------------
   RANKING GLOBAL (opcional) — Supabase
   ------------------------------------------------------------------
   1) Crie um projeto grátis em https://supabase.com
   2) rode no SQL editor:

      create table scores (
        id bigserial primary key,
        name text not null,
        score integer not null,
        created_at timestamp with time zone default now()
      );
      alter table scores enable row security;
      create policy "leitura publica" on scores for select using (true);
      create policy "insert publico" on scores for insert with check (true);

   3) Preencha abaixo e ligue GLOBAL_RANKING.
------------------------------------------------------------------ */
export const GLOBAL_RANKING = {
  enabled: false,
  url: 'https://SEU-PROJETO.supabase.co/rest/v1/scores',
  key: 'SUA-CHAVE-ANON-PUBLICA', // chave "anon public" (segura p/ cliente)
  limit: 10,
};

export function initRanking() {
  on('screen:ranking', () => { renderRanking(); });
  on('stats:changed', () => { renderRanking(); });
}

export function renderRanking() {
  const list = document.getElementById('ranking-list');
  const empty = document.getElementById('ranking-empty');
  if (!list) return;

  const rows = state.ranking.slice(0, 10);
  if (rows.length === 0) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
  } else {
    if (empty) empty.hidden = true;
    list.innerHTML = rows.map((r, i) => {
      const d = new Date(r.date);
      const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      return `<li class="${i === 0 ? 'rank-1' : ''}">
        <span><span class="rank-pos">${i + 1}º</span> 🏆 <b>${r.score.toLocaleString('pt-BR')}</b></span>
        <span class="rank-date">${date}</span>
      </li>`;
    }).join('');
  }

  if (GLOBAL_RANKING.enabled) fetchGlobal();
}

/** Busca o ranking global (desligado por padrão; falha silenciosa). */
async function fetchGlobal() {
  const list = document.getElementById('ranking-list');
  if (!list || !GLOBAL_RANKING.enabled) return;
  try {
    const res = await fetch(`${GLOBAL_RANKING.url}?select=name,score&order=score.desc&limit=${GLOBAL_RANKING.limit}`, {
      headers: { apikey: GLOBAL_RANKING.key, Authorization: `Bearer ${GLOBAL_RANKING.key}` },
    });
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    const el = document.getElementById('ranking-global-list');
    const title = document.getElementById('ranking-global-title');
    if (title) title.hidden = false;
    if (el) {
      el.innerHTML = rows.map((r, i) =>
        `<li><span><span class="rank-pos">${i + 1}º</span> ${escapeHtml(r.name)}</span><b>${r.score.toLocaleString('pt-BR')}</b></li>`
      ).join('');
    }
  } catch (err) {
    console.warn('[ranking] global indisponível:', err); // segue só com o local
  }
}

/** Envia uma pontuação para o ranking global (chame após configurar). */
export async function submitGlobalScore(name, score) {
  if (!GLOBAL_RANKING.enabled) return false;
  try {
    await fetch(GLOBAL_RANKING.url, {
      method: 'POST',
      headers: {
        apikey: GLOBAL_RANKING.key,
        Authorization: `Bearer ${GLOBAL_RANKING.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, score }),
    });
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
