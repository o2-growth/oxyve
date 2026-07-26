-- Onda 3d — Lançamento multi-dia (alimentação/transporte para vários dias)
--
-- Requisito: o usuário marca "vários dias", informa o período (início/fim) e o
-- valor POR DIA. O sistema gera uma despesa por dia, reusando o motor de política
-- (create_expense_in_current_report) — cada dia valida o teto diário, o ciclo e a
-- exceção de evento. Atômico: se um dia violar a política, a operação inteira aborta
-- (nada é criado), evitando lançamentos parciais.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_expense_multiday(
  p_description text,
  p_amount_cents_per_day integer,
  p_start_date date,
  p_end_date date,
  p_category_id uuid DEFAULT NULL::uuid,
  p_cost_center_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'personal_card'::text,
  p_currency text DEFAULT 'BRL'::text,
  p_is_reimbursable boolean DEFAULT true,
  p_notes text DEFAULT NULL::text,
  p_is_event boolean DEFAULT false
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _d date;
  _count integer := 0;
  _r json;
  _results json[] := ARRAY[]::json[];
BEGIN
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'A data final deve ser igual ou posterior à inicial.';
  END IF;
  IF (p_end_date - p_start_date) > 62 THEN
    RAISE EXCEPTION 'Período muito longo (máximo 62 dias).';
  END IF;

  _d := p_start_date;
  WHILE _d <= p_end_date LOOP
    -- Reusa o motor de política por dia (teto diário, ciclo, evento).
    _r := public.create_expense_in_current_report(
      p_description,
      p_amount_cents_per_day,
      _d,
      p_category_id,
      p_cost_center_id,
      p_project_id,
      p_payment_method,
      p_currency,
      p_is_reimbursable,
      p_notes,
      NULL,          -- receipt_path (comprovante por dia é anexado depois, se houver)
      p_is_event,
      NULL           -- distance_km (multi-dia não usa km)
    );
    _results := array_append(_results, _r);
    _count := _count + 1;
    _d := _d + 1;
  END LOOP;

  RETURN json_build_object('count', _count, 'expenses', array_to_json(_results));
END;
$function$;

COMMIT;
