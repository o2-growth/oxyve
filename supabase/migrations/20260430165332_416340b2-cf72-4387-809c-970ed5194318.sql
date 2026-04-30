-- ============================================================================
-- Sprint 2 — Migration 1/2: notifications table + create_notification()
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_category') THEN
    CREATE TYPE public.notification_category AS ENUM (
      'action_required', 'my_expenses', 'reports', 'other'
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

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

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
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, org_id, category, title, body, link)
  VALUES (p_user_id, _org_id, p_category::public.notification_category, p_title, p_body, p_link)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Sprint 2 — Migration 2/2: report_events + triggers
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.report_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'created', 'submitted', 'approved', 'rejected', 'paid',
    'expense_added', 'expense_removed', 'comment'
  )),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_events_report_id_idx
  ON public.report_events (report_id, created_at DESC);

ALTER TABLE public.report_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_events_select_org ON public.report_events;
CREATE POLICY report_events_select_org ON public.report_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM public.reports r
        JOIN public.profiles p ON p.org_id = r.org_id
       WHERE r.id = report_events.report_id
         AND p.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_reports_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _event TEXT := NULL;
  _approver_ids UUID[];
  _uid UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.report_events (report_id, actor_id, event_type, data)
    VALUES (NEW.id, _actor, 'created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status::TEXT
      WHEN 'submitted' THEN 'submitted'
      WHEN 'approved'  THEN 'approved'
      WHEN 'rejected'  THEN 'rejected'
      WHEN 'paid'      THEN 'paid'
      ELSE NULL
    END;

    IF _event IS NOT NULL THEN
      INSERT INTO public.report_events (report_id, actor_id, event_type, data)
      VALUES (
        NEW.id, _actor, _event,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'title', NEW.title)
      );

      IF _event IN ('submitted', 'approved', 'rejected', 'paid') THEN
        PERFORM public.create_notification(
          NEW.user_id,
          CASE WHEN _event = 'submitted' THEN 'reports'
               WHEN _event IN ('approved', 'rejected') THEN 'my_expenses'
               WHEN _event = 'paid' THEN 'my_expenses'
               ELSE 'other' END,
          CASE _event
            WHEN 'submitted' THEN 'Relatório enviado'
            WHEN 'approved'  THEN 'Relatório aprovado'
            WHEN 'rejected'  THEN 'Relatório reprovado'
            WHEN 'paid'      THEN 'Relatório pago'
          END,
          format('"%s" — %s', NEW.title, NEW.status::TEXT),
          format('/app/reports/%s', NEW.id)
        );
      END IF;

      IF _event = 'submitted' THEN
        SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::UUID[])
          INTO _approver_ids
          FROM public.profiles p
          JOIN public.user_roles ur ON ur.user_id = p.id
         WHERE p.org_id = NEW.org_id
           AND ur.role IN ('admin', 'manager')
           AND p.id <> NEW.user_id;

        FOREACH _uid IN ARRAY _approver_ids LOOP
          PERFORM public.create_notification(
            _uid,
            'action_required',
            'Relatório aguardando aprovação',
            format('"%s" foi enviado e aguarda sua aprovação.', NEW.title),
            format('/app/reports/%s', NEW.id)
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_audit_trigger ON public.reports;
CREATE TRIGGER reports_audit_trigger
  AFTER INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_reports_audit();

CREATE OR REPLACE FUNCTION public.tg_report_items_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.report_events (report_id, actor_id, event_type, data)
    VALUES (NEW.report_id, _actor, 'expense_added',
            jsonb_build_object('expense_id', NEW.expense_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.report_events (report_id, actor_id, event_type, data)
    VALUES (OLD.report_id, _actor, 'expense_removed',
            jsonb_build_object('expense_id', OLD.expense_id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS report_items_audit_trigger ON public.report_items;
CREATE TRIGGER report_items_audit_trigger
  AFTER INSERT OR DELETE ON public.report_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_report_items_audit();