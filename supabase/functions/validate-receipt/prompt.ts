// Prompt e schema da leitura de comprovante. Módulo puro (sem Deno).
import { EXPENSE_KIND_HINTS, RECEIPT_ISSUES, RECEIPT_TYPES } from "./normalize.ts";

// Escolhido em teste com notas reais e sintéticas (out/2026): o gpt-4o-mini
// inventava valor e ano com confiança alta; o gpt-4.1 acertou mais e devolveu
// null onde a foto não mostrava o total. Em imagem o custo é parecido.
export const PRIMARY_MODEL = "gpt-4.1";
export const EXTRACT_FUNCTION_NAME = "extract_receipt_data";

export const SYSTEM_PROMPT = [
  "Você lê comprovantes de despesa brasileiros para um app de reembolso. Os tipos mais comuns:",
  "NFC-e / cupom fiscal / SAT (supermercado, restaurante, farmácia), DANFE de NF-e, recibo de app",
  "(Uber, 99, iFood), nota de posto de combustível, ticket de estacionamento e recibo de pedágio.",
  "",
  "VALOR (extracted_amount_cents, em centavos):",
  "- É o total efetivamente pago: 'VALOR A PAGAR', 'TOTAL R$', 'Valor total', 'Total pago'.",
  "- Inclua taxa de serviço/gorjeta quando ela estiver somada no total pago (ex.: 'Total c/ serviço').",
  "- NUNCA use: subtotal; 'valor recebido', 'dinheiro', 'troco'; tributos aproximados",
  "  ('Val. aprox. tributos', Lei 12.741); desconto isolado; valor de um item; saldo ou limite.",
  "- Formato brasileiro: '1.234,56' = 123456 centavos; '45,90' = 4590. Ponto separa milhar, vírgula separa centavos.",
  "- Confira: se a nota lista itens, a soma dos itens (mais serviço, menos desconto) deve dar o total.",
  "  Se não bater ou algum dígito estiver duvidoso (5/6/8/9, 0/8), use amount_confidence 'medium'.",
  "- Se houver mais de um total e não der para saber qual foi pago, marque a issue 'multiple_totals'",
  "  e amount_confidence 'low'.",
  "",
  "DATA (extracted_date, YYYY-MM-DD):",
  "- É a data de emissão/da compra. NÃO use data de vencimento, validade, autorização futura ou a hora.",
  "- A nota costuma trazer dd/mm/aa ou dd/mm/aaaa: ano de 2 dígitos é 20xx (ex.: 15/10/26 = 2026-10-15).",
  "- Dia vem antes do mês (padrão brasileiro).",
  "",
  "CNPJ (extracted_cnpj): o do EMITENTE (quem vendeu), não o do consumidor nem CPF. Só dígitos.",
  "Sem CNPJ do emitente, use null.",
  "",
  "ESTABELECIMENTO (extracted_supplier): nome fantasia se houver, senão razão social. Curto",
  "(ex.: 'Posto Ipiranga Centro', não a razão social inteira com LTDA e endereço). Em app, o app (ex.: 'Uber').",
  "",
  "TIPO (receipt_type): 'nota_fiscal' (NF-e, NFC-e, SAT ou cupom fiscal com CNPJ), 'recibo' (recibo",
  "simples ou de app), 'comprovante_pix' (transferência PIX), 'comprovante_cartao' (via da maquininha",
  "sem nota fiscal) ou 'outro'.",
  "",
  "CONFIANÇA: amount_confidence e date_confidence por campo, e confidence geral. Use 'high' só quando",
  "o número está nítido e você tem certeza de que é o campo certo; 'medium' se leu mas há dúvida;",
  "'low' se chutou ou não achou.",
  "",
  "ISSUES (lista, vazia se a foto está boa): 'blurry' (tremida/desfocada), 'cropped' (cortada, total ou",
  "data fora da foto), 'multiple_totals', 'handwritten' (preenchida à mão), 'low_light' (escura),",
  "'not_a_receipt' (a foto não é um comprovante de despesa), 'other'.",
  "",
  "expense_kind_hint: 'food' (refeição, mercado, delivery de comida), 'transport' (combustível, app de",
  "transporte, estacionamento, pedágio) ou 'other'.",
  "",
  "Não invente: se não conseguir ler um campo com clareza, use null e confiança 'low'.",
].join("\n");

export const USER_PROMPT =
  "Leia este comprovante e extraia valor total pago, data de emissão, CNPJ do emitente, estabelecimento, tipo, confiança por campo e problemas da foto.";

const CONFIDENCE_ENUM = ["high", "medium", "low"];

export const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: EXTRACT_FUNCTION_NAME,
    description: "Extrai os dados de um comprovante de despesa brasileiro.",
    parameters: {
      type: "object",
      properties: {
        extracted_date: {
          type: ["string", "null"],
          description: "Data de emissão no formato YYYY-MM-DD. Null se não identificada.",
        },
        extracted_amount_cents: {
          type: ["integer", "null"],
          description: "Total efetivamente pago em centavos (R$ 1.234,56 = 123456). Null se não identificado.",
        },
        extracted_cnpj: {
          type: ["string", "null"],
          description: "CNPJ do emitente, só dígitos. Null se não houver.",
        },
        extracted_supplier: {
          type: ["string", "null"],
          description: "Nome fantasia do estabelecimento (ou razão social), curto. Null se não identificado.",
        },
        receipt_type: {
          type: "string",
          enum: [...RECEIPT_TYPES],
          description: "Tipo do documento.",
        },
        confidence: {
          type: "string",
          enum: CONFIDENCE_ENUM,
          description: "Confiança geral na leitura.",
        },
        amount_confidence: {
          type: "string",
          enum: CONFIDENCE_ENUM,
          description: "Confiança no valor total pago.",
        },
        date_confidence: {
          type: "string",
          enum: CONFIDENCE_ENUM,
          description: "Confiança na data de emissão.",
        },
        issues: {
          type: "array",
          items: { type: "string", enum: [...RECEIPT_ISSUES] },
          description: "Problemas da foto ou do documento. Vazio se nenhum.",
        },
        expense_kind_hint: {
          type: "string",
          enum: [...EXPENSE_KIND_HINTS],
          description: "Natureza provável da despesa.",
        },
      },
      required: ["confidence", "amount_confidence", "date_confidence", "issues"],
      additionalProperties: false,
    },
  },
} as const;

/** Corpo do chat/completions. */
export function buildChatRequest(model: string, dataUrl: string) {
  return {
    model,
    // Leitura de valor não pode variar entre chamadas: o mesmo cupom já saiu
    // R$ 189,00 numa leitura e R$ 189,10 na seguinte.
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "function", function: { name: EXTRACT_FUNCTION_NAME } },
    max_tokens: 500,
  };
}
