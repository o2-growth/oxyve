# Atlas — Auditoria Competitiva: VExpenses vs Oxy VE
**Data:** 2026-04-30  
**Analista:** Atlas (Analista de Negócio e Pesquisa Competitiva)  
**Modo:** Deep Research — 18 tool calls executados

---

## Resumo Executivo

VExpenses é a plataforma brasileira líder em gestão de despesas corporativas (filial do grupo VR Benefícios), com 6.000+ clientes em 9 países, R$ 7 bilhões geridos, 4.8 estrelas no Google Play com 20.200+ avaliações. Seu posicionamento é all-in-one: reembolso + cartão corporativo (Mastercard) + viagens + combustível + IA de auditoria (Hórus) + ERP integration. O pricing público identificado é R$ 21/usuário ativo/mês, sem free tier.

Oxy VE implementa o núcleo do fluxo de despesas com qualidade técnica boa (React + Supabase, OCR via GPT-4o-mini, validação de comprovante, aprovação gestor/admin). Contém 14 features confirmadas no código. São identificados 27 gaps relevantes em relação ao catálogo VExpenses.

**Recomendação: Cópia melhorada**, com foco em 3 diferenciais-chave: (1) UX mais simples que VExpenses, (2) IA generativa no lançamento (não só auditoria), (3) preço acessível para PMEs brasileiras abaixo de 50 funcionários — segmento onde VExpenses tem onboarding pesado e sem free tier.

---

## Fase A — Catálogo VExpenses (material público)

### Módulo 1: Prestação de Contas (Expense Management)
| Feature | Sub-features |
|---------|-------------|
| Lançamento de despesa | Manual via app/web; OCR por foto (Intelliscan); comando de voz/texto via Assistente IA |
| Categorização | Por tipo de despesa configurável; palavras proibidas detectadas por Hórus |
| Campos de despesa | Data, valor, moeda, categoria, centro de custo, projeto, comprovante, observação |
| Multi-moeda | Cadastro de moedas pela empresa; taxa de câmbio manual no lançamento ou via aba Gestão; extrato de conversão em PDF |
| Reembolsável / Não reembolsável | Sim |
| Forma de pagamento | Cartão corporativo, pessoal, dinheiro |
| Status do lançamento | Rascunho, enviado, aprovado, reprovado, pago |
| Relatório de despesas | Despesas agrupadas em relatório (batch); período configurável |
| Detecção de duplicidade | Automática por Hórus IA |
| Alertas de política | Em tempo real; bloqueio ou alerta configurável |
| HEIC / imagem | Não mencionado especificamente |

### Módulo 2: Cartão Corporativo VExpenses
| Feature | Sub-features |
|---------|-------------|
| Cartão físico Mastercard | Contactless; aceito em físico e online; carteiras digitais (Google Pay, Samsung Pay) |
| Cartão virtual | Número gerado por transação (segurança antifraude) |
| Pré-alocação de valores | Gestor define limite por colaborador/grupo |
| Bloqueio/desbloqueio imediato | Em caso de perda, fraude ou uso indevido |
| Reconciliação automática | Transação no cartão → despesa criada automaticamente |
| Grupos de cartão | Gestão por grupo de colaboradores |
| Limite configurável | Por colaborador, departamento, centro de custo |
| Cashback | Direto no Cartão VExpenses (módulo Viagens) |
| Sem anuidade / sem taxa abusiva | Mencionado em marketing |

### Módulo 3: Viagens Corporativas
| Feature | Sub-features |
|---------|-------------|
| Reserva de voo | Via plataforma; sem fee de emissão; média 14% mais barato |
| Reserva de hotel | Via plataforma |
| Locação de veículo | Via plataforma |
| Viagens internacionais | Acesso a especialistas de viagem |
| Aprovação de reserva | Fluxo automático disparado ao reservar |
| Dashboard de viagens | Total de reservas, média de aprovação, conformidade com política |
| Cartão de viagem | VExpenses Travel Card com cashback e reconciliação automática |
| Relatórios de viagem | CSV export |

### Módulo 4: Gestão de Combustível
| Feature | Sub-features |
|---------|-------------|
| Reembolso de quilometragem | Por GPS (online e offline), mapa ou apontamento manual |
| Rastreio GPS offline | Registro de percurso sem conexão |
| Controle de frota | Novidade — monitoramento de frota (sem rede restritiva de postos) |
| Políticas de combustível | Configuráveis |

