# Source Tree — oxyve

**Curador:** Pax (PO)
**Data:** 2026-04-27
**Propósito:** mapa de pastas para SM/Dev navegarem rapidamente.

```
oxyve/
├── docs/                        ← documentos do AIOS workflow
│   ├── brownfield-assessment.md   (Atlas)
│   ├── prd.md                     (Morgan — visão geral)
│   ├── prd/                       (fragmentação por epic)
│   ├── po-validation.md           (Pax)
│   ├── tech-stack.md              (Pax)
│   ├── source-tree.md             (este arquivo)
│   ├── coding-standards.md        (Pax)
│   └── stories/                   (River — a popular no Sprint 1)
│
├── public/                      ← assets estáticos
│   ├── favicon.ico                (64x64 — falta 192/512 para PWA, Story 3.4)
│   ├── manifest.json              (theme_color a corrigir, Story 3.4)
│   ├── placeholder.svg
│   └── robots.txt
│
├── src/
│   ├── App.tsx                  ← router + providers (Auth, Theme, Query, Tooltip, Toaster)
│   ├── main.tsx
│   ├── index.css                ← tokens Tailwind + tema (target da Story 1.4)
│   ├── App.css
│   ├── vite-env.d.ts
│   │
│   ├── pages/                   ← rotas
│   │   ├── Index.tsx              (redirect → /app/dashboard)
│   │   ├── Login.tsx
│   │   ├── NotFound.tsx
│   │   └── app/                   (rotas autenticadas)
│   │       ├── Dashboard.tsx        (Story 1.2)
│   │       ├── Expenses.tsx         (já tem render condicional mobile)
│   │       ├── Reports.tsx
│   │       ├── ReportDetail.tsx     (Stories 2.3, 2.4, 3.2)
│   │       ├── SettingsProfile.tsx
│   │       ├── SettingsPassword.tsx
│   │       ├── SettingsPolicy.tsx
│   │       ├── SettingsTeam.tsx
│   │       ├── Advances.tsx         (placeholder — fora do MVP)
│   │       └── Support.tsx
│   │
│   ├── components/
│   │   ├── NavLink.tsx
│   │   ├── layout/                ← AppShell, TopBar, SidebarNav, PageHeader
│   │   ├── theme/                 ← ThemeProvider, theme switcher
│   │   ├── ui/                    ← shadcn primitives (não editar exceto extensão)
│   │   ├── dashboard/             ← CurrentReportCard
│   │   ├── expenses/              ← ExpenseCard, ExpensesTable, ExpenseFormDialog,
│   │   │                            ReceiptUpload, ReceiptValidation,
│   │   │                            ExpenseFiltersPopover (Story 1.4),
│   │   │                            AddToReportDialog
│   │   ├── reports/               ← ApprovalQueue (Stories 2.1-2.6),
│   │   │                            ReportCard, ReportFormDialog
│   │   └── settings/              ← CostCentersList, DepartmentsList,
│   │                                ExpenseTypesList, InvitesList, ProjectsList,
│   │                                SettingsLayout
│   │
│   ├── contexts/                ← AuthContext (com `isManager`, `isAdmin`)
│   │
│   ├── hooks/                   ← server state via React Query
│   │   ├── use-mobile.tsx         (breakpoint 768px — usado em ApprovalQueue, Settings, Expenses)
│   │   ├── use-toast.ts
│   │   ├── useBootstrap.ts
│   │   ├── useCurrentReport.ts    (target da Story 1.2 expansão)
│   │   ├── useDepartments.ts
│   │   ├── useExpenseTypes.ts
│   │   ├── useExpenses.ts
│   │   ├── useInvites.ts
│   │   ├── usePolicy.ts
│   │   ├── useReportActions.ts    (Stories 2.5, 2.6 — toasts e error handling)
│   │   ├── useReports.ts          (Story 2.2 — enriquecer com out_of_policy_count)
│   │   ├── useReviewExpense.ts    (Story 2.3)
│   │   └── useValidateReceipt.ts  (Story 3.1)
│   │
│   ├── integrations/
│   │   └── supabase/              ← client + types gerados
│   │
│   ├── lib/                     ← utilitários (constants, formatCurrency, etc.)
│   ├── assets/                  ← imagens
│   └── test/                    ← setup Vitest
│
├── supabase/
│   ├── config.toml
│   ├── migrations/              ← 7 arquivos, **só aditivas** (regra global)
│   └── functions/
│       └── validate-receipt/    ← OCR via OpenAI (Story 1.1, 3.1)
│           └── index.ts
│
├── package.json                 ← scripts: dev, build, lint, test
├── tsconfig.app.json            ← TS relaxado (não enrijecer no MVP)
├── tailwind.config.ts
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
└── components.json              ← config shadcn
```

## Pontos de atenção para Dev

- **ApprovalQueue.tsx (`src/components/reports/ApprovalQueue.tsx`)** será modificado em **6 stories do Epic 2** — coordenar PRs para evitar conflito; sugiro 1 PR por story em sequência ou agrupar 2.5 + 2.6 em 1 PR.
- **AppShell.tsx (`src/components/layout/AppShell.tsx`)** é tocado em Stories 1.4 e 3.5 (bottom nav) — mesma sugestão.
- **`index.css`** tocado em Story 1.4 (safe-area, touch-action).
- **Migrations**: Stories 1.3 (notificações — pode adicionar coluna `last_seen_status` em `reports` ou tabela nova) e 3.1 (OCR ack — adicionar coluna em `expenses`) podem precisar. **Sempre aditivas.**

## Onde NÃO mexer no MVP

- `src/components/ui/*` (shadcn primitives) — exceto extensão pontual.
- `src/pages/app/Advances.tsx` (declaradamente fora do MVP).
- Configuração de TypeScript / ESLint (não enrijecer).
- `components.json` (config shadcn).
