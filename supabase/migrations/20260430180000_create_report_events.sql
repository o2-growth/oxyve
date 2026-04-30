-- Sprint 2 — GAP-G011: Audit trail / histórico de relatórios.
-- + GAP-G012: triggers que disparam notificações em transições de status.
--
-- Tabela `report_events` é insert-only do ponto de vista do client (sem
-- INSERT policy). Triggers populam automaticamente.

BEGIN;

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

-- SELECT: membros da mesma org do report. (Mesma política do reports.)
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

-- INSERT/UPDATE/DELETE: bloqueado p/ client. Só triggers (definidos abaixo)
-- ou SECURITY DEFINER fns gravam.

-- ============================================================================
-- Triggers
-- ============================================================================

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
    _event := 'created';
    INSERT INTO public.report_events (report_id, actor_id, event_type, data)
    VALUES (NEW.id, _actor, 'created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;

  -- UPDATE com mudança de status.
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

      -- Notificações pro autor sempre.
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

      -- Quando submitted: notifica admins/managers da org como "ação necessária".
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

-- Item add/remove events.
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

COMMIT;
