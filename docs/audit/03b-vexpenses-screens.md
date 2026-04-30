# VExpenses — Observações de telas internas (sessão logada)

**Origem:** 13 capturas fornecidas pelo usuário em 2026-04-30 (perfil colaborador, org "O2 Inc").
**Posicionamento da marca:** "vexpenses — uma solução VR" (logo + selo VR).

---

## 1. Dashboard Inicial (`/inicio-colaborador`)

### Layout
- **Sidebar fixa azul** com: Início (selecionado), Despesas, Relatórios, Saques/Adto, Configurações, Suporte.
- Header da org (`O2 Inc`) acima do menu.
- Topo: idioma `PT (BR)`, ícone "graduação" (provável onboarding/Academy), badge de notificações com contador (2), avatar.
- Saudação personalizada: "Olá, {nome}".

### Cards principais
- **Alertas** — destaca relatórios abertos pendentes ("Você possui relatórios abertos") com badge de contagem.
- **O que você gostaria de fazer?** — 4 atalhos em grade:
  1. Criar **despesa manual**
  2. Criar **relatório**
  3. Criar **percurso manual** (km/dia)
  4. Criar **percurso por mapa** (mileage tracker via mapa)
- **Resumo de Prestação de Contas** com seletor "Últimos 7 dias":
  - Suas despesas: avulsas + valor total
  - Seus relatórios: relatórios abertos + valor total
- **Recursos de Suporte** — Primeiros passos / Prestação de contas / Canais de atendimento / **App mobile com QR Code Google Play e App Store**.

### Widgets globais
- Chat de suporte flutuante ("Olá! Precisa de ajuda?").

### Insights pra Oxy VE
- Hub de ações é **task-oriented** (verbo + substantivo), não é menu técnico. Vale copiar.
- "Percurso por mapa" e "Percurso manual" são duas features distintas (não estão no Oxy VE).
- Resumo financeiro com timeframe configurável ("Últimos 7 dias" → 30 dias / mês corrente / etc).
- Alerts inline na home (call-to-action) em vez de notificações isoladas.

---

## 2. Lista de Despesas (`/despesas`)

### Filtros & tabs
- Tabs por status com contador inline: **Todas (26) / Avulsas / Abertas (6) / Enviadas / Reprovadas / Aprovadas (20) / Pagas**.
- Range de data De/Até (date picker), busca textual, **Mais filtros** (provável drawer com tipo, centro de custos, forma de pagamento, valor, etc).
- Ações em massa: **Excluir / Adicionar a um relatório / + Nova despesa**.

### Tabela
Colunas: Anexo (thumbnail), Data, Descrição, Tipo, Relatório, Valor, Status (badge colorido), Forma de pagamento, Ações (`···` menu).

Status visíveis: **Aberto** (amarelo) / **Aprovado** (verde).

### Insights pra Oxy VE
- Tabs com **contadores em tempo real** > nosso filtro atual.
- **Thumbnail do anexo direto na tabela** ajuda a identificar visualmente.
- Coluna "Relatório" com link para o pai → contexto rápido.
- Bulk actions ("Adicionar a um relatório" sobre N despesas avulsas) — falta no Oxy VE.

---

## 3. Lista de Relatórios (`/relatorios`)

### KPIs no topo (4 cards)
- Valor total
- Valor **reembolsável**
- Valor **não reembolsável**
- Valor **médio por relatório**

> Cada card tem ícone informativo (`ⓘ`) provável tooltip.

### Tabs
Todos (1) / Abertos (1) / Enviados / Reprovados / Aprovados / Pagos. + filtro de data + **Mais filtros**.

### Tabela
ID (formato `#XXXXXXXX`), Descrição, Data, Status, Total, Ações.

### Insights pra Oxy VE
- KPIs do header acima da tabela são **forte hook** pra dashboard executivo.
- Distinção **reembolsável vs não-reembolsável** é fundamental e está ausente no Oxy VE (despesa em cartão corp não é reembolsável; em cartão pessoal é).

---

## 4. Configurações > Meus Dados

Campos:
- **Dados pessoais**: Nome, Email (read-only?), CPF/CNPJ, Data de Nascimento, Telefone (obrigatório, com validação inline "Por favor, preencha o telefone"), Telefone secundário, Moeda Padrão, Cargo.
- **Dados bancários**: Banco, Agência, Conta.

Botão **Salvar** desabilitado até preencher campo obrigatório.

### Insights pra Oxy VE
- **CPF/CNPJ obrigatório** — base pra integração contábil/NF-e.
- Dados bancários no perfil do funcionário → **reembolso direto via PIX/TED** sem precisar de RH.
- Validação inline + Salvar disabled é UX padrão Material Design — Oxy VE atual usa toast (pior).

