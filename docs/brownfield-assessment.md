# Brownfield Assessment — oxyve

**Autor:** Atlas (Business Analyst)
**Data:** 2026-04-27
**Escopo:** MVP de gestão de despesas corporativas para uso interno via navegador de celular (substituto do VExpenses).
**Fora do escopo:** adiantamentos, quilometragem, cartão corporativo, integração contábil, BI, multi-nível de aprovação, app nativo.

---

## 1. Executive Summary

- **Completude global:** ~70% pronto para uso interno restrito. Backbone funcional (despesa → comprovante+OCR → relatório → aprovação) está implementado end-to-end com schema robusto e RLS configurado.
- **Bloqueador #1:** confirmar `OPENAI_API_KEY` nos secrets do Supabase. Sem isso, OCR (`validate-receipt`) falha silenciosamente e quebra a UX.
- **Bloqueador #2:** Dashboard mostra apenas "relatório atual" — não há visão consolidada do mês/período fiscal. Inviabiliza acompanhamento financeiro real.
- **Bloqueador #3:** ausência de notificações ao funcionário quando relatório é aprovado/rejeitado — fluxo fica sem feedback de fechamento.
- **Mobile:** base sólida (viewport, PWA manifest, drawer, renderização condicional Card/Table), mas faltam ajustes finos: `safe-area-inset` (notch iPhone), touch targets de 44px na fila de aprovação, popover de filtros que estoura em viewport ≤360px, e ausência de bottom nav.
- **Recomendação:** entregar v1 interno em 2 sprints curtos focando os 5 bloqueadores listados; pular refactor amplo.

---

## 2. Metodologia

- Análise estática do código em `src/` e `supabase/` (componentes, hooks, edge functions, migrations).
- Inspeção do schema Postgres via migrations (7 arquivos).
- Cross-check de fluxos críticos no celular (upload de foto, listar/filtrar, aprovar, configurar).
- Auditoria conduzida em paralelo por dois sub-agentes Explore e consolidada por Atlas.

---

## 3. Estado Atual — Paridade com VExpenses

### ✅ Já implementado

| Pilar | Onde | Notas |
|-------|------|-------|
| Multi-tenant + papéis | `organizations`, `profiles`, `user_roles` (employee/manager/admin) | RLS policies completas |
| Cadastro de despesa | `Expenses.tsx`, `ExpenseFormDialog.tsx`, `useExpenses.ts` | CRUD completo, validação Zod, filtros avançados |
| Política dinâmica | `expense_policies`, `usePolicy.ts` | `require_project`, `require_receipt`, `enforce_limits_mode`, limites por categoria |
| Upload de comprovante | `ReceiptUpload.tsx`, Storage `/receipts/{org}/{user}/{report}/{expense}/` | RLS por usuário/manager, HEIC→JPEG via `heic2any` |
| OCR de comprovante | edge `validate-receipt/index.ts` (OpenAI GPT-4o-mini, tool-calling) | Extrai data + valor com confidence scoring |
| Relatórios | `Reports.tsx`, `ReportDetail.tsx`, `report_items` | Workflow draft→submitted→approved/rejected→paid |
| Aprovação | `ApprovalQueue.tsx`, `useReviewExpense.ts`, RPC `admin_decide_report` | Aprovação por relatório e por despesa, com comentário |
| Dimensões organizacionais | `cost_centers`, `projects`, `departments`, `expense_categories` | CRUDs em Settings |
| Convites de equipe | `org_invites`, `org_domains`, `InvitesList.tsx` | |
| Dashboard básico | `Dashboard.tsx`, `CurrentReportCard.tsx` | Diferencia admin/manager/employee |
| Auth + temas | `AuthContext`, `ThemeProvider` (light/dark) | |

### ❌ Declaradamente fora do MVP (não implementar agora)

Adiantamentos, quilometragem, cartão corporativo (importação/conciliação), integração contábil (export SAP/TOTVS), aprovação multi-nível, BI/relatórios analíticos, app nativo.

---

## 4. Auditoria Funcional (5 Features Core)

### 4.1 Cadastro de Despesa — ✅ COMPLETA

**O que funciona:**
- CRUD completo com 7 abas de status; validação Zod com campos obrigatórios dinâmicos via `usePolicy`.
- Vínculo a categoria/centro de custo/projeto carregado conditional.
- Filtros avançados (data range, categoria, forma pagamento, reembolsável, centro custo, projeto).
- Conversão HEIC→JPEG automática (`heic2any`).
- Limite diário por categoria exibido como aviso (`ExpenseFormDialog.tsx:323-326`).

**Lacunas:** nenhuma bloqueadora.

