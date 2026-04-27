# PO Validation — oxyve MVP

**Validador:** Pax (Product Owner)
**Data:** 2026-04-27
**Documentos avaliados:** [`prd.md`](./prd.md), [`brownfield-assessment.md`](./brownfield-assessment.md)
**Decisão:** ✅ **APROVADO COM RESSALVAS** — pode prosseguir para Sprint 1 com defaults nas Open Questions.

---

## 1. Checklist de Consistência

### Document Consistency
- ✅ PRD goals alinhados com assessment (mesmos 5 fluxos core, mesmo escopo, mesmo princípio "qualidade > features").
- ✅ Stories rastreáveis aos 3 epics (15/15 stories vinculadas).
- ✅ Arquitetura existente suporta todas as features (schema já tem `report_approvals`, `expense_reviews`, `expense_policies`, RPC `admin_decide_report`).
- ✅ Sem stories órfãs. Sem epics sem stories.
- ✅ Non-goals (seção 5 PRD) alinhados com escopo do usuário (adiantamentos, BI, multi-nível, etc. fora).

### Story Quality (Avaliação preliminar — SM/River vai detalhar)
- ✅ Todas as stories têm narrativa "Como X, quero Y, para Z".
- ✅ Critérios de aceite presentes em todas, com cenário mobile e edge case.
- ✅ Esforço estimado (XS/S/M/L) em todas.
- ✅ Dependências identificadas explicitamente onde existem (1.4 → 2.1; 1.1 → 3.1).
- 🟡 **A melhorar (responsabilidade do SM):** transformar CAs em formato Given/When/Then operacional para QA; adicionar "Definition of Done" por story (lint passa, tipos passam, smoke test mobile no Chrome DevTools, etc.).

### Completeness
- ✅ Todos os bloqueadores do assessment estão cobertos no PRD (mapeamento abaixo).
- ✅ Critical paths identificados (1.1 → 3.1 OCR; 1.4 → 2.1 / 3.5 mobile foundation).
- ✅ Riscos documentados com mitigações (PRD seção 10).
- 🟡 **Pendente:** stories detalhadas em `docs/stories/` — responsabilidade do SM no Sprint 1.

---

## 2. Mapeamento Assessment → PRD (rastreabilidade)

| Gap do Assessment | Severidade | Story PRD | Sprint |
|-------------------|------------|-----------|--------|
| `OPENAI_API_KEY` não confirmada | 🔴 Bloq | 1.1 | 1 |
| Total consolidado mensal no Dashboard | 🔴 Bloq | 1.2 | 1 |
| Notificações ao funcionário | 🔴 Bloq | 1.3 | 1 |
| `safe-area-inset` ausente | 🟡 Alta | 1.4 | 1 |
| Touch targets <44px na fila | 🟡 Alta | 2.1 | 2 |
| OCR baixa confiança não bloqueia | 🟡 Alta | 3.1 | 3 |
| Bottom nav ausente | 🟡 Média | 3.5 | 3 |
| Popover filtros estoura em 360px | 🟡 Média | 1.4 | 1 |
| Manifest PWA incompleto | 🟢 Baixa | 3.4 | 3 |
| Export PDF/CSV | 🟢 Backlog | — | pós-MVP |

✅ **100% dos gaps acionáveis cobertos.** Apenas Export PDF foi (corretamente) postergado para backlog.

### Stories adicionais ao assessment (PO valida pertinência)
- **2.2** Sinalização de despesas out-of-policy na fila → 🟢 **Aprovada** — vital para "aprovação BEM FEITA".
- **2.3** Aprovação parcial (rejeitar despesa individual) → 🟢 **Aprovada** — `expense_reviews` já existe e está subutilizada.
- **2.4** Histórico de aprovação visível ao funcionário → 🟢 **Aprovada** — fecha loop de feedback.
- **2.5** Tratamento de erro state em `ApprovalQueue` → 🟢 **Aprovada** — gap real (código atual não tem `if (error)` ramo).
- **2.6** Confirmação destrutiva ao rejeitar → 🟢 **Aprovada** — comprimento mínimo do comentário endurece o atual.
- **3.2** Tela "revisar e confirmar" antes de submit → 🟢 **Aprovada** — anti-erro.
- **3.3** Padronização de empty/loading/error states → 🟢 **Aprovada** — reflete princípio do usuário.

---

## 3. Open Questions — Resolução

