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

## Sprint 2 — Aprovação BEM FEITA (Epic 2)

| Story | Título | Esforço | Status | Agente sugerido |
|-------|--------|---------|--------|-----------------|
| [2.1](./2.1-touch-targets-fila-aprovacao.md) | Touch targets ≥44px na fila | XS | Approved | `/agents:dev` |
| [2.2](./2.2-fila-destaca-fora-politica.md) | Fila destaca despesas fora da política | S | Approved | `/agents:dev` |
| [2.3](./2.3-aprovacao-parcial-despesa.md) | Aprovação parcial — rejeitar despesa individual | M | Approved | `/agents:dev` |
| [2.4](./2.4-historico-aprovacao.md) | Histórico de aprovação visível ao funcionário | S | Approved | `/agents:dev` |
| [2.5](./2.5-mensagens-claras-aprovacao.md) | Mensagens claras + error state | XS | Approved | `/agents:dev` |
| [2.6](./2.6-confirmacao-destrutiva-rejeicao.md) | Confirmação destrutiva ao rejeitar — drawer + 10 chars | S | Approved | `/agents:dev` |

### Ordem sugerida (Sprint 2)
1. **2.1** Touch targets (XS, depende de 1.4)
2. **2.5** Toasts e error states (XS, paralelizável)
3. **2.2** Sinalização out-of-policy (S)
4. **2.6** Confirmação destrutiva (S, depende de 1.4 e 2.5)
5. **2.4** Histórico de aprovação (S)
6. **2.3** Aprovação parcial (M, soft de 2.4 e 2.5)

> **Nota de coordenação:** as stories 2.1, 2.2, 2.5 e 2.6 tocam `ApprovalQueue.tsx`. Sugestão: agrupar 2.5+2.6 em 1 PR ou serializar para evitar conflitos. As stories 2.3, 2.4 e parte de 2.6 tocam `ReportDetail.tsx` — mesma sugestão.

## Sprint 3 — Polish dos Fluxos Core (Epic 3)

A detalhar após Sprint 2.

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
