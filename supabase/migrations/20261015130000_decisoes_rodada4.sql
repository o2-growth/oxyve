-- Decisões de negócio da rodada 4 (triagem 2026-10).
--
-- Só aditiva: ADD COLUMN IF NOT EXISTS, CREATE INDEX, CREATE OR REPLACE FUNCTION
-- e CREATE POLICY (RESTRICTIVE). Nenhuma linha existente é alterada por esta
-- migration. Cada função parte da versão vigente (20261015120000 ou anterior) e
-- muda só o que a decisão pede.
--
-- 1. Só admin marca reembolso como pago (por relatório e por pessoa).
-- 2. Aprovar exige todos os itens revisados e aprovados (expense_reviews).
-- 3. Mesma data + valor + categoria não bloqueia mais: a despesa é salva com
--    possible_duplicate_of e o gestor vê o alerta. Comprovante repetido
--    (receipt_hash) continua bloqueado.
-- 4/5. Sem mudança de banco (CPF/banco já visíveis a gestores; envio antecipado
--    e autoaprovação ficam como estão). O painel da Gestão passa a trazer o PIX
--    e os dados bancários de cada pessoa para a hora do pagamento.

-- ---------------------------------------------------------------------------
-- Decisão 3: coluna de possível duplicidade
-- ---------------------------------------------------------------------------
-- Aponta para a despesa mais antiga do mesmo dono com a mesma data, valor e
-- categoria. Linhas antigas ficam NULL (nada é recalculado retroativamente).
-- ON DELETE SET NULL: apagar o rascunho original não pode travar a exclusão.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid NULL
  REFERENCES public.expenses(id) ON DELETE SET NULL;

-- O SET NULL do FK precisa achar as referências sem varrer a tabela.
CREATE INDEX IF NOT EXISTS expenses_possible_duplicate_of_idx
  ON public.expenses (possible_duplicate_of) WHERE possible_duplicate_of IS NOT NULL;

-- Guard das escritas diretas (vigente da 20261015120000): possible_duplicate_of
-- é calculado pelo banco, como reimbursable_cents. Sem isto, um PATCH limpava o
-- alerta antes de o gestor ver.
CREATE OR REPLACE FUNCTION public.tg_expenses_guard_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Despesa aprovada injetada por INSERT ia direto para pagamento (A2).
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Despesa nova entra como rascunho.';
    END IF;
    NEW.late_decision := NULL;
    NEW.reimbursable_cents := NULL;
    NEW.is_out_of_policy := false;
    NEW.possible_duplicate_of := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'Situação, dono e empresa da despesa só mudam pelo fluxo do app.';
  END IF;
  -- Campos calculados: volta o valor antigo em vez de recusar, para o form de
  -- edição (que manda a linha inteira) continuar funcionando.
  NEW.reimbursable_cents := OLD.reimbursable_cents;
  NEW.is_out_of_policy := OLD.is_out_of_policy;
  NEW.late_decision := OLD.late_decision;
  NEW.possible_duplicate_of := OLD.possible_duplicate_of;
  RETURN NEW;
END;
$function$;

