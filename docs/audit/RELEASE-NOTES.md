# Release Notes — Oxy VE

Histórico de mudanças por sprint. Releases mais recentes no topo.

---

## v1.0 — Sprint 3 (2026-04-30)

**Tema:** polish, observabilidade, release-ready.

### Adicionado
- **PDF export de relatórios** (GAP-G009 parte 2) — geração 100% client-side via
  jsPDF + jspdf-autotable. Layout com header da org, KPIs, tabela de despesas e
  sumário por categoria. Item "Baixar em PDF" no menu "Mais ações" do
  `ReportDetail`. Dynamic import mantém o bundle inicial enxuto.
- **Observabilidade frontend (Sentry)** — `src/lib/sentry.ts` inicializa
  `@sentry/react` com `tracesSampleRate: 0.1`, replay on-error e DSN via
  `VITE_SENTRY_DSN`. Sem DSN, comportamento é no-op (não polui dev/test).
  `ErrorBoundary` reporta via `captureException` no `componentDidCatch`.
- **Cron de envio automático de email** — função
  `dispatch_pending_notification_emails()` consome `notifications` pendentes
  da última hora e despacha via edge fn `send-email`. Schedule `pg_cron` a
  cada 1 min (best-effort: se a extensão não estiver disponível, a função
  fica disponível pra invocação manual).
- **Backfill de `report_events`** — migration popula histórico sintético para
  relatórios criados antes dos triggers do Sprint 2 (eventos `created`,
  `submitted`, `approved`, `rejected`, `paid` reconstruídos a partir do estado
  atual).
- **E2E Playwright** — 1 fluxo crítico (`login-flow.spec.ts`): redirect
  anônimo → login, tab "Cadastrar" gated por `?invite=`, login inválido
  exibindo toast. Script `bun run test:e2e`.

### Mudou
- **TS strict bump** — `noImplicitAny: true` ativo (DEC-008). 0 erros novos
  no typecheck.
- **ESLint cleanup** — de 25 problemas (17 errors, 8 warnings) para
  **0 errors, 1 warning** aceitável (`AuthContext` exporta hook + componente).
  Override de `react-refresh/only-export-components` para `ui/*` (shadcn
  boilerplate) e `no-require-imports` para `tailwind.config.ts`.
- **Tipagem em `ReportDetail.tsx`** — interfaces `ReportItem`,
  `ReportApproval`, `ReportExtras` substituem todos os `any` previamente
  necessários pra navegar nos joins do PostgREST.
- **`useInvites.ts`** — `error: any` → `PostgrestError | Error`.
- **`SettingsPolicy.tsx`** — `(policy as any).cycle_cutoff_day` removido
  (já tipado em `ExpensePolicy`).

### Decisões CTO
- DEC-006 — Sentry como provedor de observabilidade frontend.
- DEC-007 — PDF export client-side via jsPDF + autotable.
- DEC-008 — `noImplicitAny: true` ativo.

### Quality gates (final)
| Gate | Resultado |
|---|---|
| `bunx tsc --noEmit` | 0 erros |
| `bun run test` | 22/22 passando |
| `bunx eslint src/` | 0 errors, 1 warning |
| `bunx vite build` | OK, initial chunk 21KB (7.95KB gzip) |
| `bunx playwright test` | 4/4 passando |

### TODOs v1.1
- Ativar TS `strict: true` completo (depois `noUnusedLocals/Parameters`).
- Resolver warning shadow-boundary do `AuthContext` (split em
  `AuthContext.ts` + `AuthProvider.tsx`).
- NF-e + IA categorização (DEC-004 deferido).
- Multimoeda real (conversion rates).
- Mobile nativo (React Native).
- Integração com gateways de pagamento.
- Configurar `RESEND_API_KEY` em produção (envio real de email).
- Configurar `VITE_SENTRY_DSN` em produção (telemetria real).
- Configurar `app.supabase_url` + `app.service_role_key` no Postgres pra
  habilitar o cron de envio de email se `pg_cron` ainda não estiver
  agendado pelo Lovable.

---

## Sprint 2 (2026-04-30)

**Tema:** dados financeiros, exports, notificações persistentes, audit trail.

### Adicionado
- **Dados bancários, CPF, cost center** em `profiles` (GAP financeiro pra reembolso).
- **Export CSV / XLSX** de relatórios (GAP-G009 parte 1) — colunas Data,
  Descrição, Tipo, Centro de custos, Forma de pagamento, Valor. XLSX com aba
  "Resumo".
- **Notificações persistentes** (GAP-G012) — tabela `notifications` + sino
  no header com badge de não-lidas, marcar como lido, navegação pelo `link`.
- **Audit trail / `report_events`** (GAP-G011) — triggers em `reports` e
  `report_items` populam histórico em `submitted`/`approved`/`rejected`/`paid`/
  `expense_added`/`expense_removed`. Exibido no diálogo "Histórico" do
  `ReportDetail`.
- **KPIs no `ReportDetail`** — Total / Reembolsável / Não-reembolsável /
  Despesas (cards no topo).
- **Tabs com contadores** em telas de listagem.
- **Edge fn `send-email`** com Resend (DEC-001) + fallback `{simulated: true}`
  quando `RESEND_API_KEY` ausente.

### Mudou
- Migrations `20260430170000_create_notifications.sql` e
  `20260430180000_create_report_events.sql` aplicadas em prod.

---

## Sprint 1 (2026-04-30)

**Tema:** performance, bundle splitting, TS strict (parte 1), org cleanup.

### Adicionado
- **`React.lazy` por rota** (DEC-003) — todas as páginas de `/app/*` viram
  chunks separados. `Suspense` com `LoadingScreen` cobre a transição.
- **`manualChunks`** separando `vendor-react`, `vendor-supabase`,
  `vendor-charts`, `vendor-radix` em arquivos próprios.
- **`ErrorBoundary` global** (Aria-5) entre `BrowserRouter` e `AuthProvider`.

### Mudou
- **TS `strictNullChecks: true`** (DEC-002, parte 1 do incremental). Resto das
  flags `strict` adiadas.
- Bundle inicial: de ~2.3MB (Aria-3 baseline) para ~7.91KB gzip.
- Org morta `70aa944f-…` (João Victor) **desativada** (DEC-005); dados não
  havia.

---

## Sprint 0 (2026-04-30)

**Tema:** RLS hotfix, invite-only, segurança baseline.

### Adicionado / Corrigido
- **RLS hotfix** — políticas faltantes em `reports`, `report_items`,
  `expenses`, `categories`, `cost_centers`. Bloqueia leitura cross-org.
- **Invite-only signup** — tab "Cadastrar" só aparece com `?invite=<token>`
  válido na URL. Bootstrap atrela o user à `org` do invite.
- **Bootstrap idempotente** — flag `is_bootstrapped` em `profiles` evita
  re-execução acidental.
- **Migration `20260430000000_sprint0_security_hotfix.sql`** aplicada em prod.