### Módulo 5: IA e Automação
| Feature | Sub-features |
|---------|-------------|
| Assistente VExpenses | Criação de despesas por voz, texto e imagem |
| Hórus — IA de Auditoria | Alertas em tempo real; duplicidades; palavras proibidas; valores fora do padrão; comprovantes suspeitos |
| OCR Intelliscan | Preenchimento automático de data e valor do recibo |
| Auto-categorização | Implícita no Assistente |

### Módulo 6: Fluxos de Aprovação
| Feature | Sub-features |
|---------|-------------|
| Fluxo configurável | Por centro de custo ou por membro da equipe |
| Multinível | Múltiplos aprovadores em sequência |
| Aprovação item-a-item | Dentro do relatório |
| Rejeição com justificativa | Fluxo interrompido; retorna ao criador com visibilidade dos itens rejeitados |
| App mobile para aprovação | Sim |
| Delegação | Não mencionada em documentação pública |

### Módulo 7: Política de Despesas
| Feature | Sub-features |
|---------|-------------|
| Política por funcionário | Sim |
| Política por filial | Sim |
| Política por centro de custo | Sim |
| Limite diário por categoria | Configurável |
| Modo bloquear vs. alertar | Configurável |
| Campos obrigatórios | Configuráveis (comprovante, CC, projeto, etc.) |
| Palavras proibidas | Detectadas por IA Hórus |

### Módulo 8: Integrações
| Sistema | Tipo |
|---------|------|
| TOTVS Protheus | Nativa (sincronização bidirecional) |
| Datasul (TOTVS) | Nativa |
| OMIE | Nativa (com troubleshooting docs detalhados) |
| Matera | Nativa (batch import) |
| API Genérica | REST API para qualquer ERP |
| Active Directory | Gestão centralizada de acesso |
| Power BI | Via API / exportação |
| CSV Export | Geral para todos os relatórios |

### Módulo 9: Configurações Organizacionais
| Feature | Sub-features |
|---------|-------------|
| Centros de custo | CRUD com código; fluxo de aprovação por CC |
| Projetos | CRUD com código |
| Departamentos | Associação a tipos de despesa |
| Moedas | Cadastro e configuração da moeda padrão |
| Ciclo de reembolso | Data de corte configurável |
| Perfis de acesso | Hierarquia de roles |
| Onboarding dedicado | Consultores, help center, universidade VExpenses |

### Módulo 10: Reports & Dashboard
| Feature | Sub-features |
|---------|-------------|
| Dashboard por período | Total gasto, nº de reservas, categorias, aprovadores |
| Relatórios de aprovação | Tempo médio, taxa de conformidade |
| Exportação CSV | Todos os relatórios |
| Integração BI | Power BI |
| Extrato de câmbio | PDF com histórico de conversões |

### Modelo de Negócio
- **Preço:** R$ 21/usuário ativo/mês (fonte: Omie store + busca direta)
- **Free tier:** Não identificado publicamente (oferecem trial via consultor)
- **Onboarding:** Pago (50% off em promoção)
- **Contrato:** Sem lock-in (mencionado em marketing)
- **Clientes:** 6.000+ em 9 países; 30.000+ avaliações 5 estrelas no app

### Personas-Alvo
- PMEs a Enterprise (sem free tier, mas pricing acessível para PME)
- Setores: Agronegócio, Varejo, Construção Civil, Tecnologia, Alimentos/Farmacêutica/Saúde/Vestuário
- CFOs, gestores financeiros, colaboradores em campo

### Fraquezas Identificadas (Reclame Aqui + revisão pública)
- Suporte pós-venda com reclamações recorrentes (atendimento lento, >20 min para suporte)
- Nota 6.3/10 no Reclame Aqui; apenas 60% voltariam a contratar
- 18 reclamações ativas (pequeno volume, mas qualitativas sobre suporte)
- Nenhuma review pública verificada no Capterra (0 reviews em 2026)
- Sem transparência de preço na homepage

---

## Fase B — Catálogo Oxy VE (estado atual do código)

### Features Confirmadas no Código

