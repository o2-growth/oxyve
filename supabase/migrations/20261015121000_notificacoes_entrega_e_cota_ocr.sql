-- Notificações: coluna que faltava em push_subscriptions (C1), confirmação de
-- entrega de e-mail/push pela resposta do pg_net (C2) e cota de leitura de nota
-- por usuário para a edge function validate-receipt (F2).
--
-- Só aditiva: ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX, CREATE OR REPLACE
-- FUNCTION e REVOKE/GRANT. Nenhuma linha existente é alterada pela migration.

-- ---------------------------------------------------------------------------
-- C1: push_subscriptions.updated_at
-- ---------------------------------------------------------------------------
-- A 20260430223637 criou a trigger update_updated_at_column nesta tabela, mas a
-- tabela vigente (da 20260430210000) não tem updated_at. Todo UPDATE/upsert com
-- conflito falhava com 'record "new" has no field "updated_at"'.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- C2: entrega confirmada pela resposta HTTP, não pelo enfileiramento
-- ---------------------------------------------------------------------------
-- net.http_post é assíncrono: devolve só o id do pedido. O dispatcher carimbava
-- emailed_at/pushed_at ao enfileirar e um 401/5xx da edge function perdia o
-- envio. Agora ele guarda o id do pedido; a reconciliação lê net._http_response
-- e, se falhou, devolve a notificação para a fila (até 3 tentativas).
-- O carimbo ao enfileirar continua, para o mesmo item não sair duas vezes
-- enquanto o pedido está em voo.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_request_id bigint;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_request_id bigint;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS notifications_email_request_idx
  ON public.notifications (email_request_id) WHERE email_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_push_request_idx
  ON public.notifications (push_request_id) WHERE push_request_id IS NOT NULL;

-- Resposta "simulated" (edge sem RESEND_API_KEY/VAPID) conta como final: repetir
-- não adianta, e reabrir a fila faria sair tudo de uma vez quando a chave entrar.
-- Sem resposta depois de 6 h (TTL padrão do pg_net) desiste sem repetir.
CREATE OR REPLACE FUNCTION public.reconcile_notification_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
DECLARE _reabertas integer := 0; _n integer;
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RETURN 0;
  END IF;

  WITH res AS (
    SELECT n.id,
           (r.timed_out IS TRUE OR r.error_msg IS NOT NULL OR r.status_code IS NULL
            OR r.status_code < 200 OR r.status_code >= 300) AS falhou
      FROM public.notifications n
      JOIN net._http_response r ON r.id = n.email_request_id
     WHERE n.email_request_id IS NOT NULL
  )
  , upd AS (
    UPDATE public.notifications n
       SET email_request_id = NULL,
           email_attempts = n.email_attempts + CASE WHEN res.falhou THEN 1 ELSE 0 END,
           emailed_at = CASE WHEN res.falhou AND n.email_attempts + 1 < 3 THEN NULL ELSE n.emailed_at END
      FROM res
     WHERE res.id = n.id
    RETURNING n.emailed_at
  )
  SELECT count(*) FILTER (WHERE emailed_at IS NULL) INTO _n FROM upd;
  _reabertas := _reabertas + _n;

  WITH res AS (
    SELECT n.id,
           (r.timed_out IS TRUE OR r.error_msg IS NOT NULL OR r.status_code IS NULL
            OR r.status_code < 200 OR r.status_code >= 300) AS falhou
      FROM public.notifications n
      JOIN net._http_response r ON r.id = n.push_request_id
     WHERE n.push_request_id IS NOT NULL
  )
  , upd AS (
    UPDATE public.notifications n
       SET push_request_id = NULL,
           push_attempts = n.push_attempts + CASE WHEN res.falhou THEN 1 ELSE 0 END,
           pushed_at = CASE WHEN res.falhou AND n.push_attempts + 1 < 3 THEN NULL ELSE n.pushed_at END
      FROM res
     WHERE res.id = n.id
    RETURNING n.pushed_at
  )
  SELECT count(*) FILTER (WHERE pushed_at IS NULL) INTO _n FROM upd;
  _reabertas := _reabertas + _n;

  -- Pedido sem resposta há mais de 6 h: o pg_net já descartou, desiste.
  UPDATE public.notifications SET email_request_id = NULL
   WHERE email_request_id IS NOT NULL AND emailed_at < now() - interval '6 hours';
  UPDATE public.notifications SET push_request_id = NULL
   WHERE push_request_id IS NOT NULL AND pushed_at < now() - interval '6 hours';

  RETURN _reabertas;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_notification_deliveries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_notification_deliveries() TO service_role;

