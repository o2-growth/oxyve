# Epic 3 — Polish dos Fluxos Core

**Sprint:** 3 (estimado 1 semana)
**Severidade:** 🟢 Polish e robustez
**Objetivo:** garantir que cadastro de despesa, comprovante+OCR, relatório e dashboard também estejam "bem feitos".

## Stories

### Story 3.1 — OCR rigoroso: divergência ou baixa confiança bloqueia submit
- **Persona:** Funcionário / Admin
- **Esforço:** S (~4h)
- **Dependências:** Story 1.1 (`OPENAI_API_KEY` confirmada)
- **Narrativa:** Como funcionário/admin, quero que o sistema me alerte e exija confirmação quando OCR detectar divergência grave ou ler com baixa confiança, para não submeter dados errados.
- **Critérios de aceite:**
  - Se `confidence === 'low'` ou se `data extraída != data do form` ou `valor extraído != valor do form` (com tolerância de centavos): UI exibe banner amarelo no formulário com texto exato da divergência.
  - Botão "Salvar" só habilita após o usuário marcar checkbox "Confirmo os valores acima estão corretos".
  - Despesa salva com flag interna `ocr_warning_acknowledged` (nova coluna ou JSON em `notes` — Dara decide).
  - **Mobile:** banner ocupa largura total; checkbox com label tocável `≥44px`.
  - **Edge case:** se OCR falhar (Story 1.1 cenário 503), banner muda para "OCR indisponível, valide manualmente" e checkbox segue obrigatório.
- **Notas técnicas:** ajustes em `src/components/expenses/ReceiptValidation.tsx`, `src/components/expenses/ExpenseFormDialog.tsx`, `src/hooks/useValidateReceipt.ts`. Coluna nova: `expenses.ocr_warning_acknowledged` BOOLEAN DEFAULT false (migration aditiva).

---

### Story 3.2 — Tela "revisar e confirmar" antes de submeter relatório
- **Persona:** Funcionário
- **Esforço:** S (~4-6h)
- **Dependências:** nenhuma
- **Narrativa:** Como funcionário, quero revisar todas as despesas de um relatório antes de submeter para aprovação, para evitar erros.
- **Critérios de aceite:**
  - Em `ReportDetail.tsx`, ao clicar "Submeter para aprovação", abre drawer/dialog com:
    - Lista resumida das despesas (data, descrição, valor).
    - Total geral.
    - Aviso destacado se houver despesas com `is_out_of_policy=true`.
    - Aviso se houver despesa criada manualmente sem comprovante (ou OCR não confirmado).
    - Botão "Confirmar e Enviar" (primário) e "Voltar" (secundário).
  - Ação só executa após confirmação explícita.
  - **Mobile:** drawer bottom-sheet ocupando ~80% da tela; scroll interno se passar de N despesas.
- **Notas técnicas:** novo componente `<SubmitReportConfirmDrawer>` em `src/components/reports/`; integração em `ReportDetail.tsx`.

---

### Story 3.3 — Empty/loading/error states padronizados
- **Persona:** Todos
- **Esforço:** M (~1-2 dias)
- **Dependências:** nenhuma
- **Narrativa:** Como usuário, quero que cada tela me diga claramente quando está carregando, sem dados ou com erro, para não ficar perdido.
- **Critérios de aceite:** revisar e padronizar em:
  - `Dashboard.tsx` — loading skeleton, error toast com retry.
  - `Expenses.tsx` — empty ("Nenhuma despesa lançada — comece criando uma"), loading, error.
  - `Reports.tsx` — empty, loading, error em cada aba.
  - `ReportDetail.tsx` — loading skeleton estruturado, 404 explícito ("Relatório não encontrado ou sem permissão").
  - `Settings*` — error states em cada CRUD.
  - Componente único `<EmptyState>` (já existe) usado como padrão.
  - **Mobile:** skeletons respeitam altura natural do conteúdo (não saltam quando carrega).
- **Notas técnicas:** varrer todas as telas em `src/pages/app/`, identificar onde falta cada estado, usar componentes existentes.

---

### Story 3.4 — Manifest PWA com ícones e marca corretas
- **Persona:** Todos
- **Esforço:** S (~2-4h)
- **Dependências:** identidade visual final (default: usar atual)
- **Narrativa:** Como usuário, quero instalar o oxyve como app na tela inicial do celular, para acessar como app nativo.
- **Critérios de aceite:**
  - `manifest.json`:
    - `theme_color` alinhado à identidade (default `#131112` graphite ou cor a confirmar com PO).
    - Ícones em 192x192 e 512x512 (purpose `any` e `maskable`).
    - `name`, `short_name`, `description` em pt-BR (já estão).
  - Banner "Adicionar à tela inicial" customizado em iOS (Safari não dispara prompt).
  - **Mobile:** verificar instalação em iOS (Safari) e Android (Chrome); ícone aparece sem fundo branco.
- **Notas técnicas:** gerar ícones PNG (PWA Asset Generator ou similar); ajustar `public/manifest.json`.

---

### Story 3.5 — Bottom navigation em mobile
- **Persona:** Todos os usuários mobile
- **Esforço:** S (~4-6h)
- **Dependências:** Story 1.4 (safe-area)
- **Narrativa:** Como usuário mobile, quero acessar as principais áreas (Dashboard, Despesas, Relatórios, Mais) com 1 toque, para reduzir fricção.
- **Critérios de aceite:**
  - Bottom nav fixa em mobile (≤768px) com 4 ícones + labels: Dashboard, Despesas, Relatórios, Mais (drawer com Settings/Support).
  - Sidebar atual desativada em mobile (já fechada por padrão; pode ser removida da árvore mobile).
  - Active state visualmente claro (cor primária + indicador).
  - Respeita `safe-area-inset-bottom` (iPhones com home bar).
  - **Edge case:** rota dentro de `Settings/*` mantém o ícone "Mais" ativo.
- **Notas técnicas:** novo `src/components/layout/BottomNav.tsx`; ajustes em `src/components/layout/AppShell.tsx`.
