-- Sprint 3 — Email cron + dispatch function

-- 1) coluna emailed_at
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_pending_email
  ON public.notifications (created_at)
  WHERE emailed_at IS NULL;

-- 2) tentar habilitar extensões (graceful)
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net não pôde ser habilitado: %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron não pôde ser habilitado: %', SQLERRM;
  END;
END $$;

-- 3) função dispatch
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row RECORD;
  _count INTEGER := 0;
  _supabase_url TEXT;
  _service_key  TEXT;
  _user_email   TEXT;
  _has_pg_net   BOOLEAN;
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

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link, n.category
      FROM public.notifications n
     WHERE n.emailed_at IS NULL
       AND n.created_at > now() - interval '24 hours'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    SELECT email INTO _user_email FROM auth.users WHERE id = _row.user_id;
    IF _user_email IS NULL THEN
      UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
      CONTINUE;
    END IF;

    IF _has_pg_net AND _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
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
        CONTINUE;
      END;
    END IF;

    UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_pending_notification_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_pending_notification_emails() TO service_role;

-- 4) agendamento via pg_cron (graceful)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('dispatch_pending_notification_emails');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM cron.schedule(
        'dispatch_pending_notification_emails',
        '* * * * *',
        $cron$ SELECT public.dispatch_pending_notification_emails(); $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron.schedule falhou: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron indisponível — função dispatch_pending_notification_emails fica acessível via RPC manual.';
  END IF;
END $$;