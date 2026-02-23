

# Remover Centro de Custo do formulario de despesas

## O que sera feito

Remover o campo "Centro de Custo" do formulario de criacao/edicao de despesas (`ExpenseFormDialog`). O campo continuara existindo no banco de dados mas nao sera exibido no formulario.

## Alteracoes

### 1. `src/components/expenses/ExpenseFormDialog.tsx`

- Remover o campo `cost_center_id` do schema Zod de validacao
- Remover o valor default `cost_center_id` do formulario
- Remover o bloco de `FormField` que renderiza o select de Centro de Custo (linhas ~501-535)
- Remover a referencia a `cost_center_id` no reset do formulario ao carregar/limpar
- Manter `cost_center_id: null` no submit para nao quebrar o tipo

### 2. `src/components/expenses/ExpenseFiltersPopover.tsx`

- Remover o filtro de Centro de Custo do popover de filtros avancados
- Remover o import de `useCostCenters`

### 3. Sem alteracao no banco

- A coluna `cost_center_id` permanece na tabela (nullable), apenas nao sera mais preenchida pelo formulario

