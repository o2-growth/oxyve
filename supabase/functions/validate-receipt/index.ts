import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Sprint 0: JWT verification (DARA-009 partial). Rate-limit fica para Sprint 1.
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

    const { image_base64, mime_type } = await req.json();

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
          extracted_date: null,
          extracted_amount_cents: null,
          confidence: "low",
          error: "Formato não suportado. Use PNG, JPEG, GIF ou WebP.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataUrl = `data:${mime_type};base64,${image_base64}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em analisar comprovantes fiscais brasileiros. " +
              "Extraia: (1) a data de emissão, (2) o valor total, (3) o CNPJ do emitente (se houver), " +
              "(4) o nome do estabelecimento e (5) o tipo de documento. " +
              "Classifique o tipo em: 'nota_fiscal' (NF-e, NFC-e ou cupom fiscal com CNPJ), " +
              "'recibo' (recibo simples, sem CNPJ), 'comprovante_pix' (comprovante de transferência PIX), " +
              "'comprovante_cartao' (comprovante de cartão/maquininha sem nota fiscal), ou 'outro'. " +
              "Se não conseguir identificar algo com clareza, use null e indique confiança baixa.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise este comprovante e extraia a data de emissão, o valor total, o CNPJ do emitente, o nome do estabelecimento e o tipo de documento.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description:
                "Extrai data e valor de um comprovante fiscal brasileiro.",
              parameters: {
                type: "object",
                properties: {
                  extracted_date: {
                    type: "string",
                    description:
                      "Data de emissão no formato YYYY-MM-DD. Null se não identificada.",
                  },
                  extracted_amount_cents: {
                    type: "integer",
                    description:
                      "Valor total em centavos (ex: R$ 45,90 = 4590). Null se não identificado.",
                  },
                  extracted_cnpj: {
                    type: "string",
                    description:
                      "CNPJ do emitente (apenas dígitos ou formatado). Null se o documento não tiver CNPJ.",
                  },
                  extracted_supplier: {
                    type: "string",
                    description:
                      "Nome do estabelecimento/emitente. Null se não identificado.",
                  },
                  receipt_type: {
                    type: "string",
                    enum: [
                      "nota_fiscal",
                      "recibo",
                      "comprovante_pix",
                      "comprovante_cartao",
                      "outro",
                    ],
                    description:
                      "Tipo do documento fiscal identificado.",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Nível de confiança na extração.",
                  },
                },
                required: ["confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "extract_receipt_data" },
        },
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido na OpenAI. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao analisar comprovante" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({
          extracted_date: null,
          extracted_amount_cents: null,
          confidence: "low",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
