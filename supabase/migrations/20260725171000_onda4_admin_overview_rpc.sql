-- Onda 4 — RPC de visão financeira do painel admin.
-- Só admin/manager (is_manager_or_admin). Retorna, para o ciclo atual (25→24):
--  - cycle: janela e dias úteis
--  - org: colaboradores, orçamento de alimentação (dias úteis × teto × pessoas),
--    realizado (food/transport) e total a pagar (enviadas + aprovadas)
--  - por_pessoa: realizado e projetado (alimentação = dias úteis × teto;
--    transporte = média mensal histórica), a pagar, contagem de recusados/exceções
--  - por_setor: total/food/transport agregados pelo setor da categoria
-- Projeção de transporte é fraca enquanto houver pouco histórico — melhora com o uso.

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
  ),
  transport_hist AS (
    SELECT e.user_id, (SUM(e.amount_cents)::numeric / GREATEST(COUNT(DISTINCT date_trunc('month', e.date)),1))::int AS avg_monthly
    FROM public.expenses e JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.org_id = _org AND ec.kind='transport' AND e.date < _start GROUP BY e.user_id
  ),
  per_person AS (
    SELECT p.id AS user_id, p.full_name,
      COALESCE(SUM(ce.amount_cents) FILTER (WHERE ce.kind='food'),0) AS food_realized_cents,
      COALESCE(SUM(ce.amount_cents) FILTER (WHERE ce.kind='transport'),0) AS transport_realized_cents,
      COALESCE(SUM(ce.amount_cents) FILTER (WHERE ce.status IN ('submitted','approved')),0) AS a_pagar_cents,
      COUNT(ce.id) FILTER (WHERE ce.status='rejected') AS recusados,
      COUNT(ce.id) FILTER (WHERE ce.is_out_of_policy) AS excecoes,
      COALESCE(th.avg_monthly,0) AS transport_projected_cents,
      (_bdays * _food_limit) AS food_projected_cents
    FROM public.profiles p
    LEFT JOIN cycle_exp ce ON ce.user_id = p.id
    LEFT JOIN transport_hist th ON th.user_id = p.id
    WHERE p.org_id = _org GROUP BY p.id, p.full_name, th.avg_monthly
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
      'total_a_pagar_cents',(SELECT COALESCE(SUM(a_pagar_cents),0) FROM per_person)),
    'por_pessoa',(SELECT COALESCE(json_agg(to_jsonb(pp) ORDER BY pp.a_pagar_cents DESC),'[]'::json) FROM per_person pp),
    'por_setor',(SELECT COALESCE(json_agg(to_jsonb(ps) ORDER BY ps.total_cents DESC),'[]'::json) FROM per_sector ps)
  ) INTO _result;
  RETURN _result;
END;
$function$;
