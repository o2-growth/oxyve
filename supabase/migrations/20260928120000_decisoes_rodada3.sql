-- Decisões do Andrey (2026-09-28) sobre a rodada 3 do gauntlet:
-- 1. Realizado (Gestão) = enviado + aprovado + pago no ciclo; a pagar = aprovado; sempre
--    pelo valor reembolsável.
-- 2. Refeição limitada pelo teto é uso normal da política: sai de is_out_of_policy (que
--    fica só para evento). A interface deriva "Limitado ao teto" de reimbursable < amount.
-- 3. Duplicidade é bloqueada: mesmo comprovante (receipt_hash, SHA-256 calculado no
--    navegador) ou mesma data + valor + categoria.
-- 5. Admin vê as despesas da empresa com o dono: FK expenses.user_id → profiles para o
--    embed `owner:profiles!user_id(full_name)`.
-- E correções: 409 na criação concorrente do relatório do ciclo; revisões por item
-- apagadas quando o relatório é devolvido; descrição com no máximo 200 caracteres.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_hash text;
CREATE INDEX IF NOT EXISTS expenses_user_receipt_hash_idx ON public.expenses (user_id, receipt_hash) WHERE receipt_hash IS NOT NULL;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_description_len CHECK (char_length(description) BETWEEN 1 AND 200);
UPDATE public.expenses SET is_out_of_policy = is_event WHERE is_out_of_policy AND NOT is_event;

DROP FUNCTION IF EXISTS public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric, integer);