-- Regras da despesa (vigente da 20261015120000). Muda só o bloco de duplicidade.
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

  -- Mesmo comprovante continua bloqueando: é a mesma nota pedida duas vezes.
  IF NEW.receipt_hash IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash) THEN
    PERFORM 1 FROM public.expenses e
     WHERE e.user_id = NEW.user_id AND e.receipt_hash = NEW.receipt_hash
       AND e.status <> 'rejected' AND e.id <> NEW.id;
    IF FOUND THEN
      RAISE EXCEPTION 'Este comprovante já foi lançado em outra despesa. Se for outra nota, fotografe a nota correta.';
    END IF;
  END IF;
  -- Mesma data + valor + categoria pode ser legítimo (dois táxis iguais no dia):
  -- não bloqueia, só marca para quem lança e para o gestor conferirem (decisão 3).
  -- Recalcula também quando possible_duplicate_of muda, que só acontece pelo
  -- ON DELETE SET NULL (o guard repõe o valor num PATCH do cliente).
  IF TG_OP = 'INSERT' OR NEW.date IS DISTINCT FROM OLD.date OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.possible_duplicate_of IS DISTINCT FROM OLD.possible_duplicate_of THEN
    SELECT e.id INTO NEW.possible_duplicate_of FROM public.expenses e
     WHERE e.user_id = NEW.user_id AND e.date = NEW.date AND e.amount_cents = NEW.amount_cents
       AND e.category_id IS NOT DISTINCT FROM NEW.category_id
       AND e.status <> 'rejected' AND e.id <> NEW.id
     ORDER BY e.created_at, e.id
     LIMIT 1;
    -- SELECT INTO sem linha já grava NULL: a edição que desfaz a coincidência limpa o alerta.
  END IF;

  -- Recalcula só quando muda o que entra na conta. Troca de status (enviar,
  -- aprovar, pagar) não mexe no valor já calculado. Mexer direto nos campos
  -- calculados também força o recálculo, para não aceitar valor forjado.
  IF TG_OP = 'UPDATE'
     AND NEW.amount_cents IS NOT DISTINCT FROM OLD.amount_cents
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.food_days IS NOT DISTINCT FROM OLD.food_days
     AND NEW.is_event IS NOT DISTINCT FROM OLD.is_event
     AND NEW.is_reimbursable IS NOT DISTINCT FROM OLD.is_reimbursable
     AND NEW.reimbursable_cents IS NOT DISTINCT FROM OLD.reimbursable_cents
     AND NEW.is_out_of_policy IS NOT DISTINCT FROM OLD.is_out_of_policy
     AND NEW.reimbursable_cents IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.reimbursable_cents := NEW.amount_cents;
  SELECT kind INTO _kind FROM public.expense_categories WHERE id = NEW.category_id;

  -- Não reembolsável (ex.: cartão corporativo) não entra no teto: as telas e o
  -- painel já contam 0 para ela, então limitar só criaria selo falso.
  IF NOT NEW.is_reimbursable THEN
    NEW.is_out_of_policy := NEW.is_event;
    RETURN NEW;
  END IF;

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
   WHERE e.user_id = NEW.user_id AND ec.kind = 'food' AND NOT e.is_event AND e.is_reimbursable
     AND e.date BETWEEN _start AND _end AND e.status <> 'rejected' AND e.id <> NEW.id;

  IF NEW.food_days > 1 THEN
    _cap := NEW.food_days::bigint * _limit;
  ELSE
    SELECT COALESCE(SUM(COALESCE(e.reimbursable_cents, e.amount_cents)), 0) INTO _day_used
      FROM public.expenses e JOIN public.expense_categories ec ON ec.id = e.category_id
     WHERE e.user_id = NEW.user_id AND ec.kind = 'food' AND NOT e.is_event AND e.is_reimbursable
       AND e.food_days = 1 AND e.date = NEW.date AND e.status <> 'rejected' AND e.id <> NEW.id;
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

-- create_expense_in_current_report (vigente da 20260928120000). O retorno ganha
-- possible_duplicate/possible_duplicate_of no topo, para o front avisar quem
-- lança sem ler a linha inteira. As chaves antigas continuam iguais.
CREATE OR REPLACE FUNCTION public.create_expense_in_current_report(
  p_description text, p_amount_cents integer, p_date date,
  p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'personal_card'::text,
  p_currency text DEFAULT 'BRL'::text, p_is_reimbursable boolean DEFAULT true,
  p_notes text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text,
  p_is_event boolean DEFAULT false, p_distance_km numeric DEFAULT NULL::numeric,
  p_food_days integer DEFAULT 1, p_receipt_hash text DEFAULT NULL::text)
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
    'is_out_of_policy', _expense.is_out_of_policy,
    'possible_duplicate', _expense.possible_duplicate_of IS NOT NULL,
    'possible_duplicate_of', _expense.possible_duplicate_of);
END;
$function$;

