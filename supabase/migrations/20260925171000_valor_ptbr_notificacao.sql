-- to_char com 'G'/'D' segue o lc_numeric do servidor (en_US): saía "R$ 45.00".
CREATE OR REPLACE FUNCTION public.brl(p_cents bigint)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT translate(to_char(p_cents / 100.0, 'FM999,999,990.00'), ',.', '.,') $$;

CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(
  p_description text, p_amount_cents integer, p_date date,
  p_category_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'personal_card', p_currency text DEFAULT 'BRL',
  p_is_reimbursable boolean DEFAULT true, p_notes text DEFAULT NULL, p_receipt_path text DEFAULT NULL,
  p_is_event boolean DEFAULT false, p_distance_km numeric DEFAULT NULL, p_food_days integer DEFAULT 1)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid(); _org_id uuid; _report json; _late boolean;
  _expense_id uuid; _expense record; _author text; _admin uuid;
  _today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  SELECT org_id, full_name INTO _org_id, _author FROM public.profiles WHERE id = _user_id;
  IF _org_id IS NULL THEN RAISE EXCEPTION 'User has no organization'; END IF;

  IF p_is_event AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'Despesa marcada como evento exige uma observação descrevendo o motivo da exceção (política de reembolso).';
  END IF;
  -- Checado antes de get_or_create para não criar relatório vazio de um ciclo inválido.
  IF p_date > _today THEN RAISE EXCEPTION 'A data da despesa não pode ser futura.'; END IF;
  IF p_date < _today - 20 THEN
    RAISE EXCEPTION 'Só é possível lançar despesas de até 20 dias atrás (a partir de %).', to_char(_today - 20, 'DD/MM/YYYY');
  END IF;

  _report := public.get_or_create_report_for_date(p_date);
  _late := (_report->>'status') <> 'draft';

  INSERT INTO public.expenses (
    org_id, user_id, description, amount_cents, date, category_id, cost_center_id, project_id,
    payment_method, currency, is_reimbursable, notes, receipt_path, is_event, distance_km,
    food_days, status, late_decision)
  VALUES (
    _org_id, _user_id, p_description, p_amount_cents, p_date, p_category_id, p_cost_center_id, p_project_id,
    p_payment_method::payment_method, p_currency, p_is_reimbursable, p_notes, p_receipt_path, p_is_event, p_distance_km,
    GREATEST(COALESCE(p_food_days, 1), 1), 'draft', CASE WHEN _late THEN 'pending' END)
  RETURNING id INTO _expense_id;

  IF _late THEN
    -- Relatório do ciclo já enviado: fica avulsa e os admins decidem o destino.
    FOR _admin IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
       WHERE p.org_id = _org_id AND ur.role IN ('admin', 'manager') AND ur.user_id <> _user_id
    LOOP
      PERFORM public.create_notification(
        _admin, 'action_required', 'Despesa fora do prazo',
        format('%s lançou "%s" (R$ %s) depois do envio do %s. Decida se entra neste mês ou no próximo.',
               COALESCE(_author, 'Um colaborador'), p_description,
               public.brl(p_amount_cents), _report->>'title'),
        '/app/gestao');
    END LOOP;
  ELSE
    INSERT INTO public.report_items (report_id, expense_id) VALUES ((_report->>'id')::uuid, _expense_id);
  END IF;

  SELECT * INTO _expense FROM public.expenses WHERE id = _expense_id;
  RETURN json_build_object(
    'expense', row_to_json(_expense),
    'report', CASE WHEN _late THEN NULL ELSE _report END,
    'late', _late,
    'late_report', CASE WHEN _late THEN _report END,
    'is_out_of_policy', _expense.is_out_of_policy);
END;
$function$;

