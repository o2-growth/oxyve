# Epic 2 — Aprovação BEM FEITA

**Sprint:** 2 (estimado 1 semana)
**Severidade:** 🟡 Polish + edge cases
**Objetivo:** elevar o fluxo de aprovação de "funcional" para "robusto e ergonômico". **Foco explícito do usuário: este epic precisa ficar BEM FEITO.**

> ⚠️ **Cuidado de coordenação:** 6 stories tocam `ApprovalQueue.tsx` e/ou `ReportDetail.tsx`. Sugerir 1 PR por story em sequência ou agrupar 2.5+2.6 em 1 PR para reduzir conflitos.

## Stories

### Story 2.1 — Touch targets adequados na fila de aprovação
- **Persona:** Gestor mobile
- **Esforço:** XS (~30min)
- **Dependências:** Story 1.4 (safe-area)
- **Narrativa:** Como gestor mobile, quero botões de aprovar/rejeitar/ver com tamanho de toque confortável, para não tocar errado.
- **Critérios de aceite:**
  - `ApprovalQueue.tsx:127-153` — botões mobile mudam de `size="sm"` (~36px) para `size="default"` (~44px) ou `h-12` explícito.
  - Espaçamento mínimo de 8px entre botões.
  - Versão desktop (linhas 247-268) substitui `variant="ghost"` ícone-only por botões com label visível ("Ver", "Aprovar", "Rejeitar") — reduz erro por affordance.
  - **Edge case:** "Aprovar" como ação primária, "Rejeitar" como destrutiva (vermelha), "Ver" como secundária (outline).
- **Notas técnicas:** apenas ajuste de classes/props.

---

### Story 2.2 — Fila destaca despesas fora da política
- **Persona:** Gestor
- **Esforço:** S (~4h)
- **Dependências:** nenhuma
- **Narrativa:** Como gestor, quero ver de relance se um relatório contém despesas fora da política, para priorizar revisão.
- **Critérios de aceite:**
  - Card/linha do relatório na `ApprovalQueue` mostra badge "⚠️ X fora da política" se `report.expense_count_out_of_policy > 0`.
  - Hook `useReports` enriquece resposta com contagem de `is_out_of_policy=true` no relatório (subquery ou agregação).
  - Badge clicável vai direto para `/app/reports/:id` com filtro pré-aplicado nas despesas problemáticas.
  - **Mobile:** badge fica em linha separada se não couber ao lado do título.
  - **Edge case:** zero despesas out_of_policy → não mostra o badge.
- **Notas técnicas:** ajuste em `src/hooks/useReports.ts` (query) + UI em `src/components/reports/ApprovalQueue.tsx`.

---

### Story 2.3 — Aprovação parcial: rejeitar despesa individual
- **Persona:** Gestor
- **Esforço:** M (~2-3 dias)
- **Dependências:** soft de 2.4 e 2.5
- **Narrativa:** Como gestor, quero rejeitar despesas individuais dentro de um relatório (não só o relatório inteiro), para que o funcionário ajuste só o que está errado.
- **Critérios de aceite:**
  - `ReportDetail.tsx`: cada despesa tem ações "Aprovar" e "Rejeitar" via `useReviewExpense` (`expense_reviews` table já existe).
  - Rejeição exige comentário (≥10 caracteres).
  - Estado da despesa fica visível: aprovada (verde), rejeitada (vermelha + comentário visível), pendente (cinza).
  - Quando o gestor decide o relatório como "approved" mas há despesas individualmente rejeitadas, o status da despesa rejeitada não é alterado para "approved" — é mantido conforme `expense_reviews`.
  - **Mobile:** ações em formato de cards com botões `h-10` mínimo; comentário em **drawer mobile**, não dialog que cubra a tela toda.
  - **Edge case:** se gestor rejeita despesa e depois aprova o relatório, UI alerta "X despesa(s) ainda rejeitada(s) — confirmar?".
- **Notas técnicas:** UI nova em `src/pages/app/ReportDetail.tsx` + `src/hooks/useReviewExpense.ts`; verificar se RPC `admin_decide_report` precisa ajuste para preservar status individual rejeitado.

---

### Story 2.4 — Histórico de aprovação visível ao funcionário
- **Persona:** Funcionário
- **Esforço:** S (~4-6h)
- **Dependências:** nenhuma
- **Narrativa:** Como funcionário, quero ver quem aprovou ou rejeitou meu relatório e o comentário, para entender a decisão.
- **Critérios de aceite:**
  - `ReportDetail.tsx` exibe seção "Histórico" com entradas de `report_approvals` ordenadas por data desc: aprovador (nome), decisão, comentário, timestamp.
  - Inclui também rejeições individuais de despesas (`expense_reviews`), agrupadas por despesa.
  - Para o funcionário (próprio relatório), histórico é read-only e sempre visível.
  - **Mobile:** seção colapsável; cada entrada cabe em 1 linha com timestamp em formato relativo ("há 2 dias").
  - **Edge case:** relatório nunca submetido → seção não aparece.
- **Notas técnicas:** novo hook `useReportHistory(reportId)` agregando ambas tabelas; UI em `src/pages/app/ReportDetail.tsx`.

---

### Story 2.5 — Mensagens claras de erro/sucesso na decisão
- **Persona:** Gestor
- **Esforço:** XS (~2h)
- **Dependências:** nenhuma
- **Narrativa:** Como gestor, quero feedback claro quando minha decisão é confirmada (ou falha), para ter certeza do que aconteceu.
- **Critérios de aceite:**
  - Toast de sucesso após aprovar/rejeitar: "Relatório [título] aprovado" ou "Relatório [título] rejeitado".
  - Toast de erro com mensagem específica em caso de falha de RPC (não mensagem técnica).
  - Trata erro state no `ApprovalQueue.tsx` — atualmente não há `if (error)` ramo.
  - Toasts respeitam mobile: posicionados em `top` (não cobertos por teclado virtual), `swipe-to-dismiss`.
  - **Edge case:** dupla submissão (gestor toca aprovar duas vezes) — botão fica disabled até resposta.
- **Notas técnicas:** ajustes em `src/hooks/useReportActions.ts` (try/catch + toast) e `src/components/reports/ApprovalQueue.tsx` (error state); config global do Sonner em `App.tsx` se necessário.

---

### Story 2.6 — Confirmação destrutiva ao rejeitar
- **Persona:** Gestor
- **Esforço:** S (~4h)
- **Dependências:** nenhuma
- **Narrativa:** Como gestor, quero confirmar antes de rejeitar (ação destrutiva), para evitar tap acidental.
- **Critérios de aceite:**
  - Diálogo já existente em `ApprovalQueue.tsx:161-200` mantém-se, mas com:
    - Comentário com **mínimo de 10 caracteres** (atualmente apenas "não vazio").
    - Botão "Rejeitar" só fica habilitado após preencher comentário válido.
    - Texto do botão muda para "Confirmar Rejeição" quando há comentário válido — reforço visual.
  - **Mobile:** diálogo abre como **drawer bottom-sheet** (mais natural em mobile que dialog centralizado).
  - **Edge case:** fechar drawer com swipe não submete decisão; fechar ao tocar fora também não.
- **Notas técnicas:** trocar `<Dialog>` por `<Drawer>` (shadcn) em viewport mobile, manter dialog em desktop; validação de comprimento via Zod ou inline.
