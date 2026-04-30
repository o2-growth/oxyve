# Oxy VE — Action Plan Consolidado (Fase 2 / Morgan / PM)

**Data:** 2026-04-30
**Autora:** Morgan (Product Manager)
**Inputs:** Aria (arquitetura), Dara (segurança), Atlas (competitivo), Atlas-Screens (UI VExpenses), Quinn (QA), logs 00-*.
**Status do code:** typecheck OK · 39 erros + 11 warns ESLint · 1 teste · bundle 2.36 MB / 624 KB gzip.
**Decisão estratégica de partida (usuário):** posicionamento "cópia melhorada" do VExpenses para PMEs self-serve com OCR + IA + free tier + NF-e; entrega preferencial em PR único.

---

## 1. Resumo Executivo

**Estado atual:** core funcional do MVP (auth, despesa, relatório, aprovação, OCR) implementado, mas com 3 vulnerabilidades RLS Crítica/Alta que permitem privilege escalation e cross-org takeover, fluxo de convite quebrado ponta-a-ponta, ausência total de testes e bundle não otimizado.

**Issues por severidade (consolidado):**

| Severidade | Qtd | Exemplos |
|---|---|---|
| **P0** | **13** | DARA-001/002/003, B1, B2, B3, B4, B5, B6, B8, B11 (Quinn), Race Bootstrap (Aria), N+1 useReports |
| **P1** | **22** | DARA-004/005/006/007, B7-B16 (Quinn), bundle splitting, strict TS, error boundary, expense_reviews types, gaps G-003/005/008/009/012/021/022 |
| **P2** | **18** | DARA-008/009/010, B17-B21, hooks duplicados, ESLint cleanup, gaps G-001/006/007/010/011/013/014/016/017 |
| **P3** | **9** | DARA-011/012, gaps G-002/015/018/019/020/023, lovable cleanup |
| **Total** | **62** | |

**Veredicto produção-ready: NÃO. Condicional após Sprint 0+1.** Em produção hoje, qualquer usuário autenticado vira admin com 1 linha JS no console (DARA-001) e qualquer Gmail entra na primeira org Gmail registrada (DARA-002). Sem fix, lançar é negligência de segurança e LGPD.

**Recomendação de PR: SPLIT em 2 PRs (override polite da pedida do usuário).** Justificativa em §5. Sprint 0 (segurança) **não pode** esperar review do Sprint 1+2+3 — cada dia em produção atual é passivo legal. PR1 ≤ 200 linhas, mergea em 1 dia; PR2 fica para review profundo.

**Estimativa total para release-ready:** **22–28 dias-pessoa** distribuídos em 4 sprints (uma engenheira full-time + 1 consulta SQL Dara + 1 QA Quinn meio-período). Detalhes em §4.

---

## 2. Decisão de Produto

### 2.1 Posicionamento — confirmar "cópia melhorada"

**Confirmado.** Os screens de Atlas mostram que a paridade visual é trivial (1-2 dias de tokens shadcn) e a paridade funcional do core (despesa→relatório→aprovação→pago) já existe em qualidade comparável. VExpenses tem fraqueza pública de suporte (6.3/10 Reclame Aqui) e ausência de free tier — espaço claro para PME self-serve.

**Recortes deliberados (NÃO entrar agora):**
- Cartão corporativo Mastercard — exige licença/contrato Mastercard+Cielo, regulação Bacen.
- Viagens (voos/hotéis) — exige integração GDS (Amadeus/Sabre).
- Frota / GPS tracking — fora do core financeiro.
- Multinível de aprovação — postergar para v1.1 (PMEs com <50 funcionários raramente usam).

### 2.2 Definição de "sistema funcional" mínimo (MVP release)

**Bloqueantes para release inicial:**
1. Auth + bootstrap sem race + sem privilege escalation (DARA-001/002/003 + B1/B2/B3).
2. Convite por email funcionando ponta-a-ponta (B1).
3. CRUD de despesa com upload + OCR sem race (B4/B5).
4. Submeter relatório → aprovar/rejeitar → marcar pago (já funciona; estabilizar com B6, B11, B15).
5. **Reembolsável vs não-reembolsável** na despesa (G-003) — gap crítico de modelagem; cartão corporativo não-reembolsável vs gasto pessoal reembolsável é distinção fiscal.
6. **Centro de custos por despesa** (G-005) — já existe na policy mas não é exposto consistentemente no form.
7. **Export CSV/Excel** (G-009) — sem isto, contabilidade não consome o produto.
8. **Notificações por email** (status do relatório) — colaborador precisa saber sem abrir o app.
9. RLS sem leak cross-org (DARA-004/005/006).
10. Bundle ≤ 600 KB gzip + Error Boundary (sem isto, qualquer crash = tela branca).

**Nice-to-have (não bloqueia release, mas entra Sprint 2-3):**
- Adiantamentos completo (G-008 — placeholder existe).
- Rateio (G-007).
- Multimoeda no form com taxa de câmbio (G-004).
- Histórico/audit trail visível por relatório (G-011).
- KPIs reembolsável/não-reembolsável no header de Reports (G-013/014).
- Tabs com contadores (G-016).
- Bulk action "adicionar a relatório" (G-017).

