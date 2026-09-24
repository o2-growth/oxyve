-- Login só com conta Google da O2 Inc.
--
-- O parâmetro `hd` que o front manda ao Google é só dica de UI: qualquer um
-- pode tirá-lo da URL e entrar com um Gmail pessoal. A trava de verdade é este
-- hook before_user_created do Supabase Auth, que roda antes do INSERT em
-- auth.users e recusa o cadastro quando o domínio do e-mail não está em
-- org_domains. Vale para todo caminho de criação de usuário (OAuth, signup,
-- convite pelo painel), então não depende do provider e.mail estar desligado.
--
-- Usar org_domains em vez de fixar 'o2inc.com.br' mantém uma fonte só: é a
-- mesma tabela de que handle_new_user tira a org do auto-join. Domínio que entra
-- lá passa a poder logar e já cai na org certa.

CREATE OR REPLACE FUNCTION public.hook_restringe_dominio(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _email  text := lower(coalesce(event->'user'->>'email', ''));
  _domain text := split_part(_email, '@', 2);
BEGIN
  IF _domain <> '' AND EXISTS (
    SELECT 1 FROM public.org_domains WHERE lower(domain) = _domain
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Acesso restrito a contas Google da O2 Inc. Entre com seu e-mail @o2inc.com.br.'
    )
  );
END;
$function$;

-- Só o Auth chama o hook. Ninguém mais precisa descobrir quais domínios passam.
REVOKE EXECUTE ON FUNCTION public.hook_restringe_dominio(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_restringe_dominio(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
