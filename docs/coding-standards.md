# Coding Standards — oxyve

**Curador:** Pax (PO)
**Data:** 2026-04-27
**Princípio:** padrões mínimos, **sem introduzir nova fricção** num projeto Lovable. Manter coerência com o código existente.

---

## 1. Regras de ouro (não-negociáveis)

1. **Migrations só aditivas.** `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`, `INSERT … ON CONFLICT DO NOTHING`. Nunca `DELETE`/`DROP`/`TRUNCATE`/`UPDATE` em dados de produção. (Regra global do CLAUDE.md.)
2. **RLS sempre ligado.** Toda tabela nova precisa de `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policies por papel.
3. **Não mexer em `src/components/ui/*`** (shadcn primitives) — se precisar customizar, crie wrapper em `src/components/<feature>/`.
4. **Não enrijecer TS/ESLint no MVP.** `strict: false` é proposital; mudar isso é refactor amplo, fora de escopo.

---

## 2. TypeScript

- Sem `any` em código novo (mesmo que TS permita) — preferir `unknown` + narrowing ou tipos específicos.
- Tipos de banco vêm de `src/integrations/supabase/types.ts` (gerados) — usar `Database['public']['Tables']['...']['Row']` em vez de redeclarar.
- Hooks de query devem retornar tipos explícitos no `useQuery<T>`.
- Componentes: `function Foo({ a, b }: { a: string; b: number }) { ... }` ou `interface FooProps { ... }` — escolher o mais legível.

## 3. React + Hooks

- Server state em **React Query** (`@tanstack/react-query`). Sem `useEffect` para fetch de dados.
- Mutations sempre tratam loading + erro + sucesso (toast).
- `useEffect` apenas para sincronizações genuínas (subscriptions, eventos do DOM).
- `useState` local em formulários complexos OU `react-hook-form` (preferir RHF para validação Zod).
- Componentes "fat": > 300 linhas → considerar quebrar (mas não perseguir métricas; clareza vale mais).

## 4. Estilo (Tailwind + shadcn)

- Classes Tailwind direto no JSX. Sem CSS modules nem styled-components.
- Tokens via CSS variables em `index.css` (`hsl(var(--primary))` etc.) — não hard-code cores hex em componentes.
- Mobile-first: `class="text-sm md:text-base"` (não inverso).
- Touch targets ≥44px em mobile (botões interativos): `h-12` ou `size="default"` no shadcn `<Button>`.
- Respeitar safe-area: `pb-[env(safe-area-inset-bottom)]` em sticky/fixed bottom (após Story 1.4).

## 5. Forms

- **react-hook-form + zod** sempre que houver validação não-trivial.
- Esquema Zod separado em arquivo `*.schema.ts` se reusado, ou inline se único.
- Mensagens de erro **em pt-BR**.
- Inputs de moeda: `inputMode="decimal"`. Inputs de data: `react-day-picker`. Inputs de telefone: `inputMode="tel"`.

## 6. Supabase

- Client central em `src/integrations/supabase/client.ts` — não criar novos clients.
- Sempre usar `.select()` explícito, não `*` em queries críticas (custo de payload mobile).
- Migrar via arquivo SQL versionado em `supabase/migrations/` com timestamp prefix.
- Edge functions em Deno, em `supabase/functions/<name>/index.ts`. Nome em kebab-case.

## 7. Estrutura de arquivos

- 1 componente principal por arquivo (PascalCase).
- Hooks em `src/hooks/use*.ts(x)`.
- Tipos compartilhados em `src/lib/types.ts` ou no arquivo de hook se específicos.
- Utilitários puros em `src/lib/`.

## 8. Git

- Commits em **conventional commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
- Referenciar story: `feat: [Story 2.1] aumentar touch targets na fila de aprovação`.
- 1 PR por story (preferencial). PRs grandes só com justificativa.
- Mensagem em pt-BR ou en — manter coerência com histórico (este repo está misto; aceitar).

## 9. Testes (mínimos para o MVP)

- Não obrigar TDD para o MVP — projeto Lovable não tem suite estabelecida.
- **Smoke test mobile** obrigatório para stories de UX: abrir Chrome DevTools em viewport 390x844 (iPhone 14) e validar fluxo descrito nos CAs.
- Stories que tocam RPC ou edge function devem incluir teste manual documentado no PR (passos para reproduzir).
- Sprint 2+: introduzir Playwright para E2E do fluxo de aprovação (referência: PRD Risco 3).

## 10. UX e i18n

- Texto da UI em **pt-BR**.
- Datas formatadas com `formatDate` de `lib/constants.ts` (já existente).
- Moeda formatada com `formatCurrency` (já existente, em centavos).
- Empty states usam o componente `<EmptyState>` (`src/components/ui/EmptyState.tsx`).
- Toasts de sucesso: verde + check. Erros: vermelho + alerta. Avisos: amarelo + info.

## 11. Segurança

- Nunca expor chaves de service role no frontend. Usar apenas anon key (`VITE_SUPABASE_PUBLISHABLE_KEY`).
- Operações privilegiadas (admin) → SECURITY DEFINER RPC ou edge function.
- `OPENAI_API_KEY` e demais secrets vivem nas configs da edge function, nunca no `.env` do frontend.

## 12. Definition of Done por story

- [ ] Implementação completa e funcionando localmente (`npm run dev`).
- [ ] `npm run lint` sem erros novos.
- [ ] `npm run build` ok.
- [ ] Smoke test mobile (Chrome DevTools 390x844) para stories de UX.
- [ ] Migrations testadas localmente (Supabase CLI ou ambiente staging).
- [ ] PR aberto com referência à story (`[Story X.Y]`) e descrição do que muda.
- [ ] Self-review feita (sem `console.log`, sem código comentado).
- [ ] QA review aprovado (`/agents:qa`).
