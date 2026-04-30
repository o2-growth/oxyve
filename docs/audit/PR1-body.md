## Sprint 0 — Hotfix de segurança crítica

Fecha 3 vulnerabilidades **P0 (CVSS 8.5–9.8)** + 4 issues **P1** identificadas em auditoria automatizada (Aria, Dara, Atlas, Quinn, Morgan) — relatórios completos em `docs/audit/`.

### O que muda

#### Backend (`supabase/migrations/20260430000000_sprint0_security_hotfix.sql`)

| ID | Severidade | Fix |
|---|---|---|
| **DARA-001** | CVSS 9.8 | Bloqueia self-grant de role admin via `INSERT user_roles`. Drop policy permissiva → função `admin_assign_role()` SECURITY DEFINER que valida caller=admin + cross-org. |
| **DARA-002** | CVSS 9.1 | `bootstrap_user()` não faz mais auto-join por domínio — acesso é **EXCLUSIVAMENTE via `org_invites`**. |
| **DARA-003** | CVSS 8.5 | Token de invite agora é validado de verdade (era ignorado, só email batia). Exige `email_confirmed_at`. Marca invite com `accepted_by` para audit trail. |
| DARA-005 | P1 | Policy de UPDATE em `profiles` trava mudança de `org_id` (cross-org takeover). |
| DARA-006 | P1 | SELECT em `report_approvals` exige cross-check de org via JOIN com reports. |
| DARA-007 | P1 | `org_domains`: CHECK de formato + UNIQUE(org_id, domain). |
| **NOVO** | — | `org_invites.email LIKE '%@o2inc.com.br'` via `CHECK NOT VALID` (decisão produto: invite-only single-tenant; substituir por `orgs.allowed_email_domains[]` em sprint futuro). |

#### Edge function

- `supabase/functions/validate-receipt/index.ts` — agora exige `Authorization: Bearer <jwt>` válido (rate-limit + size cap em Sprint 1).

#### Frontend (bugs P0 do Quinn QA)

- **B1** — `Login.tsx` consome `?invite=token` corretamente; tab "Cadastrar" só aparece com invite presente; Zod schemas (email + password ≥8).
- **B2/B3/Aria-1** — `AuthContext` sem race no bootstrap (`useRef` guard por userId, removido `getSession()` duplicado), estado `bootstrapError` com banner em `ProtectedRoute` + botão "Tentar novamente".
- **B4** — `useReportForDate` migrado de `useMutation` para `useQuery` (dedupe por queryKey, sem race em keystroke).
- **B5** — deps do `useEffect` de validação de recibo agora completas.
- **B11** — `<></>` em `.map()` trocado por `React.Fragment` com `key`.
- **B13/B14** — `setIsLoading` antes de `navigate`; try/catch em `fetchProfile`.

### Validações locais

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✅ 0 erros |
| Vitest | ✅ 3/3 passing (1 baseline + 2 novos invite-only) |
| ESLint `src/` | ✅ 44 problemas (-6 vs baseline; 0 novos) |
| `vite build` | ✅ ok (~625KB gzip; bundle splitting fica para Sprint 1) |

### ⚠️ Antes/depois de mergear

#### 1. **Pré-check no Supabase** (rodar no SQL Editor antes da migration aplicar):
```sql
SELECT id, email, created_at FROM public.org_invites
WHERE email !~* '@o2inc\.com\.br$';
```
Se voltar linhas, são invites legacy. Como o CHECK foi criado `NOT VALID`, **eles não bloqueiam a migration**, mas você pode querer limpá-los.

#### 2. **Aplicar migration** via SQL Editor (cole o conteúdo de `supabase/migrations/20260430000000_sprint0_security_hotfix.sql`) ou `supabase db push`.

#### 3. **Forçar logout global** após aplicar (revogar JWTs com role admin auto-atribuído):
```sql
-- Auditar admins atuais antes de revogar:
SELECT u.email, ur.role, p.org_id, ur.created_at
  FROM user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN profiles p ON p.id = ur.user_id
 WHERE ur.role = 'admin'
 ORDER BY ur.created_at DESC;
```
Revisar manualmente — quem não deveria ser admin, deletar o `user_roles` row.

### Checklist de validação Sprint 0

- [ ] Migration aplicada no Supabase remoto
- [ ] `INSERT user_roles role=admin` retorna 42501 para non-admin
- [ ] `UPDATE profiles SET org_id=...` retorna check_violation
- [ ] Convite por email: admin convida → email recebido → link com `?invite=token` → signup → usuário entra na org correta com role correto
- [ ] Login com erro de bootstrap mostra banner (não tela branca)
- [ ] Lista de admins atual auditada e limpa
- [ ] JWTs ativos revogados (forçar logout global)

### Próximos passos (não inclusos neste PR)

PR2 cobre Sprint 1+2+3 (~22 dias-pessoa): bundle splitting, perf (N+1 useReports), error boundary, strict TS, gaps de feature do VExpenses (rateio, multimoeda, export, notificações, adiantamentos, dados bancários/CPF).

---

🤖 Auditoria automatizada via [Claude Code](https://claude.com/claude-code) — relatórios em `docs/audit/`
