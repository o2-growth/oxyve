-- Sprint 7 — Cron de despacho automático de pushes a partir de `notifications`.
--
-- Mesmo padrão da migration de email (DEC-010 / 20260430200000):
--   1) Coluna `notifications.pushed_at` (NULL = ainda não pushado).
--   2) Função `dispatch_pending_notification_pushes()` SECURITY DEFINER:
--        - Pega notifs com pushed_at IS NULL e created_at > now() - 1h.
--        - Chama edge fn `send-push` via pg_net.http_post.
--        - Marca pushed_at = now() em sucesso.
--   3) Schedule via pg_cron a cada 1 min.
--
-- Se pg_net / pg_cron não estiverem disponíveis (Lovable Cloud restrito),
-- tudo é envolto em DO $$ ... EXCEPTION pra não falhar a migration.

BEGIN;

-- 1) Coluna pushed_at idempotente.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_pending_push_idx
  ON public.notifications (created_at)
  WHERE pushed_at IS NULL;

-- 2) Garantir extensions (pg_net + pg_cron já criadas no email cron, mas idempotente).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net não disponível: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não disponível: %', SQLERRM;
END $$;

-- 3) Função dispatcher.
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_pushes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row RECORD;
  _supabase_url TEXT;
  _service_key TEXT;
  _request_id BIGINT;
  _count INTEGER := 0;
  _has_subs BOOLEAN;
BEGIN
  BEGIN
    _supabase_url := current_setting('app.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
  END;
  BEGIN
    _service_key := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    _service_key := NULL;
  END;

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RAISE NOTICE 'dispatch_pending_notification_pushes: secrets não configurados (app.supabase_url / app.service_role_key)';
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link
      FROM public.notifications n
     WHERE n.pushed_at IS NULL
       AND n.created_at > now() - INTERVAL '1 hour'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    -- Skip rápido se o user não tem subscription ativa.
    SELECT EXISTS (
      SELECT 1 FROM public.push_subscriptions WHERE user_id = _row.user_id
    ) INTO _has_subs;

    IF NOT _has_subs THEN
      UPDATE public.notifications SET pushed_at = now() WHERE id = _row.id;
      CONTINUE;
    END IF;

    BEGIN
      SELECT net.http_post(
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
          'data', jsonb_build_object('notification_id', _row.id)
        ),
        timeout_milliseconds := 5000
      ) INTO _request_id;

      UPDATE public.notifications SET pushed_at = now() WHERE id = _row.id;
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'falha ao despachar push de notif % (%): %', _row.id, _row.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_pending_notification_pushes() TO service_role;

-- 4) Schedule via pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'dispatch_pending_notification_pushes';

    PERFORM cron.schedule(
      'dispatch_pending_notification_pushes',
      '* * * * *',
      $cron$ SELECT public.dispatch_pending_notification_pushes(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponível — função criada, agendar manualmente.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule falhou: %', SQLERRM;
END $$;

COMMIT;
