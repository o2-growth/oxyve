-- Onda 6 — Exceção de evento exige justificativa escrita
--
-- Regra (decisão de produto 2026-08-03): quando a despesa é marcada como "evento"
-- — o mecanismo que libera o teto diário (ex.: alimentação/transporte acima do
-- combinado de R$ 30/dia) — o usuário PRECISA descrever o motivo da exceção no
-- campo de observação (notes). Fecha o furo de auditoria: até aqui o evento
-- liberava o valor sem exigir explicação.
--
-- Duas camadas de garantia:
--  1. CHECK constraint em expenses — rede definitiva, cobre TODOS os caminhos de
--     escrita (RPC de ciclo, multi-dia, insert/update direto do formulário).
--  2. RAISE EXCEPTION legível na RPC create_expense_in_current_report — mensagem
--     amigável em pt-BR, disparada antes de bater no CHECK (que daria erro cru).

BEGIN;

-- 1) Rede definitiva no banco: evento ⇒ observação não-vazia.
--    (Sem despesas de evento existentes — pode validar direto, sem NOT VALID.)
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_event_requires_note;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_event_requires_note
  CHECK (NOT is_event OR (notes IS NOT NULL AND btrim(notes) <> ''));

-- 2) RPC com mensagem amigável (assinatura idêntica à onda3c → CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(
  p_description text,
  p_amount_cents integer,
  p_date date,
  p_category_id uuid DEFAULT NULL::uuid,
  p_cost_center_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'personal_card'::text,
  p_currency text DEFAULT 'BRL'::text,
  p_is_reimbursable boolean DEFAULT true,
  p_notes text DEFAULT NULL::text,
  p_receipt_path text DEFAULT NULL::text,
  p_is_event boolean DEFAULT false,
  p_distance_km numeric DEFAULT NULL::numeric
)
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

COMMIT;