-- create_expense_multiday (vigente da 20260725160000). Cada item de "expenses"
-- já traz possible_duplicate (vem da RPC acima); o topo ganha a contagem.
CREATE OR REPLACE FUNCTION public.create_expense_multiday(
  p_description text, p_amount_cents_per_day integer, p_start_date date, p_end_date date,
  p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'personal_card'::text,
  p_currency text DEFAULT 'BRL'::text, p_is_reimbursable boolean DEFAULT true,
  p_notes text DEFAULT NULL::text, p_is_event boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d date;
  _count integer := 0;
  _dups integer := 0;
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
    IF (_r->>'possible_duplicate')::boolean THEN _dups := _dups + 1; END IF;
    _d := _d + 1;
  END LOOP;

  RETURN json_build_object('count', _count, 'expenses', array_to_json(_results),
                           'possible_duplicates', _dups);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Decisão 1: só admin paga, também por pessoa
-- ---------------------------------------------------------------------------
-- mark_expenses_paid (vigente da 20260925151000) aceitava gestor; mark_report_paid
-- já exigia admin. A mensagem mantém "Acesso restrito", que o front reconhece
-- como erro de permissão (lib/permissionError.ts).
--
-- Também fecha o relatório quando só sobra despesa não reembolsável aprovada:
-- o front não manda essas para pagamento (valor 0), e o relatório ficava
-- 'approved' para sempre. Elas viram 'paid' junto, como no mark_report_paid.
CREATE OR REPLACE FUNCTION public.mark_expenses_paid(p_expense_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _org uuid; _count int;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores: só admin marca reembolso como pago.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;

  UPDATE public.expenses e SET status = 'paid', updated_at = now()
   WHERE e.id = ANY(p_expense_ids) AND e.org_id = _org AND e.status = 'approved'
     AND EXISTS (
       SELECT 1 FROM public.report_items ri JOIN public.reports r ON r.id = ri.report_id
        WHERE ri.expense_id = e.id AND r.status IN ('approved', 'paid'));
  GET DIAGNOSTICS _count = ROW_COUNT;

  -- Só nos relatórios tocados por este pagamento e cujo reembolsável já foi todo pago.
  UPDATE public.expenses e SET status = 'paid', updated_at = now()
    FROM public.report_items ri JOIN public.reports r ON r.id = ri.report_id
   WHERE ri.expense_id = e.id AND r.org_id = _org AND r.status = 'approved'
     AND e.status = 'approved' AND NOT e.is_reimbursable
     AND EXISTS (SELECT 1 FROM public.report_items ri2
                  WHERE ri2.report_id = r.id AND ri2.expense_id = ANY(p_expense_ids))
     AND NOT EXISTS (
       SELECT 1 FROM public.report_items ri3 JOIN public.expenses e3 ON e3.id = ri3.expense_id
        WHERE ri3.report_id = r.id AND e3.status <> 'paid' AND e3.is_reimbursable);

  UPDATE public.reports r SET status = 'paid', updated_at = now()
   WHERE r.org_id = _org AND r.status = 'approved'
     AND EXISTS (SELECT 1 FROM public.report_items ri WHERE ri.report_id = r.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.report_items ri JOIN public.expenses e ON e.id = ri.expense_id
        WHERE ri.report_id = r.id AND e.status <> 'paid');

  RETURN json_build_object('paid', _count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Decisão 2: aprovação exige todos os itens revisados e aprovados
-- ---------------------------------------------------------------------------
-- admin_decide_report (vigente da 20261015120000). Antes só recusava com item
-- reprovado; a RPC direta ainda aprovava com item sem revisão ou sem itens.
CREATE OR REPLACE FUNCTION public.admin_decide_report(p_report_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid(); _org_id uuid; _report record;
  _item record; _itens text := ''; _comment text := p_comment;
  _total int; _aprovados int;
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
  IF p_decision = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.expense_reviews er
        JOIN public.report_items ri ON ri.report_id = er.report_id AND ri.expense_id = er.expense_id
       WHERE er.report_id = p_report_id AND er.decision = 'rejected'
    ) THEN
      RAISE EXCEPTION 'Há despesa reprovada neste relatório: use Reprovar e devolver.';
    END IF;
    -- Revisão é desta rodada: devolver apaga as revisões, e a policy de INSERT
    -- só aceita revisão de relatório em aprovação.
    SELECT count(*), count(er.expense_id) FILTER (WHERE er.decision = 'approved')
      INTO _total, _aprovados
      FROM public.report_items ri
      LEFT JOIN public.expense_reviews er ON er.report_id = ri.report_id AND er.expense_id = ri.expense_id
     WHERE ri.report_id = p_report_id;
    IF _total = 0 THEN
      RAISE EXCEPTION 'Relatório sem despesas não pode ser aprovado.';
    END IF;
    IF _aprovados < _total THEN
      RAISE EXCEPTION 'Revise todos os itens antes de aprovar (% de % revisados).', _aprovados, _total;
    END IF;
  END IF;

  INSERT INTO public.report_approvals (report_id, approver_id, decision, comment)
  VALUES (p_report_id, _user_id, p_decision::approval_decision, p_comment);

  IF p_decision = 'approved' THEN
    UPDATE public.reports SET status = 'approved', updated_at = now() WHERE id = p_report_id RETURNING * INTO _report;
    UPDATE public.expenses e SET status = 'approved', updated_at = now()
      FROM public.report_items ri
     WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status = 'submitted';
  ELSE
    -- Motivo por item: vai para o histórico e para o comentário da devolução.
    -- Se o gestor já citou o item no comentário (o front pré-preenche), não repete.
    FOR _item IN
      SELECT er.expense_id, er.comment, e.description, e.date,
             COALESCE(e.reimbursable_cents, e.amount_cents) AS cents
        FROM public.expense_reviews er
        JOIN public.expenses e ON e.id = er.expense_id
       WHERE er.report_id = p_report_id AND er.decision = 'rejected'
       ORDER BY e.date, e.description
    LOOP
      INSERT INTO public.report_events (report_id, actor_id, event_type, data)
      VALUES (p_report_id, _user_id, 'comment', jsonb_build_object(
        'kind', 'item_rejected',
        'expense_id', _item.expense_id,
        'description', format('Item reprovado: %s (%s, R$ %s)',
                              _item.description, to_char(_item.date, 'DD/MM/YYYY'), public.brl(_item.cents)),
        'comment', COALESCE(NULLIF(btrim(_item.comment), ''), 'sem motivo informado')));
      IF position(_item.description IN p_comment) = 0 THEN
        _itens := _itens || format(E'\n• %s (%s): %s', _item.description, to_char(_item.date, 'DD/MM/YYYY'),
                                   COALESCE(NULLIF(btrim(_item.comment), ''), 'sem motivo informado'));
      END IF;
    END LOOP;
    IF _itens <> '' THEN
      _comment := p_comment || E'\n\nItens reprovados:' || _itens;
    END IF;

    -- Reprovação é total. Passa por 'rejected' para o gatilho de auditoria registrar
    -- o evento e notificar o autor, e devolve como rascunho para correção e reenvio.
    UPDATE public.reports SET status = 'rejected', updated_at = now() WHERE id = p_report_id;
    UPDATE public.reports
       SET status = 'draft', last_rejection_comment = _comment, returned_at = now(),
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

-- A policy de INSERT de expense_reviews só olhava a org: dava para gravar
-- "aprovado" num rascunho antes do envio, e a aprovação passaria sem revisão
-- de verdade. Revisão nova só em relatório da org em aprovação e para item dele.
CREATE POLICY "Expense reviews: insert so em relatorio em aprovacao da org"
  ON public.expense_reviews AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
       WHERE r.id = expense_reviews.report_id
         AND r.org_id = public.get_user_org_id(auth.uid())
         AND r.status = 'submitted'
    )
    AND EXISTS (
      SELECT 1 FROM public.report_items ri
       WHERE ri.report_id = expense_reviews.report_id
         AND ri.expense_id = expense_reviews.expense_id
    )
  );

-- ---------------------------------------------------------------------------
-- Decisão 4: dados de pagamento no painel da Gestão
-- ---------------------------------------------------------------------------
-- get_admin_financial_overview (vigente da 20261015120000). por_pessoa ganha o
-- PIX e os dados bancários de quem recebe, para o admin conferir na hora de
-- pagar. A RPC já é restrita a gestor/admin, que pela decisão 4 podem ver esses
-- dados (a policy de profiles já deixava). Os valores não mudam.
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
           CASE WHEN e.is_reimbursable THEN COALESCE(e.reimbursable_cents, e.amount_cents) ELSE 0 END AS reemb,
           ec.kind, ec.sector
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
      p.pix_key, p.pix_key_type, p.bank_name, p.bank_branch, p.bank_account,
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
           CASE WHEN e.is_reimbursable THEN COALESCE(e.reimbursable_cents, e.amount_cents) ELSE 0 END AS reimbursable_cents,
           e.created_at, r.title AS report_title, r.status::text AS report_status
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
