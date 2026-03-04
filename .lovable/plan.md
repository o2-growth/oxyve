

# Permitir admin aprovar/reprovar seus próprios relatórios

Atualmente, a linha `const canApprove = isManager && !isOwner && report?.status === 'submitted'` no `ReportDetail.tsx` impede que o dono do relatório veja os botões de aprovação/reprovação. Para admins, isso deve ser permitido.

## Alteração

No arquivo `src/pages/app/ReportDetail.tsx`, linha 60, mudar a lógica de `canApprove`:

De:
```ts
const canApprove = isManager && !isOwner && report?.status === 'submitted';
```

Para:
```ts
const canApprove = isManager && (!isOwner || isAdmin) && report?.status === 'submitted';
```

Isso permite que admins aprovem/reprovem seus próprios relatórios, enquanto managers comuns continuam sem poder aprovar os seus.

A mesma lógica precisa ser aplicada no componente `ApprovalQueue.tsx` — atualmente ele filtra por `status: 'submitted'` e mostra todos os relatórios da org. Não há filtro `!isOwner` lá, então a fila de aprovação já mostra relatórios do próprio admin. Nenhuma alteração necessária nesse componente.

O backend (`admin_decide_report`) já permite que o admin aprove seus próprios relatórios — não há verificação de `user_id != approver_id`.