**Diferenciais "cópia melhorada" (Sprint 3 — ataque comercial):**
- IA categorização automática pós-OCR (já temos GPT-4o-mini integrado).
- Detecção de duplicidade cross-relatório (extensão do OCR).
- Free tier até 5 usuários / 10 despesas/mês.
- NF-e parser (XML SEFAZ).
- Wizard de onboarding em 5 passos.

### 2.3 Posicionamento de mercado (2 linhas)

> **Oxy VE — gestão de despesas para PMEs brasileiras que não querem reunião comercial.** Self-serve, free tier até 5 usuários, OCR+IA no lançamento, integração nativa NF-e, dashboard executivo sem Power BI. Para empresas <50 funcionários onde VExpenses cobra onboarding e demora 20min no suporte.

---

## 3. Issues Consolidadas (priorizado P0 → P3)

> Origem: ARIA / DARA / QUINN / ATLAS (gap funcional) / GAP (screens VExpenses)
> Tipo: bug | security | perf | feature | tech-debt | test | ux
> Esforço: S = ≤2h · M = ≤1d · L = ≤3d · XL = >3d

### 3.1 P0 — Bloqueantes de produção

| ID | Origem | Tipo | Título | Sev | Esforço | Impacto | Arquivo/Local | Ação |
|---|---|---|---|---|---|---|---|---|
| DARA-001 | DARA | security | Self-grant de role admin via RLS `user_roles` INSERT | P0 | S | Privilege escalation total — qualquer auth vira admin | `migrations/20260208154124_*.sql:185-188` | Aplicar `patches/P0-fix-user-roles.sql`: drop policy de INSERT, criar `admin_assign_role()` SECURITY DEFINER |
| DARA-002 | DARA | security | `bootstrap_user()` agrupa Gmails em mesma org | P0 | M | Cross-org takeover — todo Gmail vira employee da 1ª org Gmail | `migrations/20260208163752_*.sql:127-180` | Aplicar `patches/P0-fix-bootstrap-user.sql`: blocklist de domínios públicos + email_confirmed_at + token validado |
| DARA-003 | DARA | security | `org_invites` aceita sem validar token criptográfico | P0 | M | Atacante com mesmo email auto-aceita invite mais recente | mesma migration | Mesmo patch acima — exigir `p_invite_token` no `bootstrap_user()` |
| B1 | QUINN | bug | Convite quebrado: token lido mas não consumido | P0 | M | Usuário convidado vira `domain_match`/`new_org`, fluxo Team morto | `src/pages/Login.tsx:39, 79-96` | Passar `inviteToken` em `signUp.options.data` E chamar `bootstrap_user(p_invite_token)` após signup |
| B2 | QUINN | bug | `runBootstrap` engole erro com console.error | P0 | S | Usuário sem org_id vê app carregando para sempre | `src/contexts/AuthContext.tsx:82-86` | Setar `bootstrapError` state, mostrar banner, bloquear dashboard |
| B3 / Aria-1 | QUINN+ARIA | bug | Race condition `runBootstrap` chamado 2x (onAuthStateChange + getSession) | P0 | S | 2x RPC bootstrap por sessão, possível inconsistência | `AuthContext.tsx:97-124` | Remover bloco `getSession()` separado; usar APENAS `onAuthStateChange` + `useRef` guard por userId |
| B4 | QUINN | bug | Race em `ExpenseFormDialog.reportForDate.mutate` por keystroke | P0 | M | Resposta antiga sobrescreve `currentReportForDate` | `ExpenseFormDialog.tsx:148-157` | Trocar mutation por `useQuery({ queryKey:['report-for-date',date] })` com debounce |
| B5 | QUINN | bug | `useEffect` re-valida recibo com deps incompletas | P0 | S | Pode validar arquivo já removido | `ExpenseFormDialog.tsx:240-244` | Incluir `receiptFile`, `receiptValidation.status`, `triggerValidation` nas deps OU substituir por callback explícito |
| B6 | QUINN | bug | `mutateAsync` sem try/catch em ReportDetail | P0 | S | UX trava (`isPending` ok mas state local não) | `ReportDetail.tsx:74-97, 99-120` | Wrap em try/finally limpando dialog state em erro |
| B8 | QUINN | bug | Login sem schema Zod (password ≥6, sem regex email) | P0 | S | Validação fraca; senhas frágeis aceitas | `src/pages/Login.tsx:64-96` | `zodResolver` com schema (email válido, password ≥8, complexidade) — também aplicar em `useCreateInvite` |
| B11 | QUINN | bug | Fragment `<>` em `.map()` sem key em ReportDetail | P0 | S | Re-render imprevisível, React warn | `ReportDetail.tsx:408-536` | Trocar `<>` por `<React.Fragment key={item.id}>` |
| Aria-2 | ARIA | perf | N+1 queries em useReports (N×2+1 por acesso) | P0 | M | Latência O(N); 100 reports = 201 queries | `useReports.ts:69-105` | Substituir Promise.all por single `select('*, user:profiles(...), items:report_items(expense:expenses(...))')` |
| GAP-G003 | GAP | feature | Reembolsável vs não-reembolsável na despesa | P0 | S | Distinção fiscal essencial (cartão corp vs pessoal) | `ExpenseFormDialog`, `Expense` interface | Campo já existe parcial — garantir checkbox no form, badge na tabela, KPI no relatório |

