// Sprint 7 — DEC-011: edge function `send-push`. Web Push fan-out.
//
// POST { user_id, title, body, link?, data?, tag? }
//   -> 200 { sent: number, failed: number, simulated?: boolean }
//
// Auth: aceita JWT de service_role (cron) OU JWT de admin/manager (UI manual).
// Lê todas subscriptions de `push_subscriptions` pro user_id alvo, despacha
// via VAPID + npm:web-push. Em 410 Gone (subscription expirada/inválida),
// deleta a row. Em 200/201, atualiza last_used_at.
//
// Sem VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY em env, retorna { simulated: true }
// pra não quebrar o pipeline (mesmo padrão de send-email com RESEND_API_KEY).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — npm: specifier resolvido pelo Deno em runtime.
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendPushPayload {
  user_id: string;
  title: string;
  body?: string;
  link?: string | null;
  data?: Record<string, unknown>;
  tag?: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "supabase_env_missing" }, 500);
    }

    const jwt = authHeader.slice("bearer ".length).trim();

    // Caminho 1: service-role (cron) — bypass de validação.
    const isServiceRole = jwt === SUPABASE_SERVICE_ROLE_KEY;

    if (!isServiceRole) {
      // Caminho 2: usuário humano (admin/manager) → valida via is_manager_or_admin.
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: authError } = await supabaseAuth.auth.getUser(jwt);
      if (authError || !userData?.user) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      const { data: roleCheck, error: roleError } = await supabaseAuth.rpc(
        "is_manager_or_admin",
        { _user_id: userData.user.id },
      );
      if (roleError || roleCheck !== true) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
    }

    const payload = (await req.json()) as SendPushPayload;
    if (!payload?.user_id || !payload?.title) {
      return jsonResponse({ error: "user_id/title required" }, 400);
    }

    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:growth@o2inc.com.br";

    // Service-role client pra ler/atualizar subscriptions, ignorando RLS.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", payload.user_id);

    if (subsError) {
      console.error("[send-push] error reading subs", subsError);
      return jsonResponse({ error: "subs_read_failed" }, 500);
    }

    const subscriptions = (subs ?? []) as PushSubscriptionRow[];

    if (subscriptions.length === 0) {
      return jsonResponse({ sent: 0, failed: 0, no_subscriptions: true });
    }

    // Sem VAPID configurado: simula sucesso pra não quebrar pipeline.
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.log("[send-push simulated]", {
        user_id: payload.user_id,
        title: payload.title,
        recipient_count: subscriptions.length,
      });
      return jsonResponse({
        sent: 0,
        failed: 0,
        simulated: true,
        recipient_count: subscriptions.length,
      });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      link: payload.link ?? null,
      data: payload.data ?? {},
      tag: payload.tag ?? "oxyve-default",
    });

    let sent = 0;
    let failed = 0;
    const toDelete: string[] = [];
    const toTouch: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload,
          );
          sent += 1;
          toTouch.push(sub.id);
        } catch (err: unknown) {
          const e = err as { statusCode?: number; message?: string };
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            // Subscription morta — purge.
            toDelete.push(sub.id);
          } else {
            console.error("[send-push] send error", e?.statusCode, e?.message);
          }
          failed += 1;
        }
      }),
    );

    if (toDelete.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .in("id", toDelete);
    }

    if (toTouch.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .in("id", toTouch);
    }

    return jsonResponse({ sent, failed, recipient_count: subscriptions.length });
  } catch (err) {
    console.error("[send-push] error", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
