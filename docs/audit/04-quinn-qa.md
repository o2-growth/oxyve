# 04 — Quinn (QA / Test Architect) — Auditoria de Qualidade

**Projeto:** Oxy VE — Gestão de Despesas (React + Vite + Supabase)
**Data:** 2026-04-30
**Estado dos testes:** 1 teste trivial (`src/test/example.test.ts`). Cobertura efetiva ≈ 0%.
**Stack de teste:** Vitest 3.2.4 + Testing Library + jest-dom (configurados, não utilizados).

---

## 1. Resumo Executivo (P0 confirmados em 5 linhas)

1. **Convite por token NÃO é validado em lugar algum no client** — `useInvites.getInviteLink` cria `?invite=<token>`, mas `Login.tsx` apenas alterna para a aba "Cadastrar"; o token nunca é enviado ao `signUp` nem consumido por RPC. **O fluxo de convite está quebrado** (signup cai no caminho `domain_match` ou `new_org` do bootstrap).
2. **Bootstrap silencioso** (`AuthContext.runBootstrap`) engole erros com `console.error`. Se `bootstrap_user` RPC falhar, usuário fica sem `org_id` mas vê app carregando — todos os hooks com `enabled: !!profile?.org_id` ficam "presos" sem feedback.
3. **Race condition no `ExpenseFormDialog`** — `useEffect` que chama `reportForDate.mutate` (linhas 148–157) não tem guarda de mutation pendente, dispara em cada keystroke de data e pode sobrescrever `currentReportForDate` com resposta antiga (mutations não são canceladas).
4. **Autorização puramente client-side**: `canApprove`, `canMarkPaid`, `isAdmin`, `isManager` (`AuthContext`, `ReportDetail`, `Reports`) só são checados no React. Sem RLS confirmada (Dara cobre), um usuário pode chamar as RPCs `admin_decide_report` / `mark_report_paid` direto via console.
5. **Validação Zod ausente em formulários sensíveis** — `Login.tsx` (signup, login, forgot-password) e `useCreateInvite` (apenas `email: string`) **não têm schema Zod**, validação manual frágil (`password.length < 6`, sem regex de email além do `type=email`).

**Veredicto:** Sistema **NÃO funcional** para release. Veja seção 6.

---

## 2. Mapa de Bugs Confirmados