### 3.2 P1 — Bloqueantes de "release-ready" qualidade

| ID | Origem | Tipo | Título | Sev | Esforço | Impacto | Arquivo/Local | Ação |
|---|---|---|---|---|---|---|---|---|
| DARA-004 | DARA | security | `expense_reviews` UPDATE sem revalidar org_id | P1 | S | Manager que mudou de org continua editando reviews antigas | migration `20260223161405` | `patches/P1-fix-cross-org-leaks.sql` (pronto) |
| DARA-005 | DARA | security | Usuário muda próprio `org_id` (cross-org migration self-service) | P1 | S | Pula para org da vítima e lê tudo | `migrations/20260208154124_*.sql:165-167` | `patches/P0-fix-profile-update.sql` (pronto) — WITH CHECK que trava org_id |
| DARA-006 | DARA | security | `report_approvals` SELECT permite manager ler approvals de outra org | P1 | S | Cross-org leak de aprovações | mesma migration | Patch P1 (pronto) |
| DARA-007 | DARA | security | `org_domains` sem normalização nem CHECK de domínio público | P1 | S | Reforça DARA-002 | mesma | Patch P0-bootstrap (pronto) — CHECK constraints |
| Aria-3 | ARIA | perf | Bundle 2.3MB sem code-splitting | P1 | M | TTI > 2s em 4G; bundle inicial inviável | `vite.config.ts`, `App.tsx` | `manualChunks` (vendor-react/query/supabase/charts/radix) + `React.lazy` por rota + `<Suspense>` |
| Aria-4 | ARIA | tech-debt | TypeScript `strict: false` + `noImplicitAny: false` | P1 | M | 39 erros `any` mascaram bugs reais | `tsconfig.app.json:21-24` | Ativar `strictNullChecks: true` primeiro, depois `noImplicitAny: true` (incremental) |
| Aria-5 | ARIA | bug | Ausência de Error Boundary | P1 | S | Qualquer exceção = tela branca | `App.tsx` | Criar `src/components/ErrorBoundary.tsx`, envolver `<AppRoutes />` |
| Aria-6 | ARIA | tech-debt | `expense_reviews` não está em `types.ts` (cast `as any`) | P1 | S | Erros de schema invisíveis | `useReports.ts:138`, `useReviewExpense.ts:24`, `types.ts` | `supabase gen types typescript --local > src/integrations/supabase/types.ts` |
| Aria-7 | ARIA | perf | QueryClient sem `staleTime` (refetch em toda montagem) | P1 | S | Excesso requests, skeletons piscando | `App.tsx:21` | `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1` |
| B7 | QUINN | perf | Mesma issue Aria-2 (N+1 useReports) | P1 | M | duplicado | — | — |
| B9 | QUINN | tech-debt | `payment_method as any` em useExpenses | P1 | S | Enum não tipado | `useExpenses.ts:132` | Garantir enum em types gerados |
| B10 | QUINN | tech-debt | Cast `as any` em expense_reviews | P1 | S | Ver Aria-6 | — | Mesmo fix |
| B12 | QUINN | tech-debt | Cast `(e as any).report` em Dashboard | P1 | S | Modelo Expense.report? não está sendo usado | `Dashboard.tsx:39, 42, 182, 192` | Remover any, usar campos tipados |
| B13 | QUINN | bug | `setIsLoading(false)` após navigate | P1 | S | State update em unmounted (warn) | `Login.tsx:50-62` | Mover antes do navigate |
| B14 | QUINN | bug | `fetchProfile` sem error handling | P1 | S | Erro de rede silencioso | `AuthContext.tsx:44-63` | Tratar `error` |
| B15 | QUINN | bug | Lógica duplicada `useSubmitReport` vs `useSubmitReportRpc` | P1 | S | Risco de divergência | `useReports.ts:330-367`, `useCurrentReport.ts:166-189` | Remover a manual, manter só RPC |
| B16 | QUINN | bug | FileReader sem cleanup em handleFileChange | P1 | S | Memory leak menor | `ExpenseFormDialog.tsx:247-260` | Cleanup OR `URL.createObjectURL`+`revokeObjectURL` |
| GAP-G005 | GAP | feature | Centro de custos por despesa | P1 | S | Já existe na policy, falta exposição | ExpenseFormDialog | Garantir dropdown no form + filtro |
| GAP-G008 | GAP | feature | Adiantamentos (placeholder Q2 2024 ridículo) | P1 | XL | Paridade VExpenses + crédito de fluxo de viagem | `Advances.tsx:29` | Modelar tabela `advances`, CRUD, vincular ao report |
| GAP-G009 | GAP | feature | Export CSV + Excel + PDF de relatório | P1 | M | Contabilidade não consome sem isto | `ReportDetail.tsx` | Edge function `export-report` (csv via supabase, xlsx via sheetjs, pdf via puppeteer-core) |
| GAP-G012 | GAP | feature | Notificações persistentes + email automático | P1 | L | Colaborador precisa saber status sem abrir app | nova tabela `notifications` + edge fn | trigger SQL onChange de report.status → enqueue email via Resend |
| GAP-G021 | GAP | feature | Dados bancários no perfil (PIX/agência/conta) | P1 | M | Reembolso direto sem RH | `SettingsProfile.tsx`, schema profiles | Adicionar campos + validação |
| GAP-G022 | GAP | feature | CPF/CNPJ + dados fiscais no perfil | P1 | S | Base para integração contábil/NF-e | mesma | Adicionar campo + validador CPF |

