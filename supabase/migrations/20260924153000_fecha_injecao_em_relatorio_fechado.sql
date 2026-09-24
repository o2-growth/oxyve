-- Impede que despesa entre num relatório já enviado e seja paga sem aprovação.
--
-- get_or_create_report_for_date procura o relatório do ciclo por
-- (org, user, cycle_key), sem olhar status, e devolve o que achar. Uma despesa
-- com data de um ciclo já aprovado caía dentro daquele relatório como draft —
-- depois de o gestor ter revisado. Na hora do pagamento, mark_report_paid
-- atualizava todos os itens do relatório sem filtrar status, então a despesa
-- injetada virava paid sem nunca ter sido aprovada.
--
-- Reproduzido de ponta a ponta neste projeto: relatório aprovado com R$ 20,00,
-- injeção de R$ 99,00 aceita com HTTP 200, e o pagamento carimbou as duas.
-- Mesma janela existia entre o envio e a decisão, com admin_decide_report.
--
-- Três travas, independentes de propósito: a entrada passa a recusar o ciclo
-- fechado, e as duas transições em massa só tocam no que está no estado certo.
-- create_expense_multiday é coberta porque delega a create_expense_in_current_report.

CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(p_description text, p_amount_cents integer, p_date date, p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'personal_card'::text, p_currency text DEFAULT 'BRL'::text, p_is_reimbursable boolean DEFAULT true, p_notes text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text, p_is_event boolean DEFAULT false, p_distance_km numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report JSON;
  _report_id UUID;
  _expense_id UUID;
  _enforce_mode TEXT;
  _food_limit INTEGER;
  _kind TEXT;
  _daily_total INTEGER;
  _is_out_of_policy BOOLEAN := false;
  _expense RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  -- Exceção de evento exige justificativa escrita (motivo). Sinalizada para o
  -- admin, então precisa deixar por escrito por que fugiu do combinado.
  IF p_is_event AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'Despesa marcada como evento exige uma observação descrevendo o motivo da exceção (política de reembolso).';
  END IF;

  _report := public.get_or_create_report_for_date(p_date);
  _report_id := (_report->>'id')::UUID;

  -- O relatório do ciclo é devolvido em qualquer status. Sem esta trava, uma
  -- despesa com data de um ciclo já enviado/aprovado/pago entra como draft
  -- dentro daquele relatório — depois da revisão — e é carimbada junto no
  -- próximo UPDATE em massa, virando reembolso sem passar por aprovação.
  IF (_report->>'status') <> 'draft' THEN
    RAISE EXCEPTION 'O relatório deste período já foi enviado (situação: %). Lance no ciclo aberto ou peça ao gestor para reabrir.',
      _report->>'status';
  END IF;

  IF p_date < (_report->>'start_date')::DATE OR p_date > (_report->>'end_date')::DATE THEN
    RAISE EXCEPTION 'Data da despesa deve estar dentro do período do relatório (% a %)',
      _report->>'start_date', _report->>'end_date';
  END IF;

  SELECT enforce_limits_mode, food_daily_limit_cents
    INTO _enforce_mode, _food_limit
  FROM public.expense_policies
  WHERE org_id = _org_id;

  IF p_category_id IS NOT NULL THEN
    SELECT kind INTO _kind
      FROM public.expense_categories
     WHERE id = p_category_id AND org_id = _org_id;

    IF _kind = 'food' AND _food_limit IS NOT NULL THEN
      SELECT COALESCE(SUM(e.amount_cents), 0) INTO _daily_total
        FROM public.expenses e
        INNER JOIN public.report_items ri ON ri.expense_id = e.id
        INNER JOIN public.reports r ON r.id = ri.report_id
        INNER JOIN public.expense_categories ec ON ec.id = e.category_id
       WHERE e.user_id = _user_id
         AND e.date = p_date
         AND ec.kind = 'food'
         AND r.cycle_key = _report->>'cycle_key';

      IF (_daily_total + p_amount_cents) > _food_limit THEN
        IF p_is_event THEN
          _is_out_of_policy := true;
        ELSIF _enforce_mode = 'block' THEN
          RAISE EXCEPTION 'Alimentação acima do limite de R$ %/dia. Total do dia ficaria em R$ %. Marque como evento se for exceção aprovada pela Diretoria.',
            (_food_limit / 100.0)::NUMERIC(10,2),
            ((_daily_total + p_amount_cents) / 100.0)::NUMERIC(10,2);
        ELSE
          _is_out_of_policy := true;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.expenses (
    org_id, user_id, description, amount_cents, date, category_id,
    cost_center_id, project_id, payment_method, currency, is_reimbursable,
    notes, receipt_path, is_out_of_policy, is_event, distance_km, status
  )
  VALUES (
    _org_id, _user_id, p_description, p_amount_cents, p_date, p_category_id,
    p_cost_center_id, p_project_id, p_payment_method::payment_method, p_currency, p_is_reimbursable,
    p_notes, p_receipt_path, _is_out_of_policy, p_is_event, p_distance_km, 'draft'
  )
  RETURNING id INTO _expense_id;

  INSERT INTO public.report_items (report_id, expense_id)
  VALUES (_report_id, _expense_id);

  SELECT * INTO _expense FROM public.expenses WHERE id = _expense_id;

  RETURN json_build_object(
    'expense', row_to_json(_expense),
    'report', _report,
    'is_out_of_policy', _is_out_of_policy
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_report_paid(p_report_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF NOT has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem marcar como pago';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;

  SELECT * INTO _report
  FROM public.reports
  WHERE id = p_report_id
    AND org_id = _org_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado ou não está aprovado';
  END IF;

  -- Update report status
  UPDATE public.reports
  SET status = 'paid', updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO _report;

  -- Update expenses status
  UPDATE public.expenses e
  SET status = 'paid', updated_at = now()
  FROM public.report_items ri
  WHERE ri.report_id = p_report_id
    AND ri.expense_id = e.id
    -- Paga só o que passou por aprovação; item que entrou depois fica de fora.
    AND e.status = 'approved';

  RETURN json_build_object('report', row_to_json(_report));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_decide_report(p_report_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report RECORD;
BEGIN
  -- Get current user and org
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Check if user is admin or manager
  IF NOT is_manager_or_admin(_user_id) THEN
    RAISE EXCEPTION 'Apenas gestores podem aprovar/reprovar relatórios';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;

  -- Get the report
  SELECT * INTO _report
  FROM public.reports
  WHERE id = p_report_id
    AND org_id = _org_id
    AND status = 'submitted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado ou não pode ser processado';
  END IF;

  -- Validate decision
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida. Use approved ou rejected';
  END IF;

  -- Require comment for rejection
  IF p_decision = 'rejected' AND (p_comment IS NULL OR p_comment = '') THEN
    RAISE EXCEPTION 'Comentário obrigatório para reprovação';
  END IF;

  -- Insert approval record
  INSERT INTO public.report_approvals (report_id, approver_id, decision, comment)
  VALUES (p_report_id, _user_id, p_decision::approval_decision, p_comment);

  -- Update report status
  UPDATE public.reports
  SET status = p_decision::report_status, updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO _report;

  -- Update expenses status
  UPDATE public.expenses e
  SET status = p_decision::expense_status, updated_at = now()
  FROM public.report_items ri
  WHERE ri.report_id = p_report_id
    AND ri.expense_id = e.id
    -- Decide só sobre o que foi de fato submetido.
    AND e.status = 'submitted';

  RETURN json_build_object(
    'report', row_to_json(_report),
    'decision', p_decision
  );
END;
$function$;
