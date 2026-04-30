# Aria — Architectural Assessment: Oxy VE Frontend

**Data:** 2026-04-30  
**Scope:** src/{App,main,contexts,hooks,pages,integrations,lib}, tsconfig.app.json, vite.config.ts, eslint.config.js  
**Agente:** Aria (Arquiteta de Sistemas)

---

## Resumo Executivo

O frontend foi gerado via Lovable e apresenta estrutura de módulos razoavelmente coerente (hooks por domínio, camada de layout isolada), mas sofre de **dívida técnica sistêmica**: TypeScript sem strict, 39 erros ESLint ignorados por configuração, ausência total de code-splitting (bundle único 2.3MB), e padrões de data-fetching que geram N+1 queries por design. Dois problemas críticos se destacam: (1) uma race condition no bootstrap de autenticação pode executar `runBootstrap` duas vezes simultaneamente em toda sessão nova, e (2) há três funções de ação de relatório duplicadas e inativas em `useReports.ts` que divergem silenciosamente do fluxo RPC utilizado em produção. Nenhum error boundary existe; qualquer exceção React derruba a UI inteira.

---

## Achados por Categoria

### 1. State Management

#### [P1] Race condition no bootstrap de autenticação — dupla chamada a `runBootstrap`

**Localização:** `/Users/andreylopes/oxyve/src/contexts/AuthContext.tsx:97-121`

**Evidência:**
```typescript
// onAuthStateChange handler (linha 104)
setTimeout(() => runBootstrap(session.user.id), 0);

// getSession().then (linha 118)  
runBootstrap(session.user.id);
```

**Root Cause:** `getSession()` é chamado **depois** de `onAuthStateChange` ser registrado. Em sessões existentes (tab reaberta, refresh), Supabase dispara o evento `onAuthStateChange` com a sessão ativa imediatamente. O `getSession().then(...)` também resolve com essa sessão. Resultado: `runBootstrap` é invocado duas vezes em paralelo — uma via `setTimeout(0)` e outra direta — sem nenhum mutex/deduplication. Cada chamada faz queries independentes ao banco.

**Impacto:** 2x RPC calls `bootstrap_user` por login/refresh. Em escala causa carga desnecessária e pode criar inconsistências de estado se as duas execuções sobreporem `setIsBootstrapping`.

**Fix recomendado:**
```typescript
// Padrão oficial Supabase: usar APENAS onAuthStateChange
// Remover o bloco getSession() separado, que é redundante.
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      
      if (session?.user) {
        // Não usar setTimeout; usar queueMicrotask ou aguardar diretamente
        queueMicrotask(() => runBootstrap(session.user.id));
      } else {
        setProfile(null);
        setRoles([]);
        setIsBootstrapping(false);
      }
    }
  );
  return () => subscription.unsubscribe();
}, []); // Sem getSession() separado
```

---

#### [P1] QueryClient sem configuração de staleTime — refetch em toda montagem de componente

**Localização:** `/Users/andreylopes/oxyve/src/App.tsx:21`

**Evidência:**
```typescript
const queryClient = new QueryClient();
// Sem defaultOptions: staleTime padrão = 0ms
```

**Root Cause:** Com `staleTime: 0` (padrão), React Query considera todos os dados obsoletos imediatamente. Cada montagem de componente que usa `useExpenses()`, `useReports()`, `useDashboardContext()` etc. dispara um refetch. A página Dashboard monta 3 queries em paralelo (`useExpenses`, `useReports`, `useDashboardContext`) — qualquer navegação de volta ao dashboard resulta em 3 requests simultâneos desnecessários.

**Impacto:** Excesso de requests ao Supabase (cobrança por operação em planos pagos), latência percebida pelo usuário, piscar de skeletons em cada re-visita.