### 3.3 P2 — Polish e paridade

| ID | Origem | Tipo | Título | Sev | Esforço | Impacto | Arquivo/Local | Ação |
|---|---|---|---|---|---|---|---|---|
| DARA-008 | DARA | security | `handle_new_user` legacy NO-OP + trigger ainda existe | P2 | S | Estado inconsistente se signup bypass | migration | Drop trigger OU lógica defensiva |
| DARA-009 | DARA | security | Edge fn `validate-receipt` sem auth/rate-limit/size | P2 | M | Financial DoS via OpenAI | `functions/validate-receipt/index.ts` | Validar JWT, limitar 5MB, CORS restrito |
| DARA-010 | DARA | security | `submit_report` não checa org_id | P2 | S | Defesa em profundidade | migration `20260208183022` | `AND org_id = _org_id` na query |
| Aria-8 | ARIA | tech-debt | Hooks duplicados `useCostCenters`/`useProjects` em useExpenses + usePolicy | P2 | S | Cache inconsistente | useExpenses.ts:424, usePolicy.ts:83 | Centralizar em `useCostCenters.ts`/`useProjects.ts` |
| Aria-9 | ARIA | tech-debt | `ExpenseReviewBadge` definido inline na página | P2 | S | Remount desnecessário | `ReportDetail.tsx:139-155` | Extrair para `src/components/reports/ExpenseReviewBadge.tsx` |
| Aria-10 | ARIA | tech-debt | `useCurrentReport` exportado mas não consumido | P2 | S | Código morto | `useCurrentReport.ts:38-49` | Remover ou documentar |
| Aria-11 | ARIA | observ | `console.error` sem Sentry/observabilidade | P2 | M | Erros prod invisíveis | múltiplos | Integrar Sentry (free tier) |
| Aria-12 | ARIA | tech-debt | `lovable/index.ts` sem uso bundlado | P2 | S | Dependência supply-chain ociosa | `integrations/lovable/index.ts` | Remover + uninstall |
| Aria-13 | ARIA | tech-debt | `tailwind.config.ts` com `require()` | P2 | S | ESLint error em ESM | `tailwind.config.ts:113` | Converter para `import` |
| Aria-14 | ARIA | ux | `Advances.tsx` "Q2 2024" hardcoded | P2 | S | Credibilidade prejudicada | `Advances.tsx:29` | Ver GAP-G008 (resolve) |
| B17 | QUINN | bug | `formSchema` recriado a cada render em ExpenseFormDialog | P2 | S | Validação stale ao mudar policy | `ExpenseFormDialog.tsx:102-114` | `useMemo` no schema + `form.reset` ao mudar policy |
| B18 | QUINN | tech-debt | `useNavigate` duplicado | P2 | S | Redundância | Reports.tsx:212-214 | Pass via prop |
| B19 | QUINN | perf | `useEffect` para derivar selectedCategory | P2 | S | Re-render extra | ExpenseFormDialog.tsx:138-145 | `useMemo` |
| B20 | QUINN | bug | `error: any` + checagem por código 23505 | P2 | S | Acoplamento frágil | useInvites.ts:58-64 | Tipar `PostgrestError`, tratar 42501 |
| B21 | QUINN | tech-debt | QueryClient instanciado fora do componente | P2 | S | Strict Mode duplica em DEV | App.tsx:21 | `useState(() => new QueryClient())` |
| ESLint-any | LOG | tech-debt | 34 erros `@typescript-eslint/no-explicit-any` | P2 | M | Tipagem erodida | múltiplos | Pass de `any → unknown/typed` por arquivo (consequência de Aria-4 + Aria-6) |
| ESLint-shadcn | LOG | tech-debt | 7 warnings `react-refresh/only-export-components` em `components/ui/*` | P2 | S | Ruído boilerplate shadcn | eslint.config.js | Override em `src/components/ui/*` |
| ESLint-misc | LOG | tech-debt | 2 erros `no-empty-object-type` (command/textarea), 1 require-imports | P2 | S | Boilerplate shadcn + tailwind config | command.tsx, textarea.tsx, tailwind.config.ts | Override + ESM import |
| ESLint-deps | LOG | bug | 3 warns `react-hooks/exhaustive-deps` | P2 | S | Já cobertos por B3/B4/B5 | — | (resolve com fixes P0) |
| GAP-G001 | GAP | feature | Percurso/quilometragem manual (km × R$/km) | P2 | L | Equipes de campo | nova feature | Modelo `mileage_entries` + form |
| GAP-G006 | GAP | feature | Projeto como dimensão paralela ao CC | P2 | M | Já existe parcial | usePolicy + form | Expor consistente |
| GAP-G007 | GAP | feature | Rateio entre CC/projetos | P2 | L | Contábil B2B | ExpenseFormDialog + schema | Tabela `expense_splits` + form repeater |
| GAP-G010 | GAP | feature | Email de relatório | P2 | S | Atalho contábil | edge fn | Resend + template |
| GAP-G011 | GAP | feature | Histórico/audit trail visível | P2 | M | Audit trail UX | nova tabela + drawer | tabela `report_events` + componente Timeline |
| GAP-G013/014 | GAP | feature | KPIs no header de Reports + por relatório (4 cards) | P2 | S | UX exec | Reports.tsx, ReportDetail.tsx | Cards reutilizáveis com sumários |
| GAP-G016 | GAP | feature | Tabs com contadores em tempo real | P2 | S | UX | Expenses.tsx, Reports.tsx | Counts via select count |
| GAP-G017 | GAP | feature | Bulk action "Adicionar a relatório" | P2 | M | UX | Expenses.tsx | Multi-select + dialog seletor |

