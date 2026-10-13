/* =========================================================
   Ranking local + estrutura pronta p/ ranking global
   Top 3 em pódio (ouro/prata/bronze neon), resto em lista
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

  // pódio: top 3 (ordem visual: prata, ouro, bronze)
  const hasPodium = rows.length >= 3;
  if (podium) {
    podium.hidden = !hasPodium;
    if (hasPodium) {
      podium.innerHTML = [1, 0, 2].map((i) => `
        <div class="podium-slot podium-${i + 1}">
          <svg class="ic" aria-hidden="true"><use href="#ic-trophy"/></svg>
          <span class="pos">${i + 1}º</span>
          <span class="pts">${rows[i].score.toLocaleString('pt-BR')}</span>
        </div>`).join('');
    } else podium.innerHTML = '';
  }

  // lista: do 4º em diante (ou todas as posições se menos de 3 partidas)
  const rest = hasPodium ? rows.slice(3) : rows;
  const offset = hasPodium ? 3 : 0;
  list.innerHTML = rest.map((r, i) => {
    const d = new Date(r.date);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `<li>
      <span><span class="rank-pos">${i + 1 + offset}º</span> <b>${r.score.toLocaleString('pt-BR')}</b></span>
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
    const res = await fetch(`${GLOBAL_RANKING.url}?select=name,score&order=score.desc&limit=${GLOBAL_RANKING.limit}`, {
      headers: { apikey: GLOBAL_RANKING.key, Authorization: `Bearer ${GLOBAL_RANKING.key}` },
    });
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    if (list) {
      list.innerHTML = rows.map((r, i) =>
        `<li><span><span class="rank-pos">${i + 1}º</span> ${escapeHtml(r.name)}</span><b>${r.score.toLocaleString('pt-BR')}</b></li>`
      ).join('');
    }
    const title = document.getElementById('ranking-global-title');
    if (title) title.hidden = false;
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
