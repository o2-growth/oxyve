

# Aprovacao/Reprovacao Individual de Despesas

## Problema

Atualmente o admin so pode aprovar ou reprovar o relatorio inteiro. O usuario quer que cada despesa seja aprovada ou reprovada individualmente, e quando reprovada, o admin deve informar o motivo. O usuario (colaborador) precisa ver quais despesas foram reprovadas e por que.

## Solucao

### Fluxo do Admin
1. Admin abre o relatorio com status "submitted"
2. Para cada despesa, ele pode clicar em "Aprovar" ou "Reprovar"
3. Ao reprovar, abre um dialog pedindo o motivo (obrigatorio)
4. Quando todas as despesas forem decididas, o admin pode finalizar o relatorio (aprovar se todas aprovadas, ou reprovar se alguma foi reprovada)

### Fluxo do Colaborador
1. Ao abrir um relatorio reprovado, ve cada despesa com seu status individual
2. Despesas reprovadas mostram o motivo da reprovacao em destaque

## Alteracoes

### 1. Banco de dados - Nova tabela `expense_reviews`

Criar tabela para armazenar a decisao individual de cada despesa:

```text
expense_reviews
- id (uuid, PK)
- expense_id (uuid, FK -> expenses)
- report_id (uuid, FK -> reports)
- reviewer_id (uuid)
- decision ('approved' | 'rejected')
- comment (text, obrigatorio se rejected)
- created_at (timestamp)
```

Com RLS:
- Managers/admins podem inserir reviews para despesas da sua org
- Usuarios podem ver reviews das suas proprias despesas
- Managers podem ver reviews da org

### 2. Atualizar `useReport` hook

- Buscar `expense_reviews` junto com os items do relatorio
- Incluir `review_decision` e `review_comment` em cada despesa retornada

### 3. Criar hook `useReviewExpense`

- Mutation para inserir um registro em `expense_reviews`
- Invalida queries do relatorio apos inserir

### 4. Atualizar `ReportDetail.tsx`

- Substituir os checkboxes de revisao por botoes de Aprovar/Reprovar em cada despesa
- Ao clicar "Reprovar" em uma despesa, abrir dialog pedindo motivo
- Mostrar status de cada despesa (aprovada/reprovada) com badge colorido
- Despesas reprovadas mostram o comentario do admin
- Barra de progresso mostra quantas ja foram decididas
- Botao final de "Aprovar Relatorio" so fica habilitado quando todas as despesas tiverem decisao
- Se alguma despesa foi reprovada, o botao final vira "Reprovar Relatorio" automaticamente

### 5. Visao do colaborador

- Quando o relatorio esta rejeitado, cada despesa mostra seu status individual
- Despesas reprovadas exibem o motivo em um card de alerta vermelho abaixo da despesa

### Detalhes tecnicos

- A tabela `expense_reviews` precisa de RLS policies para managers inserirem e usuarios/managers lerem
- O select no `useReport` vai incluir um join com `expense_reviews` filtrado pelo `report_id`
- A logica de decisao final do relatorio continua usando o RPC `admin_decide_report` existente
- Nenhuma alteracao no RPC e necessaria, apenas adicionamos a camada de revisao individual na UI e no banco