### 3.4 P3 — Pode esperar v1.1

| ID | Origem | Tipo | Título | Esforço | Ação |
|---|---|---|---|---|---|
| DARA-011 | DARA | security | `.env` rastreado no git (anon key pública mas hábito ruim) | S | Adicionar a `.gitignore` + criar `.env.example` |
| DARA-012 | DARA | observ | `report_approvals.approver_id ON DELETE SET NULL` perde audit trail | M | `ON DELETE NO ACTION` ou snapshot |
| GAP-G002 | GAP | feature | Percurso por mapa (Google Maps) | XL | post-MVP |
| GAP-G004 | GAP | feature | Multimoeda com taxa de câmbio | M | post-MVP — campo currency já existe |
| GAP-G015 | GAP | ux | Toggle tabela ↔ gráfico | S | post-MVP |
| GAP-G018 | GAP | ux | Thumbnail anexo na tabela | S | post-MVP |
| GAP-G019 | GAP | feature | App mobile nativo iOS/Android | XL | v2 (PWA primeiro) |
| GAP-G020 | GAP | feature | i18n (EN, ES) | M | v2 |
| GAP-G023 | GAP | ux | Onboarding embutido / Academy | M | post-MVP — mas wizard guiado entra em Sprint 3 |

---

## 4. Roadmap em Sprints

> 4 sprints de 1 semana (5 dias úteis) cada. Owners sugeridos:
> - **Dex** = Full-stack Dev (frontend + edge functions)
> - **Dara** = SQL/RLS (consultora, não modifica código TS)
> - **Gage** = DevOps (CI, deploy, secrets)
> - **Uma** = UX/UI (tokens, componentes shadcn, layouts)
> - **Quinn** = QA (testes, smoke, E2E)

### Sprint 0 — Segurança crítica (3-4 dias) ⚠️ MERGEAR PRIMEIRO

**Objetivo:** produção-safe. Fechar todos os P0 de segurança e os bugs P0 que bloqueiam fluxos básicos.

**Issues:** DARA-001, DARA-002, DARA-003, DARA-005 (já é sql aplicar agora junto), DARA-006, DARA-007, B1, B2, B3, B5, B11.

**Owners:**
- **Dara**: aplica os 4 patches SQL (`P0-fix-user-roles.sql`, `P0-fix-bootstrap-user.sql`, `P0-fix-profile-update.sql`, `P1-fix-cross-org-leaks.sql`) — todos prontos no doc 02. ~2h.
- **Dex**: B1 (fluxo convite — passar token no signUp + chamar `bootstrap_user(p_invite_token)`), B2 (banner de erro bootstrap), B3 (remover getSession() duplicado + useRef guard), B5 (fix deps useEffect ExpenseFormDialog), B11 (Fragment key). ~2 dias.
- **Quinn**: smoke test manual ponta-a-ponta após patches: criar 2 orgs com domínios @gmail.com e validar isolamento; tentar `INSERT INTO user_roles VALUES (auth.uid(),'admin')` e validar 42501. ~0.5d.
- **Gage**: revogar todos os JWTs ativos pós-patch (forçar logout global) + auditar lista de admins atuais para revisão manual.

