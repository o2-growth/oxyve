# Epic 1 — Destravar Uso Interno

**Sprint:** 1 (estimado 1 semana)
**Severidade:** 🔴 Bloqueador
**Objetivo:** remover os bloqueadores reais que impedem o oxyve ser usado pela empresa hoje.

## Stories

### Story 1.1 — Configurar `OPENAI_API_KEY` na edge function (DevOps)
- **Persona:** Admin
- **Esforço:** XS
- **Dependências:** acesso ao Supabase admin
- **Agente sugerido:** `/agents:devops`
- **Narrativa:** Como admin, quero que o OCR funcione em produção para que comprovantes sejam validados automaticamente.
- **Critérios de aceite:**
  - `OPENAI_API_KEY` configurada nos secrets da edge function `validate-receipt`.
  - Teste manual: upload de comprovante real retorna `data` e `amount_cents` extraídos com `confidence` informado.
  - Se a chave não estiver presente, edge function retorna 503 com mensagem clara (não 200 silencioso).
  - **Mobile:** UI exibe toast de erro legível em mobile se OCR falhar; não trava o salvamento da despesa.
- **Notas técnicas:** ajuste em `supabase/functions/validate-receipt/index.ts:15-21` (validar presença e retornar 503 explícito).

---

### Story 1.2 — Dashboard com total consolidado mensal
- **Persona:** Admin / Gestor / Funcionário
- **Esforço:** M (~1-2 dias)
- **Dependências:** nenhuma
- **Narrativa:** Como admin/gestor/funcionário, quero ver o total gasto no mês corrente (independente do relatório atual), para acompanhar consumo financeiro.
- **Critérios de aceite:**
  - Card "Total do mês" no `Dashboard.tsx` exibindo soma de `expenses.amount_cents` do mês corrente, escopo da org.
  - Card "Total mês anterior" com comparativo simples (% variação, cor semântica).
  - **Employee:** vê apenas as próprias despesas. **Manager/Admin:** vê org inteira.
  - **Mobile:** cards empilham bem; números grandes legíveis (≥24px); cores semânticas (verde/vermelho na variação).
  - **Edge case:** se não houver despesas no mês, exibir empty state ("Nenhuma despesa este mês"), não R$ 0,00 confuso.
- **Notas técnicas:** novo hook `useMonthlyTotals` (filtro por período + scope por papel via RLS); ajustes em `src/pages/app/Dashboard.tsx`.

---

### Story 1.3 — Notificação ao funcionário em aprovação/rejeição
- **Persona:** Funcionário
- **Esforço:** M (~1-2 dias)
- **Dependências:** chave do provedor de email (default Resend — confirmar com usuário)
- **Narrativa:** Como funcionário, quero receber notificação quando meu relatório for aprovado ou rejeitado, para não precisar abrir o app o tempo todo.
- **Critérios de aceite:**
  - **Canal in-app:** badge no menu "Relatórios" mostrando contagem de relatórios com mudança de status não vista; clicar limpa o badge.
  - **Canal email:** email enviado ao `profiles.email` quando `admin_decide_report` é executado, contendo: título do relatório, decisão, comentário, link direto para `/app/reports/:id`. **Provedor default: Resend.**
  - Email funciona para ambas decisões (approved e rejected) e respeita pt-BR.
  - **Mobile:** email é responsivo; link funciona ao tocar e abre direto na rota.
  - **Edge case:** se admin auto-aprovar (já permitido), não dispara email para si mesmo.
- **Notas técnicas:** nova edge function `send-report-decision-email`; trigger via DB (após INSERT em `report_approvals`) ou call direto após RPC; coluna `last_seen_status_at` (ou tabela `notifications`) para in-app badge — Dara decide o melhor padrão.

---

### Story 1.4 — Quick wins mobile foundation
- **Persona:** Todos os usuários mobile
- **Esforço:** S (~2h total)
- **Dependências:** nenhuma
- **Narrativa:** Como usuário mobile, quero que o app respeite a tela do meu celular (notch, área segura, toques sem delay), para usar sem fricção.
- **Critérios de aceite:**
  - `index.css` com `env(safe-area-inset-*)` aplicado em `AppShell` e elementos sticky/fixed.
  - `touch-action: manipulation` em inputs/buttons globais (elimina double-tap zoom).
  - `ExpenseFiltersPopover.tsx` ajusta largura para `w-[calc(100vw-2rem)] sm:w-80` (não estoura em 360px).
  - `-webkit-tap-highlight-color: transparent` global, com substituto via `:active` se desejado.
  - **Edge case:** verificar em iPhone com notch (Safari) e Android (Chrome).
- **Notas técnicas:** edits localizados em `src/index.css` e `src/components/layout/AppShell.tsx:19`.