-- Versão da 20260917182000 + reconciliação no início e request_id gravado.
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
  _dispatch_tok TEXT;
  _user_email   TEXT;
  _has_pg_net   BOOLEAN;
  _can_send     BOOLEAN;
  _request_id   BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO _has_pg_net;

  BEGIN
    _supabase_url := public.app_setting('app.supabase_url');
    _service_key  := public.app_setting('app.service_role_key');
    _dispatch_tok := public.app_setting('app.dispatch_token');
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
    _service_key  := NULL;
    _dispatch_tok := NULL;
  END;

  _can_send := _has_pg_net
               AND _supabase_url IS NOT NULL AND _supabase_url <> ''
               AND _service_key  IS NOT NULL AND _service_key  <> '';

  -- Sem canal de envio: não carimbar nada. Deixa pendente para quando as
  -- chaves forem configuradas, em vez de queimar a notificação silenciosamente.
  IF NOT _can_send THEN
    RETURN 0;
  END IF;

  -- Reabre o que falhou no ciclo anterior. Erro aqui não pode travar o envio.
  BEGIN
    PERFORM public.reconcile_notification_deliveries();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'reconciliação de entregas falhou: %', SQLERRM;
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
    -- Destinatário inexistente: inentregável, descarta para não reprocessar eternamente.
    IF _user_email IS NULL THEN
      UPDATE public.notifications SET emailed_at = now() WHERE id = _row.id;
      CONTINUE;
    END IF;

    BEGIN
      -- link vai relativo (/app/...); a edge send-email monta a URL absoluta.
      SELECT net.http_post(
        url := _supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_key,
          'x-dispatch-token', coalesce(_dispatch_tok, '')
        ),
        body := jsonb_build_object(
          'to', _user_email,
          'subject', _row.title,
          'text', COALESCE(_row.body, _row.title),
          'link', _row.link,
          'category', _row.category::text,
          'notification_id', _row.id
        )
      ) INTO _request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'send-email falhou para % : %', _row.id, SQLERRM;
      CONTINUE;  -- não carimba: permanece pendente para retry no próximo ciclo
    END;

    -- Carimba ao enfileirar (evita reenvio em voo); a reconciliação reabre se a
    -- resposta vier com erro.
    UPDATE public.notifications SET emailed_at = now(), email_request_id = _request_id WHERE id = _row.id;
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
  _dispatch_tok TEXT;
  _has_pg_net   BOOLEAN;
  _can_send     BOOLEAN;
  _request_id   BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO _has_pg_net;

  BEGIN
    _supabase_url := public.app_setting('app.supabase_url');
    _service_key  := public.app_setting('app.service_role_key');
    _dispatch_tok := public.app_setting('app.dispatch_token');
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
    _service_key  := NULL;
    _dispatch_tok := NULL;
  END;

  _can_send := _has_pg_net
               AND _supabase_url IS NOT NULL AND _supabase_url <> ''
               AND _service_key  IS NOT NULL AND _service_key  <> '';

  IF NOT _can_send THEN
    RETURN 0;
  END IF;

  -- Reabre o que falhou no ciclo anterior. Erro aqui não pode travar o envio.
  BEGIN
    PERFORM public.reconcile_notification_deliveries();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'reconciliação de entregas falhou: %', SQLERRM;
  END;

  FOR _row IN
    SELECT n.id, n.user_id, n.title, n.body, n.link, n.category
      FROM public.notifications n
     WHERE n.pushed_at IS NULL
       AND n.created_at > now() - interval '24 hours'
     ORDER BY n.created_at ASC
     LIMIT 50
  LOOP
    BEGIN
      SELECT net.http_post(
        url := _supabase_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_key,
          'x-dispatch-token', coalesce(_dispatch_tok, '')
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
      ) INTO _request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'send-push falhou para % : %', _row.id, SQLERRM;
      CONTINUE;  -- não carimba: permanece pendente para retry
    END;

    UPDATE public.notifications SET pushed_at = now(), push_request_id = _request_id WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$function$;

-- CREATE OR REPLACE mantém a ACL; reforça o corte da 20260924144500.
REVOKE EXECUTE ON FUNCTION public.dispatch_pending_notification_emails() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_pending_notification_pushes() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- F2: cota de leitura de nota (validate-receipt) por usuário
-- ---------------------------------------------------------------------------
-- Sem limite, um loop no console gasta OpenAI e pode estourar o rate limit da
-- conta, derrubando o OCR de todo mundo. RLS ligada e sem policy: só a função
-- (SECURITY DEFINER) lê e escreve.
CREATE TABLE IF NOT EXISTS public.receipt_validation_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receipt_validation_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_validation_usage FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS receipt_validation_usage_user_time_idx
  ON public.receipt_validation_usage (user_id, created_at DESC);

-- Registra a chamada e diz se ainda está dentro do limite da última hora.
-- A edge chama com o client do usuário (JWT dele) e devolve 429 quando for false.
CREATE OR REPLACE FUNCTION public.consume_receipt_validation_quota(p_limit_per_hour integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _usadas integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  SELECT count(*) INTO _usadas FROM public.receipt_validation_usage
   WHERE user_id = _uid AND created_at > now() - interval '1 hour';
  -- Limite vem do servidor; o parâmetro só pode apertar, não afrouxar.
  IF _usadas >= LEAST(GREATEST(COALESCE(p_limit_per_hour, 60), 1), 60) THEN
    RETURN false;
  END IF;
  INSERT INTO public.receipt_validation_usage (user_id) VALUES (_uid);
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consume_receipt_validation_quota(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_receipt_validation_quota(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
