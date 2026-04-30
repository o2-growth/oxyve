# Auditoria de Segurança Backend Supabase — Oxy VE
**Auditora:** Dara (Arquiteta de Banco de Dados / Security)
**Data:** 2026-04-30
**Escopo:** `supabase/migrations/*` (7 arquivos), `supabase/functions/validate-receipt/`, `supabase/config.toml`, `.env`, `.gitignore`
**Projeto Supabase:** `kulwornnpimjsbmexphd`

---

## 1. Resumo Executivo

Foram identificados **12 achados** classificados como segue:

| Severidade | Qtd. | IDs |
|---|---|---|
| **Crítica** | 3 | DARA-001, DARA-002, DARA-003 |
| **Alta** | 4 | DARA-004, DARA-005, DARA-006, DARA-007 |
| **Média** | 3 | DARA-008, DARA-009, DARA-010 |
| **Baixa** | 2 | DARA-011, DARA-012 |

### Destaques Críticos (P0 — exploráveis em produção HOJE):

1. **DARA-001 — Privilege Escalation via `user_roles` self-INSERT (CONFIRMA o ultraplan).** Qualquer usuário autenticado pode executar `INSERT INTO user_roles(user_id, role) VALUES (auth.uid(), 'admin')` graças à policy `"Users can insert own role"`. **Tomada total de qualquer org em uma única requisição.**
2. **DARA-002 — Cross-org admin takeover via `bootstrap_user()`.** Função SECURITY DEFINER cria automaticamente `org_domains` com base no domínio de email, sem normalização nem proteção contra domínios públicos (gmail.com, hotmail.com). O **primeiro** usuário Gmail fica admin de uma org "Minha Empresa"; **todo Gmail subsequente** entra automaticamente como `employee` na MESMA org — vazamento massivo de despesas entre estranhos.
3. **DARA-003 — Tabela `org_invites` sem policy de SELECT.** A policy `FOR ALL` cobre INSERT/UPDATE/DELETE para admins do org, mas não há mecanismo para um usuário *recém-cadastrado* validar o token recebido por email — `bootstrap_user` faz lookup direto via SECURITY DEFINER mas confia 100% no `email` do `auth.users` (que pode ser unverified em algumas configs Supabase). Não há validação de `email_confirmed_at`.

### Recomendação imediata:
Aplicar `patches/P0-fix-user-roles.sql` e `patches/P0-fix-bootstrap-user.sql` antes de qualquer onboarding adicional. Considerar revogar todos os `admin` roles atuais e re-emitir manualmente.

---

## 2. Achados Detalhados

### DARA-001 — Self-grant de role `admin` via RLS [CRÍTICA / CWE-269 Improper Privilege Management / CVSS ~9.8]

**Arquivo:** `supabase/migrations/20260208154124_f4e5dbbe-a27d-4815-8785-a054a8a7dd30.sql:185-188`

**Evidência SQL:**
```sql
CREATE POLICY "Users can insert own role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
```

A policy só verifica que `user_id = auth.uid()` — **não restringe qual `role` o usuário pode inserir**. Como `user_roles` tem UNIQUE(user_id, role) — não UNIQUE(user_id) — o usuário pode adicionar `admin` *além* do seu role de `employee`.

**Adicionalmente:** Não existe policy de UPDATE/DELETE em `user_roles` (sem nenhuma policy, RLS bloqueia — então UPDATE está OK por default). Mas INSERT está aberto. Não há trigger BEFORE INSERT que valide.

**Exploração mínima viável (1 linha JS no console do navegador autenticado):**
```js
await supabase.from('user_roles').insert({ user_id: (await supabase.auth.getUser()).data.user.id, role: 'admin' });
// agora is_manager_or_admin(auth.uid()) = true → vê todas as despesas, profiles, aprova relatórios, marca como pago
```

**Impacto:** Privilege escalation total dentro da org. Combinado com DARA-002, vira tomada cross-org.