| # | Sev | Arquivo:linha | Categoria | Descrição | Fix sugerido |
|---|-----|---------------|-----------|-----------|--------------|
| B1 | **P0** | `src/pages/Login.tsx:39, 79–96` | Fluxo quebrado | `inviteToken` é lido mas nunca passado para `signUp` nem para RPC `accept_invite`. Usuário convidado vira `domain_match`/`new_org` no bootstrap. | Passar `inviteToken` no `options.data` do signUp e/ou chamar RPC `accept_invite(token)` após signup. |
| B2 | **P0** | `src/contexts/AuthContext.tsx:82–86` | Erro engolido | `runBootstrap` `console.error`-only; UI segue como se ok. | Setar estado `bootstrapError`, exibir toast/banner e bloquear dashboard. |
| B3 | **P0** | `src/contexts/AuthContext.tsx:95–124` | Race + dep array | `useEffect([])` chama `runBootstrap` mas a fn é redefinida a cada render; `setTimeout(0)` não previne dupla chamada (listener + getSession ambos chamam). | Usar `useRef` p/ guarda OR `useEvent`/`useCallback` estável; deduplicar por `userId`. |
| B4 | **P0** | `src/components/expenses/ExpenseFormDialog.tsx:148–157` | Race em mutation | `reportForDate.mutate` em cada mudança de data, sem cancelamento; `setCurrentReportForDate` pode receber resposta tardia. | Trocar por `useQuery({ queryKey:['report-for-date',date], enabled }) ` ou debounce + AbortController. |
| B5 | **P0** | `src/components/expenses/ExpenseFormDialog.tsx:240–244` | Hook deps erradas | `useEffect` re-valida recibo só com `[watchedDate, watchedAmount]`, ignora `receiptFile`, `receiptValidation.status`, `triggerValidation` (lint warn confirma). Pode validar arquivo já removido. | Incluir deps; ou substituir por callback explícito chamado de handlers. |
| B6 | **P0** | `src/pages/app/ReportDetail.tsx:74–97, 99–120` | Sem try/catch | `mutateAsync` sem try; se `reviewExpense`/`submitReport` lançar, dialog não fecha mas o erro é tratado só pelo onError do hook (toast). UX pode ficar travada (`isPending` ok, mas state local não). | Envolver em try/finally limpando dialog state mesmo em erro. |
| B7 | **P0** | `src/hooks/useReports.ts:69–100, 142–151` | N+1 / waterfall | Para cada relatório faz 2 queries seriais (`report_items`, `profiles`). Para 50 relatórios = 100+ requests. | Mover para uma RPC SQL com agregação ou usar `select('*, items:report_items(...), user:profiles(...)')`. |
| B8 | **P0** | `src/pages/app/Login.tsx:64–96` | Validação fraca | Sem Zod; `password.length < 6` é o único check. Sem confirmação de email. | `zodResolver` com schema (email, password ≥ 8, complexidade). |
| B9 | **P1** | `src/hooks/useExpenses.ts:132` | Type-cast inseguro | `payment_method as any` para escapar enum do supabase types. | Garantir enum no tipo gerado e remover `any`. |
| B10 | **P1** | `src/hooks/useReports.ts:138–157` | Cast `as any` em tabela | `from('expense_reviews' as any)` indica que types do Supabase não foram regerados. Bugs de schema podem passar despercebidos. | Rodar `supabase gen types typescript` e remover. |
| B11 | **P1** | `src/pages/app/ReportDetail.tsx:408–536` | React key warning | `<>` fragment dentro de `.map()` sem `key` (loop renderiza `<TableRow>` + linha de comentário). React vai warnar e a re-renderização fica imprevisível. | Usar `<React.Fragment key={item.id}>` em vez de `<>`. |
| B12 | **P1** | `src/pages/app/Dashboard.tsx:39, 42, 182, 192` | Cast `(e as any).report` | `Expense` já tipa `report?`; o cast some com checagem TS. Indica modelo desalinhado. | Remover `any`, usar campos tipados. |
| B13 | **P1** | `src/pages/app/Login.tsx:50–62` | `setIsLoading(false)` após navigate | Em sucesso, `setIsLoading(false)` ocorre **após** `navigate()`, mas o componente é desmontado. State update em unmounted component (warn). Inofensivo, mas indício de padrão fraco. | Mover `setIsLoading(false)` antes de navigate. |
| B14 | **P1** | `src/contexts/AuthContext.tsx:44–63` | Sem error handling em `fetchProfile` | `await supabase.from('profiles')...single()` — se 0 rows, `data === null` e nada acontece (sem set). Ok, mas se erro de rede, usuário silenciosamente sem perfil. | Tratar `error` explicitamente. |
| B15 | **P1** | `src/hooks/useReports.ts:330–367` | Lógica duplicada | `useSubmitReport` (em `useReports.ts`) e `useSubmitReportRpc` (em `useCurrentReport.ts`) coexistem; o primeiro faz updates manuais (não usa RPC com cycle/late). Risco de divergência se chamado por engano. | Consolidar — manter só RPC. |
| B16 | **P1** | `src/components/expenses/ExpenseFormDialog.tsx:247–260` | Sem cleanup do FileReader | `reader.readAsDataURL` em `handleFileChange` sem abort se componente desmontar mid-read. Memory leak menor + warn. | Cleanup ou `URL.createObjectURL` + `URL.revokeObjectURL`. |
| B17 | **P2** | `src/components/expenses/ExpenseFormDialog.tsx:102–114` | Schema recriado a cada render | `formSchema` é redefinido toda render; `useForm` foi inicializado com schema antigo, mudanças em `policy` não atualizam validação ativa. | `useMemo` no schema + `form.reset` ao mudar policy. |
| B18 | **P2** | `src/pages/app/Reports.tsx:212–214` | `useNavigate` duplicado | Hook chamado em `Reports` e em `ReportsContent` (subcomponente). Ok, mas redundante. | Passar via prop. |
| B19 | **P2** | `src/components/expenses/ExpenseFormDialog.tsx:138–145` | Loop/derivação | `useEffect` para derivar `selectedCategory` de `watchedCategoryId` poderia ser `useMemo`. Causa re-render extra. | Substituir por `useMemo`. |
| B20 | **P2** | `src/hooks/useInvites.ts:58–64` | `error: any` + checagem por código | Acoplamento ao código `23505` do Postgres; se RLS rejeitar, mensagem genérica. | Tipar com `PostgrestError` e tratar `code === '42501'`. |
| B21 | **P2** | `src/App.tsx:21` | `QueryClient` instanciado fora de componente | Em StrictMode pode haver dois clients efêmeros no DEV. Inofensivo em prod, mas atrapalha testes. | `useState(() => new QueryClient())` dentro do App. |

