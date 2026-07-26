-- Onda 4 — Auto-join por domínio + gestão de usuários (painel admin).
--
-- Decisão: onboarding por domínio. Todo usuário @o2inc que entra (Google ou signup)
-- vira 'employee' na org automaticamente; admins promovem no painel.

-- 1) Corrige o mapeamento de domínio para a org PRINCIPAL (estava na org morta).
UPDATE public.org_domains SET org_id = '21b53d25-aa01-45dc-a64a-9f239a32d4f7'
 WHERE lower(domain) = 'o2inc.com.br';

-- 2) handle_new_user: cria profile + papel 'employee' para novo usuário cujo
--    domínio de e-mail está em org_domains. Idempotente. Roda no INSERT de
--    auth.users (antes do login processar), então o runBootstrap do front vê o
--    profile pronto e pula o fluxo de convite.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _domain text; _org uuid;
BEGIN
  _domain := lower(split_part(NEW.email, '@', 2));
  SELECT org_id INTO _org FROM public.org_domains WHERE lower(domain) = _domain LIMIT 1;
  IF _org IS NOT NULL THEN
    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (NEW.id, _org,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) set_user_role: apenas ADMIN altera papéis; não pode alterar o próprio;
--    só dentro da mesma org.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role app_role)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _org uuid; _target_org uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis.';
  END IF;
  IF p_user_id = _uid THEN
    RAISE EXCEPTION 'Você não pode alterar o seu próprio papel.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  SELECT org_id INTO _target_org FROM public.profiles WHERE id = p_user_id;
  IF _target_org IS NULL OR _target_org IS DISTINCT FROM _org THEN
    RAISE EXCEPTION 'Usuário não pertence à sua organização.';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);
  RETURN json_build_object('user_id', p_user_id, 'role', p_role::text);
END;
$function$;

-- 4) get_org_members: lista membros da org com e-mail (de auth.users) e papel.
CREATE OR REPLACE FUNCTION public.get_org_members()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _org uuid; _result json;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.is_manager_or_admin(_uid) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.full_name), '[]'::json) INTO _result
  FROM (
    SELECT p.id AS user_id, p.full_name, u.email,
      (SELECT r.role::text FROM public.user_roles r WHERE r.user_id = p.id
         ORDER BY (r.role='admin') DESC, (r.role='manager') DESC LIMIT 1) AS role,
      u.last_sign_in_at
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.org_id = _org
  ) m;
  RETURN _result;
END;
$function$;