---

## 5. Modal "Selecione o que você deseja adicionar"

3 opções: **Despesa manual / Percurso manual / Percurso por mapa**.

> Cartão corporativo NÃO aparece aqui — provavelmente é integração separada (não captura manual).

---

## 6. Modal "Nova despesa" (Step 1 de 2)

### Stepper 1 → 2
1. **Dados da despesa** (atual)
2. **Selecionar relatório**

### Campos do step 1
- Descrição da despesa (livre)
- **Moeda*** (default BRL — multimoeda)
- **Valor***
- **Tipo*** (dropdown — categoria)
- **Data*** (default hoje)
- **Centro de custos*** (default herda da org)
- Forma de pagamento (dropdown)
- **Reembolsável** (checkbox)
- **Observações**
- **Rateio** (`+ Adicionar`) — split contábil entre centros de custo / projetos
- **Selecione um comprovante** — drag & drop, formatos `PDF/JPEG/PNG/JPG` (sem HEIC explícito)

### Insights pra Oxy VE
- **Multimoeda nativa** com seletor por despesa (Oxy VE só tem currency no profile, não no lançamento).
- **Rateio** = funcionalidade contábil obrigatória pra B2B. Falta no Oxy VE.
- **Reembolsável vs não** = checkbox simples, mas com impacto downstream em relatório.
- Stepper 2 etapas evita formulário gigante.
- Não vimos OCR aqui — provável que o OCR do VExpenses só rode em mobile ou após upload (vale validar).

---

## 7. Modal "Selecionar relatório" (Step 2 do flow despesa)

- Lista de relatórios abertos com: **#ID curto (DAF10)**, Título, contador de despesas, data de criação, total.
- Search por ID ou título.
- **+ Criar relatório** inline (atalho que abre modal de criação).
- **Cancelar / Vincular despesas** (CTA primário).

### Insights pra Oxy VE
- Atrelar despesa→relatório no momento do lançamento (em vez de exigir relatório pré-existente) → reduz fricção.

---

## 8. Modal "Criar relatório"

Campos:
- Título*
- Centro de custos (default O2 Inc)
- **Projeto** ← campo novo (não tem no Oxy VE)
- Forma de pagamento
- **Vincular adiantamento** ← cruza com módulo Saques/Adto
- Observações

### Insights pra Oxy VE
- **Projeto** como dimensão paralela a centro de custos → essencial pra empresas que faturam por cliente/projeto.
- **Vincular adiantamento direto na criação do relatório** → fluxo "viajei com R$1000 adiantado" automatizado.

---

## 9. Detalhe do Relatório (`/relatorios/{id}`)

### Header
- `#10247538 - Andrey - MAI` + badge "**Aberto**".
- Breadcrumb: Relatórios > #ID.
- CTAs:
  - **Mais ações** (dropdown) → Baixar em **Excel** / Baixar em **PDF** / Editar relatório / **Enviar por e-mail** / Excluir relatório
  - **Exibir histórico** → drawer com timeline ("Relatório criado por X em DD/MM AS HH:MM")
  - **+ Adicionar despesa**
  - **Enviar para aprovação** (CTA primário azul)

### Detalhes (4 cards de KPI)
- Total de despesas (count)
- Valor reembolsável
- Valor não reembolsável
- Valor total

### Tabela "Despesas do relatório"
Data, Descrição, Tipo, Centro de custos, Forma de pagamento, Valor.

### Resumo em valores (toggle tabela ↔ gráfico)
- Por **Tipo de despesa** (com %)
- Por **Reembolso** (reembolsável %, não-reembolsável %)
- Por **Forma de pagamento** (cartão, dinheiro, PIX, etc)

### Visualização **gráfica** (toggle)
- Bar charts horizontais com %, intuitivos.

### Insights pra Oxy VE
- **Histórico (timeline) por relatório** = audit trail visível pro usuário.
- Export Excel + PDF + email = essencial pra contabilidade.
- **Toggle tabela ↔ gráfico** no mesmo card é inteligente.
- Categorização contábil (Tipo, Centro de custos) já agregada por % → executivo entende em 3s.

---

## 10. Sistema de Notificações (sino)

Tabs do popover: **Todas / Ações necessárias / Minhas despesas / Outras**.

Exemplos vistos:
- "Pagamento de relatório efetuado — Informamos que o pagamento do relatório 'X' no valor de BRL Y,YY foi efetuado com sucesso. {data}"