> **Não testei:** suspeitas de subscriptions Supabase realtime sem cleanup — não foram encontradas no escopo lido (não há `supabase.channel(...)`/`.on(...)` em hooks/pages auditados).

---

## 3. Análise dos 50 problemas ESLint (39 erros + 11 warnings)

| Categoria | Qtde | Tipo | Bug real? |
|-----------|------|------|-----------|
| `@typescript-eslint/no-explicit-any` | **34 erros** | Tipagem | **Bug latente.** Em `useReports`, `useExpenses`, `Dashboard`, `ReportDetail`, `SettingsPolicy` o `any` mascara modelo real. Tsconfig com `strict:false` agrava — reduz a 0 garantia de contrato. **Prioridade alta**. |
| `@typescript-eslint/no-empty-object-type` | 2 erros (`command.tsx`, `textarea.tsx`) | shadcn boilerplate | Ruído. shadcn padrão. |
| `@typescript-eslint/no-require-imports` | 1 erro (`tailwind.config.ts:113`) | Build config | Ruído (config Tailwind, não roda no app). |
| `react-hooks/exhaustive-deps` | 3 warns (`AuthContext:124`, `ExpenseFormDialog:157, 244`) | **Bugs reais** | **B3, B4, B5** acima — race conditions e validação stale. |
| `react-refresh/only-export-components` | 7 warns (UI shadcn + `AuthContext:182`) | DX/HMR | Ruído nos UI; em `AuthContext` é minor (export de `useAuth` junto com `AuthProvider`). |
| `@typescript-eslint/no-explicit-any` (catch errors em `useInvites`, `Login`) | 2 | Type | Aceitável onde só extrai `.message`, mas idealmente `unknown`. |

**Score real:** ~3 bugs (race conditions de hooks) + 34 sintomas de erosão de tipo. **~7 ruídos** (shadcn boilerplate + Fast Refresh). Recomendado:
- Fixar `react-hooks/exhaustive-deps` imediatamente (B3, B4, B5).
- Fazer pass de `any → unknown/typed` nos hooks `useReports`, `useExpenses`, `useReviewExpense` antes de qualquer feature.
- Suprimir os 7 warns de UI shadcn no `.eslintrc` (`overrides` para `src/components/ui/*`).
- `tailwind.config.ts:113` — converter `require` para import ESM.

---

## 4. Plano de Testes Mínimo — "Sistema Funcional"

### Fluxo crítico 1 — Onboarding & lifecycle de despesa
> signup → bootstrap → criar despesa → adicionar a relatório → submeter → aprovar → marcar paga

| Passo | Componente / hook | Tipo | Estimativa |
|-------|-------------------|------|------------|
| Signup com schema Zod | `Login.tsx` (form refatorado) | unit (RTL) | S |
| `bootstrapUser()` retorna 4 status | `useBootstrap` | unit (mock supabase) | S |
| `AuthProvider` reage a `onAuthStateChange` e seta `profile` | `AuthContext` | integration (RTL + msw) | M |
| `useCreateExpense` insere com `org_id`/`user_id` | `useExpenses` | unit (mock supabase) | S |
| `ExpenseFormDialog` valida required-receipt + Zod policy | componente | integration (RTL) | M |
| `useAddExpenseToReport` invalida queries certas | `useReports` | unit | S |
| `useSubmitReportRpc` chama `submit_report` e trata `submitted_late` | `useCurrentReport` | unit | S |
| `useApproveReportRpc` (decision='approved') | `useReportActions` | unit | S |
| `useMarkReportPaidRpc` | `useReportActions` | unit | S |
| **E2E full flow** | `ReportDetail` | e2e (Playwright contra Supabase test) | **L** |

