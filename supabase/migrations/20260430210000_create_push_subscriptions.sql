-- Sprint 7 — Push notifications: tabela `push_subscriptions`.
--
-- Cada device/browser que aceita push gera um endpoint único + chaves
-- (p256dh + auth). Guardamos por usuário pra fan-out via edge function
-- `send-push`. ON DELETE CASCADE em auth.users garante limpeza quando
-- a conta some.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuário só vê/manipula suas próprias subscriptions.
DROP POLICY IF EXISTS users_manage_own_subscriptions ON public.push_subscriptions;
CREATE POLICY users_manage_own_subscriptions
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role (edge function send-push + cron dispatcher) lê todas.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;

COMMIT;
