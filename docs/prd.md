# PRD — oxyve MVP (Substituto VExpenses, Uso Interno Mobile-First)

**Autor:** Morgan (Product Manager)
**Data:** 2026-04-27
**Input:** [`docs/brownfield-assessment.md`](./brownfield-assessment.md) (Atlas)
**Status:** Draft — aguardando validação do Pax (PO)

---

## 1. Problem Statement

A empresa do usuário precisa de uma ferramenta interna para gestão de despesas e reembolsos corporativos que substitua o **VExpenses**. Hoje o oxyve já tem ~70% do backbone funcional implementado (despesa → comprovante+OCR → relatório → aprovação), com schema Supabase robusto e RLS configurado. Falta **destravar bloqueadores reais** e **polir os fluxos básicos para qualidade de uso real**, especialmente o fluxo de aprovação.

**Contexto:** uso interno (não SaaS público), 100% via navegador de celular, sem deadline rígido, sem requisitos de paridade total com VExpenses.

---

## 2. Princípios Orientadores

1. **Qualidade > novas features.** Os fluxos básicos (especialmente aprovação) devem estar **bem feitos**: empty/loading/error states, edge cases tratados, UX mobile sólida, mensagens claras. Antes de adicionar coisa nova, polir o que existe.
2. **Mobile-first.** Toda story tem critérios de aceite mobile explícitos. Touch targets ≥44px, safe-area-inset, sem elementos cortados em viewport ≤360px.
3. **Cortar escopo agressivamente.** Adiantamentos, quilometragem, cartão corporativo, BI, integração contábil, multi-nível de aprovação, app nativo, export PDF — **NÃO entram no MVP**.
4. **Aproveitar o que já existe.** O schema Postgres está sólido (RLS, RPCs `admin_decide_report`, `expense_reviews`, `report_approvals`, `expense_policies`). Não recriar — usar.

---

## 3. Goals & Success Metrics

### Goals
- **G1.** Tornar o oxyve utilizável por toda a empresa em substituição ao VExpenses.
- **G2.** Garantir que o fluxo de aprovação seja confiável e ergonômico (zero ambiguidade entre gestor e funcionário).
- **G3.** Entregar UX mobile que não dependa de paciência do usuário (sem fricção em fluxos críticos).

### Success Metrics
- **M1.** 100% dos funcionários da empresa lançam ao menos uma despesa via oxyve em até 30 dias do go-live interno.
- **M2.** Tempo médio entre submissão de relatório e decisão do gestor ≤3 dias úteis.
- **M3.** Taxa de extração correta do OCR (data + valor) ≥80% em comprovantes legíveis.
- **M4.** Zero incidentes reportados de "aprovei sem querer" ou "não consigo tocar o botão" em 30 dias.
- **M5.** NPS interno ≥+30 após 60 dias de uso.

---

## 4. Personas

### P1 — Funcionário (employee)
- **Perfil:** equipe de campo, comercial, ou administrativo que tem despesas reembolsáveis.
- **Contexto:** mobile, geralmente em movimento, foto direto da câmera.
- **Objetivos:** lançar despesa rápido, anexar comprovante, agrupar em relatório, submeter, saber quando foi aprovado.
- **Frustrações:** apps que "perdem" foto, OCR que não entende a nota, não saber se o gestor já viu.

### P2 — Gestor (manager)
- **Perfil:** líder de área que aprova despesas do time.
- **Contexto:** mobile no celular durante o dia, no máximo 5min por sessão.
- **Objetivos:** ver fila pendente, abrir relatório, ver despesas (especialmente as fora da política), aprovar ou rejeitar com comentário.
- **Frustrações:** botões pequenos, não saber o que está fora da política, ter que sair do mobile pra fazer.

### P3 — Admin / Financeiro (admin)
- **Perfil:** dono da operação financeira interna.
- **Contexto:** misto desktop/mobile, configura políticas, convida usuários, fecha o ciclo.
- **Objetivos:** ver total consolidado mensal, gerenciar política, equipe, categorias, centros de custo, projetos, e atuar como aprovador final quando necessário (auto-aprovação já permitida).
- **Frustrações:** dashboard que só mostra "relatório atual" e não o agregado.

