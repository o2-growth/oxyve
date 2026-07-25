-- Onda 3a — Núcleo do Motor de Política de Reembolso
--
-- Deriva da Política de Reembolso O2 (PO-0002, Out/25):
--  - Alimentação: teto de R$ 30,00/dia (4.5.1). Como as categorias de comida são
--    dezenas (por depto), o teto é aplicado por TIPO (kind='food'), agregando todas
--    as despesas de alimentação do usuário no dia — não por categoria isolada.
--  - Exceção "evento" (4.5.3): a tag libera o teto, mas sinaliza para o admin revisar.
--  - Enforcement em modo 'block' (decisão do produto): acima do teto, sem evento, nega.
--
-- Estrutura:
--  1. expenses.is_event        — marca despesa como exceção de evento.
--  2. expense_categories.kind  — food | transport | other (classifica o teto aplicável).
--  3. expense_policies.food_daily_limit_cents / transport_daily_limit_cents.
--  4. RPC create_expense_in_current_report recriada com p_is_event + teto por kind.

BEGIN;

-- 1) Marcador de evento por despesa
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_event boolean NOT NULL DEFAULT false;

-- 2) Tipo da categoria (para aplicar o teto correto independente do departamento)
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';
ALTER TABLE public.expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_kind_check;
ALTER TABLE public.expense_categories
  ADD CONSTRAINT expense_categories_kind_check CHECK (kind IN ('food', 'transport', 'other'));

-- Classificação das categorias existentes por nome
UPDATE public.expense_categories
   SET kind = 'food'
 WHERE kind = 'other'
   AND (name ILIKE '%aliment%' OR name ILIKE '%refei%' OR name ILIKE '%comida%');

UPDATE public.expense_categories
   SET kind = 'transport'
 WHERE kind = 'other'
   AND (name ILIKE '%transporte%' OR name ILIKE '%deslocamento%'
        OR name ILIKE '%locomo%' OR name ILIKE '%combust%');

-- 3) Limites diários por tipo na política
--    food = R$ 30,00 (3000 cents). transport fica NULL até a regra de km entrar (Onda 3c).
ALTER TABLE public.expense_policies
  ADD COLUMN IF NOT EXISTS food_daily_limit_cents integer NOT NULL DEFAULT 3000;
ALTER TABLE public.expense_policies
  ADD COLUMN IF NOT EXISTS transport_daily_limit_cents integer;

-- Enforcement: bloquear violações de teto (decisão do produto)
UPDATE public.expense_policies SET enforce_limits_mode = 'block';

-- 4) RPC recriada (assinatura muda → DROP + CREATE)
DROP FUNCTION IF EXISTS public.create_expense_in_current_report(
  text, integer, date, uuid, uuid, uuid, text, text, boolean, text, text
);

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
  p_is_event boolean DEFAULT false
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

  _report := public.get_or_create_report_for_date(p_date);
  _report_id := (_report->>'id')::UUID;

  -- Data da despesa dentro do período do relatório (ciclo 25 → 24, dia 24 inclusive)
  IF p_date < (_report->>'start_date')::DATE OR p_date > (_report->>'end_date')::DATE THEN
    RAISE EXCEPTION 'Data da despesa deve estar dentro do período do relatório (% a %)',
      _report->>'start_date', _report->>'end_date';
  END IF;

  SELECT enforce_limits_mode, food_daily_limit_cents
    INTO _enforce_mode, _food_limit
  FROM public.expense_policies
  WHERE org_id = _org_id;

  -- Motor de política — teto diário de ALIMENTAÇÃO (agregado por tipo food).
  IF p_category_id IS NOT NULL THEN
    SELECT kind INTO _kind
      FROM public.expense_categories
     WHERE id = p_category_id AND org_id = _org_id;

    IF _kind = 'food' AND _food_limit IS NOT NULL THEN
      -- Soma todas as despesas de alimentação do usuário nesse dia/ciclo.
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
          -- Exceção de evento: libera o teto, mas sinaliza para o admin revisar.
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
    notes, receipt_path, is_out_of_policy, is_event, status
  )
  VALUES (
    _org_id, _user_id, p_description, p_amount_cents, p_date, p_category_id,
    p_cost_center_id, p_project_id, p_payment_method::payment_method, p_currency, p_is_reimbursable,
    p_notes, p_receipt_path, _is_out_of_policy, p_is_event, 'draft'
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