**Gate de validação Sprint 0:**
- [ ] `INSERT user_roles role=admin` retorna 42501 para non-admin.
- [ ] `UPDATE profiles SET org_id=...` retorna 23514 check_violation.
- [ ] Convite por email: admin convida → email recebido → link com `?invite=token` → signup → usuário entra na org correta com role correto.
- [ ] Login com erro de bootstrap mostra banner (não tela branca, não loading infinito).
- [ ] 2 orgs Gmail isoladas (criar 2 contas Gmail diferentes → 2 orgs distintas).

**Output Sprint 0:** PR1 (segurança).

### Sprint 1 — Funcional mínimo (5 dias)

**Objetivo:** estabilizar o core e atingir critérios de "release qualidade" técnica.

**Issues:** B4, B6, B8 (Zod Login), DARA-004, DARA-009 (edge fn auth+rate-limit), DARA-010, Aria-2/B7 (N+1 useReports), Aria-3 (bundle splitting), Aria-5 (Error Boundary), Aria-6/B10 (regen types), Aria-7 (staleTime), B9, B12, B13, B14, B15, B16, GAP-G003 (reembolsável UI).

**Owners:**
- **Dex**: ~4 dias — fix B4 (substituir mutation por useQuery), B6 (try/finally), B8 (Zod schema Login + Invite), Aria-2 (single select com join), Aria-3 (manualChunks + React.lazy), Aria-5 (ErrorBoundary), Aria-6 (regen types + remover any), Aria-7 (staleTime), B9/B12-B16 (cleanup), GAP-G003 (UI checkbox + badge + KPI).
- **Dara**: ~0.5d — DARA-004 + DARA-010 (revisar policies já patchadas no Sprint 0; aqui complementam defesa em profundidade).
- **Gage**: ~0.5d — DARA-009 (edge function: JWT check, payload limit, CORS restrito), CI rodando ESLint+typecheck+vitest em PR.
- **Quinn**: ~3 dias paralelos — setup msw + render utility + fixtures; testes unitários de `useBootstrap`, `useCreateExpense`, `useSubmitReportRpc`, `useApproveReportRpc`, `useMarkReportPaidRpc`; 1 E2E Playwright cobrindo signup→approve→paid.

**Gate de validação Sprint 1:**
- [ ] Bundle inicial ≤ 600 KB gzip (medido por `vite build`).
- [ ] Tela "Reports" carrega com 1 query (não N+1).
- [ ] `vitest run` ≥ 15 testes passando.
- [ ] 1 E2E Playwright passando no CI.
- [ ] Crashar um componente intencionalmente mostra fallback do ErrorBoundary.
- [ ] Tentar usar OCR sem JWT retorna 401.

### Sprint 2 — Paridade competitiva (5 dias)

**Objetivo:** fechar gaps que tornam "cópia melhorada" recomendação real.

**Issues:** GAP-G005 (CC por despesa expor), GAP-G008 (adiantamentos completos), GAP-G009 (export CSV+Excel+PDF), GAP-G012 (notificações + email), GAP-G021 (dados bancários), GAP-G022 (CPF/CNPJ), GAP-G013/014 (KPIs reembolsável), GAP-G016 (tabs com counters), Aria-4 (strictNullChecks).

**Owners:**
- **Dex**: 4 dias — GAP-G008 (modelagem advances + CRUD + vincular relatório), GAP-G009 (edge fn export-report com sheetjs+puppeteer-core), GAP-G012 (tabela notifications + trigger SQL + Resend email), GAP-G021/022 (campos profile + validação CPF), GAP-G013/014/016 (UI tweaks).
- **Dara**: 0.5d — schema migrations para `advances`, `notifications`, novos campos em `profiles`, trigger de notificação.
- **Uma**: 1d — design dos novos cards KPI + tabs com contadores + drawer de histórico se Sprint 2 puxar G-011.
- **Quinn**: 1.5d paralelo — testes para fluxo advance + export + email notification.

**Gate de validação Sprint 2:**
- [ ] Admin convida → invite consumido → colaborador cria despesa reembolsável + não-reembolsável → submete relatório → recebe email automático ao aprovar/rejeitar/pagar.
- [ ] Export CSV/Excel/PDF do relatório baixa arquivo válido.
- [ ] Adiantamento criado → vinculado a relatório → rebaixado do total reembolsável.
- [ ] strictNullChecks ativado, build sem erro.

### Sprint 3 — Polimento e diferenciação (5 dias)

**Objetivo:** lint zerado, testes mínimos completos e 2 diferenciais "cópia melhorada".

**Issues:** ESLint cleanup completo (Aria-13, todos os any), Aria-8/9/10/11/12, B17-B21, DARA-008, DARA-011, DARA-012, GAP-G011 (audit trail), GAP-G017 (bulk action), GAP-G023 parcial (wizard onboarding 5 passos), Diferencial 1 (IA categorização auto pós-OCR), Diferencial 2 (NF-e parser XML).