**Fix recomendado:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minuto como baseline
      retry: 1,
      refetchOnWindowFocus: false, // para SaaS corporativo, foco não implica dados alterados
    },
  },
});
```
Queries de leitura crítica (dashboard) podem ter `staleTime: 30_000`, contagens `staleTime: 5_000`.

---

#### [P2] Hooks duplicados de submit/aprovação — código morto divergente em produção

**Localização:** `/Users/andreylopes/oxyve/src/hooks/useReports.ts:330-450` e `/Users/andreylopes/oxyve/src/hooks/useCurrentReport.ts:137-189`

**Evidência:**
- `useReports.ts` exporta: `useSubmitReport`, `useApproveReport`, `useMarkReportAsPaid` (manipulam diretamente tabelas via SQL client-side)
- `useCurrentReport.ts` exporta: `useSubmitReportRpc` (usa RPC `submit_report`)
- `useReportActions.ts` exporta: `useApproveReportRpc`, `useMarkReportPaidRpc` (usam RPCs)
- **Nenhum componente importa** `useApproveReport` ou `useMarkReportAsPaid` de `useReports.ts`

**Root Cause:** Refatoração incompleta migrou a lógica para RPCs mas deixou as implementações antigas sem remover.

**Impacto:** Qualquer dev que acidentalmente importe `useApproveReport` ao invés de `useApproveReportRpc` executa uma aprovação sem passar pela lógica de negócio do RPC (validações, timestamps, notificações). Risco de divergência de estado silenciosa.

**Fix recomendado:** Remover de `useReports.ts` as funções `useSubmitReport`, `useApproveReport`, `useMarkReportAsPaid`. Consolidar toda mutação de status em `useReportActions.ts`. Eliminar `useSubmitReport` em `useCurrentReport.ts` (linha 166-189) que também duplica via SQL direto.

---

#### [P2] Queries duplicadas de `useCostCenters` e `useProjects` entre módulos

**Localização:** `/Users/andreylopes/oxyve/src/hooks/useExpenses.ts:424-458` e `/Users/andreylopes/oxyve/src/hooks/usePolicy.ts:83-219`

**Evidência:**
- `useExpenses.ts` define `useCostCenters()` (queryKey: `['cost-centers']`, sem `.is_active` filter) e `useProjects()` (queryKey: `['projects']`, sem filter)
- `usePolicy.ts` define `useCostCenters()` (queryKey: `['cost-centers']`, sem filter) e `useProjects()` (queryKey: `['projects']`, sem filter), além de `useActiveCostCenters()` e `useActiveProjects()`
- As versões em `useExpenses.ts` têm a mesma queryKey mas diferem em escopo

**Root Cause:** Hooks de domínio cruzado colocados em arquivo errado durante crescimento orgânico.

**Impacto:** Duas definições da mesma queryKey em arquivos diferentes causam confusão de import. Se os dados diferirem (ex.: um aplica `.eq('is_active', true)` e outro não), o cache do React Query pode servir dados incorretos para ambos os consumidores.

**Fix recomendado:** Remover `useCostCenters` e `useProjects` de `useExpenses.ts`. Centralizar em `usePolicy.ts` (ou melhor: criar `src/hooks/useCostCenters.ts`, `src/hooks/useProjects.ts` independentes). Atualizar `ExpenseFiltersPopover` para importar de `usePolicy`.

---

### 2. Estrutura de Módulos & Camadas

#### [P1] `expense_reviews` sem type no schema Supabase — cast `as any` sistêmico

**Localização:** `/Users/andreylopes/oxyve/src/hooks/useReports.ts:138` e `/Users/andreylopes/oxyve/src/hooks/useReviewExpense.ts:24`

**Evidência:**
```typescript
// useReports.ts:138
.from('expense_reviews' as any)

