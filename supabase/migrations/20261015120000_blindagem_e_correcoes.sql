-- Blindagem das escritas diretas do cliente e correções de regra (triagem 2026-10).
--
-- Só aditiva: funções com CREATE OR REPLACE, triggers, policies (inclusive
-- RESTRICTIVE, que somam restrição sem precisar de DROP nas permissivas antigas)
-- e REVOKE/GRANT. Nenhuma linha existente é alterada por esta migration.
--
-- Por que as RPCs não são afetadas: todas são SECURITY DEFINER com dono postgres.
-- Dentro delas current_user é postgres, e RLS não se aplica ao dono da tabela.
-- O guard abaixo só age quando current_user é authenticated/anon, isto é, numa
-- escrita direta pelo PostgREST com o JWT do usuário.
--
-- Itens: A1, A2, A3, A4, A5, aprovacao-pagamento-extra-2, regras-extra-1/2,
-- dinheiro-datas-1/2/8, uso-real-1/3/6/8/9, D3, B7.

-- ---------------------------------------------------------------------------
-- A1 / A2 / regras-extra-1 / aprovacao-pagamento-extra-2: guard de expenses
-- ---------------------------------------------------------------------------
-- reimbursable_cents, is_out_of_policy e late_decision são calculados pelo
-- banco. Um PATCH direto conseguia gravar o valor cheio por cima do teto, ou
-- tirar a despesa da fila "fora do prazo". O nome com 00 faz o guard rodar antes
-- de expenses_regras (triggers BEFORE disparam em ordem alfabética), então o
-- recálculo legítimo continua quando valor/data/categoria mudam.
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
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_expenses_guard_client() FROM PUBLIC, anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'expenses_00_guard_client' AND tgrelid = 'public.expenses'::regclass
  ) THEN
    CREATE TRIGGER expenses_00_guard_client
      BEFORE INSERT OR UPDATE ON public.expenses
      FOR EACH ROW EXECUTE FUNCTION public.tg_expenses_guard_client();
  END IF;
END $$;

-- Camada extra do A2: mesmo sem o trigger, INSERT direto só como rascunho.
CREATE POLICY "Expenses: insert direto so rascunho"
  ON public.expenses AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (status = 'draft' AND late_decision IS NULL);

-- ---------------------------------------------------------------------------
-- A4: UPDATE direto só no rascunho próprio (expenses e reports)
-- ---------------------------------------------------------------------------
-- "Managers can update org expenses status" / "Managers can update org reports"
-- deixavam gestor/admin mudar status, valor e dono por PATCH. O app não usa
-- esse caminho (useApproveReport/useMarkReportAsPaid são código morto; as telas
-- usam admin_decide_report, mark_report_paid e mark_expenses_paid).
CREATE POLICY "Expenses: update direto so rascunho proprio"
  ON public.expenses AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid() AND status = 'draft' AND org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Reports: update direto so rascunho proprio"
  ON public.reports AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid() AND status = 'draft' AND org_id = public.get_user_org_id(auth.uid()));

-- Relatório criado direto (AddToReportDialog/ReportFormDialog) nasce rascunho.
CREATE POLICY "Reports: insert direto so rascunho"
  ON public.reports AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (status = 'draft' AND submitted_at IS NULL);

-- Guard análogo em reports: o dono, no rascunho, não mexe nos campos do ciclo
-- (prazo e chave) nem na trilha de envio/devolução. Esses só mudam pelas RPCs.
CREATE OR REPLACE FUNCTION public.tg_reports_guard_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.cycle_key IS DISTINCT FROM OLD.cycle_key
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.submitted_late IS DISTINCT FROM OLD.submitted_late
     OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
     OR NEW.last_rejection_comment IS DISTINCT FROM OLD.last_rejection_comment THEN
    RAISE EXCEPTION 'Situação e prazo do relatório só mudam pelo fluxo do app.';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_reports_guard_client() FROM PUBLIC, anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'reports_00_guard_client' AND tgrelid = 'public.reports'::regclass
  ) THEN
    CREATE TRIGGER reports_00_guard_client
      BEFORE UPDATE ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.tg_reports_guard_client();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A3 / dinheiro-datas-8: report_items só com despesa própria, em rascunho,