**Patch (pronto para colar):** ver `patches/P0-fix-user-roles.sql` (resumo: dropar a policy de INSERT, criar policy `WITH CHECK (user_id = auth.uid() AND role = 'employee')` OU — **preferível** — remover INSERT pelo client e fazer atribuição apenas via funções SECURITY DEFINER `bootstrap_user()` / `admin_assign_role()`).

---

### DARA-002 — `bootstrap_user()` agrupa estranhos por domínio público [CRÍTICA / CWE-863 Incorrect Authorization / CVSS ~9.1]

**Arquivo:** `supabase/migrations/20260208163752_*.sql:127-180`

**Evidência:** A função SECURITY DEFINER:
1. Extrai `_email_domain := split_part(_user_email, '@', 2)`.
2. Busca em `org_domains` — se achar, **automaticamente** cria profile do novo usuário na mesma `org_id` como `employee`.
3. Se não achar, cria nova org **e registra o domínio** em `org_domains` (`UNIQUE(domain)`).

**Problemas:**
- (a) Sem allowlist/blocklist de domínios públicos. Primeiro signup com `@gmail.com` → registra `gmail.com` em `org_domains` → **todo Gmail futuro do planeta entra naquela org**.
- (b) Sem normalização de domínio (`lower(trim())` ausente — vide DARA-007).
- (c) Não há verificação de `email_confirmed_at` antes de auto-join. Se o projeto permitir signup sem confirmação, atacante registra `victim@empresavitima.com` (sem confirmar) e ganha acesso.

**Exploração:**
```text
1. Atacante cria conta com email @gmail.com (ou qualquer domínio compartilhado já registrado).
2. bootstrap_user() o coloca como employee na org existente.
3. Combina com DARA-001 → vira admin → exfiltra tudo.
```

**Patch:** `patches/P0-fix-bootstrap-user.sql` — adicionar blocklist de domínios públicos (gmail/hotmail/outlook/yahoo/icloud/proton/etc), exigir `email_confirmed_at IS NOT NULL`, normalizar domain.

---

### DARA-003 — `org_invites`: aceite sem verificação criptográfica do token [CRÍTICA / CWE-287 Improper Authentication / CVSS ~8.5]

**Arquivo:** `supabase/migrations/20260208163752_*.sql:11-22` e `:140-160`

**Evidência:** O fluxo de aceite em `bootstrap_user()` é:
```sql
SELECT * INTO _invite FROM public.org_invites
WHERE lower(email) = lower(_user_email)
  AND expires_at > now()
  AND accepted_at IS NULL
ORDER BY created_at DESC LIMIT 1;
```

**Nunca compara o `token`.** O token de 32 bytes (`encode(gen_random_bytes(32),'hex')`) é gerado mas **inútil** — basta ter o mesmo email. Se um atacante registrar uma conta com o email exato de um pending invite (e o projeto permitir signup direto sem confirmação prévia), ele auto-aceita o convite.

**Adicionalmente:** Não existe RLS policy para SELECT em `org_invites` para o convidado validar o token client-side antes de aceitar. Apenas admins do org podem ver convites (`FOR ALL` policy).

**Exploração:** Atacante intercepta/adivinha email do alvo → cria conta Supabase com aquele email → bootstrap_user aceita o convite mais recente para aquele email → entra como o role escolhido pelo admin (potencialmente `admin`).

**Patch:** `patches/P0-fix-bootstrap-user.sql` — adicionar verificação `auth.users.email_confirmed_at IS NOT NULL`, e idealmente exigir token via parâmetro: `bootstrap_user(p_invite_token TEXT DEFAULT NULL)` que valide `token = p_invite_token` quando fornecido.

---

### DARA-004 — `expense_reviews.reviewer_id` sem cross-check de org [ALTA / CWE-639 Authorization Bypass Through User-Controlled Key / CVSS ~7.4]

**Arquivo:** `supabase/migrations/20260223161405_*.sql:14-26`