CREATE OR REPLACE FUNCTION public.get_or_create_report_for_date(p_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _policy RECORD;
  _cycle_start DATE;
  _cycle_end DATE;
  _due_date DATE;
  _cycle_key TEXT;
  _report RECORD;
  _report_title TEXT;
BEGIN
  -- Get current user and org
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  -- Get policy settings
  SELECT cycle_cutoff_day, timezone INTO _policy
  FROM public.expense_policies
  WHERE org_id = _org_id;

  IF NOT FOUND THEN
    INSERT INTO public.expense_policies (org_id) VALUES (_org_id);
    _policy.cycle_cutoff_day := 24;
    _policy.timezone := 'America/Sao_Paulo';
  END IF;

  -- Calculate cycle dates based on provided date
  -- If day(p_date) >= cutoff: cycle starts on cutoff day of same month
  -- If day(p_date) < cutoff: cycle starts on cutoff day of previous month
  IF EXTRACT(DAY FROM p_date) >= _policy.cycle_cutoff_day THEN
    _cycle_start := date_trunc('month', p_date)::DATE + (_policy.cycle_cutoff_day - 1);
  ELSE
    _cycle_start := date_trunc('month', p_date - interval '1 month')::DATE + (_policy.cycle_cutoff_day - 1);
  END IF;

  -- Cycle ends on day before cutoff of next month (day 23)
  _cycle_end := (_cycle_start + interval '1 month')::DATE - 1;
  
  -- Due date is the cutoff day (day 24)
  _due_date := _cycle_end + 1;
  
  -- Cycle key is YYYY-MM of the due date
  _cycle_key := to_char(_due_date, 'YYYY-MM');

  -- Try to find existing report for this cycle
  SELECT * INTO _report
  FROM public.reports
  WHERE org_id = _org_id
    AND user_id = _user_id
    AND cycle_key = _cycle_key;

  IF NOT FOUND THEN
    -- Create report title like "Relatório Mar 2026"
    _report_title := 'Relatório ' || 
      CASE EXTRACT(MONTH FROM _due_date)
        WHEN 1 THEN 'Jan'
        WHEN 2 THEN 'Fev'
        WHEN 3 THEN 'Mar'
        WHEN 4 THEN 'Abr'
        WHEN 5 THEN 'Mai'
        WHEN 6 THEN 'Jun'
        WHEN 7 THEN 'Jul'
        WHEN 8 THEN 'Ago'
        WHEN 9 THEN 'Set'
        WHEN 10 THEN 'Out'
        WHEN 11 THEN 'Nov'
        WHEN 12 THEN 'Dez'
      END || ' ' || EXTRACT(YEAR FROM _due_date);

    -- Duas abas (ou captura + form) criando o relatório do mesmo ciclo ao mesmo
    -- tempo batiam no índice único e uma delas levava 409.
    INSERT INTO public.reports (org_id, user_id, title, start_date, end_date, due_date, cycle_key, status)
    VALUES (_org_id, _user_id, _report_title, _cycle_start, _cycle_end, _due_date, _cycle_key, 'draft')
    ON CONFLICT (org_id, user_id, cycle_key) WHERE cycle_key IS NOT NULL DO NOTHING;
    SELECT * INTO _report FROM public.reports
     WHERE org_id = _org_id AND user_id = _user_id AND cycle_key = _cycle_key;
  END IF;

  RETURN json_build_object(
    'id', _report.id,
    'title', _report.title,
    'start_date', _report.start_date,
    'end_date', _report.end_date,
    'due_date', _report.due_date,
    'cycle_key', _report.cycle_key,
    'status', _report.status,
    'submitted_at', _report.submitted_at,
    'submitted_late', _report.submitted_late,
    'created_at', _report.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_expenses_regras()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Duplicidade (bloqueia): mesmo comprovante, ou mesma data + valor + categoria.
  -- Também segura o duplo clique, que chegava a criar três lançamentos iguais.
  IF NEW.receipt_hash IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash) THEN
    PERFORM 1 FROM public.expenses e
     WHERE e.user_id = NEW.user_id AND e.receipt_hash = NEW.receipt_hash
       AND e.status <> 'rejected' AND e.id <> NEW.id;
    IF FOUND THEN
      RAISE EXCEPTION 'Este comprovante já foi lançado em outra despesa. Se for outra nota, fotografe a nota correta.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.date IS DISTINCT FROM OLD.date OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    PERFORM 1 FROM public.expenses e
     WHERE e.user_id = NEW.user_id AND e.date = NEW.date AND e.amount_cents = NEW.amount_cents
       AND e.category_id IS NOT DISTINCT FROM NEW.category_id
       AND e.status <> 'rejected' AND e.id <> NEW.id;
    IF FOUND THEN
      RAISE EXCEPTION 'Já existe uma despesa de R$ % em % nesta categoria. Lançamento duplicado bloqueado.',
        public.brl(NEW.amount_cents), to_char(NEW.date, 'DD/MM/YYYY');
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
  -- Teto aplicado é uso normal da política, não exceção: o app mostra "Limitado ao
  -- teto" a partir de reimbursable_cents < amount_cents. Exceção é só evento.
  NEW.is_out_of_policy := false;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(p_description text, p_amount_cents integer, p_date date, p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'personal_card'::text, p_currency text DEFAULT 'BRL'::text, p_is_reimbursable boolean DEFAULT true, p_notes text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text, p_is_event boolean DEFAULT false, p_distance_km numeric DEFAULT NULL::numeric, p_food_days integer DEFAULT 1, p_receipt_hash text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    food_days, status, late_decision, receipt_hash)
  VALUES (
    _org_id, _user_id, p_description, p_amount_cents, p_date, p_category_id, p_cost_center_id, p_project_id,
    p_payment_method::payment_method, p_currency, p_is_reimbursable, p_notes, p_receipt_path, p_is_event, p_distance_km,
    GREATEST(COALESCE(p_food_days, 1), 1), 'draft', CASE WHEN _late THEN 'pending' END, p_receipt_hash)
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

CREATE OR REPLACE FUNCTION public.admin_decide_report(p_report_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    -- Revisões por item eram da rodada anterior; no reenvio o aprovador revisa de novo.
    DELETE FROM public.expense_reviews WHERE report_id = p_report_id;
    UPDATE public.expenses e SET status = 'draft', updated_at = now()
      FROM public.report_items ri
     WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status IN ('submitted', 'approved');
  END IF;

  RETURN json_build_object('report', row_to_json(_report), 'decision', p_decision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_financial_overview()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  cycle_done AS (SELECT * FROM exp WHERE date BETWEEN _start AND _end AND status IN ('submitted', 'approved', 'paid')),
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

REVOKE EXECUTE ON FUNCTION public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_in_current_report(text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text, boolean, numeric, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