### 4.2 Upload + OCR de Comprovante — 🟡 PARCIAL

**O que funciona:**
- Upload real para Supabase Storage com path organizado.
- OCR via OpenAI Vision (GPT-4o-mini) com tool-calling estruturado (`validate-receipt/index.ts:48-114`).
- Detecção de divergências: data e valor (`useValidateReceipt.ts:105-120`).
- Suporte a JPEG/PNG/GIF/WebP + HEIC. Tratamento de rate-limit (429).

**Lacunas:**
- 🔴 **`OPENAI_API_KEY`** não confirmada nos secrets da edge function — sem ela, OCR falha (`validate-receipt/index.ts:15-21`).
- 🟡 Divergências geram apenas `status='warning'` na UI — não bloqueiam submissão nem forçam re-upload.
- 🟡 Sem fallback/retry se OpenAI estiver indisponível.

### 4.3 Criação de Relatório — ✅ COMPLETA

**O que funciona:**
- Criar/editar relatório, adicionar/remover despesas (bulk via `AddToReportDialog`), submeter para aprovação.
- Workflow de status enforced no banco.
- Cálculo automático de `total_cents` e `reimbursable_cents` (`useReports.ts:69-100`).
- Counters por status visíveis no header (`Reports.tsx:57-59`).

**Lacunas (nice-to-have, não bloqueadoras):**
- Sem export PDF/CSV (compliance vai pedir cedo, mas não é bloqueador da v1 interna).
- Sem tela de "revisar e confirmar submissão".

### 4.4 Fluxo de Aprovação — ✅ COMPLETA

**O que funciona:**
- Fila visível em `ApprovalQueue.tsx`; aprovação por relatório (RPC `admin_decide_report`) e por despesa individual (`expense_reviews`).
- Comentário no fluxo. Flag `is_out_of_policy` exposta nos cards.
- Auto-aprovação por admin permitida intencionalmente (commit `fa3f8dd Allow admin self-approval`).

**Lacunas:**
- 🟡 Sem notificação ao funcionário quando o relatório é aprovado/rejeitado — funcionário só descobre ao reabrir o app.

### 4.5 Dashboard — 🟡 PARCIAL

**O que funciona:**
- Métricas reais para o relatório em andamento; counters de rascunho/enviado/aprovado.
- Painel de pendentes para manager.

**Lacunas (críticas para uso interno):**
- 🔴 **Sem total consolidado mês/período fiscal** — apenas reflete o relatório aberto (`Dashboard.tsx:76-77` ancorado em `currentReportExpenses`). CFO/admin não consegue visão de gasto agregado.
- 🟡 Sem comparativo período anterior, sem alerta de proximidade de limite.
- 🟡 Métricas zeradas quando `dashboardContext.current_report === null`.

---

## 5. Auditoria Mobile

### Configuração base
- ✅ `index.html` com viewport, `apple-mobile-web-app-capable`, manifest PWA linkado.
- ✅ `useIsMobile` (breakpoint 768px) usado consistentemente.
- 🟡 `manifest.json` com `theme_color` desalinhado da marca; faltam ícones 192/512.
- 🔴 **Sem `safe-area-inset`** em `index.css`/`AppShell.tsx:19` — conteúdo pode ficar atrás do notch.

### Layout e navegação
- ✅ `SidebarProvider defaultOpen={!isMobile}` — sidebar fecha automaticamente em mobile; gatilho no TopBar.
- ✅ `SettingsLayout.tsx:60-89` troca abas por `<Select>` em mobile.
- 🟡 Sem **bottom nav** — para 5 rotas principais, hamburger é menos ergonômico que tab bar fixa.

### Fluxos críticos no celular
- ✅ **Upload com câmera**: `accept="image/*,image/heic,image/heif"` + `capture="environment"` (`ReceiptUpload.tsx:99-119`); botões `h-14`.
- ✅ **Form em drawer** com `max-h-[90vh]` e `inputMode="decimal"` no valor.
- ✅ **Listar despesas**: `Expenses.tsx:367-384` renderiza `ExpenseCard` em mobile e `ExpensesTable` em desktop — implementado corretamente.
- 🔴 **Touch targets na fila de aprovação**: `ApprovalQueue.tsx:127-153` usa `size="sm"` (~36px) em mobile, abaixo dos 44px recomendados — risco de toques errados.
- 🟡 **Popover de filtros** (`ExpenseFiltersPopover.tsx`) usa `w-80` (320px), pode estourar em viewports de 360px.

