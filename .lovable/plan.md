

# Validacao de Comprovantes via OpenAI Vision

## Resumo

Ao anexar um comprovante, o sistema envia a imagem para a API da OpenAI (GPT-4o / GPT-4o-mini com vision) via edge function para extrair data e valor, comparando com o formulario. Divergencias geram aviso visual.

## Passo 1: Configurar a chave da OpenAI

Antes de implementar, vou solicitar sua chave da OpenAI via ferramenta segura de secrets. Ela ficara armazenada como `OPENAI_API_KEY` no backend, nunca exposta no frontend.

## Passo 2: Edge Function `validate-receipt`

**Arquivo:** `supabase/functions/validate-receipt/index.ts`

- Recebe imagem em base64 + tipo MIME do frontend
- Chama `https://api.openai.com/v1/chat/completions` com modelo `gpt-4o-mini` (vision, rapido, barato)
- Usa **tool calling** para extrair dados estruturados:
  - `extracted_date` (YYYY-MM-DD)
  - `extracted_amount_cents` (inteiro)
  - `confidence` (high/medium/low)
- Retorna JSON ao frontend
- Trata erros (401, 429, 500)

**Config:** Adicionar `[functions.validate-receipt]` com `verify_jwt = false` no `supabase/config.toml`

## Passo 3: Hook `useValidateReceipt`

**Arquivo:** `src/hooks/useValidateReceipt.ts`

- Converte File para base64
- Chama edge function via `supabase.functions.invoke('validate-receipt', ...)`
- Retorna estado: `idle | validating | success | warning | error`
- Compara data e valor extraidos com os do formulario

## Passo 4: Componente `ReceiptValidation`

**Arquivo:** `src/components/expenses/ReceiptValidation.tsx`

- Spinner durante analise
- Verde: "Comprovante validado"
- Amarelo: "Divergencia encontrada" com detalhes (data/valor)
- Cinza: "Nao foi possivel validar"

## Passo 5: Integrar no `ExpenseFormDialog`

**Arquivo:** `src/components/expenses/ExpenseFormDialog.tsx`

- Dispara validacao ao anexar arquivo
- Exibe `ReceiptValidation` abaixo do upload
- Revalida se usuario alterar data/valor
- Nao bloqueia envio (apenas warning)

## Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/validate-receipt/index.ts` | Criar |
| `supabase/config.toml` | Editar |
| `src/hooks/useValidateReceipt.ts` | Criar |
| `src/components/expenses/ReceiptValidation.tsx` | Criar |
| `src/components/expenses/ExpenseFormDialog.tsx` | Editar |

## Ordem de execucao

1. Solicitar e salvar `OPENAI_API_KEY` como secret
2. Criar edge function
3. Criar hook + componente
4. Integrar no formulario
5. Testar

