
-- 1) Create departments table
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- RLS policies for departments
CREATE POLICY "Users can view org departments"
ON public.departments FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL
USING (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_departments_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add department_id to profiles
ALTER TABLE public.profiles
ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3) Evolve expense_categories to expense_types functionality
ALTER TABLE public.expense_categories
ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN daily_limit_cents INTEGER,
ADD COLUMN requires_receipt BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Add trigger for updated_at on expense_categories
CREATE TRIGGER update_expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Evolve expense_policies
ALTER TABLE public.expense_policies
ADD COLUMN cycle_cutoff_day INTEGER NOT NULL DEFAULT 24,
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
ADD COLUMN enforce_limits_mode TEXT NOT NULL DEFAULT 'warn';

-- Add check constraint for enforce_limits_mode
ALTER TABLE public.expense_policies
ADD CONSTRAINT enforce_limits_mode_check CHECK (enforce_limits_mode IN ('warn', 'block'));

-- Add check constraint for cycle_cutoff_day (1-28 to be safe for all months)
ALTER TABLE public.expense_policies
ADD CONSTRAINT cycle_cutoff_day_check CHECK (cycle_cutoff_day >= 1 AND cycle_cutoff_day <= 28);

-- 5) Evolve reports for cycle management
ALTER TABLE public.reports
ADD COLUMN due_date DATE,
ADD COLUMN cycle_key TEXT;

-- Create unique constraint for one report per user per cycle
CREATE UNIQUE INDEX reports_org_user_cycle_unique 
ON public.reports(org_id, user_id, cycle_key) 
WHERE cycle_key IS NOT NULL;

-- 6) Add is_out_of_policy to expenses
ALTER TABLE public.expenses
ADD COLUMN is_out_of_policy BOOLEAN NOT NULL DEFAULT false;

-- 7) Create RPC function: get_or_create_current_report
CREATE OR REPLACE FUNCTION public.get_or_create_current_report()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _policy RECORD;
  _today DATE;
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
    -- Create default policy if not exists
    INSERT INTO public.expense_policies (org_id) VALUES (_org_id);
    _policy.cycle_cutoff_day := 24;
    _policy.timezone := 'America/Sao_Paulo';
  END IF;

  -- Calculate cycle dates based on current date in org timezone
  _today := (now() AT TIME ZONE _policy.timezone)::DATE;

  -- If today is before cutoff day, cycle started on cutoff day of previous month
  -- If today is on or after cutoff day, cycle started on cutoff day of current month
  IF EXTRACT(DAY FROM _today) < _policy.cycle_cutoff_day THEN
    _cycle_start := date_trunc('month', _today - interval '1 month')::DATE + (_policy.cycle_cutoff_day - 1);
  ELSE
    _cycle_start := date_trunc('month', _today)::DATE + (_policy.cycle_cutoff_day - 1);
  END IF;

  -- Cycle ends one month after start, minus one day
  _cycle_end := (_cycle_start + interval '1 month')::DATE - 1;
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

    -- Create new report
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
    'created_at', _report.created_at
  );
END;
$$;

-- 8) Create RPC function: create_expense_in_current_report
CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(
  p_description TEXT,
  p_amount_cents INTEGER,
  p_date DATE,
  p_category_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'personal_card',
  p_currency TEXT DEFAULT 'BRL',
  p_is_reimbursable BOOLEAN DEFAULT true,
  p_notes TEXT DEFAULT NULL,
  p_receipt_path TEXT DEFAULT NULL
)
RETURNS JSON
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

  -- Get or create current report
  _report := public.get_or_create_current_report();
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

-- 9) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_current_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense_in_current_report(TEXT, INTEGER, DATE, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
