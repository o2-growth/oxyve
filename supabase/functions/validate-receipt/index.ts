import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "OCR temporariamente indisponível",
          code: "OCR_UNAVAILABLE",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
              "Você é um assistente especializado em analisar comprovantes fiscais brasileiros (notas fiscais, cupons fiscais, recibos). Extraia a data de emissão e o valor total do documento. Se não conseguir identificar com clareza, indique confiança baixa.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise este comprovante e extraia a data de emissão e o valor total.",
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
