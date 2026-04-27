import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestPayload {
  report_id?: string;
  decision?: "approved" | "rejected";
  comment?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Email service unavailable",
          code: "EMAIL_UNAVAILABLE",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Supabase env not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const FROM_EMAIL = Deno.env.get("EMAIL_FROM") || "oxyve <onboarding@resend.dev>";
    const APP_URL = Deno.env.get("APP_URL") || "";

    // 1) Validar JWT do approver
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const approver = authData.user;

    // 2) Validar payload
    const payload = (await req.json()) as RequestPayload;
    if (!payload.report_id || !payload.decision) {
      return new Response(
        JSON.stringify({ error: "report_id and decision are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) Service role para resolver dados (bypass RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: report, error: reportErr } = await supabaseAdmin
      .from("reports")
      .select("id, title, user_id, total_cents")
      .eq("id", payload.report_id)
      .single();

    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Skip se auto-aprovação (admin aprovou próprio relatório — não envia email pra si)
    if (report.user_id === approver.id) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "self_approval" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5) Resolver nomes (profiles) + email do owner (auth.users via admin api)
    const [ownerProfileRes, approverProfileRes, ownerAuthRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name").eq("id", report.user_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("full_name").eq("id", approver.id).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(report.user_id),
    ]);

    const ownerEmail = ownerAuthRes.data?.user?.email;
    if (!ownerEmail) {
      console.warn("send-report-decision-email: owner has no email", report.user_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ownerName = ownerProfileRes.data?.full_name || "Colaborador";
    const approverName = approverProfileRes.data?.full_name || "Gestor";

    // Sanitiza o título antes de usar em header (subject) — defesa contra
    // header injection via \r\n. HTML body usa escapeHtml separadamente.
    const safeTitle = report.title.replace(/[\r\n]+/g, " ").trim();
    const decisionLabel = payload.decision === "approved" ? "aprovado" : "rejeitado";
    const subject = `Seu relatório "${safeTitle}" foi ${decisionLabel}`;
    const totalFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format((report.total_cents ?? 0) / 100);
    const reportLink = APP_URL ? `${APP_URL.replace(/\/$/, "")}/app/reports/${report.id}` : "";

    const html = renderEmailHtml({
      ownerName,
      approverName,
      reportTitle: safeTitle,
      decision: payload.decision,
      comment: payload.comment ?? null,
      total: totalFormatted,
      link: reportLink,
    });

    // 6) POST Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const text = await resendRes.text();
      console.error("Resend error:", resendRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to send email", status: resendRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendData = await resendRes.json();
    return new Response(
      JSON.stringify({ sent: true, id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-report-decision-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function renderEmailHtml(args: {
  ownerName: string;
  approverName: string;
  reportTitle: string;
  decision: "approved" | "rejected";
  comment: string | null;
  total: string;
  link: string;
}): string {
  const isApproved = args.decision === "approved";
  const headerColor = isApproved ? "#16a34a" : "#dc2626";
  const headerLabel = isApproved ? "APROVADO" : "REJEITADO";
  const verbLower = isApproved ? "aprovado" : "rejeitado";

  const button = args.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr><td style="border-radius:8px;background:#1f2937"><a href="${escapeAttr(args.link)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">Ver relatório completo</a></td></tr></table>`
    : "";

  const commentBlock = args.comment
    ? `<div style="margin-top:20px;padding:14px 16px;background:#fef2f2;border-left:4px solid ${headerColor};color:#374151;font-size:14px;line-height:1.5;border-radius:4px"><strong>Comentário:</strong><br>${escapeHtml(args.comment)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(args.reportTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <tr><td style="background:${headerColor};padding:20px 24px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px">${headerLabel}</td></tr>
      <tr><td style="padding:32px 24px;color:#111827">
        <p style="margin:0 0 16px;font-size:16px">Olá, ${escapeHtml(args.ownerName)}!</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6">Seu relatório de despesas <strong>&ldquo;${escapeHtml(args.reportTitle)}&rdquo;</strong> foi <strong>${verbLower}</strong> por ${escapeHtml(args.approverName)}.</p>
        <p style="margin:0;font-size:14px;color:#6b7280">Total: <strong style="color:#111827">${escapeHtml(args.total)}</strong></p>
        ${commentBlock}
        ${button}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;text-align:center">— oxyve · gestão de despesas</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