**Evidência:** Policy de INSERT exige `reviewer_id = auth.uid()` e que o `report.org_id` bata com o do usuário, mas a policy de UPDATE:
```sql
USING ( is_manager_or_admin(auth.uid()) AND reviewer_id = auth.uid() )
```
não revalida `org_id`. Se um manager mudar de org (o que `profiles.org_id` permite via UPDATE em `profiles`), ele continua podendo editar reviews antigas.

**Combinação venenosa:** A policy `"Users can update own profile"` permite o usuário alterar `org_id` no próprio profile (ver DARA-005), e isso reflete em `is_manager_or_admin` + `get_user_org_id`.

**Patch inline:**
```sql
DROP POLICY "Managers can update expense reviews" ON public.expense_reviews;
CREATE POLICY "Managers can update expense reviews" ON public.expense_reviews
FOR UPDATE TO authenticated
USING (
  is_manager_or_admin(auth.uid()) AND reviewer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM reports r WHERE r.id = expense_reviews.report_id AND r.org_id = get_user_org_id(auth.uid()))
);
```

---

### DARA-005 — `profiles`: usuário pode mudar próprio `org_id` (cross-org migration self-service) [ALTA / CWE-639 / CVSS ~7.8]

**Arquivo:** `supabase/migrations/20260208154124_*.sql:165-167`

**Evidência:**
```sql
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());
```

Não há `WITH CHECK` que restrinja colunas. O usuário pode `UPDATE profiles SET org_id = '<id-da-vitima>' WHERE id = auth.uid()`. Como `organizations.id` é UUID v4 (não enumerável trivialmente), o ataque exige conhecer a UUID alvo — **mas qualquer ex-funcionário, parceiro ou ex-tester sabe**. Após o pulo, todas as policies que dependem de `get_user_org_id(auth.uid())` agora retornam o org da vítima → leitura total.

**Exploração:**
```js
await supabase.from('profiles').update({ org_id: 'UUID-vitima' }).eq('id', user.id);
// agora vê todas as despesas, projects, cost_centers, etc. da empresa vítima
```

**Patch:**
```sql
DROP POLICY "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
-- OU mais simples: revogar UPDATE de org_id via column-level GRANT REVOKE.
```

---

### DARA-006 — `report_approvals`: SELECT permite manager ver approvals de OUTRA org [ALTA / CWE-863 / CVSS ~7.1]

**Arquivo:** `supabase/migrations/20260208154124_*.sql:328-336`

**Evidência:**
```sql
CREATE POLICY "Users can view approvals for their reports"
ON public.report_approvals FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.reports r
    WHERE r.id = report_id
      AND (r.user_id = auth.uid() OR public.is_manager_or_admin(auth.uid())))
);
```

A condição `is_manager_or_admin(auth.uid())` **não verifica `r.org_id = get_user_org_id(auth.uid())`**. Qualquer manager/admin de qualquer org pode ler approvals de qualquer report — desde que descubra UUIDs (via DARA-005 ou enumeração).

**Patch:**
```sql
DROP POLICY "Users can view approvals for their reports" ON public.report_approvals;
CREATE POLICY "Users can view approvals for their reports" ON public.report_approvals
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.reports r
    WHERE r.id = report_id
      AND (
        r.user_id = auth.uid()
        OR (is_manager_or_admin(auth.uid()) AND r.org_id = get_user_org_id(auth.uid()))
      ))
);
```

---

### DARA-007 — `org_domains` sem normalização e sem proteção de domínios públicos [ALTA / CWE-20 Improper Input Validation / CVSS ~7.5]

**Arquivo:** `supabase/migrations/20260208163752_*.sql:1-7` (DDL) + `:148-150` (uso)

**Evidência:** `domain TEXT NOT NULL UNIQUE`. Sem CHECK de formato, sem `lower()`, sem blocklist. Combinado com DARA-002.

**Patch:** ver DARA-002 + adicionar:
```sql
ALTER TABLE org_domains ADD CONSTRAINT domain_lowercase CHECK (domain = lower(domain));
ALTER TABLE org_domains ADD CONSTRAINT domain_not_public CHECK (domain NOT IN ('gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','proton.me','protonmail.com','live.com','aol.com','msn.com','yandex.com','mail.ru','qq.com'));
```

