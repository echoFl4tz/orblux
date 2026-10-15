/* =========================================================
   ORBLUX — Edge Function: tournament-rollover (Fase 6)
   Disparada pelo pg_cron toda segunda 03:03 UTC (00:03 BRT)
   — migração ..._jobs.sql.

   Lógica inteira no SQL: public.tournament_settle_last()
   liquida a temporada anterior (recompensas por participação/
   posição/promoção em tournament_history + movimento de liga).
   Idempotente: se a temporada já foi liquidada, devolve
   { already: true } e não credita de novo.

   Credenciais: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
   injetados pelo runtime do Supabase — nada de chaves neste
   arquivo nem no repositório.
   ========================================================= */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Liquida a última temporada encerrada (RPC com service role). */
async function settle(): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "env-missing" }, 500);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tournament_settle_last`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: "{}",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return json({ ok: false, status: res.status, data }, 502);
  return json({ ok: true, data });
}

// gatilho manual (Dashboard "Test"/curl): só com a chave de serviço.
Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (!SERVICE_KEY || auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "forbidden" }, 403);
  }
  return await settle();
});
