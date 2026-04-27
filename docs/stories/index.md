# Stories — Backlog Detalhado

**Curador:** River (SM)
**Documentos-pai:** [`../prd/`](../prd/), [`../po-validation.md`](../po-validation.md)

## Sprint 1 — Destravar Uso Interno (Epic 1)

| Story | Título | Esforço | Status | Agente sugerido |
|-------|--------|---------|--------|-----------------|
| [1.1](./1.1-openai-api-key-config.md) | Configurar `OPENAI_API_KEY` na edge function | XS | Approved | `/agents:devops` |
| [1.2](./1.2-dashboard-total-mensal.md) | Dashboard com total consolidado mensal | M | Approved | `/agents:dev` |
| [1.3](./1.3-notificacoes-aprovacao.md) | Notificações ao funcionário em aprovação/rejeição | M | Approved | `/agents:dev` |
| [1.4](./1.4-mobile-foundation.md) | Quick wins mobile foundation | S | Approved | `/agents:dev` |

## Próximos Sprints

- **Sprint 2 — Aprovação BEM FEITA** (Epic 2, 6 stories): a detalhar após Sprint 1.
- **Sprint 3 — Polish dos Fluxos Core** (Epic 3, 5 stories): a detalhar após Sprint 2.

## Fluxo de cada story

```
Approved (PO) → In Progress (Dev) → Review (QA) → Done (PO accept)
```

## Como o Dev usa estes arquivos

1. Lê a story do topo ao DoD.
2. Executa em branch `feature/story-X.Y-<slug>` (River só cria branch local; push/PR é DevOps).
3. Marca CAs como `[x]` à medida que entrega.
4. Atualiza "Files Affected" com os arquivos realmente tocados.
5. Move status para "Review" e aciona QA.

## Ordem de execução sugerida (Sprint 1)

1. **1.1** OpenAI key (paralelizável, devops)
2. **1.4** Mobile foundation (base para Sprint 2)
3. **1.2** Dashboard mensal (paralelizável com 1.4)
4. **1.3** Notificações (depende de Resend confirmado — ✅ aprovado pelo usuário)