// useReviewExpense.ts:24
.from('expense_reviews' as any)
```

**Root Cause:** A tabela `expense_reviews` existe nas migrations SQL mas não foi adicionada ao arquivo de tipos gerado `/Users/andreylopes/oxyve/src/integrations/supabase/types.ts`. O cast `as any` é o workaround utilizado, eliminando toda segurança de tipo nas operações sobre esta tabela.

**Impacto:** Erros de schema (nomes de coluna errados, tipos incompatíveis) passam silenciosamente pela compilação e só quebram em runtime. Nenhum autocomplete disponível.

**Fix recomendado:** Regenerar `types.ts` via `supabase gen types typescript --local > src/integrations/supabase/types.ts`. Remover todos os casts `as any` nas queries desta tabela.

---

#### [P2] Componente `ExpenseReviewBadge` definido dentro de página

**Localização:** `/Users/andreylopes/oxyve/src/pages/app/ReportDetail.tsx:139-155`

**Evidência:**
```typescript
// Linha 139 — componente definido dentro da função da página
const ExpenseReviewBadge = ({ decision, comment: reviewComment }: { ... }) => {
```

**Root Cause:** Componente inline definido dentro de outro componente. React recria a referência da função a cada render, causando unmount/remount desnecessário do componente filho.

**Impacto:** Performance degradada; impossível reusar em `ApprovalQueue.tsx` que tem lógica similar de badge de revisão (duplicação). Viola separação de camadas.

**Fix recomendado:** Mover para `src/components/reports/ExpenseReviewBadge.tsx` e importar em `ReportDetail` e `ApprovalQueue`.

---

#### [P2] Página `Advances` é stub hardcoded com "Q2 2024" (data passada)

**Localização:** `/Users/andreylopes/oxyve/src/pages/app/Advances.tsx:29`

**Evidência:**
```typescript
<span>Previsão: Q2 2024</span>
```

**Root Cause:** Feature não implementada exposta no menu de navegação com data de previsão há 2 anos no passado.

**Impacto:** Prejudica credibilidade do produto para novos usuários/demos.

**Fix recomendado:** Remover do `SidebarNav` até implementação, ou atualizar previsão para data futura real e esconder atrás de feature flag.

---

#### [P2] `src/integrations/lovable/index.ts` — dependência de vendor não usada no app

**Localização:** `/Users/andreylopes/oxyve/src/integrations/lovable/index.ts`

**Evidência:** O módulo exporta `lovable.auth.signInWithOAuth`, mas nenhum arquivo em `src/` (fora do próprio módulo) importa de `@lovable.dev/cloud-auth-js` ou usa `lovable.auth`. O Login usa exclusivamente `supabase.auth.signInWithPassword`.

**Root Cause:** Scaffolding do Lovable incluído por padrão, não utilizado.

**Impacto:** `@lovable.dev/cloud-auth-js` é bundlado desnecessariamente. Dependência de supply chain ativa sem uso.

**Fix recomendado:** Remover `src/integrations/lovable/index.ts` e desinstalar `@lovable.dev/cloud-auth-js` do `package.json` se OAuth social não for utilizado.

---

### 3. Performance & Bundle

#### [P1] Ausência total de code-splitting — bundle único de 2.3MB

**Localização:** `/Users/andreylopes/oxyve/vite.config.ts` (sem `rollupOptions`) e `/Users/andreylopes/oxyve/src/App.tsx` (imports estáticos de todas as páginas)

**Evidência:**
```typescript
// App.tsx — todas as páginas importadas estaticamente
import Dashboard from "./pages/app/Dashboard";
import Expenses from "./pages/app/Expenses";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
// ... +7 imports estáticos
```
Não existe nenhuma ocorrência de `React.lazy`, `import()` dinâmico, ou `Suspense` em todo o codebase.

**Root Cause do bundle 2.3MB:**
- Radix UI: ~25 pacotes distintos todos bundlados juntos
- Recharts: ~300KB (usado apenas no Dashboard)
- heic2any: biblioteca pesada de conversão de imagem
- lucide-react: potencialmente tree-shaken, mas impacto real depende do bundler
- Sem vendor chunk separation

**Impacto:** First Load JS de 2.3MB. Em 4G médio brasileiro (~8Mbps), download leva ~2.3s apenas para o JS. TTI (Time to Interactive) degradado mesmo em usuários autenticados que acessam apenas Expenses.

**Fix recomendado:**

```typescript
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
          'vendor-radix': [/* radix packages */],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  // ...
}));
```

```typescript
// App.tsx — lazy loading por rota
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Expenses = lazy(() => import("./pages/app/Expenses"));
// ...

