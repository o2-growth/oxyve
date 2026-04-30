# Runbook — Aplicar Sprint 0 no Supabase remoto

**Projeto:** `kulwornnpimjsbmexphd`
**SQL Editor:** https://supabase.com/dashboard/project/kulwornnpimjsbmexphd/sql/new

> Execute na ordem. Cada bloco é idempotente (pode rodar 2x sem quebrar).

---

## 🔍 Passo 1 — Pré-check de invites legacy (informativo)

Cole no SQL Editor e rode:

```sql
-- Ver invites com domínio diferente de @o2inc.com.br
SELECT id, email, role, created_at, accepted_at
  FROM public.org_invites
 WHERE email !~* '@o2inc\.com\.br$'
 ORDER BY created_at DESC;
```

**Resultado esperado:** 0 rows (se vocês nunca convidaram fora do o2inc).
**Se vier rows:** ok, a migration usa `CHECK NOT VALID` e não rejeita esses rows. Mas você pode querer revisar/limpar.

---

## 🔍 Passo 2 — Auditoria de admins atuais (CRÍTICO)

Antes de aplicar a migration, ver quem é admin agora — porque DARA-001 permitia self-grant, **pode ter admin que não deveria existir**.

```sql
SELECT u.email,
       p.full_name,
       ur.role,
       p.org_id,
       o.name AS org_name,
       ur.created_at AS role_granted_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.orgs o ON o.id = p.org_id
 WHERE ur.role = 'admin'
 ORDER BY ur.created_at DESC;
```

**Ação:** revisar manualmente. Se houver admin que não deveria, deletar o row antes de aplicar a migration:
```sql
-- exemplo (substituir o id real):
DELETE FROM public.user_roles WHERE user_id = '<uuid_do_intruso>' AND role = 'admin';
```

---

## 🚀 Passo 3 — Aplicar a migration

Cole o conteúdo completo de `supabase/migrations/20260430000000_sprint0_security_hotfix.sql` no SQL Editor e rode.

**Atalho via terminal** (no diretório do projeto):
```bash
cat supabase/migrations/20260430000000_sprint0_security_hotfix.sql | pbcopy
```
Cola lá no editor (Cmd+V) e clica **Run**.

**Resultado esperado:**
- `BEGIN`
- vários `DROP POLICY` / `CREATE POLICY` / `CREATE FUNCTION`
- `COMMIT`
- "Success. No rows returned"

---

## ✅ Passo 4 — Validar fixes (smoke tests SQL)

Cole e rode bloco a bloco:

### 4.1 — DARA-001: tentar self-grant deve falhar (use uma conta NÃO-admin)

```sql
-- Trocar para uma sessão de usuário comum (não-admin), aí no SQL Editor "Run as authenticated user"
-- Se rodar com service_role, vai dar bypass de RLS — não testa nada.

-- Alternativa: testar via API/frontend depois.
```

### 4.2 — DARA-005: tentar mudar próprio org_id deve falhar

```sql
-- Idem 4.1 — precisa de sessão authenticated. Validar pelo frontend.
```

### 4.3 — Validar que bootstrap_user agora exige token

```sql
-- Esse já dá pra testar como service_role:
SELECT public.bootstrap_user(NULL);
-- Esperado: ERRO "invite_required"

SELECT public.bootstrap_user('token-fake-abc123');
-- Esperado: ERRO "not_authenticated" (sem auth.uid()) ou "invite_required" se rodar como user
```

### 4.4 — Validar CHECK no org_invites

```sql
-- Tentar criar invite com domínio fora do whitelist:
INSERT INTO public.org_invites (org_id, email, role, token, created_by, expires_at)
VALUES ((SELECT id FROM public.orgs LIMIT 1),
        'teste@gmail.com', 'employee',
        encode(gen_random_bytes(16), 'hex'),
        (SELECT id FROM auth.users LIMIT 1),
        now() + interval '7 days');
-- Esperado: ERRO violando "org_invites_email_domain_chk"
-- Se passar (porque NOT VALID), bug.
```

---

## 🔐 Passo 5 — Revogar sessões / forçar logout global (recomendado)

Após mergear o PR e aplicar a migration, revogar todos os refresh tokens ativos para invalidar sessões com role auto-atribuído:

```sql
-- CUIDADO: isso desloga TODO MUNDO. Faça em horário de baixa.
DELETE FROM auth.refresh_tokens WHERE revoked = false;
```

**Alternativa menos agressiva** — só revogar sessões de usuários sem invite válido:
```sql
DELETE FROM auth.refresh_tokens
 WHERE user_id NOT IN (
   SELECT accepted_by FROM public.org_invites WHERE accepted_by IS NOT NULL
 );
```

---

## 📋 Checklist final

- [ ] Passo 1 rodado (invites legacy revisados)
- [ ] Passo 2 rodado (admins auditados; intrusos removidos)
- [ ] Passo 3 — migration aplicada com sucesso
- [ ] Passo 4 — smoke tests SQL passando
- [ ] Passo 5 — sessões revogadas
- [ ] Manual — admin convida usuário pelo painel → email chega → link funciona → user entra na org/role correta
- [ ] Manual — tentar acessar app sem invite (signup direto) → bloqueado com mensagem amigável

---

## ⚠️ Rollback (caso necessário)

Se algo der errado, reverter via:

```sql
BEGIN;

-- Restaurar bootstrap_user antiga (só fazer se a migração quebrar prod)
-- Ver supabase/migrations/20260208163752_*.sql para versão original

-- Drop dos novos artefatos
DROP FUNCTION IF EXISTS public.admin_assign_role(UUID, public.app_role);
ALTER TABLE public.org_invites DROP CONSTRAINT IF EXISTS org_invites_email_domain_chk;
ALTER TABLE public.org_invites DROP COLUMN IF EXISTS accepted_by;

-- Restaurar policies originais (ver migrations 20260208154124, 20260208163752, 20260223161405)

ROLLBACK;  -- ou COMMIT se for mesmo o caso
```