| # | Pergunta | Decisão / Default | Bloqueia Sprint? |
|---|----------|-------------------|------------------|
| 1 | Provedor de email para notificações | **Default: Resend** (popular, 100 emails/dia free, simples). Confirmar com usuário antes de Story 1.3. | 🟡 Story 1.3 only |
| 2 | Branding mobile (logo, cores, ícones 192/512) | **Default: gerar ícones a partir de `favicon.ico` + cor `#131112` (graphite)**, ajustar manifest para `theme_color: #131112`, `background_color: #0f172a` mantido. Logo PNG exato fica como input opcional. | 🟢 Não bloqueia; afeta só Story 3.4 (Sprint 3). |
| 3 | Pilotos go-live (3-5 funcionários, data) | **Default: definir após Sprint 2** quando o produto estiver maduro. | 🟢 Não bloqueia desenvolvimento. |
| 4 | Out-of-office gestor (escalation) | **Decisão: pós-MVP.** Fluxo manual basta. | 🟢 Não bloqueia. |
| 5 | Auto-aprovação admin (manter ou restringir) | **Decisão: manter** conforme commit `fa3f8dd` — uso interno justifica. | 🟢 Não bloqueia. |

### ⚠️ Único item que precisa input do usuário antes do Sprint 1
- **Provedor de email**: confirmar Resend ou indicar alternativa antes de iniciar Story 1.3. Outras stories podem prosseguir em paralelo.

---

## 4. Backlog Ordenado (pronto para SM)

### Sprint 1 (ordem de execução sugerida)
1. **1.1** OPENAI_API_KEY (XS, devops, paralelizável)
2. **1.4** Mobile foundation (S, base para Sprint 2)
3. **1.2** Dashboard total mensal (M, paralelizável com 1.4)
4. **1.3** Notificações (M, depende da decisão de provedor)

### Sprint 2 (ordem de execução sugerida)
5. **2.1** Touch targets (XS, depende de 1.4)
6. **2.5** Toasts e error states (XS, paralelizável)
7. **2.2** Sinalização out-of-policy (S)
8. **2.6** Confirmação destrutiva (S)
9. **2.4** Histórico de aprovação (S)
10. **2.3** Aprovação parcial (M, dependência soft das 2.4 + 2.5)

### Sprint 3 (ordem de execução sugerida)
11. **3.1** OCR rigoroso (S, depende de 1.1)
12. **3.2** Revisar e confirmar (S)
13. **3.5** Bottom nav (S, depende de 1.4)
14. **3.3** Padronização states (M, transversal)
15. **3.4** Manifest PWA (S, depende de input branding ou usa default)

---

## 5. Stories Aceitas (Definition of Ready)

Para o SM (River) detalhar, cada story em `docs/stories/` deve conter:
- Frontmatter: `id`, `epic`, `priority`, `effort`, `dependencies`, `assignee` (vazio inicialmente).
- Narrativa "Como [persona], quero..., para...".
- Critérios de aceite em formato **Given/When/Then** (1 cenário feliz + 1 cenário mobile + 1 edge case mínimo).
- Notas técnicas com referência a arquivos/linhas atuais (`File:line`).
- Checklist de Definition of Done:
  - [ ] Implementação concluída
  - [ ] `npm run lint` sem erro
  - [ ] `npm run build` ok
  - [ ] Smoke test em viewport 390px (Chrome DevTools)
  - [ ] PR aberto com referência à story (`feat: [Story 2.x] título`)
  - [ ] QA review aprovado
  - [ ] Migração testada em ambiente local (se houver — relembrando: **só aditiva**)

---

## 6. Documentos Suplementares Gerados

Esta validação acompanha:
- [`docs/tech-stack.md`](./tech-stack.md) — stack técnica de referência para Dev/QA.
- [`docs/source-tree.md`](./source-tree.md) — mapa do código para SM/Dev navegarem.
- [`docs/coding-standards.md`](./coding-standards.md) — padrões mínimos (não introduzir nova fricção).
- [`docs/prd/`](./prd/) — PRD fragmentado por epic (1 arquivo por epic).

---

## 7. Decisão Final

✅ **APROVADO PARA SPRINT 1.**

**Próximo agente:** **River (`/agents:sm`)** para criar as stories detalhadas em `docs/stories/`, começando pelas 4 stories do Epic 1.

**Ressalva:** confirmar provedor de email com o usuário antes de iniciar implementação da Story 1.3 (paralelizável com 1.1, 1.2, 1.4).
