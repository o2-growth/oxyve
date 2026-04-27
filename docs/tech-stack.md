# Tech Stack — oxyve

**Curador:** Pax (PO)
**Data:** 2026-04-27
**Propósito:** referência rápida para Dev/QA sobre as escolhas técnicas. **Stack é travada para o MVP** — não trocar peças sem alinhamento com PO/Architect.

---

## Frontend

| Camada | Tech | Versão | Notas |
|--------|------|--------|-------|
| Build | Vite | 5.x | `npm run dev`, `npm run build`, `npm run preview` |
| Linguagem | TypeScript | 5.x | Config relaxada (`strict: false`, `noImplicitAny: false`) — não enrijecer no MVP |
| UI Framework | React | 18.3.1 | |
| Roteamento | react-router-dom | 6.30.1 | rotas em `src/App.tsx` |
| Estilo | Tailwind CSS | 3.x + tailwindcss-animate | tokens CSS em `index.css` |
| Componentes | shadcn-ui (Radix UI) | latest | em `src/components/ui/` — não editar arquivos `ui/*` exceto se necessário |
| Forms | react-hook-form + zod (`@hookform/resolvers`) | | padrão em `ExpenseFormDialog`, `ReportFormDialog` |
| Server state | @tanstack/react-query | 5.83 | hooks em `src/hooks/use*` |
| Datas | date-fns | 3.x | |
| Imagens HEIC | heic2any | 0.0.4 | conversão HEIC→JPEG para iPhone |
| Icons | lucide-react | 0.462 | |
| Toast | sonner | + Radix toast (`@radix-ui/react-toast`) | dois toasters em `App.tsx` — preferir Sonner para novidades |
| Tema | next-themes via `ThemeProvider` | | light/dark |

## Backend

| Camada | Tech | Notas |
|--------|------|-------|
| BaaS | Supabase (Postgres + Auth + Storage + Edge Functions) | client em `src/integrations/supabase/` |
| Edge Functions | Deno (Supabase Edge Runtime) | em `supabase/functions/` |
| OCR | OpenAI Vision (GPT-4o-mini, tool-calling) | secret: `OPENAI_API_KEY` |
| Storage | bucket `receipts` com RLS por org/user/report | path: `/{org}/{user}/{report}/{expense}/{file}` |

## Schema (resumo)

Tabelas: `organizations`, `profiles`, `user_roles` (enum: employee/manager/admin), `expense_categories`, `expense_types`, `expenses`, `reports`, `report_items`, `report_approvals`, `expense_reviews`, `expense_policies`, `cost_centers`, `projects`, `departments`, `org_invites`, `org_domains`.

Enums: `app_role`, `expense_status` (draft/submitted/approved/rejected/paid), `report_status` (mesmos), `payment_method` (personal_card/corporate_card/cash/other), `approval_decision` (approved/rejected).

RPCs notáveis: `admin_decide_report(p_report_id, p_decision, p_comment)`.

## Testes

| Tipo | Tool | Status |
|------|------|--------|
| Unit | Vitest | configurado, suite mínima |
| E2E | (a definir) | sugestão Playwright para Sprint 2 |

## CI/CD & Deploy

- Push para `main` → Lovable auto-builds + deploy.
- Migrations Supabase aplicadas via dashboard ou `supabase db push` (devops decide).
- **Regra crítica:** migrations **só aditivas** (CLAUDE.md global). Nunca DROP/UPDATE/DELETE em dados de produção.

## Variáveis de ambiente

### Frontend (`.env`, prefixo `VITE_`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### Edge Functions (Supabase secrets)
- `OPENAI_API_KEY` ⚠️ **Story 1.1 — confirmar configurada**
- `RESEND_API_KEY` (a adicionar no Sprint 1, Story 1.3 — **default: Resend**)