// Envolver AppRoutes em <Suspense fallback={<PageSkeleton />}>
```
Expectativa: bundle inicial < 400KB, resto carregado on-demand por rota.

---

#### [P1] N+1 queries em `useReports` — 1 query por relatório para buscar totais e profile

**Localização:** `/Users/andreylopes/oxyve/src/hooks/useReports.ts:69-105`

**Evidência:**
```typescript
const reportsWithTotals = await Promise.all(
  (reports || []).map(async (report) => {
    // Query 1: report_items (1 por relatório)
    const { data: items } = await supabase
      .from('report_items')
      .select('expense:expenses(amount_cents, is_reimbursable)')
      .eq('report_id', report.id);

    // Query 2: profiles (1 por relatório)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', report.user_id)
      .single();
    // ...
  })
);
```

**Root Cause:** Agregação de dados feita no cliente via `Promise.all` com N × 2 queries, onde N = número de relatórios. Com 20 relatórios: 41 queries (1 lista + 20 items + 20 profiles).

**Impacto:** Latência O(N) em vez de O(1). Supabase cobra por operação. Com 100 relatórios: 201 queries por acesso à página de relatórios.

**Fix recomendado:** Mover a agregação para o banco via Supabase join ou uma view materializada:
```typescript
// Substituir o Promise.all por um único select com join
const { data: reports } = await supabase
  .from('reports')
  .select(`
    *,
    user:profiles!user_id(full_name),
    items:report_items(
      expense:expenses(amount_cents, is_reimbursable)
    )
  `)
  .order('created_at', { ascending: false });
```
Reduz de N×2+1 queries para 1 query com joins. Alternativamente, criar uma view `reports_summary` no banco com os totais pré-calculados.

---

### 4. TypeScript & Configuração

#### [P1] TypeScript com `strict: false` e `noImplicitAny: false` — type safety desabilitada

**Localização:** `/Users/andreylopes/oxyve/tsconfig.app.json:21-24`

**Evidência:**
```json
{
  "strict": false,
  "noUnusedLocals": false,
  "noUnusedParameters": false,
  "noImplicitAny": false,
  "noFallthroughCasesInSwitch": false
}
```

**Root Cause:** Configuração padrão do template Lovable. Com `strict: false`, todas as flags de segurança críticas ficam desabilitadas: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`.

**Impacto Concreto:** Os 39+ erros ESLint de `@typescript-eslint/no-explicit-any` são sintoma direto desta configuração. Sem `strictNullChecks`, `profile.org_id` pode ser `null` e ser usado em operação de banco sem erro de compilação (ex.: `useReports.ts:104: profile!.org_id!` usa non-null assertion forçado porque o tipo não é verificado). Bugs de produção por null dereference não são detectados em build.

**Fix recomendado:** Ativar `strict: true` de forma incremental:
```json
{
  "strict": false,
  "strictNullChecks": true,  // Ativar primeiro
  "noImplicitAny": true,     // Ativar segundo
  "noUnusedLocals": true     // Ativar por último
}
```
Expectativa com `strictNullChecks: true`: ~50-80 novos erros a corrigir — mas estes representam bugs reais latentes.

---

#### [P2] ESLint desabilita `@typescript-eslint/no-unused-vars` globalmente

**Localização:** `/Users/andreylopes/oxyve/eslint.config.js:23`

**Evidência:**
```typescript
rules: {
  "@typescript-eslint/no-unused-vars": "off",
}
```

**Root Cause:** Regra desabilitada para eliminar noise do template gerado.

**Impacto:** Variáveis, imports e funções mortas acumulam silenciosamente. Nenhum sinal de alerta ao adicionar código não utilizado.

**Fix recomendado:**
```typescript
"@typescript-eslint/no-unused-vars": ["warn", {
  "argsIgnorePattern": "^_",
  "varsIgnorePattern": "^_"
}]
```

---

#### [P2] `tailwind.config.ts` usa `require()` — erro ESLint em ambiente ESM

**Localização:** `/Users/andreylopes/oxyve/tailwind.config.ts:113`