---

## 5. Non-Goals (Declaradamente Fora do MVP)

| Feature | Por quê fora | Quando reconsiderar |
|---------|--------------|---------------------|
| Adiantamentos | Confirmado pelo usuário em 2026-04-27 | Pós go-live interno |
| Quilometragem | Não foi pedido | Sob demanda |
| Cartão corporativo / OFX | Complexo, não pedido | Sob demanda |
| Aprovação multi-nível | 1 nível atende uso interno | Quando empresa crescer |
| Integração contábil (SAP/TOTVS) | Uso interno não exige | Sob demanda |
| BI / dashboards analíticos | Dashboard simples atende | Pós go-live |
| Export PDF/CSV | Nice-to-have, sem urgência | Backlog pós-MVP |
| App nativo | Mobile web atende | Não planejado |

---

## 6. Feature Requirements

> **Convenção de stories:** `Como [persona], quero [ação] para [valor]`. Critérios de aceite (CA) sempre incluem cenários funcionais + cenário mobile + edge case relevante. Esforço em t-shirt size: XS (≤2h), S (≤1d), M (≤3d), L (≤1sem).

---

### 🔴 Epic 1 — Destravar Uso Interno (Bloqueadores)

**Objetivo:** remover os bloqueadores reais que impedem o oxyve ser usado pela empresa hoje. **Sprint estimado: 1 semana.**

#### Story 1.1 — Configurar `OPENAI_API_KEY` na edge function (DevOps)
- **Como** admin, **quero** que o OCR funcione em produção, **para** que comprovantes sejam validados automaticamente.
- **CA:**
  - `OPENAI_API_KEY` configurada nos secrets da edge function `validate-receipt` no projeto Supabase.
  - Teste manual: upload de comprovante real retorna `data` e `amount_cents` extraídos com `confidence` informado.
  - Se a chave não estiver presente, edge function retorna 503 com mensagem clara (não 200 silencioso).
  - **Mobile:** UI exibe toast de erro legível em mobile se OCR falhar; não trava o salvamento da despesa (usuário ainda consegue lançar manualmente).
- **Esforço:** XS — config + 1 ajuste em `validate-receipt/index.ts:15-21`.
- **Dependências:** acesso ao Supabase admin.
- **Agente:** `/agents:devops`.

#### Story 1.2 — Dashboard com total consolidado mensal
- **Como** admin/gestor, **quero** ver o total gasto pela empresa no mês corrente (independente do relatório atual), **para** acompanhar consumo financeiro.
- **CA:**
  - Card novo no Dashboard "Total do mês" exibindo soma de `expenses.amount_cents` do mês corrente, escopo da org.
  - Card "Total mês anterior" para comparativo simples (% variação).
  - Para `employee`: agregação só das próprias despesas. Para `manager`/`admin`: org inteira.
  - **Mobile:** cards empilham bem; números grandes legíveis (≥24px); cores semânticas (verde/vermelho na variação).
  - **Edge case:** se não houver despesas no mês, exibir empty state ("Nenhuma despesa este mês"), não R$ 0,00 visualmente confuso.
- **Esforço:** M — novo hook `useMonthlyTotals`, query agregada, ajustes em `Dashboard.tsx`.
- **Dependências:** nenhuma.

#### Story 1.3 — Notificação ao funcionário em aprovação/rejeição
- **Como** funcionário, **quero** receber notificação quando meu relatório for aprovado ou rejeitado, **para** não precisar abrir o app o tempo todo.
- **CA:**
  - **Canal 1 (in-app):** badge no menu "Relatórios" mostrando contagem de relatórios com mudança de status não vista; clicar limpa o badge.
  - **Canal 2 (email):** email enviado ao `profiles.email` quando `admin_decide_report` é executado, contendo: título do relatório, decisão, comentário, link direto para `/app/reports/:id`. Provedor sugerido: **Resend** (ou já configurado).
  - Email funciona para ambas decisões (approved e rejected) e respeita idioma pt-BR.
  - **Mobile:** email é responsivo; link funciona ao tocar e abre direto na rota.
  - **Edge case:** se admin auto-aprovar (já permitido), não dispara email para si mesmo.