### Detalhes finos
- ✅ Inputs numéricos com `inputMode="decimal"`.
- ✅ Date picker via `react-day-picker` em popover.
- 🟡 Toasts (`Sonner`) sem posição customizada para mobile — pode ser coberto pelo teclado virtual.
- 🟡 Sem `touch-action: manipulation` global — pequeno delay perceptível no double-tap.
- 🟡 Sem `-webkit-tap-highlight-color` definido.

---

## 6. TOP Gaps Consolidados — Ranking para MVP

Critério: **bloqueador para uso interno real** > **fricção alta** > **polish**.

| # | Gap | Severidade | Esforço | Categoria |
|---|-----|------------|---------|-----------|
| 1 | Confirmar `OPENAI_API_KEY` nos secrets da edge function | 🔴 Bloqueador | XS (config) | Infra |
| 2 | Total consolidado mês/período no Dashboard | 🔴 Bloqueador | M (1-2 dias) | Funcional |
| 3 | Notificação ao funcionário em aprovação/rejeição (in-app + email) | 🔴 Bloqueador | M (1-2 dias) | Funcional |
| 4 | `safe-area-inset` no AppShell (notch iPhone) | 🟡 Alta | XS (1h) | Mobile |
| 5 | Touch targets ≥44px em ApprovalQueue mobile | 🟡 Alta | XS (30min) | Mobile |
| 6 | OCR com baixa confiança/divergência: bloquear submit ou exigir confirmação manual | 🟡 Alta | S (4h) | Funcional |
| 7 | Bottom nav em mobile para rotas principais | 🟡 Média | S (4h) | Mobile |
| 8 | Popover de filtros (`w-80` → responsivo) | 🟡 Média | XS (30min) | Mobile |
| 9 | Manifest PWA: ícones 192/512 + `theme_color` correto | 🟢 Baixa | XS (1h) | Mobile/PWA |
| 10 | Export PDF/CSV de relatório | 🟢 Baixa (pós-MVP) | M (1-2 dias) | Funcional |

---

## 7. Quick Wins (≤30min cada)

1. **Adicionar `safe-area-inset`** em `src/index.css` global e ajustar `AppShell.tsx`.
2. **Trocar `size="sm"` → `size="default"`** nos botões de aprovação em `ApprovalQueue.tsx:127-153`.
3. **`touch-action: manipulation`** global em inputs/buttons via `index.css`.
4. **Popover de filtros responsivo**: `w-80` → `w-[calc(100vw-2rem)] sm:w-80`.

---

## 8. Recomendações — Próximos Passos

### Sprint 1 (1 semana) — "Destravar uso real"
- ✅ Confirmar/configurar `OPENAI_API_KEY` no Supabase (DevOps).
- ✅ Implementar **total consolidado** no Dashboard (agregar `expenses` por período fiscal, não só relatório atual).
- ✅ Implementar **notificações** (escolher: in-app via Supabase Realtime + email via Resend ou similar).
- ✅ Aplicar todos os Quick Wins mobile (≤2h total).

### Sprint 2 (1 semana) — "Polir UX e robustez"
- 🔁 OCR: bloquear submit em `confidence='low'` ou divergência sem confirmação explícita.
- 🔁 Bottom nav em mobile.
- 🔁 Manifest PWA com ícones e cor correta.
- 🔁 Tela de "revisar e confirmar" antes de submeter relatório.

### Pós-MVP (backlog)
- Export PDF/CSV de relatório.
- Adiantamentos (quando entrar em escopo).
- Audit trail (já existe `report_approvals` e `expense_reviews`, falta UI).
- Comparativo mês-a-mês no Dashboard.

---

## 9. Riscos & Considerações

| Risco | Mitigação |
|-------|-----------|
| OCR falhar em produção sem `OPENAI_API_KEY` | Adicionar health-check da edge function antes de habilitar OCR no UI; degradar para upload-only. |
| Custo OpenAI escalar | Limite de uso por org (rate limit + quota mensal). GPT-4o-mini já é a opção barata. |
| Funcionário não saber que relatório foi aprovado | Sprint 1 resolve com notificações. |
| Notch/safe-area causar UX ruim em iPhones recentes | Quick win do safe-area-inset. |
| Manager aprovar despesa fora da política sem perceber | Flag `is_out_of_policy` já existe — destacar visualmente em mobile (badge maior, cor de alerta). |

---

## 10. Próximo Agente

→ **Morgan (`/agents:pm`)**: usar este assessment como input para criar o **Enhancement PRD** (`docs/prd.md`) com 2 epics:
- **Epic 1**: Sprint 1 — Destravar uso real (5 itens)
- **Epic 2**: Sprint 2 — Polir UX mobile e robustez OCR

Após PRD, **Pax (`/agents:po`)** valida e fragmenta em stories prontas para o ciclo dev/QA/devops.