**Evidência:** `113:13 error A require() style import is forbidden @typescript-eslint/no-require-imports`

**Fix recomendado:** Converter para import ESM:
```typescript
import typography from '@tailwindcss/typography';
import animate from 'tailwindcss-animate';
// ...
plugins: [typography, animate],
```

---

### 5. Observabilidade & Tratamento de Erros

#### [P1] Ausência de Error Boundary — exceção React derruba toda a UI

**Localização:** `/Users/andreylopes/oxyve/src/App.tsx` (sem `ErrorBoundary`)

**Evidência:** `grep -rn "ErrorBoundary\|error-boundary" src/` → sem resultados.

**Root Cause:** Nenhum error boundary definido em nenhum nível da árvore de componentes.

**Impacto:** Qualquer exceção não tratada em qualquer componente (ex.: `undefined.map()` se uma query retorna formato inesperado) resulta em tela branca para o usuário, sem mensagem de erro, sem log de contexto, sem possibilidade de recuperação parcial.

**Fix recomendado:**
```typescript
// src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Aqui: integrar Sentry/LogRocket quando disponível
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorFallback />;
    }
    return this.props.children;
  }
}

// App.tsx — envolver cada rota ou o AppRoutes inteiro
<ErrorBoundary fallback={<AppError />}>
  <AppRoutes />
</ErrorBoundary>
```

---

#### [P2] Logging via `console.error` sem contexto estruturado

**Localização:** `/Users/andreylopes/oxyve/src/contexts/AuthContext.tsx:83`, `/Users/andreylopes/oxyve/src/hooks/useValidateReceipt.ts:129`, `/Users/andreylopes/oxyve/src/pages/NotFound.tsx:8`

**Evidência:**
```typescript
console.error('Bootstrap error:', error);
console.error('validate receipt error:', err);
```

**Root Cause:** Sem plataforma de observabilidade; `console.error` não persiste, não agrega, não alerta.

**Impacto:** Erros de produção invisíveis. Bootstrap failures (impede usuário de acessar a plataforma) são silenciosos fora do DevTools do browser da sessão afetada.

**Fix recomendado:** Integrar Sentry (gratuito até 5K errors/mês):
```typescript
import * as Sentry from '@sentry/react';
// Substituir console.error por Sentry.captureException(error, { extra: { context } })
```

---

### 6. Dívida Técnica Visível

#### [P2] 39 ocorrências de `as any` — type safety sistematicamente contornada

**Distribuição:** `useReports.ts` (8), `ReportDetail.tsx` (10), `Dashboard.tsx` (4), `SettingsPolicy.tsx` (3), `ApprovalQueue.tsx` (2), outros.

**Root Cause Sistêmica:** Combinação de `strict: false` no tsconfig + tabela `expense_reviews` fora do schema gerado + dados retornados de RPCs com tipo `unknown`. O problema se auto-reforça: sem strict, não há pressão para tipagem correta.

**Fix:** Ver item de tsconfig acima + regeneração de types.ts. Os `as any` em RPCs devem usar tipos de retorno explícitos:
```typescript
// Ao invés de:
return data as unknown as DashboardContext;

// Definir o tipo de retorno no próprio RPC via overload do cliente Supabase
// ou criar um type guard de validação com Zod
```

---

#### [P2] `useCurrentReport` — hook não utilizado em nenhum componente

**Localização:** `/Users/andreylopes/oxyve/src/hooks/useCurrentReport.ts:38-49`

**Evidência:** `grep -rn "useCurrentReport\b"` → apenas importações de `useDashboardContext`, `useSubmitReportRpc`, etc. A função `useCurrentReport()` em si não é importada por nenhum componente.

**Fix:** Remover o export `useCurrentReport` ou documentar por que é mantido (ex.: futuro uso).

---

## Tabela Final Priorizada