- **Esforço:** M — nova edge function `send-report-decision-email`, trigger via DB ou call no RPC, integração com Resend.
- **Dependências:** chave do provedor de email.

#### Story 1.4 — Quick wins mobile foundation
- **Como** usuário mobile, **quero** que o app respeite a tela do meu celular (notch, área segura, toques sem delay), **para** usar sem fricção.
- **CA:**
  - `index.css` com `env(safe-area-inset-bottom/top/left/right)` aplicado em `AppShell` e elementos sticky/fixed.
  - `touch-action: manipulation` em inputs/buttons globais (elimina double-tap zoom delay).
  - `ExpenseFiltersPopover.tsx` ajusta largura para `w-[calc(100vw-2rem)] sm:w-80` (não estoura em 360px).
  - `-webkit-tap-highlight-color: transparent` global, com substituto via `:active` se desejado.
  - **Edge case:** verificar em iPhone com notch (safari) e Android (chrome).
- **Esforço:** S — ≤2h total.
- **Dependências:** nenhuma.

---

### 🟡 Epic 2 — Aprovação BEM FEITA (Princípio do Usuário)

**Objetivo:** elevar o fluxo de aprovação de "funcional" para "robusto e ergonômico". **Sprint estimado: 1 semana.**

#### Story 2.1 — Touch targets adequados na fila de aprovação
- **Como** gestor mobile, **quero** botões de aprovar/rejeitar/ver com tamanho de toque confortável, **para** não tocar errado.
- **CA:**
  - `ApprovalQueue.tsx:127-153` — botões mobile mudam de `size="sm"` (~36px) para `size="default"` (~44px) ou `h-12` explícito.
  - Espaçamento mínimo de 8px entre botões.
  - Versão desktop (linhas 247-268) substitui `variant="ghost"` ícone-only por botões com label visível ("Ver", "Aprovar", "Rejeitar") — reduz erro por affordance.
  - **Edge case:** botão "Aprovar" como ação primária (azul/verde), "Rejeitar" como destrutiva (vermelha), "Ver" como secundária (outline).
- **Esforço:** XS — ajuste de classes.
- **Dependências:** Story 1.4 (safe-area).

#### Story 2.2 — Fila de aprovação mostra sinalização de despesas fora da política
- **Como** gestor, **quero** ver de relance se um relatório contém despesas fora da política, **para** priorizar revisão e dar atenção redobrada.
- **CA:**
  - Card/linha do relatório na `ApprovalQueue` mostra badge "⚠️ X fora da política" se `report.expense_count_out_of_policy > 0`.
  - Hook `useReports` enriquece resposta com contagem de `is_out_of_policy=true` no relatório.
  - Badge clicável vai direto para `/app/reports/:id` com filtro pré-aplicado nas despesas problemáticas.
  - **Mobile:** badge fica em linha separada se não couber ao lado do título.
  - **Edge case:** zero despesas out_of_policy → não mostra o badge.
- **Esforço:** S — ajuste no hook + UI.
- **Dependências:** nenhuma.

#### Story 2.3 — Aprovação parcial: rejeitar despesa individual com comentário
- **Como** gestor, **quero** rejeitar despesas individuais dentro de um relatório (não só o relatório inteiro), **para** que o funcionário ajuste só o que está errado.
- **CA:**
  - `ReportDetail.tsx`: cada despesa tem ações "Aprovar" e "Rejeitar" via `useReviewExpense` (`expense_reviews` table já existe).
  - Rejeição exige comentário (>=10 caracteres).
  - Estado da despesa fica visível: aprovada (verde), rejeitada (vermelha + comentário visível), pendente (cinza).
  - Quando o gestor decide o relatório como "approved" mas há despesas individualmente rejeitadas, o status da despesa rejeitada não é alterado para "approved" — é mantido conforme `expense_reviews`.
  - **Mobile:** ações em formato de cards com botões `h-10` mínimo; comentário em drawer mobile, não dialog que cubra a tela toda.
  - **Edge case:** se gestor rejeita despesa e depois aprova o relatório, UI alerta "X despesa(s) ainda rejeitada(s) — confirmar?".
