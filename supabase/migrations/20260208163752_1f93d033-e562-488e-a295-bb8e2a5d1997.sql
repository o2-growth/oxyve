-- 1. Create org_domains table for domain-based auto-join
CREATE TABLE public.org_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(domain)
);

-- 2. Create org_invites table for invite-based onboarding
CREATE TABLE public.org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'employee',
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email, org_id)
);

-- 3. Create expense_policies table (one per org)
CREATE TABLE public.expense_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  default_currency TEXT NOT NULL DEFAULT 'BRL',
  require_cost_center BOOLEAN NOT NULL DEFAULT false,
  require_project BOOLEAN NOT NULL DEFAULT false,
  require_receipt BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create cost_centers table
CREATE TABLE public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Add cost_center_id and project_id to expenses
ALTER TABLE public.expenses
ADD COLUMN cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Enable RLS on all new tables
ALTER TABLE public.org_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS for org_domains
CREATE POLICY "Users can view org domains" ON public.org_domains
FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage org domains" ON public.org_domains
FOR ALL USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- RLS for org_invites
CREATE POLICY "Admins can manage invites" ON public.org_invites
FOR ALL USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- RLS for expense_policies
CREATE POLICY "Users can view org policy" ON public.expense_policies
FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage org policy" ON public.expense_policies
FOR ALL USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- RLS for cost_centers
CREATE POLICY "Users can view org cost centers" ON public.cost_centers
FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage cost centers" ON public.cost_centers
FOR ALL USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- RLS for projects
CREATE POLICY "Users can view org projects" ON public.projects
FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage projects" ON public.projects
FOR ALL USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- Create triggers for updated_at
CREATE TRIGGER update_expense_policies_updated_at
BEFORE UPDATE ON public.expense_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cost_centers_updated_at
BEFORE UPDATE ON public.cost_centers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create the bootstrap_user function (SECURITY DEFINER for safe onboarding)
CREATE OR REPLACE FUNCTION public.bootstrap_user()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _user_email TEXT;
  _email_domain TEXT;
  _org_id UUID;
  _profile_exists BOOLEAN;
  _invite RECORD;
  _domain_record RECORD;
  _full_name TEXT;
  _result json;
BEGIN
  -- Get current user info
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT email, raw_user_meta_data->>'full_name' 
  INTO _user_email, _full_name
  FROM auth.users WHERE id = _user_id;

  -- Check if profile already exists
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id) INTO _profile_exists;
  
  IF _profile_exists THEN
    -- Return existing profile
    SELECT json_build_object(
      'status', 'existing',
      'profile', row_to_json(p)
    ) INTO _result
    FROM public.profiles p WHERE p.id = _user_id;
    RETURN _result;
  END IF;

  -- Extract domain from email
  _email_domain := split_part(_user_email, '@', 2);

  -- Step 1: Check for pending invite (case-insensitive)
  SELECT * INTO _invite
  FROM public.org_invites
  WHERE lower(email) = lower(_user_email)
    AND expires_at > now()
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Accept invite: create profile with invited org and role
    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (_user_id, _invite.org_id, COALESCE(_full_name, _user_email));

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _invite.role);

    -- Mark invite as accepted
    UPDATE public.org_invites SET accepted_at = now() WHERE id = _invite.id;

    SELECT json_build_object(
      'status', 'invited',
      'org_id', _invite.org_id
    ) INTO _result;
    RETURN _result;
  END IF;

  -- Step 2: Check for domain match
  SELECT * INTO _domain_record
  FROM public.org_domains
  WHERE domain = _email_domain
  LIMIT 1;

  IF FOUND THEN
    -- Join existing org as employee
    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (_user_id, _domain_record.org_id, COALESCE(_full_name, _user_email));

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'employee');

    SELECT json_build_object(
      'status', 'domain_match',
      'org_id', _domain_record.org_id
    ) INTO _result;
    RETURN _result;
  END IF;

  -- Step 3: Create new organization
  INSERT INTO public.organizations (name)
  VALUES ('Minha Empresa')
  RETURNING id INTO _org_id;

  -- Register domain
  INSERT INTO public.org_domains (org_id, domain)
  VALUES (_org_id, _email_domain);

  -- Create profile as admin
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (_user_id, _org_id, COALESCE(_full_name, _user_email));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin');

  -- Create default expense policy
  INSERT INTO public.expense_policies (org_id)
  VALUES (_org_id);

  -- Create default categories
  INSERT INTO public.expense_categories (org_id, name) VALUES
    (_org_id, 'Alimentação'),
    (_org_id, 'Transporte'),
    (_org_id, 'Hospedagem'),
    (_org_id, 'Outros');

  SELECT json_build_object(
    'status', 'new_org',
    'org_id', _org_id
  ) INTO _result;
  RETURN _result;
END;
$$;

-- Update the handle_new_user trigger to NOT create profile automatically
-- since bootstrap_user will handle it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Do nothing - bootstrap_user() will handle profile creation
  -- This prevents duplicate profile creation
  RETURN NEW;
END;
$$;