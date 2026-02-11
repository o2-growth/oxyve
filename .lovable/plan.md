
# Relatorio: Sistema de Midias/Comprovantes na Area de Aprovacoes

## Diagnostico

Foram identificados **3 problemas criticos** que impedem a visualizacao de comprovantes na area de aprovacao:

---

### Problema 1: Query do Relatorio NAO busca dados de comprovante

O hook `useReport` (usado no `ReportDetail.tsx`) busca as despesas do relatorio com este select:

```text
id, date, description, amount_cents, currency, category:expense_categories(name)
```

Os campos `receipt_path` e `is_out_of_policy` **NAO estao incluidos** na query. Mesmo que existam comprovantes no banco, eles nunca chegam ao frontend.

**Correcao:** Adicionar `receipt_path` e `is_out_of_policy` no select de `report_items` dentro do `useReport` em `src/hooks/useReports.ts` (linha 124).

---

### Problema 2: Bucket privado com metodo publico de URL

O `ReportDetail.tsx` usa `getPublicUrl` para gerar o link do comprovante:

```typescript
const getReceiptUrl = (receiptPath: string) => {
  const { data } = supabase.storage.from('receipts').getPublicUrl(receiptPath);
  return data.publicUrl;
};
```

Porem o bucket `receipts` e **privado** (`is_public: false`). URLs publicas nao funcionam em buckets privados -- retornam 400 ou imagem vazia.

**Correcao:** Trocar `getPublicUrl` por `createSignedUrl` com tempo de expiracao (ex: 1 hora).

---

### Problema 3: Nenhum comprovante foi enviado ainda

A tabela `storage.objects` para o bucket `receipts` esta **vazia** -- nenhum arquivo foi de fato uploadeado. Isso pode indicar que o upload em `ExpenseFormDialog` esta falhando silenciosamente, ou simplesmente ninguem anexou comprovantes ainda.

O codigo de upload em `ExpenseFormDialog` esta implementado corretamente (linhas 203-217), mas os erros podem nao estar sendo exibidos ao usuario se o upload falhar.

---

## O que JA funciona

| Item | Status |
|------|--------|
| Bucket `receipts` criado | OK |
| Politicas RLS do bucket (upload, leitura propria, leitura por gestor) | OK |
| Componente `ReceiptUpload` (camera, galeria, arquivo) | OK |
| Logica de upload no `ExpenseFormDialog` | OK (mas sem feedback de erro visivel) |
| Funcao RPC `admin_decide_report` (aprovar/reprovar) | OK |
| Funcao RPC `mark_report_paid` | OK |
| ApprovalQueue com fila de aprovacao | OK |

---

## Plano de Correcao

### 1. Corrigir a query do `useReport` 
**Arquivo:** `src/hooks/useReports.ts`
- Alterar o select de report_items para incluir `receipt_path` e `is_out_of_policy`:
```
id, expense:expenses(id, date, description, amount_cents, currency, receipt_path, is_out_of_policy, category:expense_categories(name))
```

### 2. Corrigir geracao de URL no ReportDetail
**Arquivo:** `src/pages/app/ReportDetail.tsx`
- Trocar `getPublicUrl` por `createSignedUrl` com expiracao de 3600 segundos
- A funcao passa a ser assincrona, entao ajustar para gerar URLs assinadas ao carregar a pagina ou ao clicar em "ver comprovante"

### 3. Melhorar feedback de erro no upload
**Arquivo:** `src/components/expenses/ExpenseFormDialog.tsx`
- Adicionar `toast.error` caso o upload falhe, para que o usuario saiba que o comprovante nao foi salvo

### 4. Exibir comprovantes na ApprovalQueue (mobile e desktop)
**Arquivo:** `src/components/reports/ApprovalQueue.tsx`
- Ao clicar em "Ver" um relatorio, o usuario ja e redirecionado para `ReportDetail` que mostrara os comprovantes apos a correcao acima

---

## Secao Tecnica

### Mudancas em arquivos:

1. **`src/hooks/useReports.ts`** (linha ~124)
   - Select atual: `id, expense:expenses(id, date, description, amount_cents, currency, category:expense_categories(name))`
   - Select corrigido: `id, expense:expenses(id, date, description, amount_cents, currency, receipt_path, is_out_of_policy, category:expense_categories(name))`

2. **`src/pages/app/ReportDetail.tsx`** (linha ~80-83)
   - Trocar `getPublicUrl` por `createSignedUrl`:
   ```typescript
   const getReceiptUrl = async (receiptPath: string) => {
     const { data, error } = await supabase.storage
       .from('receipts')
       .createSignedUrl(receiptPath, 3600);
     if (error) throw error;
     return data.signedUrl;
   };
   ```
   - Ajustar os handlers de clique para usar URLs assinadas (abrir em nova aba apos gerar a URL)

3. **`src/components/expenses/ExpenseFormDialog.tsx`** (~linha 256)
   - Adicionar tratamento de erro com toast no bloco de upload de comprovante

Nenhuma mudanca de banco de dados e necessaria -- bucket e politicas RLS ja estao corretos.