- **Esforço:** M — UI nova em `ReportDetail` + ajustes em `useReviewExpense`.
- **Dependências:** nenhuma (schema pronto).

#### Story 2.4 — Histórico de aprovação visível ao funcionário
- **Como** funcionário, **quero** ver quem aprovou ou rejeitou meu relatório e o comentário, **para** entender a decisão e ajustar se necessário.
- **CA:**
  - `ReportDetail.tsx` exibe seção "Histórico" com entradas de `report_approvals` ordenadas por data desc: aprovador (nome), decisão, comentário, timestamp.
  - Inclui também rejeições individuais de despesas (`expense_reviews`), agrupadas por despesa.
  - Para o funcionário (próprio relatório), histórico é read-only e sempre visível.
  - **Mobile:** seção colapsável; cada entrada cabe em uma linha com timestamp em formato relativo ("há 2 dias").
  - **Edge case:** relatório nunca submetido → seção não aparece.
- **Esforço:** S — query nova + UI.
- **Dependências:** nenhuma.

#### Story 2.5 — Mensagens claras de erro/sucesso na decisão de aprovação
- **Como** gestor, **quero** feedback claro quando minha decisão é confirmada (ou falha), **para** ter certeza do que aconteceu.
- **CA:**
  - Toast de sucesso após aprovar/rejeitar: "Relatório [título] aprovado" ou "Relatório [título] rejeitado".
  - Toast de erro com mensagem específica em caso de falha de RPC (não a mensagem técnica).
  - Trata erro state no `ApprovalQueue.tsx` — atualmente não há `if (error)` ramo.
  - Toasts respeitam mobile: posicionados em `top` (não cobertos por teclado virtual), `swipe-to-dismiss`.
  - **Edge case:** dupla submissão (gestor toca aprovar duas vezes) — botão fica disabled até resposta.
- **Esforço:** XS — ajustes no Sonner config + try/catch no hook.
- **Dependências:** nenhuma.

#### Story 2.6 — Confirmação destrutiva ao rejeitar
- **Como** gestor, **quero** confirmar antes de rejeitar (ação destrutiva), **para** evitar tap acidental.
- **CA:**
  - Diálogo já existente em `ApprovalQueue.tsx:161-200` mantém-se, mas com:
    - Comentário com mínimo de 10 caracteres (atualmente apenas "não vazio").
    - Botão "Rejeitar" só fica habilitado após preencher comentário válido (já implementado parcialmente).
    - Texto do botão muda para "Confirmar Rejeição" quando há comentário válido — reforço visual.
  - **Mobile:** diálogo abre como drawer bottom-sheet (mais natural em mobile).
  - **Edge case:** fechar drawer com swipe não submete decisão; fechar ao tocar fora também não.
- **Esforço:** S — drawer + validação de comprimento.
- **Dependências:** nenhuma.

---

### 🟢 Epic 3 — Polish dos Demais Fluxos Core

**Objetivo:** garantir que cadastro de despesa, comprovante+OCR e relatório também estejam "bem feitos". **Sprint estimado: 1 semana.**

#### Story 3.1 — OCR rigoroso: divergência ou baixa confiança bloqueia submissão sem confirmação
- **Como** funcionário/admin, **quero** que o sistema me alerte e exija confirmação quando OCR detectar divergência grave ou ler com baixa confiança, **para** não submeter dados errados.
- **CA:**
  - Se `confidence === 'low'` ou se `data extraída != data do form` ou `valor extraído != valor do form` (com tolerância de centavos): UI exibe banner amarelo no formulário com texto exato da divergência.
  - Botão "Salvar" só habilita após o usuário marcar checkbox "Confirmo os valores acima estão corretos".
  - Despesa salva com flag interna `ocr_warning_acknowledged` (nova coluna ou JSON em `notes` — Dara decide).
  - **Mobile:** banner ocupa largura total; checkbox com label tocável `≥44px`.
  - **Edge case:** se OCR falhar (Story 1.1 cenário 503), banner muda para "OCR indisponível, valide manualmente" e checkbox segue obrigatório.