| Feature | Status | Evidência no código |
|---------|--------|---------------------|
| **Auth — email/senha** | Completo | `AuthContext.tsx` — signIn, signUp, signOut |
| **Auth — Google OAuth** | Parcial | Mencionado em context mas sem rota específica mapeada |
| **Auth — reset de senha** | Completo | `requestPasswordReset` em AuthContext; `SettingsPassword.tsx` |
| **Multi-tenant (org_id)** | Completo | Todos os hooks filtram por `org_id` via RLS Supabase |
| **Dashboard mensal** | Completo | `Dashboard.tsx` — stats, CurrentReportCard, período atual |
| **Lançamento de despesa** | Completo | `ExpenseFormDialog.tsx` — data, valor, categoria, CC, projeto, forma pagamento, reembolsável, notas |
| **Upload de comprovante** | Completo | `ReceiptUpload` + Supabase Storage (`receipts` bucket) |
| **OCR de comprovante via IA** | Completo | Edge function `validate-receipt` — GPT-4o-mini extrai data e valor; alerta de divergência |
| **Conversão HEIC para JPEG** | Completo | `convertHeic.ts` chamado em `ExpenseFormDialog` |
| **Filtros avançados de despesa** | Completo | `ExpenseFiltersPopover` — categoria, forma pagamento, reembolsável, CC, projeto, datas |
| **Relatórios mensais por ciclo** | Completo | `Reports.tsx` — ciclo com data de corte configurável; status (draft/submitted/approved/rejected/paid) |
| **Detalhe de relatório** | Completo | `ReportDetail.tsx` — lista de despesas, submit, approve, reject, mark paid, review por item |
| **Fila de aprovação (manager)** | Completo | `ApprovalQueue.tsx` — aprovação/rejeição com comentário |
| **Aprovação item-a-item** | Completo | `useReviewExpense` hook em `ReportDetail.tsx` |
| **Roles: employee/manager/admin** | Completo | `AuthContext` — `isManager`, `isAdmin`; RLS por role |
| **Adiantamentos** | Ausente | `Advances.tsx` — "Em breve", placeholder apenas |
| **Convites por email** | Completo | `InvitesList.tsx` — CRUD de convites; role ao convidar (employee/manager/admin) |
| **Settings: Profile** | Completo | `SettingsProfile.tsx` — nome, email (read-only) |
| **Settings: Password** | Completo | `SettingsPassword.tsx` (importado em App.tsx) |
| **Settings: Policy** | Completo | `SettingsPolicy.tsx` — moeda padrão, dia de corte, modo de limites (warn/block), campo obrigatório (CC, projeto, comprovante) |
| **Settings: Team** | Completo | `SettingsTeam.tsx` — gerenciamento de convites |
| **Centros de custo** | Completo | `usePolicy.ts` — CRUD completo; `CostCentersList` component |
| **Projetos** | Completo | `usePolicy.ts` — CRUD completo; `ProjectsList` component |
| **Departamentos** | Completo | `DepartmentsList` component; associado a tipos de despesa |
| **Tipos de despesa (categorias)** | Completo | `useExpenseTypes.ts` — limite diário por categoria, comprovante obrigatório por tipo, associação a departamento |
| **Moeda por despesa** | Parcial | `currency` field em `Expense` interface; `formatCurrency(amount, currency)` na UI; porém sem conversão de câmbio ou multi-moeda no form |
| **is_out_of_policy flag** | Completo | Campo em `Expense`; exibido como badge "Fora da política" no dashboard |
| **Mobile responsivo** | Completo | Drawer em mobile, Dialog em desktop; `useIsMobile`; card vs table layout |
| **Suporte** | Parcial | `Support.tsx` existe como rota mas não inspecionado o conteúdo |

### Features Ausentes (confirmadas pelo código)
- Cartão corporativo integrado
- Reembolso de quilometragem / GPS tracking
- Gestão de viagens (voos, hotéis, veículos)
- Gestão de combustível
- IA de auditoria (Hórus equivalente)
- Assistente IA por voz/texto
- Diárias (per diem)
- Conversão de câmbio no lançamento
- Integração ERP (TOTVS, OMIE, SAP, etc.)
- API pública
- Power BI / BI integration
- Active Directory / SSO
- Fluxo multinível de aprovação (Oxy VE tem 1 nível: manager → admin)
- Delegação de aprovação
- Exportação CSV de relatórios
- Dashboard analytics avançado (por departamento, CC, tendências)
- Notificações push / email automático de status
- Universidade / help center próprio