### Fluxo crítico 2 — Recibo & validação OCR
> upload imagem → HEIC convert → OCR validate → divergence warning → submit

| Passo | Componente / hook | Tipo | Estimativa |
|-------|-------------------|------|------------|
| `convertHeicToJpeg` happy + erro | `lib/convertHeic` | unit | S |
| `useValidateReceipt.validate` (success/warning/error/low-confidence) | hook | unit (mock `functions.invoke`) | M |
| `ReceiptUpload` aceita formatos válidos, rejeita inválidos | componente | unit (RTL) | S |
| Re-validação ao mudar data/valor (B5) | `ExpenseFormDialog` | integration | M |
| Storage upload path correto (`org/user/report/expense/file`) | `uploadReceipt` extraído | unit | S |
| **E2E** com fixture de imagem | flow | e2e | L |

### Fluxo crítico 3 — Convite & roles
> admin convida → email → /login?invite=token → signup → role correto + org correto

| Passo | Componente / hook | Tipo | Estimativa |
|-------|-------------------|------|------------|
| `useCreateInvite` insere com `invited_by` e role | hook | unit | S |
| `getInviteLink` formata URL | função pura | unit | S |
| **`Login.tsx` consome `?invite=` e passa para signUp/RPC** (atualmente quebrado — B1) | componente | integration | **M** |
| `bootstrap_user` no caminho `invited` retorna org correto | hook (mock RPC) | unit | S |
| `user_roles` correto após bootstrap | `AuthContext` | integration | M |
| Tentativa de admin-action sem role → 401 RLS | `useApproveReportRpc` | integration (RLS test contra Supabase local) | L |
| **E2E**: admin convida, novo usuário aceita | full | e2e | L |

### Cobertura mínima desejada
- **Hooks (`src/hooks/*`)**: 80% de branches (queries, mutations, onError, onSuccess invalidations).
- **`AuthContext`**: 90% (lifecycle).
- **Páginas críticas**: 50% de fluxos felizes + cenários de erro.
- **E2E**: 3 jornadas acima (Playwright).

**Setup necessário (não existe hoje):**
- `msw` para mock de Supabase REST/RPC em testes de hooks.
- `vi.mock('@/integrations/supabase/client')` factory padronizada em `src/test/mocks/supabase.ts`.
- `renderWithProviders` (QueryClient + AuthContext mock + Router) em `src/test/utils.tsx`.
- Fixtures: `src/test/fixtures/{user,profile,expense,report,invite}.ts`.
- Playwright config com seed via `supabase db reset` + RPC fixtures.

---

## 5. Cobertura por Módulo