- **Esforço:** S — UI + state.
- **Dependências:** Story 1.1.

#### Story 3.2 — Tela de "revisar e confirmar" antes de submeter relatório
- **Como** funcionário, **quero** revisar todas as despesas de um relatório antes de submeter para aprovação, **para** evitar erros.
- **CA:**
  - Em `ReportDetail.tsx`, ao clicar "Submeter para aprovação", abre drawer/dialog com:
    - Lista resumida das despesas (data, descrição, valor).
    - Total geral.
    - Aviso destacado se houver despesas com `is_out_of_policy=true`.
    - Aviso se houver `ocr_warning_acknowledged=false` (despesa criada manualmente sem comprovante).
    - Botão "Confirmar e Enviar" (primário) e "Voltar" (secundário).
  - Ação só executa após confirmação explícita.
  - **Mobile:** drawer bottom-sheet ocupando ~80% da tela; scroll interno se passar de N despesas.
- **Esforço:** S — UI nova.
- **Dependências:** nenhuma.

#### Story 3.3 — Empty/loading/error states em todas as telas core
- **Como** usuário, **quero** que cada tela me diga claramente quando está carregando, sem dados ou com erro, **para** não ficar perdido.
- **CA:** revisar e padronizar em:
  - `Dashboard.tsx` — loading skeleton, error toast com retry.
  - `Expenses.tsx` — empty ("Nenhuma despesa lançada — comece criando uma"), loading, error.
  - `Reports.tsx` — empty, loading, error em cada aba.
  - `ReportDetail.tsx` — loading skeleton estruturado, 404 explícito ("Relatório não encontrado ou sem permissão").
  - `Settings*` — error states em cada CRUD.
  - Componente único `<EmptyState>` já existe — usar como padrão.
  - **Mobile:** skeletons respeitam altura natural do conteúdo (não saltam quando carrega).
- **Esforço:** M — varrer telas, padronizar.
- **Dependências:** nenhuma.

#### Story 3.4 — Manifest PWA com ícones e marca corretas
- **Como** usuário, **quero** instalar o oxyve como app na tela inicial do celular, **para** acessar como app nativo.
- **CA:**
  - `manifest.json`:
    - `theme_color` alinhado à identidade (`#131112` graphite, conforme app).
    - Ícones em 192x192 e 512x512 (purpose any e maskable).
    - `name`, `short_name`, `description` em pt-BR.
  - Banner "Adicionar à tela inicial" customizado em iOS (Safari não dispara prompt).
  - **Mobile:** verificar instalação em iOS e Android; ícone aparece sem fundo branco.
- **Esforço:** S — gerar ícones + ajustar manifest.
- **Dependências:** identidade visual final.

#### Story 3.5 — Bottom navigation em mobile
- **Como** usuário mobile, **quero** acessar as principais áreas (Dashboard, Despesas, Relatórios, Configurações) com 1 toque, **para** reduzir fricção.
- **CA:**
  - Bottom nav fixa em mobile (≤768px) com 4 ícones + labels: Dashboard, Despesas, Relatórios, Mais (drawer com Settings/Support).
  - Sidebar atual desativada em mobile (já fechada por padrão; pode ser removida da árvore mobile).
  - Active state visualmente claro (cor primária + indicador).
  - Respeita `safe-area-inset-bottom` (iPhones com home bar).
  - **Edge case:** rota dentro de `Settings/*` mantém o ícone "Mais" ativo.
- **Esforço:** S — novo componente `BottomNav` + ajustes em `AppShell`.
- **Dependências:** Story 1.4.

---

## 7. Backlog Pós-MVP (Não fazer agora)