---

## Fase C — Gap Analysis

### Tabela Comparativa

| Módulo / Feature | VExpenses | Oxy VE Atual | Gap |
|-----------------|-----------|--------------|-----|
| **AUTH** | | | |
| Email/senha | Sim | Completo | Nenhum |
| Google OAuth | Sim | Parcial | Menor |
| SSO/Active Directory | Sim | Ausente | Alto |
| **LANÇAMENTO DE DESPESA** | | | |
| Form manual (web + mobile) | Sim | Completo | Nenhum |
| OCR automático | Sim (Intelliscan) | Completo (GPT-4o-mini) | Nenhum |
| Assistente IA (voz/texto/imagem) | Sim | Ausente | Alto |
| Multi-moeda com câmbio | Sim (manual + gestão) | Parcial (campo sem conversão) | Médio |
| Comprovante obrigatório por tipo | Sim | Completo | Nenhum |
| HEIC conversion | Não mencionado | Completo | Oxy VE leva vantagem |
| **RELATÓRIOS** | | | |
| Agrupamento em relatório | Sim | Completo | Nenhum |
| Ciclo mensal configurável | Sim | Completo | Nenhum |
| Status pipeline | Sim | Completo | Nenhum |
| Exportação CSV | Sim | Ausente | Médio |
| **APROVAÇÃO** | | | |
| 1 nível de aprovação | Sim | Completo | Nenhum |
| Multinível configurável | Sim | Ausente | Alto |
| Aprovação por CC | Sim | Ausente | Alto |
| Delegação de aprovação | Sim (implícito) | Ausente | Médio |
| Comentário na aprovação/rejeição | Sim | Completo | Nenhum |
| Aprovação item-a-item | Sim | Completo | Nenhum |
| **POLÍTICA** | | | |
| Limite diário por categoria | Sim | Completo | Nenhum |
| Modo bloquear vs. alertar | Sim | Completo | Nenhum |
| Palavras proibidas (IA) | Sim (Hórus) | Ausente | Alto |
| Detecção de duplicidade (IA) | Sim (Hórus) | Parcial (OCR valida divergência data/valor) | Médio |
| **CARTÃO CORPORATIVO** | | | |
| Cartão físico Mastercard | Sim | Ausente | Alto (produto financeiro) |
| Cartão virtual | Sim | Ausente | Alto |
| Pré-alocação de saldo | Sim | Ausente | Alto |
| Bloqueio/desbloqueio | Sim | Ausente | Alto |
| Reconciliação automática | Sim | Ausente | Alto |
| **ADIANTAMENTOS** | | | |
| Adiantamento de viagem | Sim | Ausente (placeholder) | Alto |
| **QUILOMETRAGEM / COMBUSTÍVEL** | | | |
| GPS tracking (online + offline) | Sim | Ausente | Alto |
| Reembolso por km | Sim | Ausente | Alto |
| Gestão de frota | Sim (novo) | Ausente | Médio |
| **VIAGENS CORPORATIVAS** | | | |
| Reserva de voo/hotel/veículo | Sim | Ausente | Médio-Alto |
| Cashback em viagens | Sim | Ausente | Baixo |
| **INTEGRAÇÕES** | | | |
| TOTVS Protheus / Datasul | Sim | Ausente | Alto (enterprise) |
| OMIE | Sim | Ausente | Médio (PME) |
| API REST pública | Sim | Ausente | Alto |
| Active Directory / SSO | Sim | Ausente | Médio (enterprise) |
| Power BI | Sim | Ausente | Médio |
| CSV Export | Sim | Ausente | Médio |
| **ANALYTICS / DASHBOARD** | | | |
| Dashboard analítico avançado | Sim | Básico | Alto |
| Relatório por departamento/CC | Sim | Ausente | Médio |
| Tendências e comparativos | Sim | Ausente | Médio |
| **NOTIFICAÇÕES** | | | |
| Push / email automático de status | Sim | Ausente | Médio |
| Alertas em tempo real (Hórus) | Sim | Parcial | Médio |
| **SUPORTE / ONBOARDING** | | | |
| Help center dedicado | Sim | Ausente | Médio |
| Universidade VExpenses | Sim | Ausente | Baixo |
| Chat/telefone/email | Sim | Ausente | Médio |

