-- Texto da notificação ao autor saía com o enum cru ("Relatório Set 2026" — submitted).
-- Troca só essa linha por uma frase em pt-BR por evento. E o valor da despesa passa a
-- exigir > 0 no banco (o check antigo aceitava zero; a captura chegou a gravar R$ 0,00).

CREATE OR REPLACE FUNCTION public.tg_reports_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          format('"%s" %s', NEW.title, CASE _event
            WHEN 'submitted' THEN 'foi enviado para aprovação.'
            WHEN 'approved'  THEN 'foi aprovado e aguarda pagamento.'
            WHEN 'rejected'  THEN 'foi devolvido — veja o motivo e corrija.'
            WHEN 'paid'      THEN 'foi pago.'
          END),
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
$function$;

ALTER TABLE public.expenses DROP CONSTRAINT expenses_amount_cents_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_cents_check CHECK (amount_cents > 0);
