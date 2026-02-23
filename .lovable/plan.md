

# Melhorar Experiencia de Aprovacao para o Admin

## Problema atual

Quando o admin abre um relatorio na fila de aprovacao, ele so consegue aprovar ou reprovar o relatorio inteiro de uma vez. Nao existe forma de revisar cada despesa individualmente (marcar como verificada, aprovar/reprovar individualmente).

## Solucao proposta

Adicionar checkboxes de revisao em cada despesa do relatorio quando o admin esta no modo de aprovacao, permitindo que ele marque cada despesa como "revisada" antes de tomar a decisao final sobre o relatorio.

### Fluxo do admin

1. Admin abre o detalhe do relatorio com status "submitted"
2. Cada despesa aparece com um checkbox ao lado
3. Admin clica no checkbox de cada despesa conforme vai revisando (pode abrir o comprovante, verificar valores, etc.)
4. O resumo lateral mostra progresso: "5 de 8 revisadas"
5. Os botoes de Aprovar/Reprovar ficam habilitados somente quando todas as despesas estiverem marcadas como revisadas
6. Isso garante que o admin olhou cada item antes de decidir

### Importante

- Os checkboxes sao apenas controle visual local (estado no React), nao precisam ser salvos no banco
- O fluxo de aprovacao/reprovacao do relatorio continua o mesmo (via RPC `admin_decide_report`)
- Nao altera a logica de negocio, apenas melhora a UX

## Alteracoes tecnicas

### 1. `src/pages/app/ReportDetail.tsx`

- Adicionar estado `reviewedExpenses` (Set de IDs) para controlar quais despesas foram revisadas
- Adicionar coluna de checkbox na tabela de despesas (desktop) e no card (mobile) quando `canApprove` for true
- Mostrar barra de progresso ou contador no card de resumo: "X de Y revisadas"
- Desabilitar botoes "Aprovar" e "Reprovar" ate que todas as despesas estejam revisadas
- Adicionar botao "Marcar todas como revisadas" para agilizar quando o admin ja conferiu tudo

### 2. Sem alteracao no banco de dados

- Os checkboxes sao estado local do componente, sem persistencia

