# PRD Fragmentado — Índice

**Documento mestre:** [`../prd.md`](../prd.md)
**Validação PO:** [`../po-validation.md`](../po-validation.md)

Este diretório contém o PRD fragmentado por epic, formato dev-ready para o ciclo SM → Dev → QA → DevOps.

## Epics

| Epic | Sprint | Foco | Stories |
|------|--------|------|---------|
| [Epic 1 — Destravar Uso Interno](./epic-1-destravar-uso-interno.md) | 1 | Bloqueadores reais | 1.1, 1.2, 1.3, 1.4 |
| [Epic 2 — Aprovação BEM FEITA](./epic-2-aprovacao-bem-feita.md) | 2 | Fluxo de aprovação robusto | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 |
| [Epic 3 — Polish dos Fluxos Core](./epic-3-polish-fluxos-core.md) | 3 | Despesa/OCR/Relatório/Dashboard polidos | 3.1, 3.2, 3.3, 3.4, 3.5 |

## Princípios herdados (do PRD)

1. **Qualidade > novas features.**
2. **Mobile-first**: todo critério de aceite tem cenário mobile.
3. **Cortar escopo agressivamente** — ver não-goals em [`../prd.md`](../prd.md#5-non-goals-declaradamente-fora-do-mvp).
4. **Aproveitar o que já existe** (schema, RPCs, RLS, edge function).

## Próximo passo

→ **River (`/agents:sm`)** cria as stories detalhadas em `docs/stories/`, começando pelo Epic 1.
