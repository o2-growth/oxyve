## Sprint 2 — Paridade competitiva (PR3)

CTO Vince. Encerra Sprint 2 do action plan: 8 features de paridade VExpenses.

### Features entregues

| ID | Feature | Local |
|---|---|---|
| **GAP-G009** | Export CSV/XLSX de relatório | "Mais ações" no `ReportDetail` |
| **GAP-G012** | Notificações persistentes (tabela + sino + tabs) | Header global + popover |
| **GAP-G011** | Histórico de relatório (audit trail visível) | Drawer "Histórico" no `ReportDetail` |
| **GAP-G013/014** | 4 KPIs no header de relatório | `ReportDetail` |
| **GAP-G016** | Tabs com contadores | `Reports.tsx` |
| **GAP-G017** | Bulk action "Adicionar a relatório" | `Expenses.tsx` (já implementado) |
| **GAP-G024** | Modal "Criar relatório" inline | `AddToReportDialog` (já implementado) |
| **GAP-G006** | Projeto como dimensão | `ExpenseFormDialog` (já usado) |

### 🗄️ Backend

#### Migrations (aplicar via Lovable)

1. **`20260430170000_create_notifications.sql`**
   - Tabela `notifications` com enum `notification_category` (action_required / my_expenses / reports / other)
   - RLS: SELECT só dono; UPDATE só `read_at`; INSERT só via SECURITY DEFINER
   - Função `create_notification(user_id, category, title, body, link)`

2. **`20260430180000_create_report_events.sql`**
   - Tabela `report_events` (audit trail por relatório)
   - 2 triggers: ao mudar `reports.status` (created/submitted/approved/rejected/paid) e ao adicionar/remover `report_items` (expense_added/removed)
   - Notificação automática pro autor + admins/managers em `submitted`

#### Edge function

- **`supabase/functions/send-email/index.ts`** — POST `{to, subject, html, text}`
  - Auth via JWT (mesmo padrão `validate-receipt`)
  - Tenta Resend via `RESEND_API_KEY`; se ausente, retorna `{simulated: true}` (não falha)
  - DEC-001 — Resend é provider escolhido

### 📦 Dependências adicionadas

- `xlsx` (sheetjs-ce) — export Excel
- `papaparse` + `@types/papaparse` — export CSV
- Carregadas via dynamic import na rota — não inflam chunk inicial

### Quality Gates (todos verdes)

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✅ 0 erros |
| Vitest | ✅ **20/20** passing (5 arquivos; 16 casos novos) |
| ESLint `src/` | ✅ 24 (= baseline Sprint 1) |
| `vite build` | ✅ Initial **7.91KB gzip** (target era <300KB) |
| Bundle export | ✅ chunk lazy 103KB gzip (só carrega ao clicar Exportar) |

### Testes novos

- `src/lib/exportReport.test.ts` — 12 casos cobrindo CSV puro (escape de aspas, separadores, BOM)
- `src/hooks/useNotifications.test.tsx` — 4 casos (mock Supabase, valida shape e filtros por categoria)

### Pendências intencionais (Sprint 3)

- **PDF de relatório** — puppeteer ou edge fn
- **Cron disparar send-email automático** a partir de novas notifications
- **Multimoeda real** — schema pronto, ROI baixo no MVP

### 🛠️ Runbook pós-merge

Cole no chat do Lovable:

```
Acabei de mergear o PR sprint2/feature-parity. Aplica via supabase--migration:

1) supabase/migrations/20260430170000_create_notifications.sql
2) supabase/migrations/20260430180000_create_report_events.sql

Após aplicar:
- Confirma com SELECT count(*) FROM notifications; e SELECT count(*) FROM report_events;
- Confirma que o trigger em reports já populou eventos pra reports existentes? (SELECT count(*) FROM report_events GROUP BY event_type)
- Regenera src/integrations/supabase/types.ts via Lovable Cloud
- Confirma deploy da edge function send-email (deve responder 401 sem Authorization e 400 sem RESEND_API_KEY se chamada com auth — ou retornar simulated:true)
```

### Próximos passos (CTO autônomo)

- **Sprint 3** já planejado: testes E2E Playwright + Sentry + cleanup ESLint final + cron pra send-email + PDF export
- NF-e e IA categorização **deferidas pra v1.1** (DEC-004)

---

🤖 CTO Vince via [Claude Code](https://claude.com/claude-code) — charter em `docs/audit/CTO-charter.md`