| Módulo | LOC aprox | Cobertura atual | Risco | Prioridade de teste |
|--------|-----------|-----------------|-------|---------------------|
| `src/contexts/AuthContext.tsx` | 188 | 0% | **CRÍTICO** (autenticação, bootstrap) | P0 |
| `src/hooks/useBootstrap.ts` | 19 | 0% | ALTO | P0 |
| `src/hooks/useExpenses.ts` | 458 | 0% | ALTO (lógica getExpenseTab + filtros) | P0 |
| `src/hooks/useReports.ts` | 450 | 0% | ALTO (N+1, lifecycle status) | P0 |
| `src/hooks/useCurrentReport.ts` | 190 | 0% | ALTO (RPC critical path) | P0 |
| `src/hooks/useReportActions.ts` | 58 | 0% | ALTO (admin actions) | P0 |
| `src/hooks/useReviewExpense.ts` | 47 | 0% | MÉDIO (upsert review) | P1 |
| `src/hooks/useValidateReceipt.ts` | 145 | 0% | MÉDIO (OCR) | P1 |
| `src/hooks/useInvites.ts` | 88 | 0% | ALTO (B1 fluxo quebrado) | P0 |
| `src/hooks/usePolicy.ts` | 287 | 0% | MÉDIO | P1 |
| `src/hooks/useExpenseTypes.ts` | ? | 0% | MÉDIO | P1 |
| `src/hooks/useDepartments.ts` | ? | 0% | BAIXO | P2 |
| `src/pages/Login.tsx` | 323 | 0% | **CRÍTICO** | P0 |
| `src/pages/app/Dashboard.tsx` | 268 | 0% | MÉDIO (display only) | P1 |
| `src/pages/app/Expenses.tsx` | 439 | 0% | ALTO (filters + bulk) | P0 |
| `src/pages/app/Reports.tsx` | 383 | 0% | ALTO | P0 |
| `src/pages/app/ReportDetail.tsx` | 748 | 0% | **CRÍTICO** (approve/reject/pay) + B6, B11 | P0 |
| `src/pages/app/SettingsTeam.tsx` | ? | 0% | ALTO (cria invites) | P0 |
| `src/pages/app/SettingsPolicy.tsx` | ? | 0% | MÉDIO | P1 |
| `src/components/expenses/ExpenseFormDialog.tsx` | 657 | 0% | **CRÍTICO** (B4, B5, B17) | P0 |
| `src/components/expenses/ReceiptUpload.tsx` | 177 | 0% | ALTO | P1 |
| `src/components/expenses/ReceiptValidation.tsx` | ? | 0% | MÉDIO | P1 |
| `src/components/reports/ApprovalQueue.tsx` | ? | 0% | ALTO | P0 |
| `src/components/ui/*` | shadcn | n/a | BAIXO | dispensável |
| `src/lib/convertHeic.ts` | ? | 0% | MÉDIO | P1 |
| `src/lib/constants.ts` (formatCurrency, formatDate) | ? | 0% | BAIXO (puro) | P2 |
| `src/integrations/supabase/client.ts` | gerado | n/a | n/a | n/a |
| `src/test/example.test.ts` | 1 teste trivial | — | — | substituir |

---

## 6. Veredicto Funcional

### O sistema está "funcional" hoje?

**NÃO. Parcialmente operacional para usuário interno controlado, NÃO operacional para release.**

**Critérios objetivos usados:**

| Critério | Estado |
|----------|--------|
| Auth + bootstrap robustos com tratamento de erro | ❌ B2, B3 |
| Fluxo de convite end-to-end | ❌ B1 (token nunca consumido) |
| Autorização defendida no servidor (RLS/RPC) | ⚠️ assumido (Dara cobre) — client está confiando em flags locais |
| CRUD despesa + recibo sem race | ❌ B4, B5, B17 |
| Submit/approve/pay sem regressão de status | ⚠️ B6, B15 (dois caminhos) — funciona no happy path |
| Validação de inputs sensíveis | ❌ B8 (sem Zod no Login) |
| Cobertura mínima de testes para CI bloquear regressões | ❌ ~0% |
| Tipagem confiável | ❌ 34 `any` + `strict:false` |
| Sem warnings React (keys, hook deps) | ❌ B11, B5 |

### Para virar "funcional para QA aceitar release":

1. **Bloqueadores (não passa)**: B1, B2, B3, B4, B5, B6, B8, B11.
2. **Setup de testes**: msw + render utility + fixtures (S).
3. **Cobertura mínima**: hooks críticos (`AuthContext`, `useBootstrap`, `useExpenses`, `useReports`, `useCurrentReport`, `useReportActions`, `useInvites`) com unit; 1 e2e cobrindo fluxo 1 (signup→approve→paid).
4. **Reativar `strict: true` no `tsconfig`** ou no mínimo `noImplicitAny: true` antes de novas features.

### Estimativa total para "funcional"
- Bug fixes P0 (8 itens): ~3–5 dias dev.
- Setup de testes + suite mínima: ~3–4 dias dev.
- E2E happy paths Playwright: ~2 dias.
- **Total: 8–11 dias de QA-engineering antes de declarar release-ready.**

---

*Quinn — relatório QA. Não modifiquei código, apenas observei. Coordenar com Aria (arquitetura) sobre B7/B15, com Dara (RLS) sobre B6/RBAC, com Atlas (gap) sobre validações ausentes vs VExpenses.*
