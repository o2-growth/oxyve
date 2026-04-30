## Sprint 3 — Release-final (PR4)

CTO Vince. **Último sprint do action plan.** Após este merge, plataforma passa em todos os quality gates da CTO charter.

### O que entrega

#### 🔍 Audit trail completo (backfill)
- `20260430190000_backfill_report_events.sql` — popula `report_events` para reports legados (created/submitted/approved/rejected/paid). Triggers do Sprint 2 só pegavam novos eventos; agora histórico fica completo.

#### 📄 PDF Export (GAP-G009 parte 2)
- `jsPDF + jspdf-autotable` client-side — **sem edge function nem puppeteer**.
- `src/lib/exportReportPdf.ts` (puro, testado).
- Item "Baixar em PDF" no menu "Mais ações" do `ReportDetail`.
- Layout: header com org+título+status, 4 KPIs, tabela de despesas, sumário por categoria, footer.
- DEC-007 — escolha por client-side pra simplicidade e zero infra.

#### 📧 Cron de email automático
- `20260430200000_notification_email_cron.sql`:
  - Coluna `notifications.emailed_at`
  - Função `dispatch_pending_notification_emails()` SECURITY DEFINER
  - Schedule via `pg_cron` a cada 1 min (com fallback graceful — se Lovable Cloud bloquear extensão, função fica disponível pra invocação manual via RPC)
- **Requer config**:
  - `RESEND_API_KEY` como env da edge function `send-email`
  - `app.supabase_url` + `app.service_role_key` no Postgres (`ALTER DATABASE ... SET app.x = 'y'` ou Vault)

#### 🛡️ Sentry observabilidade (DEC-006)
- `@sentry/react` integrado. `src/lib/sentry.ts` wrapper.
- Init em `main.tsx`. ErrorBoundary integrado.
- **No-op sem `VITE_SENTRY_DSN`** — code path neutro em dev.
- Configuração: setar `VITE_SENTRY_DSN` no env do Lovable Cloud quando criar projeto Sentry.

#### 🔒 TypeScript strict bump (DEC-008)
- `noImplicitAny: true` ativo.
- Eliminados 16 erros de `any` em `ReportDetail`, `SettingsPolicy`, `useInvites`, `Dashboard`.
- `PostgrestError` tipado em useInvites.

#### 🧹 ESLint cleanup final
- `eslint.config.js` com overrides para `src/components/ui/*` (shadcn) e `tailwind.config.ts`.
- **24 problemas → 0 errors + 1 warning aceitável** (`AuthContext` mixed-export — TODO v1.1).

#### 🎭 Playwright E2E (primeiro fluxo crítico)
- `playwright.config.ts` raiz + `e2e/login-flow.spec.ts`.
- 4 testes:
  1. Acesso anônimo a `/app/dashboard` redireciona pra `/login`
  2. Tab "Cadastrar" oculta sem `?invite=`
  3. Tab "Cadastrar" visível com `?invite=token`
  4. Login com credenciais inválidas mostra toast
- Script `npm run test:e2e`. test-results/ ignorado.

#### 📋 Documentação
- `docs/audit/RELEASE-NOTES.md` — changelog Sprint 0+1+2+3 completo
- `docs/audit/CTO-charter.md` — DEC-006 (Sentry), DEC-007 (PDF jsPDF), DEC-008 (noImplicitAny)

### Quality Gates — TODOS verdes (✅ CTO charter satisfeita)

| Check | Início | Sprint 0 | Sprint 1 | Sprint 2 | **Sprint 3** |
|---|---|---|---|---|---|
| TypeScript | strict false | strict false | **strictNullChecks** | strictNullChecks | **+ noImplicitAny** ✅ |
| Tests | 1 | 3 | 4 | 20 | **22** |
| ESLint problemas | 50 | 44 | 24 | 24 | **0 errors + 1 warn** |
| Bundle inicial gzip | 625KB | 625KB | 253KB | 7.91KB | **7.95KB** |
| Playwright E2E | — | — | — | — | **4/4** ✨ |
| P0 abertos | 13 | **0** | 0 | 0 | 0 |

### 🛠️ Runbook pós-merge

Cole no chat do Lovable:

```
Acabei de mergear o PR sprint3/release-final. Aplica via supabase--migration:

1) supabase/migrations/20260430190000_backfill_report_events.sql
   (backfill audit trail pros reports legados)

2) supabase/migrations/20260430200000_notification_email_cron.sql
   (coluna emailed_at + função dispatch + cron pg_cron — wrap em DO/EXCEPTION
   se a extensão estiver bloqueada)

Após aplicar:
- Confirma SELECT count(*) FROM report_events GROUP BY event_type;
  (deve mostrar created/submitted/approved/etc populados pra reports legados)
- Confirma SELECT cron.job FROM cron.job; — deve listar dispatch_pending_notification_emails
  ou retornar erro de extensão (esperado se bloqueado)
- Mostra o estado de:
    SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net');

Configurações pendentes:
- Setar RESEND_API_KEY como secret da edge fn send-email (quando quiserem email real)
- Setar VITE_SENTRY_DSN no env Lovable (quando criar projeto Sentry)
- Setar app.supabase_url + app.service_role_key (Vault) pro cron de email funcionar
```

### TODOs registrados pra v1.1

- TS `strict: true` completo + `noUnusedLocals/Parameters`
- Split `AuthContext.tsx` (resolver warning fast-refresh)
- NF-e + IA categorização (DEC-004)
- Multimoeda real (FX rates)
- Mobile nativo (React Native)
- Gateway de pagamento

---

🤖 CTO Vince via [Claude Code](https://claude.com/claude-code) — charter em `docs/audit/CTO-charter.md`
