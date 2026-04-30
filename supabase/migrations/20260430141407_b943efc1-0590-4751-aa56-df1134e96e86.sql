-- Sprint 0 — Security hotfix
BEGIN;

-- DARA-001
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.admin_assign_role(
  p_user_id UUID,
  p_role public.app_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_org UUID;
  _target_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: caller is not admin';
  END IF;

  SELECT org_id INTO _caller_org FROM public.profiles WHERE id = auth.uid();
  SELECT org_id INTO _target_org FROM public.profiles WHERE id = p_user_id;

  IF _caller_org IS NULL THEN
    RAISE EXCEPTION 'caller_has_no_org';
  END IF;

  IF p_user_id <> auth.uid() AND (_target_org IS NULL OR _target_org <> _caller_org) THEN
    RAISE EXCEPTION 'target_user_not_in_same_org';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_role(UUID, public.app_role) TO authenticated;

-- DARA-002 + DARA-003
ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.bootstrap_user();
DROP FUNCTION IF EXISTS public.bootstrap_user(TEXT);

CREATE OR REPLACE FUNCTION public.bootstrap_user(p_invite_token TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _user_email TEXT;
  _email_confirmed TIMESTAMPTZ;
  _full_name TEXT;
  _profile_exists BOOLEAN;
  _invite RECORD;
  _result json;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_invite_token IS NULL OR length(trim(p_invite_token)) = 0 THEN
    RAISE EXCEPTION 'invite_required';
  END IF;

  SELECT email, raw_user_meta_data->>'full_name', email_confirmed_at
    INTO _user_email, _full_name, _email_confirmed
    FROM auth.users
   WHERE id = _user_id;

  IF _email_confirmed IS NULL THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id) INTO _profile_exists;
  IF _profile_exists THEN
    SELECT json_build_object('status','existing','profile',row_to_json(p)) INTO _result
      FROM public.profiles p WHERE p.id = _user_id;
    RETURN _result;
  END IF;

  SELECT * INTO _invite
    FROM public.org_invites
   WHERE token = p_invite_token
     AND lower(email) = lower(_user_email)
     AND expires_at > now()
     AND accepted_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_required';
  END IF;

  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (_user_id, _invite.org_id, COALESCE(_full_name, _user_email));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _invite.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.org_invites
     SET accepted_at = now(),
         accepted_by = _user_id
   WHERE id = _invite.id;

  RETURN json_build_object(
    'status', 'invited',
    'org_id', _invite.org_id,
    'role',   _invite.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_user(TEXT) TO authenticated;

-- DARA-005
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND org_id IS NOT DISTINCT FROM (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- DARA-006
DROP POLICY IF EXISTS "Users can view approvals for their reports" ON public.report_approvals;

CREATE POLICY "Users can view approvals for their reports"
ON public.report_approvals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.reports r
     WHERE r.id = report_approvals.report_id
       AND (
         r.user_id = auth.uid()
         OR (
           public.is_manager_or_admin(auth.uid())
           AND r.org_id = public.get_user_org_id(auth.uid())
         )
       )
  )
);

-- DARA-007
UPDATE public.org_domains SET domain = lower(trim(domain)) WHERE domain <> lower(trim(domain));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'org_domains_domain_format_chk'
       AND conrelid = 'public.org_domains'::regclass
  ) THEN
    ALTER TABLE public.org_domains
      ADD CONSTRAINT org_domains_domain_format_chk
      CHECK (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'org_domains_org_domain_unique'
       AND conrelid = 'public.org_domains'::regclass
  ) THEN
    ALTER TABLE public.org_domains
      ADD CONSTRAINT org_domains_org_domain_unique UNIQUE (org_id, domain);
  END IF;
END $$;

-- @o2inc.com.br restriction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'org_invites_email_domain_chk'
       AND conrelid = 'public.org_invites'::regclass
  ) THEN
    ALTER TABLE public.org_invites
      ADD CONSTRAINT org_invites_email_domain_chk
      CHECK (email ~* '@o2inc\.com\.br$') NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT org_invites_email_domain_chk ON public.org_invites IS
  'Restrição temporária @o2inc.com.br. NOT VALID: enforce só em INSERT/UPDATE novos; linhas legacy ficam intocadas. Substituir por orgs.allowed_email_domains[] quando implementarmos multi-domain.';

COMMIT;