---

### DARA-008 — `handle_new_user()` legacy ainda existe como NO-OP mas trigger pode disparar antes do `bootstrap_user` [MÉDIA / CWE-665 Improper Initialization / CVSS ~5.3]

**Arquivo:** `migrations/20260208163752_*.sql:255-264`

**Evidência:** `handle_new_user()` foi reescrita como `RETURN NEW;` (no-op), mas o trigger `on_auth_user_created` ainda existe (criado em migration 1, nunca dropped). Frontend depende de chamar `bootstrap_user()` explicitamente. Se o frontend esquecer (ou se houver signup via Supabase Auth UI direto), o usuário fica com `auth.users` row mas SEM profile/role — estado inconsistente que pode quebrar policies que assumem profile presente.

**Patch:** ou dropar o trigger, ou recolocar lógica defensiva no `handle_new_user`.

---

### DARA-009 — Edge Function `validate-receipt`: sem auth check, sem rate-limit, sem validação de tamanho [MÉDIA / CWE-770 Allocation Without Limits / CVSS ~6.5]

**Arquivo:** `supabase/functions/validate-receipt/index.ts:9-159`

**Evidência:**
- Não verifica JWT do caller (Supabase por default verifica se `verify_jwt = true` em config, mas `config.toml` está praticamente vazio — não há override mas também não há reforço explícito no código).
- Aceita qualquer `image_base64` sem limite de tamanho → atacante anônimo pode enviar imagens enormes → custo OpenAI ilimitado (financial DoS).
- CORS `Access-Control-Allow-Origin: *` permite chamada de qualquer origem → escala o abuso.
- Sem rate-limit por usuário/IP.
- Não associa o receipt a uma org/usuário (não checa permissão de `expense` correspondente).

**Patches recomendados:**
```ts
// 1. Validar JWT explicitamente:
const authHeader = req.headers.get("Authorization");
if (!authHeader) return new Response(JSON.stringify({error:"unauthorized"}), {status:401, headers:corsHeaders});
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global:{headers:{Authorization:authHeader}} });
const { data:{ user } } = await supabase.auth.getUser();
if (!user) return new Response(JSON.stringify({error:"unauthorized"}), {status:401, headers:corsHeaders});

// 2. Limitar payload:
if (image_base64.length > 5_000_000) return new Response(JSON.stringify({error:"payload too large"}), {status:413});

// 3. CORS restrito:
"Access-Control-Allow-Origin": "https://oxyve.app"  // ou similar
```

Também avaliar `verify_jwt = true` explícito em config.toml.

---

### DARA-010 — Função `submit_report` permite manager submeter report de empregado de outra org [MÉDIA / CWE-863 / CVSS ~5.5]

**Arquivo:** `migrations/20260208183022_*.sql:240-285` (`submit_report`)

**Evidência:** `submit_report` filtra `WHERE id = p_report_id AND user_id = _user_id` — então OK para o dono. Mas há outras funções (`admin_decide_report`, `mark_report_paid`) que filtram corretamente por `org_id`. Inconsistência: `submit_report` não checa `org_id` também (defesa em profundidade contra DARA-005 ainda exporia).

**Patch:** adicionar `AND org_id = _org_id` à query.

---

### DARA-011 — `.env` rastreado pelo git [BAIXA / CWE-538 Insertion of Sensitive Information into Externally-Accessible File / CVSS ~3.1]

**Evidência:** `git ls-files | grep ^.env` retorna `.env`. `.gitignore` **não** lista `.env`. Conteúdo:
```
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOi..." # JWT anon key
VITE_SUPABASE_URL="https://kulwornnpimjsbmexphd.supabase.co"
VITE_SUPABASE_PROJECT_ID="kulwornnpimjsbmexphd"
```