### Insights pra Oxy VE
- Notificações categorizadas (não é uma lista única) — manager vê "Ações necessárias", colaborador vê "Minhas despesas".
- Mensagens são **descritivas** (frase completa) com valor, data — não só "evento Z aconteceu".
- Falta no Oxy VE: módulo de notificações nem existe (Quinn confirmou).

---

## 11. Recursos de Suporte (footer da home)

- Primeiros passos (onboarding)
- Prestação de contas (FAQ)
- Canais de atendimento
- App mobile (QR codes para Google Play e App Store)

### Insights pra Oxy VE
- App mobile **nativo** (não PWA): `com.vexpenses.android2` confirmado.
- Onboarding embutido reduz suporte.

---

## 12. Idioma e i18n
- Seletor `PT (BR)` no header → multilíngue (provável EN + ES).
- Oxy VE atual: hardcoded PT-BR.

---

## 13. Branding e estilo visual
- **Azul corporativo** dominante (`#1e6cf2` aprox), branco/cinza como neutros.
- Sidebar **dark blue** + main canvas **off-white**.
- Cards com sombra suave, bordas arredondadas (≈8px).
- Ícones lucide-style outline.
- Tipografia sans-serif (provável Inter ou similar).
- Imagens vazias com ilustrações simples (estilo undraw).

> Oxy VE atual usa shadcn/Tailwind padrão (graphite + primary). Muito próximo. **Cópia visual fiel é viável** sem grande esforço.

---

## Mapa de gaps confirmados/refinados via screenshots

| # | Feature VExpenses | Oxy VE atual | Gap | Prioridade |
|---|---|---|---|---|
| G-001 | Percurso manual (km × R$/km) | Ausente | Sim | Alta |
| G-002 | Percurso por mapa (Google Maps) | Ausente | Sim | Média |
| G-003 | Reembolsável vs não-reembolsável | Ausente | Sim | **Alta** |
| G-004 | Multimoeda por despesa | Parcial (só profile) | Sim | Média |
| G-005 | Centro de custos por despesa | Ausente | Sim | **Alta** |
| G-006 | Projeto (dimensão paralela) | Ausente | Sim | Alta |
| G-007 | Rateio entre centros/projetos | Ausente | Sim | Alta |
| G-008 | Vincular adiantamento ao relatório | Adto é placeholder | Sim | **Alta** |
| G-009 | Export Excel + PDF | Ausente | Sim | **Alta** |
| G-010 | Email de relatório | Ausente | Sim | Média |
| G-011 | Histórico/audit trail visível | Ausente | Sim | Alta |
| G-012 | Notificações categorizadas + persistentes | Ausente | Sim | **Alta** |
| G-013 | KPIs no header de Relatórios | Ausente | Sim | Média |
| G-014 | KPIs por relatório (4 cards) | Parcial | Sim | Média |
| G-015 | Toggle tabela ↔ gráfico | Ausente | Sim | Baixa |
| G-016 | Tabs com contadores | Ausente | Sim | Média |
| G-017 | Bulk action "adicionar a relatório" | Ausente | Sim | Alta |
| G-018 | Thumbnail anexo na tabela | Ausente | Sim | Baixa |
| G-019 | App mobile nativo (Android/iOS) | Ausente | Sim | Médio prazo |
| G-020 | Idioma / i18n | Ausente | Sim | Baixa |
| G-021 | Dados bancários no perfil | Ausente | Sim | Alta |
| G-022 | CPF/CNPJ + dados fiscais no perfil | Ausente | Sim | Alta |
| G-023 | Onboarding embutido (Academy/Primeiros passos) | Ausente | Sim | Baixa |
| G-024 | Modal "Criar relatório" durante lançamento | Ausente (dois fluxos isolados) | Sim | Média |

---

## Observações estratégicas finais

1. **Cópia visual fiel é fácil** — UI shadcn/Tailwind do Oxy VE pode ser tunada pra match em 1-2 dias com tokens de cor/spacing.
2. **Cópia funcional fiel é dura** — rateio, multimoeda, percurso, projetos, adiantamentos, dimensões contábeis = ~30 dias de dev.
3. **Diferenciais sugeridos** (cópia melhorada):
   - **OCR no upload** (já temos! VExpenses parece não ter no web)
   - **IA de categorização** automática pós-OCR
   - **Free tier** até 5 usuários → captação PME
   - **Integração NF-e** nativa por CNPJ
   - **Dashboard exec** (KPIs trimestrais + outliers) sem precisar de Power BI
4. **Quick wins (impacto alto / esforço baixo) baseados nos screens**:
   - Tabs com contadores
   - 4 KPIs no topo de Relatórios
   - Reembolsável (boolean) na despesa
   - Histórico do relatório (audit trail)
   - Centro de custos por despesa (campo + filtro)
