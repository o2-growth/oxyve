-- Coluna pushed_at: marca quando notificação já foi enviada via Web Push.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_pushed_at_null
  ON public.notifications(created_at)
  WHERE pushed_at IS NULL;

-- Função: despacha notificações pendentes via send-push edge function.
-- Mesma estrutura de dispatch_pending_notification_emails (graceful sem pg_net).
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_pushes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _row RECORD;
  _count INTEGER := 0;
  _supabase_url TEXT;
  _service_key  TEXT;
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
     WHERE n.pushed_at IS NULL
       AND n.created_at > now() - interval '24 hours'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    IF _has_pg_net AND _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
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
        CONTINUE;
      END;
    END IF;

    UPDATE public.notifications SET pushed_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- Schedule cron a cada 1min — graceful se pg_cron não estiver disponível.
DO $$
DECLARE
  _has_pg_cron BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO _has_pg_cron;

  IF _has_pg_cron THEN
    -- Remove job antigo se existir, pra evitar duplicata.
    BEGIN
      PERFORM cron.unschedule('dispatch-pending-notification-pushes');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'dispatch-pending-notification-pushes',
      '* * * * *',
      $job$ SELECT public.dispatch_pending_notification_pushes(); $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron não disponível — função dispatch_pending_notification_pushes fica acessível para invocação manual.';
  END IF;
END;
$$;