**Análise:** A `anon` key é **pública por design** — vai pro bundle Vite e qualquer cliente vê. Logo, vazamento aceitável **enquanto** RLS estiver corretamente configurado (que NÃO está — vide DARA-001/002/003/005/006). Hoje esta key + DARA-001 = takeover.

**Patch:**
```
# .gitignore
.env
.env.local
.env.*.local
!.env.example
```
Criar `.env.example` com placeholders. Manter `.env` rastreado é hábito ruim — qualquer adição futura de secret real (OPENAI_API_KEY no front, p.ex.) vaza.

---

### DARA-012 — `report_approvals.approver_id ON DELETE SET NULL` perde audit trail [BAIXA / CWE-778 Insufficient Logging / CVSS ~3.0]

**Arquivo:** `migrations/20260208154124_*.sql:84-91`

Quando um aprovador é deletado de `auth.users`, o approval fica com `approver_id = NULL` — perde-se quem aprovou. Para auditoria fiscal/compliance (ICMS-ST, holerite reembolso), isso é problema. Recomendado: `ON DELETE NO ACTION` ou tabela `auditors` snapshotada.

---

## 3. Tabela Priorizada (Action Items)

| # | ID | Severidade | Esforço | Bloqueia Prod? |
|---|---|---|---|---|
| 1 | DARA-001 | Crítica | 15min | **SIM** |
| 2 | DARA-002 | Crítica | 1h | **SIM** |
| 3 | DARA-003 | Crítica | 1h | **SIM** |
| 4 | DARA-005 | Alta | 15min | SIM |
| 5 | DARA-006 | Alta | 10min | SIM |
| 6 | DARA-004 | Alta | 10min | Não |
| 7 | DARA-007 | Alta | 20min | Junto c/ DARA-002 |
| 8 | DARA-009 | Média | 1h | Recomendado |
| 9 | DARA-010 | Média | 5min | Não |
| 10 | DARA-008 | Média | 15min | Não |
| 11 | DARA-011 | Baixa | 5min | Não |
| 12 | DARA-012 | Baixa | 30min | Não |

---

## 4. Patches SQL — Prontos Para Aplicar

### `patches/P0-fix-user-roles.sql`
```sql
-- DARA-001: Bloquear self-grant de admin
BEGIN;

-- 1) Remover policy aberta
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

-- 2) (Opcional) Permitir apenas auto-INSERT do role 'employee' (caso o frontend dependa disso)
-- CREATE POLICY "Users can insert own employee role" ON public.user_roles
-- FOR INSERT TO authenticated
-- WITH CHECK (user_id = auth.uid() AND role = 'employee');

-- 3) Bloquear UPDATE/DELETE explicitamente (sem policy = nega, mas explícito é melhor)
-- (RLS já bloqueia por ausência de policy)

-- 4) Higiene: revogar quaisquer admins “self-granted” suspeitos.
--    Listar primeiro:
-- SELECT ur.user_id, p.full_name, ur.role, u.email
--   FROM user_roles ur
--   JOIN profiles p ON p.id = ur.user_id
--   JOIN auth.users u ON u.id = ur.user_id
--  WHERE ur.role = 'admin'
--  ORDER BY p.created_at;

-- 5) Função SECURITY DEFINER para admin ATRIBUIR role (única via)
CREATE OR REPLACE FUNCTION public.admin_assign_role(p_target_user UUID, p_role app_role)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller_org UUID; _target_org UUID;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admins podem atribuir roles';
  END IF;
  SELECT org_id INTO _caller_org FROM profiles WHERE id = auth.uid();
  SELECT org_id INTO _target_org FROM profiles WHERE id = p_target_user;
  IF _caller_org IS NULL OR _caller_org <> _target_org THEN
    RAISE EXCEPTION 'Usuário alvo não está na sua organização';
  END IF;
  -- Substitui role(s) existentes — política simples 1 role por user
  DELETE FROM user_roles WHERE user_id = p_target_user;
  INSERT INTO user_roles (user_id, role) VALUES (p_target_user, p_role);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(UUID, app_role) TO authenticated;

COMMIT;
```