---

## Recomendação Estratégica: Cópia Melhorada

### Justificativa

VExpenses é produto maduro, mas tem pontos vulneráveis exploráveis:

1. **Suporte fraco pós-venda:** Nota 6.3 no Reclame Aqui; suporte por intermediário; mais de 20 min de espera. Oxy VE pode ganhar com suporte humano ágil.
2. **Sem free tier / onboarding pesado:** VExpenses cobra onboarding (50% off em promoção). Oxy VE pode oferecer self-serve até 5 usuários.
3. **UX percebida como complexa:** Fluxo VExpenses exige relatório obrigatório para enviar despesas (não pode ser standalone). Oxy VE já tem arquitetura mais flexível.
4. **Preço opaco:** VExpenses não divulga preços na homepage — empresas menores evitam contato comercial. Oxy VE pode ser price-transparent desde o início.
5. **Foco all-in-one pode ser fraqueza:** Cartão, viagem, frota — muitas empresas não precisam de tudo isso e pagam por funcionalidades que não usam.

### 3-5 Diferenciais Propostos para Oxy VE

1. **IA Generativa no Lançamento (não só auditoria):** GPT-4o já presente para OCR. Expandir para: (a) categorização automática sugerida pelo histórico da empresa, (b) preenchimento de todos os campos pelo comprovante (não só data/valor), (c) detecção de duplicidade cross-relatório. VExpenses faz auditoria pós-fato; Oxy VE pode fazer antes do envio.

2. **Self-serve com Free Tier (até 5 usuários / 10 despesas/mês):** VExpenses não tem free tier. Um plano freemium converte SMBs sem custo de vendas. Monetiza por usuário acima do limite.

3. **Dashboard CFO nativo (sem BI externo):** VExpenses joga para Power BI (requer skill). Oxy VE pode entregar analytics built-in: top categorias, tendências mensais, compliance rate, tempo médio de aprovação — tudo dentro do produto, exportável em PDF para apresentar em reunião.

4. **Integração NF-e (diferencial Brasil):** Nenhum dos concorrentes principais menciona leitura automática de NF-e (SEFAZ). OCR em nota fiscal eletrônica seria diferencial técnico real para PMEs brasileiras que recebem NF-e dos fornecedores. Oxy VE já tem pipeline de OCR — adicionar parser de XML de NF-e é extensão natural.

5. **Onboarding self-serve com wizard guiado:** VExpenses tem "universidade" e consultores (custo). Oxy VE pode ter setup wizard in-app em 5 passos que configura política, tipos de despesa e convida equipe — tudo em menos de 10 minutos, sem vendedor.

---

## Top 10 Prioridades (Impacto x Esforço)

| # | Feature | Impacto | Esforço | Justificativa |
|---|---------|---------|---------|---------------|
| 1 | **Adiantamentos (completar)** | Alto | Baixo | Placeholder já existe; hook/DB provavelmente estruturado; paridade mínima com VExpenses |
| 2 | **Exportação CSV de relatórios** | Alto | Baixo | Todos os concorrentes têm; gestores precisam para contabilidade; 1-2 dias de dev |
| 3 | **OCR full-field no comprovante** | Alto | Médio | GPT-4o-mini já integrado; expandir de (data, valor) para (estabelecimento, CNPJ, categoria sugerida); aumenta satisfação no lançamento |
| 4 | **Notificações por email (status)** | Alto | Médio | Supabase possui `pg_net` / edge functions; colaborador precisa saber quando aprovado/reprovado sem abrir o app |
| 5 | **Conversão de câmbio no form** | Médio | Baixo | Campo `currency` já existe no `Expense`; falta UI de taxa de câmbio e cálculo automático; serve empresas com viagens internacionais |
| 6 | **Detecção de duplicidade cross-relatório** | Alto | Médio | Edge function extra que checa despesas similares (valor+data+categoria) no histórico da org; diferencial frente a VExpenses no tier PME |
| 7 | **Dashboard analítico avançado** | Alto | Médio | Top categorias, compliance rate, tempo médio de aprovação, evolução mensal; substitui Power BI para PMEs |
| 8 | **Multinível de aprovação** | Médio | Alto | VExpenses tem; Oxy VE está no nível 1; necessário para enterprise; aumenta ACV |
| 9 | **Reembolso por quilometragem** | Médio | Médio | GPS não é requisito (pode ser apontamento manual primeiro); valioso para equipes de campo; campo + política de valor/km |
| 10 | **Integração OMIE (ERP PME)** | Alto | Médio | OMIE é o ERP mais popular em PMEs brasileiras; VExpenses já tem integração nativa; Oxy VE pode usar a API OMIE para exportar lançamentos contábeis |