**Owners:**
- **Dex**: 3 dias — limpeza any, hooks duplicados consolidados, Sentry, Lovable removido, audit trail timeline, bulk action, wizard onboarding.
- **Dex (IA features)**: 2 dias — extender edge fn `validate-receipt` para sugerir categoria via histórico org; criar edge fn `parse-nfe-xml`.
- **Quinn**: 2 dias — completar suíte: AuthContext (90%), useExpenses, useReports, useCurrentReport, useReportActions, useInvites; 2 E2E adicionais (convite, OCR+HEIC).
- **Gage**: 0.5d — rotacionar anon key se DARA-011 fix; configurar Sentry DSN em env.
- **Uma**: 1d — design wizard onboarding 5 passos.

**Gate de validação Sprint 3:**
- [ ] 0 erros ESLint, ≤ 5 warnings (boilerplate shadcn permitido).
- [ ] Cobertura ≥ 60% nos hooks de domínio.
- [ ] 3 E2E Playwright (signup-approve-paid, convite, OCR).
- [ ] OCR sugere categoria automática para 5 categorias mais comuns.
- [ ] NF-e XML upload preenche 80% dos campos da despesa.
- [ ] Wizard onboarding cobre: org → política → tipos despesa → CC → convite primeiro membro.

---

## 5. Decisão sobre PR

### Análise das opções

**Opção A — PR único (preferência declarada do usuário):**
- ✅ Single source of truth, simplicidade de merge.
- ❌ ~2.500 linhas modificadas, 4 sprints de mudança simultânea.
- ❌ Review de PR único deste tamanho leva 3-5 dias e ninguém faz bem.
- ❌ **Bloqueia o fix de segurança até tudo estar pronto** — cada dia em produção atual é exposição de DARA-001.
- ❌ Rollback de qualquer issue obriga reverter o conjunto.

**Opção B — 2 PRs (Sprint 0 separado, Sprint 1+2+3 juntos):**
- ✅ PR1 ≤ 200 linhas, mergeável em 1 dia, fecha exposição de segurança imediatamente.
- ✅ PR2 grande mas review pode acontecer enquanto Sprint 0 já está em prod.
- ✅ Risco isolado: se Sprint 1+2+3 explodir, segurança já foi resolvida.
- ⚠️ Ainda assim PR2 é grande (~2.300 linhas).

**Opção C — 4 PRs (um por sprint):**
- ✅ Reviews humanas viáveis.
- ✅ Rollback granular.
- ❌ 4 ciclos de review/CI/merge — atrasa entrega para ~5-6 semanas calendário.
- ❌ Mudanças de tipos do Supabase (Sprint 1) precisam estar em main para o trabalho de Sprint 2 não conflitar.

### Recomendação: **Opção B — 2 PRs**

Motivos (≤ 10 linhas):
1. DARA-001 e DARA-002 são CVSS ~9.8 e ~9.1 — exploráveis com 1 linha JS no console hoje. Cada dia esperando PR único é passivo legal/LGPD.
2. PR1 é ~200 linhas (4 patches SQL prontos + 5 fixes TS pequenos): risco baixíssimo, review rápido, deploy em horas.
3. PR2 (Sprint 1+2+3) pode ser revisado com calma porque a porta de exploração já está fechada.
4. Mantém respeito à preferência do usuário (preferiu PR único, mas 2 ainda é "tudo junto" comparado a 4).
5. Em caso de regressão no PR2, segurança não sai com ele.

**Se o usuário insistir em PR único:** lance PR1 mesmo assim como hotfix paralelo (mergea no main, depois PR2 rebase), ou:
- Aceita-se PR único mas com **deploy condicional**: o PR único entra em main, mas pipeline aplica primeiro só os patches SQL em produção (via migration order garantida) antes do build TS.

---

## 6. Critérios de Aceite "Release-Ready"

Checklist binário (sim/não — todos sim para release):

- [ ] **0 P0 abertos** (13 fechados).
- [ ] **≤ 5 P1 abertos** (de 22 inicial).
- [ ] **`tsc --noEmit` strict habilitado** com 0 erros (mínimo `strictNullChecks: true` + `noImplicitAny: true`).
- [ ] **0 erros ESLint** (warnings shadcn boilerplate permitidos via override).
- [ ] **≥ 1 fluxo crítico coberto por teste E2E** (target: 3 — signup→approve→paid, convite, OCR).
- [ ] **Bundle inicial ≤ 600 KB gzip** (medido em `dist/assets/index-*.js`).
- [ ] **Smoke test manual passa**: signup → bootstrap → criar despesa (com OCR) → submit relatório → aprovar → marcar pago → ver no dashboard.
- [ ] **Convite por email funcionando ponta-a-ponta**: admin cria invite → email enviado → link aceito → usuário na org correta com role correto.
- [ ] **RLS validado por teste manual de 2 orgs**: usuário Org A não vê despesas/relatórios/approvals de Org B; tentativa de mudar `org_id` no profile falha com check_violation.
- [ ] **Error Boundary ativa** em crash induzido.
- [ ] **Edge function validate-receipt rejeita** request sem JWT, payload >5MB, origem não whitelisted.
- [ ] **`.env` fora do git** (em `.gitignore`); `.env.example` com placeholders.
- [ ] **Sentry capturando erros** em ambiente staging (DSN configurado).
- [ ] **Notificação por email** dispara ao aprovar/rejeitar/pagar relatório.
- [ ] **Export CSV de relatório** baixa arquivo válido com colunas: data, descrição, tipo, CC, projeto, forma pagamento, valor, reembolsável.