-- fora de outro relatório e que não esteja aguardando decisão de fora do prazo
-- ---------------------------------------------------------------------------
-- A policy antiga só olhava o relatório. Dava para anexar despesa de colega, a
-- despesa "approved" injetada (A2) ou a avulsa fora do prazo sem passar por
-- decide_late_expense. A data não entra na regra: relatório manual pode não ter
-- período, e o AddToReportDialog já filtra rascunho sem relatório.
-- UNIQUE(expense_id) fica de fora de propósito: sem conferir produção não dá para
-- saber se já há despesa em dois relatórios (o índice falharia). Ver notas.
-- Consulta report_items de dentro de uma policy de report_items dá recursão de
-- RLS; por isso a checagem de vínculo existente fica numa função SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.expense_in_any_report(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.report_items WHERE expense_id = p_expense_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.expense_in_any_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_in_any_report(uuid) TO authenticated, service_role;

CREATE POLICY "Report items: so despesa propria em rascunho"
  ON public.report_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.expenses e
        JOIN public.reports r ON r.id = report_items.report_id
       WHERE e.id = report_items.expense_id
         AND e.user_id = auth.uid()
         AND r.user_id = e.user_id
         AND e.status = 'draft'
         AND e.late_decision IS DISTINCT FROM 'pending'
    )
    AND NOT public.expense_in_any_report(report_items.expense_id)
  );

-- Ajuda a conferência de duplicidade e expense_in_any_report (não é UNIQUE).
CREATE INDEX IF NOT EXISTS report_items_expense_id_idx ON public.report_items (expense_id);

-- ---------------------------------------------------------------------------
-- A5: comprovante não pode ser trocado nem apagado depois do envio
-- ---------------------------------------------------------------------------
-- Caminho: org/usuário/relatório|unassigned/despesa/arquivo. A despesa sai da 4ª
-- pasta do caminho ou de quem aponta receipt_path para o objeto. SECURITY DEFINER
-- para não depender da RLS de expenses dentro da policy de storage.
CREATE OR REPLACE FUNCTION public.receipt_is_locked(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.expenses e
     WHERE e.status <> 'draft'
       AND (
         e.receipt_path = p_name
         OR e.id = CASE
              WHEN split_part(p_name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN split_part(p_name, '/', 4)::uuid
            END
       )
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.receipt_is_locked(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receipt_is_locked(text) TO authenticated, service_role;

CREATE POLICY "Receipts: update so de comprovante de rascunho"
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'receipts' OR NOT public.receipt_is_locked(name))
  WITH CHECK (bucket_id <> 'receipts' OR NOT public.receipt_is_locked(name));

CREATE POLICY "Receipts: delete so de comprovante de rascunho"
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'receipts' OR NOT public.receipt_is_locked(name));

-- ---------------------------------------------------------------------------
-- uso-real-8: revisão por item é da equipe de aprovação, não de um revisor só
-- ---------------------------------------------------------------------------
-- A policy antiga exigia reviewer_id = auth.uid() na linha existente, e o upsert
-- de um segundo gestor batia em erro de RLS. Quem atualiza passa a ser o revisor.
CREATE POLICY "Org approvers can update expense reviews"
  ON public.expense_reviews FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.reports r
       WHERE r.id = expense_reviews.report_id
         AND r.org_id = public.get_user_org_id(auth.uid())
         AND r.status = 'submitted'
    )
  )
  WITH CHECK (public.is_manager_or_admin(auth.uid()) AND reviewer_id = auth.uid());

-- A policy antiga de UPDATE ("Managers can update expense reviews") não olha o
-- relatório: o revisor conseguia mover a própria revisão (report_id) para um
-- relatório de outra org ou fora de aprovação. RESTRICTIVE vale para as duas.
CREATE POLICY "Expense reviews: update so em relatorio em aprovacao da org"
  ON public.expense_reviews AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
       WHERE r.id = expense_reviews.report_id
         AND r.org_id = public.get_user_org_id(auth.uid())
         AND r.status = 'submitted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
       WHERE r.id = expense_reviews.report_id
         AND r.org_id = public.get_user_org_id(auth.uid())
         AND r.status = 'submitted'
    )
  );

-- ---------------------------------------------------------------------------
-- tg_expenses_regras (versão da 20260928120000 com as correções)
-- ---------------------------------------------------------------------------
-- aprovacao-pagamento-extra-2: mudar reimbursable_cents/is_out_of_policy força
-- recálculo (defesa em profundidade além do guard).
-- dinheiro-datas-1 / uso-real-3: mudar is_reimbursable também recalcula, e
-- despesa não reembolsável não consome o teto do dia/ciclo nem é limitada.
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