### `patches/P0-fix-bootstrap-user.sql`
```sql
-- DARA-002 + DARA-003 + DARA-007: hardening de bootstrap_user e org_domains
BEGIN;

-- A) Normalizar e bloquear domínios públicos
UPDATE public.org_domains SET domain = lower(trim(domain));
ALTER TABLE public.org_domains
  ADD CONSTRAINT domain_lowercase CHECK (domain = lower(domain)),
  ADD CONSTRAINT domain_not_public CHECK (domain NOT IN (
    'gmail.com','googlemail.com','hotmail.com','outlook.com','live.com',
    'yahoo.com','yahoo.com.br','icloud.com','me.com','mac.com',
    'proton.me','protonmail.com','aol.com','msn.com','yandex.com',
    'mail.ru','qq.com','163.com','126.com','uol.com.br','bol.com.br',
    'terra.com.br','ig.com.br','globo.com','r7.com'
  ));

-- B) Reescrever bootstrap_user com:
--    - exigência de email confirmado
--    - validação opcional de invite token
--    - skip de domain match para domínios públicos
CREATE OR REPLACE FUNCTION public.bootstrap_user(p_invite_token TEXT DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _user_id UUID; _user_email TEXT; _email_domain TEXT; _email_confirmed TIMESTAMPTZ;
  _org_id UUID; _profile_exists BOOLEAN; _invite RECORD; _domain_record RECORD;
  _full_name TEXT; _result json;
  _public_domains TEXT[] := ARRAY[
    'gmail.com','googlemail.com','hotmail.com','outlook.com','live.com',
    'yahoo.com','yahoo.com.br','icloud.com','me.com','mac.com',
    'proton.me','protonmail.com','aol.com','msn.com','yandex.com',
    'mail.ru','qq.com','163.com','126.com','uol.com.br','bol.com.br',
    'terra.com.br','ig.com.br','globo.com','r7.com'];
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;

  SELECT email, raw_user_meta_data->>'full_name', email_confirmed_at
    INTO _user_email, _full_name, _email_confirmed
    FROM auth.users WHERE id = _user_id;

  IF _email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Email não confirmado. Confirme antes de continuar.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = _user_id) INTO _profile_exists;
  IF _profile_exists THEN
    SELECT json_build_object('status','existing','profile',row_to_json(p)) INTO _result
      FROM profiles p WHERE p.id = _user_id;
    RETURN _result;
  END IF;

  _email_domain := lower(split_part(_user_email,'@',2));

  -- 1) Convite: exige token quando fornecido OU exige que o invite tenha sido emitido p/ o domínio do user
  SELECT * INTO _invite FROM org_invites
   WHERE lower(email) = lower(_user_email)
     AND expires_at > now()
     AND accepted_at IS NULL
     AND (p_invite_token IS NULL OR token = p_invite_token)
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO profiles (id,org_id,full_name) VALUES (_user_id,_invite.org_id,COALESCE(_full_name,_user_email));
    INSERT INTO user_roles (user_id,role) VALUES (_user_id,_invite.role);
    UPDATE org_invites SET accepted_at = now() WHERE id = _invite.id;
    RETURN json_build_object('status','invited','org_id',_invite.org_id);
  END IF;

  -- 2) Domain match — APENAS para domínios não-públicos
  IF NOT (_email_domain = ANY(_public_domains)) THEN
    SELECT * INTO _domain_record FROM org_domains WHERE domain = _email_domain LIMIT 1;
    IF FOUND THEN
      INSERT INTO profiles (id,org_id,full_name) VALUES (_user_id,_domain_record.org_id,COALESCE(_full_name,_user_email));
      INSERT INTO user_roles (user_id,role) VALUES (_user_id,'employee');
      RETURN json_build_object('status','domain_match','org_id',_domain_record.org_id);
    END IF;
  END IF;

  -- 3) Nova org
  INSERT INTO organizations (name) VALUES ('Minha Empresa') RETURNING id INTO _org_id;
  -- Registrar domínio APENAS se não-público
  IF NOT (_email_domain = ANY(_public_domains)) THEN
    INSERT INTO org_domains (org_id, domain) VALUES (_org_id,_email_domain);
  END IF;
  INSERT INTO profiles (id,org_id,full_name) VALUES (_user_id,_org_id,COALESCE(_full_name,_user_email));
  INSERT INTO user_roles (user_id,role) VALUES (_user_id,'admin');
  INSERT INTO expense_policies (org_id) VALUES (_org_id);
  INSERT INTO expense_categories (org_id, name) VALUES
    (_org_id,'Alimentação'),(_org_id,'Transporte'),(_org_id,'Hospedagem'),(_org_id,'Outros');
  RETURN json_build_object('status','new_org','org_id',_org_id);
END $$;

GRANT EXECUTE ON FUNCTION public.bootstrap_user(TEXT) TO authenticated;

-- C) Limpar org_domains contaminada com domínios públicos (revisar antes!)
-- DELETE FROM org_domains WHERE domain IN (...lista...);

COMMIT;
```

