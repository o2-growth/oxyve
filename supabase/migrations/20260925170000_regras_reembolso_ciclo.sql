-- Regras de reembolso e de ciclo definidas pelo Andrey em 2026-09-25.
--
-- 1. Alimentação: reembolso limitado, nunca bloqueado. Teto diário (política,
--    hoje R$ 30) por nota de um dia; nota que cobre vários dias (marmitas do mês)
--    vale até dias × teto; e o mês inteiro não passa de dias úteis do ciclo × teto.
--    Almoço de R$ 60 com teto de R$ 30 → reembolsa R$ 30. Evento/viagem fica fora
--    do teto e vai marcado para o aprovador. O valor lançado continua sendo o da
--    nota (amount_cents); o que se paga é reimbursable_cents.
-- 2. Data: só até 20 dias atrás, nunca futura.
-- 3. Despesa de ciclo já enviado: não é mais recusada. Entra avulsa, com
--    late_decision = 'pending', e os admins são notificados para decidir se ela
--    entra no relatório deste mês ou vai para o do mês seguinte.
-- 4. Reprovação é total e devolve o relatório: todos os itens voltam a rascunho,
--    o relatório volta a 'draft' com o motivo em last_rejection_comment, e o
--    autor corrige e reenvia.
-- 5. Totais da Gestão pagam e somam pelo valor reembolsável; "realizado" passa a
--    ser só aprovado + pago.

-- ------------------------------------------------------------------ colunas
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS reimbursable_cents integer,
  ADD COLUMN IF NOT EXISTS food_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS late_decision text;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_food_days_check CHECK (food_days BETWEEN 1 AND 31),
  ADD CONSTRAINT expenses_late_decision_check CHECK (late_decision IN ('pending', 'this_month', 'next_month')),
  ADD CONSTRAINT expenses_reimbursable_check CHECK (reimbursable_cents IS NULL OR (reimbursable_cents >= 0 AND reimbursable_cents <= amount_cents));

