/* =========================================================
   ORBLUX — Edge Function: chat-moderation (Fase 6)
   Disparada pelo pg_cron a cada 5 min (migração ..._jobs.sql).

   Toda a REGRA mora no SQL: public.app_chat_moderate()
   (3 denúncias distintas => oculta a mensagem, mute de 24 h e
   registro em moderation_log — decisão §8.5: automação + revisão
   do dono). Aqui só fazemos a chamada e devolvemos o resultado.

   Credenciais: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são
   injetados pelo runtime do Supabase — nada de chaves neste
   arquivo nem no repositório (.gitignore cobre supabase/functions/.env).
   ========================================================= */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Roda a moderação em lote no servidor (RPC com service role). */
async function moderate(): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "env-missing" }, 500);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_chat_moderate`, {
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
// o agendador passa por aqui com Authorization vindo do Vault.
Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (!SERVICE_KEY || auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "forbidden" }, 403);
  }
  return await moderate();
});