### `patches/P0-fix-profile-update.sql`
```sql
-- DARA-005: Bloquear mudança de org_id pelo próprio usuário
BEGIN;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND org_id IS NOT DISTINCT FROM (SELECT org_id FROM profiles WHERE id = auth.uid())
);
COMMIT;
```

### `patches/P1-fix-cross-org-leaks.sql`
```sql
-- DARA-004 + DARA-006: defesa em profundidade
BEGIN;

DROP POLICY IF EXISTS "Users can view approvals for their reports" ON public.report_approvals;
CREATE POLICY "Users can view approvals for their reports" ON public.report_approvals
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM reports r
    WHERE r.id = report_id
      AND (r.user_id = auth.uid()
           OR (is_manager_or_admin(auth.uid()) AND r.org_id = get_user_org_id(auth.uid()))))
);

DROP POLICY IF EXISTS "Managers can update expense reviews" ON public.expense_reviews;
CREATE POLICY "Managers can update expense reviews" ON public.expense_reviews
FOR UPDATE TO authenticated
USING (
  is_manager_or_admin(auth.uid())
  AND reviewer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM reports r WHERE r.id = expense_reviews.report_id AND r.org_id = get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Managers can delete expense reviews" ON public.expense_reviews;
CREATE POLICY "Managers can delete expense reviews" ON public.expense_reviews
FOR DELETE TO authenticated
USING (
  is_manager_or_admin(auth.uid())
  AND reviewer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM reports r WHERE r.id = expense_reviews.report_id AND r.org_id = get_user_org_id(auth.uid()))
);
COMMIT;
```

---

## 5. Validação Pós-Patch

- [ ] `INSERT INTO user_roles VALUES (auth.uid(),'admin')` retorna **42501 permission denied** para usuário non-admin.
- [ ] `UPDATE profiles SET org_id='<other>' WHERE id=auth.uid()` falha com **23514 check_violation**.
- [ ] `bootstrap_user()` chamado por usuário com email `@gmail.com` cria org isolada; segundo `@gmail.com` cria OUTRA org isolada.
- [ ] `bootstrap_user(p_invite_token=>'token-errado')` ignora invite, cai pra fluxo de domain/new_org.
- [ ] Manager da Org A não consegue SELECT em `report_approvals.report_id` que pertence à Org B.
- [ ] Edge function `validate-receipt` rejeita request sem `Authorization` header.
- [ ] `.env` removido de tracking (`git rm --cached .env`) e `.gitignore` atualizado.

---

## 6. Notas de Procedimento

- Nenhum código foi modificado, nenhuma migration nova foi criada — estes patches são **prontos para colar** mas devem passar por revisão de Orion + Dev antes de aplicar em produção.
- Considerar fortemente forçar logout global pós-patch (revogar todos os JWTs ativos) para invalidar sessões de admins self-granted.
- Após DARA-001 fix, executar query de auditoria para listar admins atuais e revisar manualmente quem deve permanecer.
- Fim do relatório — Dara.
