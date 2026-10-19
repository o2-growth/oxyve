import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GENERIC_ERROR_MESSAGE,
  OPENAI_BUSY_MESSAGE,
  PAYLOAD_TOO_LARGE_MESSAGE,
  QUOTA_RPC,
  RATE_LIMIT_MESSAGE,
  isDeclaredBodyTooLarge,
  isImageTooLarge,
  quotaOutcome,
} from "./limits.ts";
import { type NormalizedReceipt, normalizeExtraction } from "./normalize.ts";
import { EXTRACT_FUNCTION_NAME, PRIMARY_MODEL, buildChatRequest } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ReadOutcome =
  | { ok: true; receipt: NormalizedReceipt }
  | { ok: false; status: number };

/** Uma chamada à OpenAI já normalizada. Resposta sem a função vira leitura vazia (low). */
async function readReceipt(apiKey: string, model: string, dataUrl: string): Promise<ReadOutcome> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildChatRequest(model, dataUrl)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI error:", model, response.status, errorText);
    return { ok: false, status: response.status };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  let raw: unknown = {};
  if (toolCall?.function?.name === EXTRACT_FUNCTION_NAME && toolCall.function.arguments) {
    try {
      raw = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("validate-receipt: argumentos inválidos do", model);
    }
  }
  return { ok: true, receipt: normalizeExtraction(raw) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // JWT obrigatório; a cota por usuário é conferida antes de chamar a OpenAI.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: "supabase env not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.slice("bearer ".length).trim();
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Recusa corpo grande antes de ler (quando o cliente declara o tamanho) e
    // de novo depois do parse (upload sem Content-Length).
    if (isDeclaredBodyTooLarge(req.headers.get("content-length"))) {
      return new Response(
        JSON.stringify({ error: PAYLOAD_TOO_LARGE_MESSAGE }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image_base64, mime_type } = await req.json();

    if (isImageTooLarge(image_base64)) {
      return new Response(
        JSON.stringify({ error: PAYLOAD_TOO_LARGE_MESSAGE }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: "image_base64 and mime_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate supported formats
    const supportedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!supportedTypes.includes(mime_type)) {
      return new Response(
        JSON.stringify({
          ...normalizeExtraction({}),
          model_used: null,
          error: "Formato não suportado. Use PNG, JPEG, GIF ou WebP.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cota por hora conferida com o JWT do próprio usuário (auth.uid() na RPC).
    // Só pedido válido consome cota: formato e tamanho já foram checados acima.
    const quota = quotaOutcome(await supabaseAuth.rpc(QUOTA_RPC));
    if (quota === "exceeded") {
      return new Response(
        JSON.stringify({ error: RATE_LIMIT_MESSAGE }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" } }
      );
    }
    if (quota === "unavailable") {
      console.error("validate-receipt: falha ao conferir a cota");
      return new Response(
        JSON.stringify({ error: GENERIC_ERROR_MESSAGE }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataUrl = `data:${mime_type};base64,${image_base64}`;

    const read = await readReceipt(OPENAI_API_KEY, PRIMARY_MODEL, dataUrl);

    if (!read.ok) {
      if (read.status === 429) {
        return new Response(
          JSON.stringify({ error: OPENAI_BUSY_MESSAGE }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: GENERIC_ERROR_MESSAGE }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = read.receipt;
    const modelUsed = PRIMARY_MODEL;

    // Sem valores no log: só qual modelo respondeu e por quê, para medir custo e acerto.
    console.log(JSON.stringify({
      fn: "validate-receipt",
      model_used: modelUsed,
      amount_confidence: result.amount_confidence,
      date_confidence: result.date_confidence,
      issues: result.issues,
    }));

    return new Response(JSON.stringify({ ...result, model_used: modelUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Detalhe só no log do servidor; o cliente recebe texto genérico.
    console.error("validate-receipt error:", e);
    return new Response(
      JSON.stringify({ error: GENERIC_ERROR_MESSAGE }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
