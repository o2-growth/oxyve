-- Sprint 2 — GAP-G012: Notificações persistentes.
-- Tabela `notifications` (per-user) + função SECURITY DEFINER pra inserir
-- notificações de outros (ex.: gestor avisado quando relatório é enviado).
-- Triggers em `reports` ficam em arquivo separado (20260430180000), porque
-- esse depende da função `create_notification` definida aqui.

BEGIN;

-- Idempotência: derruba enum/tabela/funções antigas se já existirem (dev-only).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_category'
  ) THEN
    CREATE TYPE public.notification_category AS ENUM (
      'action_required',
      'my_expenses',
      'reports',
      'other'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category     public.notification_category NOT NULL DEFAULT 'other',
  title        TEXT NOT NULL,
  body         TEXT,
  link         TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id, read_at NULLS FIRST, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_org_id_idx
  ON public.notifications (org_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: só o dono lê suas notifs.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- UPDATE: dono pode marcar como lida (read_at). Outros campos não podem
-- ser alterados pelo client — Postgres vai aceitar o update mas o RLS
-- impede leitura cruzada; e a função SECURITY DEFINER é a única forma
-- aceita de gravar conteúdo.
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INSERT: bloqueado para o client (sem policy). Apenas via SECURITY DEFINER.
-- DELETE: idem.

-- Função para inserir notificação (chamada por triggers ou edge functions).
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id  UUID,
  p_category TEXT,
  p_title    TEXT,
  p_body     TEXT DEFAULT NULL,
  p_link     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = p_user_id;
  IF _org_id IS NULL THEN
    -- Sem org -> não notifica (silent no-op em vez de explodir).
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, org_id, category, title, body, link)
  VALUES (p_user_id, _org_id, p_category::public.notification_category, p_title, p_body, p_link)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
