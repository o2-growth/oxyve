-- Onda 4 — confirmar pagamento (painel admin).
-- Admin/manager marca reembolsos como pagos. Só afeta despesas da própria org
-- que estão aguardando pagamento (enviadas ou aprovadas).

CREATE OR REPLACE FUNCTION public.mark_expenses_paid(p_expense_ids uuid[])
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _org uuid; _count int;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.is_manager_or_admin(_uid) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  UPDATE public.expenses SET status = 'paid', updated_at = now()
   WHERE id = ANY(p_expense_ids) AND org_id = _org AND status IN ('submitted','approved');
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN json_build_object('paid', _count);
END;
$function$;
