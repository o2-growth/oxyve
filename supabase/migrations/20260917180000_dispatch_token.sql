-- Crons passam a autenticar com um token dedicado.
--
-- send-email/send-push liberam o caminho de sistema comparando o bearer com
-- SUPABASE_SERVICE_ROLE_KEY. Em projetos criados sob o esquema novo de chaves
-- essa env chega como sb_secret_*, valor que a Management API não devolve
-- inteiro — o cron mandava a JWT legada, a igualdade falhava e todo ciclo
-- terminava em 401.
--
-- DISPATCH_TOKEN é uma credencial só do dispatcher: as edge functions passam a
-- aceitá-la além da service role, e ela vale apenas para esse caminho.
-- Mantém o fallback para service_role_key em ambientes já configurados.

CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
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
    _supabase_url := public.app_setting('app.supabase_url');
    _service_key  := coalesce(
      public.app_setting('app.dispatch_token'),
      public.app_setting('app.service_role_key')
    );
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
      PERFORM net.http_post(
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

CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_pushes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
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
    _supabase_url := public.app_setting('app.supabase_url');
    _service_key  := coalesce(
      public.app_setting('app.dispatch_token'),
      public.app_setting('app.service_role_key')
    );
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
      PERFORM net.http_post(
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