-- ---------------------------------------------------------------------------
-- admin_decide_report (versão da 20260928120000 com as correções)
-- ---------------------------------------------------------------------------
-- uso-real-1 / dinheiro-datas-2: aprovar pela Fila ignorava item reprovado na
-- revisão e o item era aprovado e pago. Agora recusa.
-- uso-real-6: na devolução, o motivo por item era apagado junto com as
-- revisões. Antes do DELETE (que segue: no reenvio o aprovador revisa de novo),
-- cada item reprovado vira um evento 'comment' no histórico e entra no
-- last_rejection_comment, que é o que a autora vê.
CREATE OR REPLACE FUNCTION public.admin_decide_report(p_report_id uuid, p_decision text, p_comment text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid(); _org_id uuid; _report record;
  _item record; _itens text := ''; _comment text := p_comment;
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
  IF p_decision = 'approved' AND EXISTS (
    SELECT 1 FROM public.expense_reviews er
      JOIN public.report_items ri ON ri.report_id = er.report_id AND ri.expense_id = er.expense_id
     WHERE er.report_id = p_report_id AND er.decision = 'rejected'
  ) THEN
    RAISE EXCEPTION 'Há despesa reprovada neste relatório: use Reprovar e devolver.';
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

-- ---------------------------------------------------------------------------
-- get_admin_financial_overview (versão da 20260928120000): não reembolsável = 0
-- ---------------------------------------------------------------------------
-- uso-real-3 / dinheiro-datas-1 / regras-extra-2: o painel somava despesa de
-- cartão corporativo / "não reembolsável" em a pagar, aguardando e realizado.
-- A correção é na leitura, então vale também para as linhas antigas.
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

-- ---------------------------------------------------------------------------
-- uso-real-9: aviso ao gestor diz quem enviou e quanto
-- ---------------------------------------------------------------------------
-- Versão da 20260925152000. Todas as notificações chegavam iguais ("Relatório
-- Out 2026" foi enviado), porque o título é o mesmo para todos no ciclo.
CREATE OR REPLACE FUNCTION public.tg_reports_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := auth.uid();
  _event TEXT := NULL;
  _approver_ids UUID[];
  _uid UUID;
  _author TEXT;
  _total BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
    INSERT INTO public.report_events (report_id, actor_id, event_type, data)
    VALUES (NEW.id, _actor, 'created', jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;

  -- UPDATE com mudança de status.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status::TEXT
      WHEN 'submitted' THEN 'submitted'
      WHEN 'approved'  THEN 'approved'
      WHEN 'rejected'  THEN 'rejected'
      WHEN 'paid'      THEN 'paid'
      ELSE NULL
    END;

    IF _event IS NOT NULL THEN
      INSERT INTO public.report_events (report_id, actor_id, event_type, data)
      VALUES (
        NEW.id, _actor, _event,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'title', NEW.title)
      );

      -- Notificações pro autor sempre.
      IF _event IN ('submitted', 'approved', 'rejected', 'paid') THEN
        PERFORM public.create_notification(
          NEW.user_id,
          CASE WHEN _event = 'submitted' THEN 'reports'
               WHEN _event IN ('approved', 'rejected') THEN 'my_expenses'
               WHEN _event = 'paid' THEN 'my_expenses'
               ELSE 'other' END,
          CASE _event
            WHEN 'submitted' THEN 'Relatório enviado'
            WHEN 'approved'  THEN 'Relatório aprovado'
            WHEN 'rejected'  THEN 'Relatório reprovado'
            WHEN 'paid'      THEN 'Relatório pago'
          END,
          format('"%s" %s', NEW.title, CASE _event
            WHEN 'submitted' THEN 'foi enviado para aprovação.'
            WHEN 'approved'  THEN 'foi aprovado e aguarda pagamento.'
            WHEN 'rejected'  THEN 'foi devolvido — veja o motivo e corrija.'
            WHEN 'paid'      THEN 'foi pago.'
          END),
          format('/app/reports/%s', NEW.id)
        );
      END IF;

      -- Quando submitted: notifica admins/managers da org como "ação necessária".
      IF _event = 'submitted' THEN
        SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::UUID[])
          INTO _approver_ids
          FROM public.profiles p
          JOIN public.user_roles ur ON ur.user_id = p.id
         WHERE p.org_id = NEW.org_id
           AND ur.role IN ('admin', 'manager')
           AND p.id <> NEW.user_id;

        IF array_length(_approver_ids, 1) > 0 THEN
          SELECT NULLIF(btrim(full_name), '') INTO _author FROM public.profiles WHERE id = NEW.user_id;
          -- Mesmo critério do "a reembolsar" da tela: não reembolsável conta 0.
          SELECT COALESCE(SUM(CASE WHEN e.is_reimbursable THEN COALESCE(e.reimbursable_cents, e.amount_cents) ELSE 0 END), 0)
            INTO _total
            FROM public.report_items ri JOIN public.expenses e ON e.id = ri.expense_id
           WHERE ri.report_id = NEW.id AND e.status <> 'rejected';
        END IF;

        FOREACH _uid IN ARRAY _approver_ids LOOP
          PERFORM public.create_notification(
            _uid,
            'action_required',
            'Relatório aguardando aprovação',
            format('%s enviou "%s" (R$ %s a reembolsar) e aguarda sua aprovação.',
                   COALESCE(_author, 'Um colaborador'), NEW.title, public.brl(_total)),
            format('/app/reports/%s', NEW.id)
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- D3: fallback do dia de corte 24 → 25 (regra vigente desde a 20260725130000)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cycle_bounds(p_org uuid, p_date date, OUT cycle_start date, OUT cycle_end date)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cutoff int;
BEGIN
  SELECT cycle_cutoff_day INTO _cutoff FROM public.expense_policies WHERE org_id = p_org;
  _cutoff := COALESCE(_cutoff, 25);
  IF EXTRACT(DAY FROM p_date) >= _cutoff THEN
    cycle_start := date_trunc('month', p_date)::date + (_cutoff - 1);
  ELSE
    cycle_start := date_trunc('month', p_date - interval '1 month')::date + (_cutoff - 1);
  END IF;
  cycle_end := (cycle_start + interval '1 month')::date - 1;
END;
$function$;

-- Versão da 20260928120000. Org sem política: lê de volta a linha recém-criada
-- (default da coluna) em vez de fixar um dia de corte no código.
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
    INSERT INTO public.expense_policies (org_id) VALUES (_org_id)
    RETURNING cycle_cutoff_day, timezone INTO _policy;
  END IF;
  _policy.cycle_cutoff_day := COALESCE(_policy.cycle_cutoff_day, 25);

  -- Calculate cycle dates based on provided date
  -- If day(p_date) >= cutoff: cycle starts on cutoff day of same month
  -- If day(p_date) < cutoff: cycle starts on cutoff day of previous month
  IF EXTRACT(DAY FROM p_date) >= _policy.cycle_cutoff_day THEN
    _cycle_start := date_trunc('month', p_date)::DATE + (_policy.cycle_cutoff_day - 1);
  ELSE
    _cycle_start := date_trunc('month', p_date - interval '1 month')::DATE + (_policy.cycle_cutoff_day - 1);
  END IF;

  -- Cycle ends on the day before the cutoff of next month
  _cycle_end := (_cycle_start + interval '1 month')::DATE - 1;

  -- Due date is the cutoff day
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

-- Versão da 20260208180618 (a vigente; o front chama no Dashboard). Tinha o mesmo
-- fallback fixo em 24 quando a org não tem política.
CREATE OR REPLACE FUNCTION public.get_or_create_current_report()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Cria a política padrão e lê de volta o default da coluna (25).
    INSERT INTO public.expense_policies (org_id) VALUES (_org_id)
    RETURNING cycle_cutoff_day, timezone INTO _policy;
  END IF;
  _policy.cycle_cutoff_day := COALESCE(_policy.cycle_cutoff_day, 25);
  _policy.timezone := COALESCE(_policy.timezone, 'America/Sao_Paulo');

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
$function$;

-- ---------------------------------------------------------------------------
-- B7: RPCs de negócio fora de PUBLIC/anon
-- ---------------------------------------------------------------------------
-- Todas checam auth.uid() hoje, mas ficavam executáveis por anon pelo grant
-- padrão. Mesmo padrão da 20260924144500: corta PUBLIC e anon, devolve a
-- authenticated (e service_role, para as edge functions).
DO $$
DECLARE _fn regprocedure;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'admin_assign_role', 'admin_decide_report', 'bootstrap_user',
         'create_expense_in_current_report', 'create_expense_multiday', 'decide_late_expense',
         'get_admin_financial_overview', 'get_dashboard_context', 'get_or_create_current_report',
         'get_or_create_report_for_date', 'get_org_members', 'mark_expenses_paid',
         'mark_report_paid', 'set_user_role', 'submit_report')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', _fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _fn);
  END LOOP;
END $$;

-- admin_assign_role é código morto (o front usa set_user_role, que proíbe mexer
-- no próprio papel). Sai também de authenticated; service_role mantém.
REVOKE EXECUTE ON FUNCTION public.admin_assign_role(uuid, public.app_role) FROM authenticated;

-- Funções de trigger não são chamáveis como RPC, mas ficam fora de PUBLIC também.
REVOKE EXECUTE ON FUNCTION public.tg_expenses_regras() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_reports_audit() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