UPDATE public.expenses SET reimbursable_cents = amount_cents WHERE reimbursable_cents IS NULL;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS last_rejection_comment text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- ------------------------------------------------------------------ ciclo
-- Mesma conta de get_or_create_report_for_date: o ciclo começa no dia de corte.
CREATE OR REPLACE FUNCTION public.cycle_bounds(p_org uuid, p_date date, OUT cycle_start date, OUT cycle_end date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cutoff int;
BEGIN
  SELECT cycle_cutoff_day INTO _cutoff FROM public.expense_policies WHERE org_id = p_org;
  _cutoff := COALESCE(_cutoff, 24);
  IF EXTRACT(DAY FROM p_date) >= _cutoff THEN
    cycle_start := date_trunc('month', p_date)::date + (_cutoff - 1);
  ELSE
    cycle_start := date_trunc('month', p_date - interval '1 month')::date + (_cutoff - 1);
  END IF;
  cycle_end := (cycle_start + interval '1 month')::date - 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.business_days(p_start date, p_end date)
RETURNS int LANGUAGE sql IMMUTABLE
AS $$ SELECT count(*)::int FROM generate_series(p_start, p_end, interval '1 day') d WHERE EXTRACT(isodow FROM d) < 6 $$;

-- ------------------------------------------------------------------ trigger
CREATE OR REPLACE FUNCTION public.tg_expenses_regras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _kind text; _limit int; _start date; _end date;
  _month_used bigint; _day_used bigint; _cap bigint;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.date IS DISTINCT FROM OLD.date THEN
    IF NEW.date > _today THEN
      RAISE EXCEPTION 'A data da despesa não pode ser futura.';
    END IF;
    IF NEW.date < _today - 20 THEN
      RAISE EXCEPTION 'Só é possível lançar despesas de até 20 dias atrás (a partir de %).', to_char(_today - 20, 'DD/MM/YYYY');
    END IF;
  END IF;

  -- Recalcula só quando muda o que entra na conta. Troca de status (enviar,
  -- aprovar, pagar) não mexe no valor já calculado.
  IF TG_OP = 'UPDATE'
     AND NEW.amount_cents IS NOT DISTINCT FROM OLD.amount_cents
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.food_days IS NOT DISTINCT FROM OLD.food_days
     AND NEW.is_event IS NOT DISTINCT FROM OLD.is_event
     AND NEW.reimbursable_cents IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.reimbursable_cents := NEW.amount_cents;
  SELECT kind INTO _kind FROM public.expense_categories WHERE id = NEW.category_id;

  IF _kind IS DISTINCT FROM 'food' THEN
    NEW.is_out_of_policy := NEW.is_event;
    RETURN NEW;
  END IF;
  IF NEW.is_event THEN
    -- Evento/viagem: fora do teto, mas sinalizado para o aprovador conferir.
    NEW.is_out_of_policy := true;
    RETURN NEW;
  END IF;

  SELECT food_daily_limit_cents INTO _limit FROM public.expense_policies WHERE org_id = NEW.org_id;
  IF _limit IS NULL OR _limit <= 0 THEN
    NEW.is_out_of_policy := false;
    RETURN NEW;
  END IF;

  SELECT cb.cycle_start, cb.cycle_end INTO _start, _end FROM public.cycle_bounds(NEW.org_id, NEW.date) cb;

  SELECT COALESCE(SUM(COALESCE(e.reimbursable_cents, e.amount_cents)), 0) INTO _month_used
    FROM public.expenses e JOIN public.expense_categories ec ON ec.id = e.category_id
   WHERE e.user_id = NEW.user_id AND ec.kind = 'food' AND NOT e.is_event
     AND e.date BETWEEN _start AND _end AND e.status <> 'rejected' AND e.id <> NEW.id;

  IF NEW.food_days > 1 THEN
    _cap := NEW.food_days::bigint * _limit;
  ELSE
    SELECT COALESCE(SUM(COALESCE(e.reimbursable_cents, e.amount_cents)), 0) INTO _day_used
      FROM public.expenses e JOIN public.expense_categories ec ON ec.id = e.category_id
     WHERE e.user_id = NEW.user_id AND ec.kind = 'food' AND NOT e.is_event AND e.food_days = 1
       AND e.date = NEW.date AND e.status <> 'rejected' AND e.id <> NEW.id;
    _cap := GREATEST(_limit - _day_used, 0);
  END IF;

  _cap := LEAST(_cap, GREATEST(public.business_days(_start, _end)::bigint * _limit - _month_used, 0));
  NEW.reimbursable_cents := LEAST(NEW.amount_cents::bigint, _cap)::int;
  NEW.is_out_of_policy := NEW.reimbursable_cents < NEW.amount_cents;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS expenses_regras ON public.expenses;
CREATE TRIGGER expenses_regras BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_expenses_regras();

-- ------------------------------------------------------------------ criação
DROP FUNCTION IF EXISTS public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric);

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
               to_char(p_amount_cents / 100.0, 'FM999G999G990D00'), _report->>'title'),
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

