-- Refino 05: Add submission tracking and improve RPC functions

-- 1. Add submission tracking columns to reports
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS submitted_late BOOLEAN DEFAULT false;

-- 2. Create RPC function to get or create report for a specific date
CREATE OR REPLACE FUNCTION public.get_or_create_report_for_date(p_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    INSERT INTO public.reports (org_id, user_id, title, start_date, end_date, due_date, cycle_key, status)
    VALUES (_org_id, _user_id, _report_title, _cycle_start, _cycle_end, _due_date, _cycle_key, 'draft')
    RETURNING * INTO _report;
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
$$;

-- 3. Create RPC function to get dashboard context
CREATE OR REPLACE FUNCTION public.get_dashboard_context()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _policy RECORD;
  _today DATE;
  _current_report JSON;
  _pending_due_report RECORD;
  _pending_json JSON;
  _days_until_due INTEGER;
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
  SELECT timezone INTO _policy
  FROM public.expense_policies
  WHERE org_id = _org_id;

  IF NOT FOUND THEN
    _policy.timezone := 'America/Sao_Paulo';
  END IF;

  -- Get today in org timezone
  _today := (now() AT TIME ZONE _policy.timezone)::DATE;

  -- Get current report (for today's date)
  _current_report := public.get_or_create_report_for_date(_today);

  -- Calculate days until due
  _days_until_due := (_current_report->>'due_date')::DATE - _today;

  -- Check for pending due report (draft report with due_date <= today, different from current)
  SELECT * INTO _pending_due_report
  FROM public.reports
  WHERE org_id = _org_id
    AND user_id = _user_id
    AND status = 'draft'
    AND due_date <= _today
    AND id != (_current_report->>'id')::UUID
  ORDER BY due_date ASC
  LIMIT 1;

  IF FOUND THEN
    _pending_json := json_build_object(
      'id', _pending_due_report.id,
      'title', _pending_due_report.title,
      'start_date', _pending_due_report.start_date,
      'end_date', _pending_due_report.end_date,
      'due_date', _pending_due_report.due_date,
      'cycle_key', _pending_due_report.cycle_key,
      'status', _pending_due_report.status,
      'days_overdue', _today - _pending_due_report.due_date
    );
  ELSE
    _pending_json := NULL;
  END IF;

  RETURN json_build_object(
    'current_report', _current_report,
    'pending_due_report', _pending_json,
    'days_until_due', _days_until_due,
    'today', _today
  );
END;
$$;

-- 4. Update the create_expense_in_current_report to use get_or_create_report_for_date
CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(
  p_description text, 
  p_amount_cents integer, 
  p_date date, 
  p_category_id uuid DEFAULT NULL, 
  p_cost_center_id uuid DEFAULT NULL, 
  p_project_id uuid DEFAULT NULL, 
  p_payment_method text DEFAULT 'personal_card', 
  p_currency text DEFAULT 'BRL', 
  p_is_reimbursable boolean DEFAULT true, 
  p_notes text DEFAULT NULL, 
  p_receipt_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report JSON;
  _report_id UUID;
  _expense_id UUID;
  _policy RECORD;
  _category RECORD;
  _daily_total INTEGER;
  _is_out_of_policy BOOLEAN := false;
  _expense RECORD;
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

  -- Get or create report for the expense date
  _report := public.get_or_create_report_for_date(p_date);
  _report_id := (_report->>'id')::UUID;

  -- Validate expense date is within report period
  IF p_date < (_report->>'start_date')::DATE OR p_date > (_report->>'end_date')::DATE THEN
    RAISE EXCEPTION 'Data da despesa deve estar dentro do período do relatório (% a %)', 
      _report->>'start_date', _report->>'end_date';
  END IF;

  -- Get policy for limit enforcement
  SELECT enforce_limits_mode INTO _policy
  FROM public.expense_policies
  WHERE org_id = _org_id;

  -- Check category daily limit if applicable
  IF p_category_id IS NOT NULL THEN
    SELECT * INTO _category
    FROM public.expense_categories
    WHERE id = p_category_id AND org_id = _org_id;

    IF _category.daily_limit_cents IS NOT NULL THEN
      -- Calculate daily total for this category (excluding current expense)
      SELECT COALESCE(SUM(e.amount_cents), 0) INTO _daily_total
      FROM public.expenses e
      INNER JOIN public.report_items ri ON ri.expense_id = e.id
      INNER JOIN public.reports r ON r.id = ri.report_id
      WHERE e.user_id = _user_id
        AND e.date = p_date
        AND e.category_id = p_category_id
        AND r.cycle_key = _report->>'cycle_key';

      IF (_daily_total + p_amount_cents) > _category.daily_limit_cents THEN
        IF _policy.enforce_limits_mode = 'block' THEN
          RAISE EXCEPTION 'Limite diário de % excedido para esta categoria. Total do dia: %, Limite: %',
            _category.name,
            ((_daily_total + p_amount_cents) / 100.0)::NUMERIC(10,2),
            (_category.daily_limit_cents / 100.0)::NUMERIC(10,2);
        ELSE
          -- Warn mode: mark as out of policy
          _is_out_of_policy := true;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Create expense
  INSERT INTO public.expenses (
    org_id, user_id, description, amount_cents, date, category_id,
    cost_center_id, project_id, payment_method, currency, is_reimbursable,
    notes, receipt_path, is_out_of_policy, status
  )
  VALUES (
    _org_id, _user_id, p_description, p_amount_cents, p_date, p_category_id,
    p_cost_center_id, p_project_id, p_payment_method::payment_method, p_currency, p_is_reimbursable,
    p_notes, p_receipt_path, _is_out_of_policy, 'draft'
  )
  RETURNING id INTO _expense_id;

  -- Link expense to report
  INSERT INTO public.report_items (report_id, expense_id)
  VALUES (_report_id, _expense_id);

  -- Get full expense record
  SELECT * INTO _expense FROM public.expenses WHERE id = _expense_id;

  RETURN json_build_object(
    'expense', row_to_json(_expense),
    'report', _report,
    'is_out_of_policy', _is_out_of_policy
  );
END;
$$;

-- 5. Create RPC function to submit a report
CREATE OR REPLACE FUNCTION public.submit_report(p_report_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _policy RECORD;
  _today DATE;
  _report RECORD;
  _is_late BOOLEAN;
BEGIN
  -- Get current user and org
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;

  -- Get policy for timezone
  SELECT timezone INTO _policy
  FROM public.expense_policies
  WHERE org_id = _org_id;

  IF NOT FOUND THEN
    _policy.timezone := 'America/Sao_Paulo';
  END IF;

  _today := (now() AT TIME ZONE _policy.timezone)::DATE;

  -- Get the report
  SELECT * INTO _report
  FROM public.reports
  WHERE id = p_report_id
    AND user_id = _user_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado ou não pode ser enviado';
  END IF;

  -- Check if late
  _is_late := _today > _report.due_date;

  -- Update report
  UPDATE public.reports
  SET 
    status = 'submitted',
    submitted_at = now(),
    submitted_late = _is_late,
    updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO _report;

  -- Update related expenses status
  UPDATE public.expenses e
  SET status = 'submitted', updated_at = now()
  FROM public.report_items ri
  WHERE ri.report_id = p_report_id
    AND ri.expense_id = e.id
    AND e.status = 'draft';

  RETURN json_build_object(
    'report', row_to_json(_report),
    'submitted_late', _is_late
  );
END;
$$;