-- Pagamento só do que foi aprovado, e totais da Gestão que batem com o que se paga.
--
-- mark_expenses_paid (botão "Confirmar pagamento" em Gestão › Por pessoa) aceitava
-- despesa 'submitted': o admin pagava um relatório recém-enviado sem nunca ter
-- aprovado. É a mesma brecha que mark_report_paid fechou em 20260924153000, por
-- outro caminho. Agora só paga despesa 'approved' cujo relatório está aprovado, e
-- fecha como 'paid' o relatório que ficar com todos os itens pagos.
--
-- get_admin_financial_overview: "Total a pagar" somava enviadas + aprovadas e só do
-- ciclo corrente — uma aprovada do ciclo anterior sumia do que a empresa deve, e uma
-- enviada entrava como dívida antes da decisão. Passa a ser: a_pagar = aprovadas não
-- pagas (qualquer ciclo); aguardando_aprovacao = enviadas (qualquer ciclo);
-- realizado = tudo que não é rascunho nem recusado, no ciclo, de qualquer categoria.

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

  UPDATE public.expenses e SET status = 'paid', updated_at = now()
   WHERE e.id = ANY(p_expense_ids) AND e.org_id = _org AND e.status = 'approved'
     AND EXISTS (
       SELECT 1 FROM public.report_items ri JOIN public.reports r ON r.id = ri.report_id
        WHERE ri.expense_id = e.id AND r.status IN ('approved', 'paid'));
  GET DIAGNOSTICS _count = ROW_COUNT;

  UPDATE public.reports r SET status = 'paid', updated_at = now()
   WHERE r.org_id = _org AND r.status = 'approved'
     AND EXISTS (SELECT 1 FROM public.report_items ri WHERE ri.report_id = r.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.report_items ri JOIN public.expenses e ON e.id = ri.expense_id
        WHERE ri.report_id = r.id AND e.status <> 'paid');

  RETURN json_build_object('paid', _count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_financial_overview()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _org uuid; _cutoff int; _today date := current_date;
  _start date; _end date; _cycle text; _bdays int; _colabs int; _food_limit int; _result json;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.is_manager_or_admin(_uid) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  SELECT cycle_cutoff_day, food_daily_limit_cents INTO _cutoff, _food_limit
    FROM public.expense_policies WHERE org_id = _org;
  _cutoff := COALESCE(_cutoff, 25); _food_limit := COALESCE(_food_limit, 3000);

  IF EXTRACT(day FROM _today)::int >= _cutoff THEN
    _start := make_date(EXTRACT(year FROM _today)::int, EXTRACT(month FROM _today)::int, _cutoff);
  ELSE
    _start := (make_date(EXTRACT(year FROM _today)::int, EXTRACT(month FROM _today)::int, _cutoff) - interval '1 month')::date;
  END IF;
  _end := (_start + interval '1 month' - interval '1 day')::date;
  _cycle := to_char(_start + interval '1 month', 'YYYY-MM');
  SELECT count(*) INTO _bdays FROM generate_series(_start, _end, interval '1 day') d WHERE EXTRACT(dow FROM d) BETWEEN 1 AND 5;
  SELECT count(*) INTO _colabs FROM public.profiles WHERE org_id = _org;

  WITH cycle_exp AS (
    SELECT e.id, e.user_id, e.amount_cents, e.status, e.is_out_of_policy, ec.kind, ec.sector
    FROM public.expenses e LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.org_id = _org AND e.date BETWEEN _start AND _end
      AND e.status IN ('submitted', 'approved', 'paid')
  ),
  open_exp AS (
    SELECT e.user_id, e.amount_cents, e.status
    FROM public.expenses e
    WHERE e.org_id = _org AND e.status IN ('submitted', 'approved')
  ),
  transport_hist AS (
    SELECT e.user_id, (SUM(e.amount_cents)::numeric / GREATEST(COUNT(DISTINCT date_trunc('month', e.date)),1))::int AS avg_monthly
    FROM public.expenses e JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.org_id = _org AND ec.kind='transport' AND e.date < _start
      AND e.status IN ('submitted', 'approved', 'paid')
    GROUP BY e.user_id
  ),
  per_person AS (
    SELECT p.id AS user_id, p.full_name,
      COALESCE((SELECT SUM(ce.amount_cents) FROM cycle_exp ce WHERE ce.user_id = p.id AND ce.kind='food'),0) AS food_realized_cents,
      COALESCE((SELECT SUM(ce.amount_cents) FROM cycle_exp ce WHERE ce.user_id = p.id AND ce.kind='transport'),0) AS transport_realized_cents,
      COALESCE((SELECT SUM(ce.amount_cents) FROM cycle_exp ce WHERE ce.user_id = p.id),0) AS realized_cents,
      COALESCE((SELECT SUM(oe.amount_cents) FROM open_exp oe WHERE oe.user_id = p.id AND oe.status='approved'),0) AS a_pagar_cents,
      COALESCE((SELECT SUM(oe.amount_cents) FROM open_exp oe WHERE oe.user_id = p.id AND oe.status='submitted'),0) AS aguardando_aprovacao_cents,
      (SELECT COUNT(*) FROM public.expenses e WHERE e.user_id = p.id AND e.org_id = _org AND e.status='rejected' AND e.date BETWEEN _start AND _end) AS recusados,
      (SELECT COUNT(*) FROM cycle_exp ce WHERE ce.user_id = p.id AND ce.is_out_of_policy) AS excecoes,
      COALESCE(th.avg_monthly,0) AS transport_projected_cents,
      (_bdays * _food_limit) AS food_projected_cents
    FROM public.profiles p
    LEFT JOIN transport_hist th ON th.user_id = p.id
    WHERE p.org_id = _org
  ),
  per_sector AS (
    SELECT COALESCE(ce.sector,'Geral') AS sector,
      COALESCE(SUM(ce.amount_cents),0) AS total_cents,
      COALESCE(SUM(ce.amount_cents) FILTER (WHERE ce.kind='food'),0) AS food_cents,
      COALESCE(SUM(ce.amount_cents) FILTER (WHERE ce.kind='transport'),0) AS transport_cents
    FROM cycle_exp ce GROUP BY COALESCE(ce.sector,'Geral')
  )
  SELECT json_build_object(
    'cycle', json_build_object('cycle_key',_cycle,'start',_start,'end',_end,'business_days',_bdays),
    'org', json_build_object('colaboradores',_colabs,'food_daily_limit_cents',_food_limit,
      'food_budget_cents',_bdays*_food_limit*_colabs,
      'food_realized_cents',(SELECT COALESCE(SUM(food_realized_cents),0) FROM per_person),
      'transport_realized_cents',(SELECT COALESCE(SUM(transport_realized_cents),0) FROM per_person),
      'realized_cents',(SELECT COALESCE(SUM(realized_cents),0) FROM per_person),
      'total_a_pagar_cents',(SELECT COALESCE(SUM(a_pagar_cents),0) FROM per_person),
      'aguardando_aprovacao_cents',(SELECT COALESCE(SUM(aguardando_aprovacao_cents),0) FROM per_person)),
    'por_pessoa',(SELECT COALESCE(json_agg(to_jsonb(pp) ORDER BY pp.a_pagar_cents DESC, pp.aguardando_aprovacao_cents DESC),'[]'::json) FROM per_person pp),
    'por_setor',(SELECT COALESCE(json_agg(to_jsonb(ps) ORDER BY ps.total_cents DESC),'[]'::json) FROM per_sector ps)
  ) INTO _result;
  RETURN _result;
END;
$function$;