| # | Severidade | Achado | Arquivo Principal | Impacto |
|---|---|---|---|---|
| 1 | P1 | Race condition bootstrap auth (duplo runBootstrap) | `AuthContext.tsx:97-121` | 2x RPC calls por sessão; race condition de estado |
| 2 | P1 | N+1 queries em useReports (N×2+1 por acesso) | `useReports.ts:69-105` | Latência O(N); custo Supabase em escala |
| 3 | P1 | Bundle único 2.3MB sem code-splitting | `App.tsx`, `vite.config.ts` | TTI > 2s em 4G; UX degradada |
| 4 | P1 | TypeScript strict:false — null safety desativada | `tsconfig.app.json:21-24` | Bugs de null dereference silenciosos em produção |
| 5 | P1 | Ausência de Error Boundary | `App.tsx` | Qualquer exceção derruba toda a UI (tela branca) |
| 6 | P1 | `expense_reviews` sem tipo no schema (cast `as any`) | `useReports.ts:138`, `useReviewExpense.ts:24` | Erros de schema invisíveis em compilação |
| 7 | P1 | QueryClient sem staleTime — refetch em toda montagem | `App.tsx:21` | Excesso de requests; skeletons em re-visita |
| 8 | P2 | Hooks duplicados de submit/aprovação (código morto) | `useReports.ts:330-450` | Risco de uso acidental bypassing lógica de RPC |
| 9 | P2 | `useCostCenters`/`useProjects` duplicados entre módulos | `useExpenses.ts:424`, `usePolicy.ts:83` | Cache inconsistente; confusão de import |
| 10 | P2 | ESLint desabilita `no-unused-vars` globalmente | `eslint.config.js:23` | Código morto acumula sem alerta |
| 11 | P2 | 39 `as any` — contorno sistêmico de type safety | múltiplos arquivos | Bugs de tipo invisíveis; manutenção difícil |
| 12 | P2 | `ExpenseReviewBadge` definido inline na página | `ReportDetail.tsx:139` | Remount desnecessário; não reutilizável |
| 13 | P2 | `lovable/index.ts` bundlado sem uso no app | `integrations/lovable/index.ts` | Dependência desnecessária no bundle |
| 14 | P2 | Logging via `console.error` sem observabilidade | `AuthContext.tsx:83` | Erros de produção invisíveis |
| 15 | P2 | `tailwind.config.ts` com `require()` em ESM | `tailwind.config.ts:113` | ESLint error; inconsistência de módulo |
| 16 | P2 | Página `Advances` stub com "Q2 2024" hardcoded | `Advances.tsx:29` | Credibilidade do produto prejudicada |

---

## Recomendações de Evolução (não-bloqueantes)

**Feature Flags:** O projeto não possui nenhum mecanismo de feature flag. Com a feature Advances já visível na navegação, isso é imediatamente relevante. Recomendo adicionar um contexto simples de flags antes de próximas features:
```typescript
// src/contexts/FeatureFlagContext.tsx
const flags = { advances: false, multi_currency: false };
```

**Separação de concerns — hooks de domínio vs. hooks de UI:** Hooks como `useIsMobile` e `use-toast` estão no mesmo diretório que hooks de negócio. Criar `src/hooks/ui/` para hooks de apresentação pura.

**Namespace de queryKeys:** As queryKeys atuais são strings simples (`'expenses'`, `'reports'`). Em equipes maiores, criar um `queryKeys` factory centralizado previne colisões:
```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  expenses: { all: ['expenses'] as const, list: (f: Filters) => ['expenses', f] as const },
  reports: { all: ['reports'] as const, detail: (id: string) => ['report', id] as const },
};
```

**Supabase Realtime:** Para um produto de aprovação de despesas, notificações em tempo real (quando um relatório é aprovado/rejeitado) são esperadas pelos usuários. A infraestrutura Supabase já suporta Realtime; nenhum subscription está implementado.

**Testes:** 1 teste (`example.test.ts`) para ~2.300 linhas de lógica de negócio. Priorizar testes de hooks de mutação (`useCreateExpense`, `useSubmitReport`) com MSW (Mock Service Worker) para mockar Supabase, e testes de integração dos fluxos críticos (criar despesa → adicionar a relatório → submeter → aprovar).