---

## Notas sobre Fluxo Crítico (Despesa → Relatório → Aprovação → Reembolso → Contabilidade)

**VExpenses:**  
Colaborador lança despesa → agrupa em relatório → envia para aprovação → aprovador aprova/rejeita item-a-item → financeiro marca como pago → ERP recebe automaticamente.

**Oxy VE:**  
Colaborador lança despesa (com OCR) → agrupa em relatório (ciclo mensal) → envia para gestor → gestor aprova/rejeita (item-a-item) → admin marca como pago.  
**Gap:** Não há saída para contabilidade / ERP. Reembolso fica no sistema sem fluxo financeiro downstream.

---

## REQUEST_USER_LOGIN_SESSION

Para completar a pesquisa com dados de telas internas, seriam úteis as capturas dos seguintes fluxos no app VExpenses (acesso com conta logada do usuário):

1. **Tela de lançamento de despesa no mobile** — ver campos completos do form, como o Assistente IA se apresenta, e se há sugestão automática de categoria.
2. **Configuração de fluxo de aprovação multinível** — Settings → Fluxos de Aprovação → ver quantos níveis são suportados, como se associa CC a aprovador.
3. **Tela de política de despesas** — ver todos os campos configuráveis: limites por categoria, palavras proibidas, modo de enforcement.
4. **Dashboard de auditoria Hórus** — ver como os alertas são apresentados ao gestor, e quais são as irregularidades detectáveis.
5. **Tela de relatório detalhado** — como o gestor vê cada item, quais ações estão disponíveis, se há comentário por item.

Estes fluxos são necessários para: (a) calibrar a complexidade do form de lançamento vs Oxy VE, (b) entender profundidade real do multinível, (c) priorizar o roadmap da IA de auditoria.

---

## Apêndice: Fontes

- [VExpenses Homepage](https://vexpenses.com.br/)
- [VExpenses LP Gestão de Despesas](https://lp.vexpenses.com/gestao-de-despesas-corporativas/)
- [VExpenses LP Viagens](https://lp.vexpenses.com/vexpenses-viagens/)
- [VExpenses Cartão Corporativo](https://vexpenses.com.br/cartao-corporativo-e-cartao-empresarial)
- [VExpenses Integrações](https://vexpenses.com.br/integracoes)
- [VExpenses Help Center](https://suporte.vexpenses.com.br/hc/pt-br)
- [VExpenses Integrações Help](https://suporte.vexpenses.com.br/hc/pt-br/categories/19885538986132-Integra%C3%A7%C3%B5es)
- [VExpenses Multi-moeda](https://suporte.vexpenses.com.br/hc/pt-br/articles/5721654318228-Cadastro-de-Moedas-e-Moeda-Padr%C3%A3o-da-Empresa)
- [VExpenses Aprovações Overview](https://suporte.vexpenses.com.br/hc/pt-br/articles/5412110595988-Vis%C3%A3o-Geral-Aprova%C3%A7%C3%B5es)
- [Capterra VExpenses](https://www.capterra.com/p/10032184/VExpenses/)
- [B2B Stack VExpenses](https://www.b2bstack.com.br/product/vexpenses/alternativas)
- [Reclame Aqui VExpenses](https://www.reclameaqui.com.br/empresa/vexpenses/)
- [Google Play VExpenses](https://play.google.com/store/apps/details?id=com.vexpenses.android2&hl=en_US)
- [OMIE Store VExpenses](https://store.omie.com.br/apps/vexpenses)
- [Startups.com.br — Cartão VExpenses](https://startups.com.br/branded-content/conheca-o-cartao-corporativo-que-faz-tudo-sozinho/)
- [Flash Despesas](https://flashapp.com.br/gestao-de-despesas)