-- ------------------------------------------------------------------ decisão da avulsa
CREATE OR REPLACE FUNCTION public.decide_late_expense(p_expense_id uuid, p_destino text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _org uuid; _e record; _r record; _next_date date; _title text;
  _cstart date; _cend date; _key text;
BEGIN
  IF _uid IS NULL OR NOT public.is_manager_or_admin(_uid) THEN
    RAISE EXCEPTION 'Apenas gestores decidem despesas fora do prazo.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  SELECT * INTO _e FROM public.expenses WHERE id = p_expense_id AND org_id = _org AND late_decision = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada ou já decidida.'; END IF;

  IF p_destino = 'this_month' THEN
    SELECT cb.cycle_start INTO _cstart FROM public.cycle_bounds(_org, _e.date) cb;
    SELECT * INTO _r FROM public.reports
     WHERE org_id = _org AND user_id = _e.user_id AND start_date = _cstart;
    IF NOT FOUND OR _r.status = 'paid' THEN
      RAISE EXCEPTION 'O relatório deste mês já foi pago — passe a despesa para o mês seguinte.';
    END IF;
    INSERT INTO public.report_items (report_id, expense_id) VALUES (_r.id, _e.id);
    -- Entra no estado do relatório: enviado segue para a aprovação; aprovado já
    -- sai aprovado, porque decidir "neste mês" é o gestor aprovando.
    UPDATE public.expenses SET late_decision = 'this_month',
      status = CASE _r.status WHEN 'approved' THEN 'approved'::expense_status
                              WHEN 'submitted' THEN 'submitted'::expense_status
                              ELSE 'draft'::expense_status END
     WHERE id = _e.id;
  ELSIF p_destino = 'next_month' THEN
    SELECT cb.cycle_end + 1 INTO _next_date FROM public.cycle_bounds(_org, _e.date) cb;
    SELECT cb.cycle_start, cb.cycle_end INTO _cstart, _cend FROM public.cycle_bounds(_org, _next_date) cb;
    _key := to_char(_cend + 1, 'YYYY-MM');
    SELECT * INTO _r FROM public.reports WHERE org_id = _org AND user_id = _e.user_id AND cycle_key = _key;
    IF NOT FOUND THEN
      _title := 'Relatório ' || (ARRAY['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[EXTRACT(MONTH FROM _cend + 1)::int]
                || ' ' || EXTRACT(YEAR FROM _cend + 1);
      INSERT INTO public.reports (org_id, user_id, title, start_date, end_date, due_date, cycle_key, status)
      VALUES (_org, _e.user_id, _title, _cstart, _cend, _cend + 1, _key, 'draft') RETURNING * INTO _r;
    ELSIF _r.status <> 'draft' THEN
      RAISE EXCEPTION 'O relatório do mês seguinte já foi enviado.';
    END IF;
    INSERT INTO public.report_items (report_id, expense_id) VALUES (_r.id, _e.id);
    UPDATE public.expenses SET late_decision = 'next_month' WHERE id = _e.id;
  ELSE
    RAISE EXCEPTION 'Destino inválido: use this_month ou next_month.';
  END IF;

  PERFORM public.create_notification(
    _e.user_id, 'my_expenses', 'Despesa fora do prazo decidida',
    format('"%s" entrou no %s.', _e.description, _r.title), format('/app/reports/%s', _r.id));
  RETURN json_build_object('report_id', _r.id, 'report_title', _r.title, 'destino', p_destino);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.decide_late_expense(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_late_expense(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cycle_bounds(uuid, date) FROM PUBLIC, anon;

-- ------------------------------------------------------------------ reprovação devolve
CREATE OR REPLACE FUNCTION public.admin_decide_report(p_report_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user_id uuid := auth.uid(); _org_id uuid; _report record;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  IF NOT is_manager_or_admin(_user_id) THEN
    RAISE EXCEPTION 'Apenas gestores podem aprovar/reprovar relatórios';
  END IF;
  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;
  SELECT * INTO _report FROM public.reports WHERE id = p_report_id AND org_id = _org_id AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Relatório não encontrado ou não pode ser processado'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida. Use approved ou rejected';
  END IF;
  IF p_decision = 'rejected' AND (p_comment IS NULL OR btrim(p_comment) = '') THEN
    RAISE EXCEPTION 'Comentário obrigatório para reprovação';
  END IF;

  INSERT INTO public.report_approvals (report_id, approver_id, decision, comment)
  VALUES (p_report_id, _user_id, p_decision::approval_decision, p_comment);

  IF p_decision = 'approved' THEN
    UPDATE public.reports SET status = 'approved', updated_at = now() WHERE id = p_report_id RETURNING * INTO _report;
    UPDATE public.expenses e SET status = 'approved', updated_at = now()
      FROM public.report_items ri
     WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status = 'submitted';
  ELSE
    -- Reprovação é total. Passa por 'rejected' para o gatilho de auditoria registrar
    -- o evento e notificar o autor, e devolve como rascunho para correção e reenvio.
    UPDATE public.reports SET status = 'rejected', updated_at = now() WHERE id = p_report_id;
    UPDATE public.reports
       SET status = 'draft', last_rejection_comment = p_comment, returned_at = now(),
           submitted_at = NULL, submitted_late = false, updated_at = now()
     WHERE id = p_report_id RETURNING * INTO _report;
    UPDATE public.expenses e SET status = 'draft', updated_at = now()
      FROM public.report_items ri
     WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status IN ('submitted', 'approved');
  END IF;

  RETURN json_build_object('report', row_to_json(_report), 'decision', p_decision);
END;
$function$;

-- Texto da notificação de reprovação agora diz que voltou para correção.
CREATE OR REPLACE FUNCTION public.submit_report(p_report_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user_id uuid := auth.uid(); _org_id uuid; _tz text; _today date; _report record; _is_late boolean;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'User not authenticated'; END IF;
  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;
  SELECT timezone INTO _tz FROM public.expense_policies WHERE org_id = _org_id;
  _today := (now() AT TIME ZONE COALESCE(_tz, 'America/Sao_Paulo'))::date;
  SELECT * INTO _report FROM public.reports WHERE id = p_report_id AND user_id = _user_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Relatório não encontrado ou não pode ser enviado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.report_items WHERE report_id = p_report_id) THEN
    RAISE EXCEPTION 'O relatório está vazio — adicione despesas antes de enviar.';
  END IF;
  _is_late := _today > _report.due_date;
  UPDATE public.reports
     SET status = 'submitted', submitted_at = now(), submitted_late = _is_late,
         last_rejection_comment = NULL, updated_at = now()
   WHERE id = p_report_id RETURNING * INTO _report;
  UPDATE public.expenses e SET status = 'submitted', updated_at = now()
    FROM public.report_items ri
   WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status = 'draft';
  RETURN json_build_object('report', row_to_json(_report), 'submitted_late', _is_late);
END;
$function$;

-- ------------------------------------------------------------------ Gestão
CREATE OR REPLACE FUNCTION public.get_admin_financial_overview()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid; _org uuid; _food_limit int; _today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _start date; _end date; _cycle text; _bdays int; _colabs int; _result json;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.is_manager_or_admin(_uid) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  SELECT food_daily_limit_cents INTO _food_limit FROM public.expense_policies WHERE org_id = _org;
  _food_limit := COALESCE(_food_limit, 3000);
  SELECT cb.cycle_start, cb.cycle_end INTO _start, _end FROM public.cycle_bounds(_org, _today) cb;
  _cycle := to_char(_end + 1, 'YYYY-MM');
  _bdays := public.business_days(_start, _end);
  SELECT count(*) INTO _colabs FROM public.profiles WHERE org_id = _org;

  WITH exp AS (
    SELECT e.id, e.user_id, e.date, e.status, e.is_out_of_policy,
           COALESCE(e.reimbursable_cents, e.amount_cents) AS reemb, ec.kind, ec.sector
      FROM public.expenses e LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
     WHERE e.org_id = _org
  ),
  cycle_done AS (SELECT * FROM exp WHERE date BETWEEN _start AND _end AND status IN ('approved', 'paid')),
  transport_hist AS (
    SELECT user_id, (SUM(reemb)::numeric / GREATEST(COUNT(DISTINCT date_trunc('month', date)), 1))::int AS avg_monthly
      FROM exp WHERE kind = 'transport' AND date < _start AND status IN ('approved', 'paid') GROUP BY user_id
  ),
  per_person AS (
    SELECT p.id AS user_id, p.full_name, u.email,
      COALESCE((SELECT SUM(c.reemb) FROM cycle_done c WHERE c.user_id = p.id AND c.kind = 'food'), 0) AS food_realized_cents,
      COALESCE((SELECT SUM(c.reemb) FROM cycle_done c WHERE c.user_id = p.id AND c.kind = 'transport'), 0) AS transport_realized_cents,
      COALESCE((SELECT SUM(c.reemb) FROM cycle_done c WHERE c.user_id = p.id), 0) AS realized_cents,
      COALESCE((SELECT SUM(x.reemb) FROM exp x WHERE x.user_id = p.id AND x.status = 'approved'), 0) AS a_pagar_cents,
      COALESCE((SELECT SUM(x.reemb) FROM exp x WHERE x.user_id = p.id AND x.status = 'submitted'), 0) AS aguardando_aprovacao_cents,
      (SELECT COUNT(*) FROM exp x WHERE x.user_id = p.id AND x.status = 'rejected' AND x.date BETWEEN _start AND _end) AS recusados,
      (SELECT COUNT(*) FROM exp x WHERE x.user_id = p.id AND x.is_out_of_policy AND x.date BETWEEN _start AND _end AND x.status <> 'rejected') AS excecoes,
      COALESCE(th.avg_monthly, 0) AS transport_projected_cents,
      (_bdays * _food_limit) AS food_projected_cents
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN transport_hist th ON th.user_id = p.id
    WHERE p.org_id = _org
  ),
  per_sector AS (
    SELECT COALESCE(c.sector, 'Geral') AS sector, SUM(c.reemb) AS total_cents,
           COALESCE(SUM(c.reemb) FILTER (WHERE c.kind = 'food'), 0) AS food_cents,
           COALESCE(SUM(c.reemb) FILTER (WHERE c.kind = 'transport'), 0) AS transport_cents
      FROM cycle_done c GROUP BY COALESCE(c.sector, 'Geral')
  ),
  fora_do_prazo AS (
    SELECT e.id AS expense_id, e.user_id, p.full_name, e.description, e.date, e.amount_cents,
           COALESCE(e.reimbursable_cents, e.amount_cents) AS reimbursable_cents, e.created_at,
           r.title AS report_title, r.status::text AS report_status
      FROM public.expenses e
      JOIN public.profiles p ON p.id = e.user_id
      LEFT JOIN public.reports r ON r.org_id = e.org_id AND r.user_id = e.user_id
        AND r.start_date = (SELECT cb.cycle_start FROM public.cycle_bounds(_org, e.date) cb)
     WHERE e.org_id = _org AND e.late_decision = 'pending'
  )
  SELECT json_build_object(
    'cycle', json_build_object('cycle_key', _cycle, 'start', _start, 'end', _end, 'business_days', _bdays),
    'org', json_build_object('colaboradores', _colabs, 'food_daily_limit_cents', _food_limit,
      'food_budget_cents', _bdays * _food_limit * _colabs,
      'food_realized_cents', (SELECT COALESCE(SUM(food_realized_cents), 0) FROM per_person),
      'transport_realized_cents', (SELECT COALESCE(SUM(transport_realized_cents), 0) FROM per_person),
      'realized_cents', (SELECT COALESCE(SUM(realized_cents), 0) FROM per_person),
      'total_a_pagar_cents', (SELECT COALESCE(SUM(a_pagar_cents), 0) FROM per_person),
      'aguardando_aprovacao_cents', (SELECT COALESCE(SUM(aguardando_aprovacao_cents), 0) FROM per_person)),
    'por_pessoa', (SELECT COALESCE(json_agg(to_jsonb(pp) ORDER BY pp.a_pagar_cents DESC, pp.aguardando_aprovacao_cents DESC, pp.full_name), '[]'::json) FROM per_person pp),
    'por_setor', (SELECT COALESCE(json_agg(to_jsonb(ps) ORDER BY ps.total_cents DESC), '[]'::json) FROM per_sector ps),
    'fora_do_prazo', (SELECT COALESCE(json_agg(to_jsonb(f) ORDER BY f.created_at), '[]'::json) FROM fora_do_prazo f)
  ) INTO _result;
  RETURN _result;
END;
$function$;

-- Pagamento em lote paga o valor reembolsável; o botão e os totais já leem dele.
NOTIFY pgrst, 'reload schema';
