-- Sprint 3 — Cron de envio automático de emails a partir de `notifications`.
--
-- Estratégia:
--   1) Adiciona `notifications.emailed_at` (NULL = ainda não enviado).
--   2) Função `dispatch_pending_notification_emails()` (SECURITY DEFINER):
--      - Pega notifs com emailed_at IS NULL e created_at > now() - 1h
--        (evita reenvio massivo de eventos antigos).
--      - Resolve email do user via auth.users.
--      - Chama edge fn `send-email` via pg_net.http_post.
--      - Marca emailed_at = now() em sucesso.
--   3) Schedule via pg_cron a cada 1 minuto.
--
-- IMPORTANTE: pg_cron e pg_net podem requerer aprovação especial no
-- Lovable Cloud. Se as extensões não estiverem disponíveis, a função e a
-- coluna são criadas mesmo assim (uso manual via RPC), mas o
-- cron.schedule é envolto em DO $$ ... EXCEPTION ... $$ pra não falhar
-- a migration inteira.

BEGIN;

-- 1) Coluna emailed_at idempotente.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_pending_email_idx
  ON public.notifications (created_at)
  WHERE emailed_at IS NULL;

-- 2) Garantir extensions disponíveis (se Lovable bloquear, segue sem cron).
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
CREATE OR REPLACE FUNCTION public.dispatch_pending_notification_emails()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row RECORD;
  _email TEXT;
  _supabase_url TEXT;
  _service_key TEXT;
  _request_id BIGINT;
  _count INTEGER := 0;
BEGIN
  -- Lê secrets do GUC (definidos via supabase secrets / vault).
  -- Fallback: usa env do projeto, que o Lovable expõe via current_setting.
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
    -- Sem secrets, no-op silencioso.
    RAISE NOTICE 'dispatch_pending_notification_emails: secrets não configurados (app.supabase_url / app.service_role_key)';
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link
      FROM public.notifications n
     WHERE n.emailed_at IS NULL
       AND n.created_at > now() - INTERVAL '1 hour'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    SELECT au.email INTO _email FROM auth.users au WHERE au.id = _row.user_id;
    IF _email IS NULL THEN
      -- Sem email no auth.users → marca como enviado pra não tentar de novo.
      UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
      CONTINUE;
    END IF;

    BEGIN
      SELECT net.http_post(
        url := _supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_key
        ),
        body := jsonb_build_object(
          'to', _email,
          'subject', _row.title,
          'html', '<p>' || COALESCE(_row.body, _row.title) || '</p>'
                  || CASE WHEN _row.link IS NOT NULL
                          THEN '<p><a href="' || _supabase_url || _row.link || '">Abrir</a></p>'
                          ELSE '' END,
          'text', COALESCE(_row.body, _row.title)
        ),
        timeout_milliseconds := 5000
      ) INTO _request_id;

      -- Marca como enviado mesmo se http_post for fire-and-forget.
      UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'falha ao despachar notif % (%): %', _row.id, _email, SQLERRM;
    END;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_pending_notification_emails() TO service_role;

-- 4) Schedule via pg_cron, opcional (skipa se extensão não rolou).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove jobs antigos com mesmo nome.
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'dispatch_pending_notification_emails';

    PERFORM cron.schedule(
      'dispatch_pending_notification_emails',
      '* * * * *',
      $cron$ SELECT public.dispatch_pending_notification_emails(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponível — função criada, agendar manualmente.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule falhou: %', SQLERRM;
END $$;

COMMIT;
