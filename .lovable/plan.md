
# Atualizar Formas de Pagamento

## O que muda

As formas de pagamento serao atualizadas para corresponder exatamente ao que esta na imagem de referencia:

| Valor no banco | Label atual | Novo label |
|---|---|---|
| corporate_card | Cartao Corporativo | Cartao Corporativo |
| personal_card | Cartao Pessoal | Cartao Pessoal (reembolsavel) |
| cash | Dinheiro | Dinheiro (reembolsavel) |
| other | Outro | **Removido** |

## Alteracoes

### 1. Banco de dados - Remover valor "other" do enum

- Migrar despesas existentes com `payment_method = 'other'` para `'cash'` (se houver)
- Remover o valor `other` do enum `payment_method`

### 2. Labels - `src/lib/constants.ts`

- Atualizar `PAYMENT_METHOD_LABELS` para os novos textos com "(reembolsavel)"
- Remover a entrada `other`

### 3. Formulario - `src/components/expenses/ExpenseFormDialog.tsx`

- Atualizar o schema Zod para aceitar apenas 3 valores: `personal_card`, `corporate_card`, `cash`

### 4. Hook - `src/hooks/useExpenses.ts`

- Atualizar o type `ExpenseInput.payment_method` removendo `'other'`
- Atualizar o type `Expense.payment_method` removendo `'other'`

### 5. Tabela e filtros

- Verificar se `ExpensesTable` e filtros referenciam `other` e remover

## Detalhes tecnicos

- A migracao SQL recria o enum sem `other` usando a tecnica de: criar novo enum, alterar coluna, dropar antigo, renomear
- Nenhuma logica de negocio depende especificamente de `other`, entao a remocao e segura