---

## 7. Riscos e Dependências

### Decisões que dependem do usuário (BLOQUEADORES de execução)

1. **Política de convite:** auto-join por domínio corporativo deve continuar (com blocklist de públicos)? Ou todo signup novo exige convite emitido por admin? — Atual `bootstrap_user` patchado mantém auto-domain-match para domínios não-públicos. Confirmar.
2. **Free tier — limite exato:** "5 usuários / 10 despesas/mês" foi proposta de Atlas, mas o usuário precisa decidir o ponto de monetização. Sugestão: 5 usuários ativos, ilimitadas despesas, sem export PDF (só CSV). Confirmar para Sprint 3.
3. **Pricing público:** publicar preço (R$ X/usuário/mês) na homepage diferencia de VExpenses. Definir valor antes de Sprint 3 fechar (impacta stripe + landing page).
4. **Provider de email transacional:** Resend vs Postmark vs Supabase SMTP nativo? — Sprint 2 precisa decidir (recomendo Resend pelo free tier 3k/mês).
5. **Domínio de produção e SSL:** certificado e domínio definitivo precisa estar pronto para Sprint 1 (CORS restrito de edge fn precisa de origem fixa).
6. **OpenAI API key budget:** com OCR full-field + categorização IA + NF-e parser, gasto vai subir. Definir cap mensal (LangSmith ou direto OpenAI).

### Features que dependem de licenças/contratos externos

| Feature | Dependência | Prazo realista |
|---|---|---|
| Cartão corporativo Mastercard | Contrato Mastercard + processador (Cielo/Adyen) + licença Bacen instituição de pagamento | 6-12 meses, NÃO entrar em MVP |
| Integração NF-e SEFAZ | Certificado A1 da empresa OU usar API parceira (NFE.io, Migrate, Tecnospeed) | 1-2 semanas para integrar via parceira; certificado próprio é processo Receita |
| Viagens (voos/hotéis) | Contrato GDS Amadeus/Sabre + intermediação | 6+ meses, NÃO entrar em MVP |
| Email transacional | Conta Resend/Postmark/SendGrid + DNS DKIM/SPF | 1-2 dias |
| OAuth Google nativo | Já no Supabase, só configurar; Lovable atualmente desconectado | 1h |

### Riscos técnicos de quebra de migração

1. **DARA-002 patch agrega `domain_not_public` CHECK constraint:** se houver `org_domains` em produção com `gmail.com` registrado (provável), a migration falha. **Plano:** rodar `DELETE FROM org_domains WHERE domain IN (lista pública)` ANTES do ALTER, e depois `UPDATE` para mover orgs Gmail para isolamento (1 org por user). Dara já flagou na seção C do patch.
2. **Aria-6 regenerar types.ts:** se houver `any` cast em outros lugares não auditados, pode quebrar build. **Plano:** rodar regen em branch isolado, fix incremental por arquivo.
3. **Aria-3 code-splitting + React.lazy:** se algum lazy chunk não tem fallback Suspense correto, primeira navegação dá erro. **Plano:** Suspense global em App.tsx + skeleton page.
4. **strictNullChecks: true:** vai gerar 50-80 erros (estimativa Aria). Precisa quebrar Sprint 1 em sub-tasks ou mover para Sprint 3.
5. **Anon key rotation (DARA-011):** se o usuário decidir rotacionar, todos os clientes pendurados (mobile, integrações) quebram. **Plano:** anon key não é segredo, manter; só remover do git.
6. **Patches SQL aplicados em prod sem revisão de admins atuais:** após DARA-001 fix, lista atual de admins pode incluir pessoas que escalaram self-grant. **Plano (Dara já indicou):** rodar query de auditoria, revisar manualmente, revogar suspeitos antes do release público.

### Riscos de produto

- Free tier muito generoso → não converte. Free tier muito restrito → não capta. Validar com 3-5 entrevistas com PMEs antes de Sprint 3.
- Diferencial NF-e exige decisão de qual parceira usar (NFE.io é mais simples, certificado próprio é mais barato em escala).
- "Cópia melhorada" pode ser interpretada como concorrência direta — VExpenses é filial do grupo VR. Se houver tentativa de aquisição/parceria, ter posicionamento "PME self-serve" deixa claro o segmento (não é enterprise direto).

---

*Fim do action plan — Morgan (PM). Aguardando go/no-go do usuário sobre as 6 decisões da seção 7.1 antes de Orion despachar Sprint 0.*