| Item | Por quê backlog | Quando ativar |
|------|----------------|---------------|
| Export PDF/CSV de relatório | Compliance interno aceita print | Quando 1º cliente externo pedir |
| Audit trail completo (UI dedicada) | Histórico do Story 2.4 atende | Crescimento de equipe |
| Comparativo período-a-período mais rico no Dashboard | Story 1.2 entrega o suficiente | Após 3 meses de dados |
| Validação pré-submit de orçamento por categoria | Não pedido | Sob demanda |
| Aprovação multi-nível | Não pedido | Quando estrutura crescer |
| Adiantamentos | Confirmado fora | Quando pedido |
| Quilometragem com geolocalização | Não pedido | Sob demanda |
| Importação OFX cartão corporativo | Não pedido | Sob demanda |
| App nativo iOS/Android | PWA atende | Não planejado |

---

## 8. Roadmap

| Sprint | Epic | Entrega |
|--------|------|---------|
| **Sprint 1** (semana 1) | Epic 1 | OCR funcional em prod, dashboard mensal, notificações, quick wins mobile |
| **Sprint 2** (semana 2) | Epic 2 | Aprovação robusta: touch, sinalização out-of-policy, rejeição parcial, histórico, mensagens, confirmação |
| **Sprint 3** (semana 3) | Epic 3 | Polish OCR rigoroso, revisar-e-submeter, states padronizados, manifest PWA, bottom nav |
| **Go-live interno** | — | Convidar 3-5 funcionários piloto antes da empresa toda |
| **Pós go-live** | observação | Coletar feedback 30 dias, decidir backlog |

---

## 9. Technical Constraints

- Stack travada: Vite + React 18 + TS + shadcn-ui + Tailwind + Supabase + TanStack Query + React Router.
- Edge functions em Deno (Supabase). OCR via OpenAI GPT-4o-mini (manter custo baixo).
- RLS deve ser preservado em qualquer mudança de schema. **Migrations só aditivas** (regra global do usuário — `CLAUDE.md`).
- Email via provedor a definir (sugerir Resend pelo time devops).
- Sem CI/CD novo neste MVP — manter pipeline atual via Lovable + GitHub.

---

## 10. Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| OPENAI_API_KEY com custo alto em escala | Média | Médio | Rate limit por org + monitorar via dashboard OpenAI; GPT-4o-mini já é a opção barata. |
| Email não chegar (spam/SPF) | Média | Alto | Configurar SPF/DKIM no domínio do Resend; testar com 5 caixas diferentes. |
| Mudança em ApprovalQueue introduzir regressão | Média | Alto | Testes E2E (Playwright) cobrindo fluxo aprovação após Epic 2. |
| Funcionário tocar errado em mobile | Alta sem fix | Alto | Epic 2 Story 2.1 + Story 2.6 resolvem. |
| OCR errar valor e gestor não perceber | Média | Alto | Story 3.1 (banner + checkbox) + Story 2.2 (sinalização out-of-policy no manager). |
| Drift de escopo (cliente externo pedir feature avançada) | Baixa | Médio | Não-goals (seção 5) e backlog (seção 7) explícitos como contrato. |

---

## 11. Open Questions (Resolver com PO/Stakeholder)

1. **Provedor de email para notificações:** Resend, Postmark, ou outro já usado pelo time?
2. **Branding mobile (manifest):** identidade visual final (cores exatas, logo em PNG) está disponível?
3. **Pilotos do go-live:** quem são os 3-5 funcionários piloto e em qual data?
4. **Fluxo de "out of office" do gestor:** se o gestor ficar X dias sem aprovar, há algum fallback? (sugiro: deixar pós-MVP, escalar manualmente).
5. **Política de auto-aprovação admin:** já permitida (commit `fa3f8dd`). Manter ou restringir? (sugiro manter — é uso interno).

---

## 12. Próximo Passo

→ **Pax (`/agents:po`)**: validar este PRD, preencher Open Questions com input do stakeholder, e fragmentar as stories em **acceptance criteria operacionais** prontas para o ciclo `sm → dev → qa → devops`.

Após aprovação do PO, iniciar **Sprint 1** com `/agents:sm` criando as stories detalhadas em `docs/stories/`.
