-- Onda 1 — Hardening de segurança e integridade de notificações
--
-- (1) DARA: fecha o INSERT arbitrário de org_id em public.profiles.
--     A policy de INSERT client-side validava apenas id = auth.uid() e deixava
--     org_id livre, permitindo que um usuário autenticado sem profile se
--     auto-anexasse a QUALQUER org, contornando o fluxo de convite (bootstrap_user).
--     Criação de profile ocorre exclusivamente via bootstrap_user (SECURITY DEFINER),
--     que valida o org_id contra um org_invite. Não há INSERT client-side legítimo
--     (grep no front confirma só .select()/.update()). Mesmo padrão do hotfix DARA-001
--     aplicado a user_roles.
--
-- (2) Dispatchers de notificação (email/push): paravam de mentir.
--     O UPDATE emailed_at/pushed_at estava FORA do bloco de envio: quando os GUCs
--     app.supabase_url/app.service_role_key estão NULL (estado atual), o http_post era
--     pulado e a notificação era carimbada como enviada mesmo assim — perda permanente.
--     Agora: sem canal configurado, retorna sem carimbar (fica pendente para retry);
--     e só marca como enviada após o http_post enfileirar com sucesso.

BEGIN;

-- ============================================================
-- (1) RLS profiles — remover INSERT client-side
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- ============================================================
-- (2a) dispatch_pending_notification_emails
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _row RECORD;
  _count INTEGER := 0;
  _supabase_url TEXT;
  _service_key  TEXT;
  _user_email   TEXT;
  _has_pg_net   BOOLEAN;
  _can_send     BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO _has_pg_net;

  BEGIN
    _supabase_url := current_setting('app.supabase_url', true);
    _service_key  := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
    _service_key  := NULL;
  END;

  _can_send := _has_pg_net
               AND _supabase_url IS NOT NULL AND _supabase_url <> ''
               AND _service_key  IS NOT NULL AND _service_key  <> '';

  -- Sem canal de envio: não carimbar nada. Deixa pendente para quando as
  -- chaves forem configuradas, em vez de queimar a notificação silenciosamente.
  IF NOT _can_send THEN
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link, n.category
      FROM public.notifications n
     WHERE n.emailed_at IS NULL
       AND n.created_at > now() - interval '24 hours'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    SELECT email INTO _user_email FROM auth.users WHERE id = _row.user_id;
    -- Destinatário inexistente: inentregável, descarta para não reprocessar eternamente.
    IF _user_email IS NULL THEN
      UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM extensions.http_post(
        url := _supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_key
        ),
        body := jsonb_build_object(
          'to', _user_email,
          'subject', _row.title,
          'text', COALESCE(_row.body, _row.title),
          'link', _row.link,
          'category', _row.category::text,
          'notification_id', _row.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'send-email falhou para % : %', _row.id, SQLERRM;
      CONTINUE;  -- não carimba: permanece pendente para retry no próximo ciclo
    END;

    -- Só marca enviado após o enfileiramento bem-sucedido do http_post.
    UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$function$;

-- ============================================================
-- (2b) dispatch_pending_notification_pushes
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_pushes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _row RECORD;
  _count INTEGER := 0;
  _supabase_url TEXT;
  _service_key  TEXT;
  _has_pg_net   BOOLEAN;
  _can_send     BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO _has_pg_net;

  BEGIN
    _supabase_url := current_setting('app.supabase_url', true);
    _service_key  := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
    _service_key  := NULL;
  END;

  _can_send := _has_pg_net
               AND _supabase_url IS NOT NULL AND _supabase_url <> ''
               AND _service_key  IS NOT NULL AND _service_key  <> '';

  IF NOT _can_send THEN
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link, n.category
      FROM public.notifications n
     WHERE n.pushed_at IS NULL
       AND n.created_at > now() - interval '24 hours'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    BEGIN
      PERFORM extensions.http_post(
        url := _supabase_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_key
        ),
        body := jsonb_build_object(
          'user_id', _row.user_id,
          'title', _row.title,
          'body', COALESCE(_row.body, _row.title),
          'link', _row.link,
          'tag', 'oxyve-' || _row.category::text,
          'data', jsonb_build_object(
            'notification_id', _row.id,
            'category', _row.category::text
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'send-push falhou para % : %', _row.id, SQLERRM;
      CONTINUE;  -- não carimba: permanece pendente para retry
    END;

    UPDATE public.notifications SET pushed_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$function$;

COMMIT;
