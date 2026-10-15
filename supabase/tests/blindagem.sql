-- Testes da blindagem (migrations 20261015120000 e 20261015121000).
--
-- NÃO roda no CI. Rodar num Postgres local com todas as migrations aplicadas,
-- por exemplo `supabase db reset` e depois:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/blindagem.sql
-- Tudo roda numa transação com ROLLBACK no fim: não deixa dado nenhum.
-- Cada bloco imprime "ok - ..." ou aborta com "FALHOU: ...".
--
-- Impersonação: SET ROLE authenticated + request.jwt.claim.sub, como o
-- PostgREST faz. As RPCs SECURITY DEFINER rodam como o dono (postgres).

\set ON_ERROR_STOP 1
BEGIN;

CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;

CREATE FUNCTION t.ok(_cond boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', _msg; END IF;
  RAISE NOTICE 'ok - %', _msg;
END $$;

-- Executa _sql e exige erro cuja mensagem contenha _like (ILIKE).
CREATE FUNCTION t.raises(_sql text, _like text, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || _like || '%' THEN
      RAISE NOTICE 'ok - % (erro: %)', _msg, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FALHOU: % (erro inesperado: %)', _msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % (não deu erro)', _msg;
END $$;

-- Executa _sql e devolve quantas linhas afetou (RLS filtrando = 0).
CREATE FUNCTION t.rows(_sql text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE _sql; GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END $$;

CREATE FUNCTION t.as_user(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', _uid::text, true), set_config('role', 'authenticated', true);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, anon;

-- Datas relativas ao "hoje" de São Paulo, para o teste não envelhecer.
CREATE FUNCTION t.d(_offset int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date - _offset;
$$;
GRANT EXECUTE ON FUNCTION t.d(int) TO authenticated;

-- ---------------------------------------------------------------- seed
INSERT INTO public.organizations (id, name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'O2 teste');
INSERT INTO public.org_domains (org_id, domain) VALUES ('00000000-0000-0000-0000-0000000000a1', 'teste.o2inc.com.br');
INSERT INTO public.expense_policies (org_id, food_daily_limit_cents, cycle_cutoff_day)
VALUES ('00000000-0000-0000-0000-0000000000a1', 3000, 25);
INSERT INTO public.expense_categories (id, org_id, name, kind) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'Alimentação', 'food'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'Transporte', 'transport');
-- O trigger de auth.users cria profile + papel employee pelo domínio.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'ana@teste.o2inc.com.br', '{"full_name":"Ana Souza"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'bia@teste.o2inc.com.br', '{"full_name":"Bia Lima"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'caio@teste.o2inc.com.br', '{"full_name":"Caio Reis"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'gestor@teste.o2inc.com.br', '{"full_name":"Gil Gestor"}'),
  ('00000000-0000-0000-0000-0000000000a8', 'gestor2@teste.o2inc.com.br', '{"full_name":"Gui Gestor"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@teste.o2inc.com.br', '{"full_name":"Adm"}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a9', 'manager'),
  ('00000000-0000-0000-0000-0000000000a8', 'manager'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin')
ON CONFLICT DO NOTHING;

SELECT t.ok((SELECT count(*) FROM public.profiles WHERE org_id = '00000000-0000-0000-0000-0000000000a1') = 6, 'seed: 6 perfis na org');

-- ================================================================ A1 / regras-extra-1
-- Almoço de R$ 60 com teto de R$ 30 entra limitado; PATCH direto não fura o teto.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
CREATE TEMP TABLE r1 AS
SELECT public.create_expense_in_current_report('almoço', 6000, t.d(1), '00000000-0000-0000-0000-0000000000f1') AS j;
SELECT t.ok((SELECT (j->'expense'->>'reimbursable_cents')::int FROM r1) = 3000, 'A1: almoço de 60 limitado a 30 pelo teto');

SELECT t.ok(t.rows(format($q$UPDATE public.expenses SET reimbursable_cents = 6000 WHERE id = %L$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 1, 'A1: PATCH de reimbursable_cents é aceito pela RLS (rascunho próprio)');
SELECT t.ok((SELECT reimbursable_cents FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM r1)) = 3000,
  'A1: ...mas o valor volta para o teto (30)');

SELECT t.raises(format($q$UPDATE public.expenses SET org_id = gen_random_uuid() WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM r1)),
  'empresa', 'A1: trocar org_id da despesa é recusado');
SELECT t.ok(t.rows(format($q$UPDATE public.expenses SET late_decision = 'this_month', is_out_of_policy = true WHERE id = %L$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 1, 'A1: PATCH de late_decision/is_out_of_policy roda...');
SELECT t.ok((SELECT late_decision IS NULL AND NOT is_out_of_policy FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM r1)),
  'A1: ...mas late_decision e is_out_of_policy ficam como estavam');

-- Fluxo legítimo do front: comprovante (lib/receipts.ts) e edição de rascunho (useUpdateExpense).
SELECT t.ok(t.rows(format($q$UPDATE public.expenses SET receipt_path = 'x/y/z/%s/1.jpg', receipt_hash = 'h-a1' WHERE id = %L$q$,
  (SELECT j->'expense'->>'id' FROM r1), (SELECT j->'expense'->>'id' FROM r1))) = 1, 'A1: anexar comprovante continua funcionando');
SELECT t.ok(t.rows(format($q$UPDATE public.expenses SET amount_cents = 2500, description = 'almoço editado' WHERE id = %L$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 1, 'A1: editar rascunho continua funcionando');
SELECT t.ok((SELECT reimbursable_cents FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM r1)) = 2500,
  'A1: editar valor recalcula o reembolsável (25)');

-- ================================================================ A2
SELECT t.raises($q$INSERT INTO public.expenses (org_id, user_id, date, description, amount_cents, status)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', t.d(2), 'injetada', 50000, 'approved')$q$,
  'rascunho', 'A2: INSERT direto com status approved é recusado');
-- Fluxo legítimo de useCreateExpense: insert direto como rascunho, com campos calculados ignorados.
CREATE TEMP TABLE loose AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON loose TO authenticated;
SELECT t.ok(t.rows(format($q$INSERT INTO public.expenses (id, org_id, user_id, date, description, amount_cents, category_id, status, reimbursable_cents, late_decision)
  VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', t.d(3), 'jantar avulso', 4500,
          '00000000-0000-0000-0000-0000000000f1', 'draft', 4500, NULL)$q$, (SELECT id FROM loose))) = 1,
  'A2: INSERT direto em rascunho continua funcionando');
SELECT t.ok((SELECT reimbursable_cents FROM public.expenses WHERE id = (SELECT id FROM loose)) = 3000,
  'A2: reimbursable_cents enviado pelo cliente é ignorado e recalculado (30)');
-- O guard (BEFORE) zera late_decision antes da checagem de RLS; a policy restritiva
-- é a rede de segurança caso o trigger seja removido.
SELECT t.rows($q$INSERT INTO public.expenses (org_id, user_id, date, description, amount_cents, status, late_decision)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', t.d(2), 'decidida sem gestor', 1234, 'draft', 'this_month')$q$);
SELECT t.ok((SELECT late_decision IS NULL FROM public.expenses WHERE description = 'decidida sem gestor'),
  'A2: INSERT direto não grava late_decision');

-- ================================================================ A3 / dinheiro-datas-8
-- Bia cria uma despesa avulsa; Ana tenta anexar ao relatório dela.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
CREATE TEMP TABLE bia AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON bia TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.expenses (id, org_id, user_id, date, description, amount_cents, status)
  VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', t.d(2), 'uber bia', 1990, 'draft')$q$, (SELECT id FROM bia)));
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.raises(format($q$INSERT INTO public.report_items (report_id, expense_id) VALUES (%L, %L)$q$,
  (SELECT j->'report'->>'id' FROM r1), (SELECT id FROM bia)), 'policy', 'A3: anexar despesa de colega ao próprio relatório é recusado');
SELECT t.raises(format($q$INSERT INTO public.report_items (report_id, expense_id) VALUES (gen_random_uuid(), %L)$q$,
  (SELECT j->'expense'->>'id' FROM r1)), 'policy', 'A3: anexar despesa a relatório inexistente é recusado');

-- Relatório manual (AddToReportDialog) e despesa avulsa própria: continua funcionando.
CREATE TEMP TABLE manual AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON manual TO authenticated;
SELECT t.ok(t.rows(format($q$INSERT INTO public.reports (id, org_id, user_id, title, status) VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Viagem', 'draft')$q$,
  (SELECT id FROM manual))) = 1, 'A3: criar relatório manual em rascunho continua funcionando');
SELECT t.raises($q$INSERT INTO public.reports (org_id, user_id, title, status) VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Fake', 'approved')$q$,
  'policy', 'A4: criar relatório direto já aprovado é recusado');
SELECT t.ok(t.rows(format($q$INSERT INTO public.report_items (report_id, expense_id) VALUES (%L, %L)$q$,
  (SELECT id FROM manual), (SELECT id FROM loose))) = 1, 'A3: anexar despesa avulsa própria em rascunho continua funcionando');
SELECT t.raises(format($q$INSERT INTO public.report_items (report_id, expense_id) VALUES (%L, %L)$q$,
  (SELECT j->'report'->>'id' FROM r1), (SELECT id FROM loose)), 'policy', 'A3/dd-8: a mesma despesa em um segundo relatório é recusada');

-- ================================================================ A4 (antes do envio)
SELECT t.raises(format($q$UPDATE public.reports SET due_date = due_date + 30 WHERE id = %L$q$, (SELECT j->'report'->>'id' FROM r1)),
  'prazo', 'A4: dono não muda o prazo do próprio relatório por PATCH');
SELECT t.raises(format($q$UPDATE public.reports SET status = 'submitted' WHERE id = %L$q$, (SELECT j->'report'->>'id' FROM r1)),
  'Situação', 'A4: dono não envia o relatório por PATCH (só pela RPC)');

-- ================================================================ fluxo normal: enviar → revisar → aprovar → pagar
SELECT t.ok((SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM r1)) IS NOT NULL), 'fluxo: submit_report ok');
SELECT t.ok((SELECT status FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM r1)) = 'submitted', 'fluxo: despesa enviada');

-- uso-real-9: aviso ao gestor com nome e valor.
RESET role;
SELECT t.ok((SELECT body FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-0000000000a9'
              AND title = 'Relatório aguardando aprovação' ORDER BY created_at DESC LIMIT 1)
            LIKE 'Ana Souza enviou "Relatório % (R$ 25,00 a reembolsar) e aguarda sua aprovação.',
  'uso-real-9: notificação do gestor diz quem enviou e quanto');

-- A5: comprovante de despesa enviada não pode ser trocado nem apagado pelo dono.
INSERT INTO storage.buckets (id, name) VALUES ('receipts', 'receipts') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('receipts', format('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000e1/%s/%s/1.jpg',
                      (SELECT j->'report'->>'id' FROM r1), (SELECT j->'expense'->>'id' FROM r1)), '00000000-0000-0000-0000-0000000000e1'),
  ('receipts', format('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000e1/unassigned/%s/2.jpg',
                      (SELECT id FROM loose)), '00000000-0000-0000-0000-0000000000e1');
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.ok(t.rows(format($q$DELETE FROM storage.objects WHERE bucket_id = 'receipts' AND name LIKE '%%/%s/1.jpg'$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 0, 'A5: apagar comprovante de despesa enviada afeta 0 linhas');
SELECT t.ok(t.rows(format($q$UPDATE storage.objects SET metadata = '{"trocado":true}' WHERE bucket_id = 'receipts' AND name LIKE '%%/%s/1.jpg'$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 0, 'A5: sobrescrever comprovante de despesa enviada afeta 0 linhas');
SELECT t.ok(t.rows(format($q$UPDATE storage.objects SET metadata = '{"ok":true}' WHERE bucket_id = 'receipts' AND name LIKE '%%/%s/2.jpg'$q$,
  (SELECT id FROM loose))) = 1, 'A5: comprovante de despesa em rascunho continua editável pelo dono');

-- A4: gestor não altera despesa/relatório da org por PATCH.
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.ok(t.rows(format($q$UPDATE public.expenses SET status = 'paid', amount_cents = 99999, user_id = '00000000-0000-0000-0000-0000000000a9' WHERE id = %L$q$,
  (SELECT j->'expense'->>'id' FROM r1))) = 0, 'A4: UPDATE direto do gestor em despesa enviada afeta 0 linhas');
SELECT t.ok(t.rows(format($q$UPDATE public.reports SET status = 'approved' WHERE id = %L$q$,
  (SELECT j->'report'->>'id' FROM r1))) = 0, 'A4: UPDATE direto do gestor em relatório enviado afeta 0 linhas');

-- uso-real-8: gestor 1 reprova item; gestor 2 consegue mudar a revisão.
SELECT t.ok(t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision, comment)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'rejected', 'nota ilegível')$q$,
  (SELECT j->'expense'->>'id' FROM r1), (SELECT j->'report'->>'id' FROM r1))) = 1, 'uso-real-8: gestor 1 reprova o item');

-- uso-real-1: com item reprovado, aprovar o relatório é recusado.
SELECT t.raises(format($q$SELECT public.admin_decide_report(%L, 'approved')$q$, (SELECT j->'report'->>'id' FROM r1)),
  'Reprovar e devolver', 'uso-real-1: aprovar com item reprovado é recusado');

SELECT t.as_user('00000000-0000-0000-0000-0000000000a8');
SELECT t.ok(t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision, comment)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a8', 'approved', NULL)
  ON CONFLICT (expense_id, report_id) DO UPDATE SET decision = EXCLUDED.decision, comment = EXCLUDED.comment, reviewer_id = EXCLUDED.reviewer_id$q$,
  (SELECT j->'expense'->>'id' FROM r1), (SELECT j->'report'->>'id' FROM r1))) = 1, 'uso-real-8: gestor 2 muda a revisão do gestor 1 (upsert)');
SELECT t.raises(format($q$UPDATE public.expense_reviews SET reviewer_id = '00000000-0000-0000-0000-0000000000a9' WHERE report_id = %L$q$,
  (SELECT j->'report'->>'id' FROM r1)), 'policy', 'uso-real-8: não dá para gravar a revisão em nome de outro gestor');
SELECT t.raises(format($q$UPDATE public.expense_reviews SET report_id = %L WHERE report_id = %L$q$,
  (SELECT id FROM manual), (SELECT j->'report'->>'id' FROM r1)), 'policy',
  'uso-real-8: não dá para mover a revisão para relatório fora de aprovação');

-- Aprova e paga pelas RPCs.
SELECT t.ok((SELECT public.admin_decide_report((SELECT (j->'report'->>'id')::uuid FROM r1), 'approved')->>'decision') = 'approved',
  'fluxo: admin_decide_report approved ok (sem item reprovado)');
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT public.mark_report_paid((SELECT (j->'report'->>'id')::uuid FROM r1)) IS NOT NULL), 'fluxo: mark_report_paid ok');
RESET role;
SELECT t.ok((SELECT status = 'paid' AND reimbursable_cents = 2500 FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM r1)),
  'fluxo: despesa paga com o valor do teto (25)');

-- ================================================================ devolução (uso-real-6)
-- Bia: dois itens no relatório do ciclo, um reprovado com motivo.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
CREATE TEMP TABLE b1 AS SELECT public.create_expense_in_current_report('táxi aeroporto', 8000, t.d(2), '00000000-0000-0000-0000-0000000000f2') AS j;
CREATE TEMP TABLE b2 AS SELECT public.create_expense_in_current_report('almoço cliente', 2800, t.d(2), '00000000-0000-0000-0000-0000000000f1') AS j;
GRANT SELECT ON b1, b2 TO authenticated;
SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM b1));
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision, comment)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'rejected', 'sem comprovante')$q$,
  (SELECT j->'expense'->>'id' FROM b1), (SELECT j->'report'->>'id' FROM b1)));
SELECT public.admin_decide_report((SELECT (j->'report'->>'id')::uuid FROM b1), 'rejected', 'Corrigir o táxi');
RESET role;
SELECT t.ok((SELECT status = 'draft' AND last_rejection_comment LIKE 'Corrigir o táxi%Itens reprovados:%táxi aeroporto%sem comprovante%'
               FROM public.reports WHERE id = (SELECT (j->'report'->>'id')::uuid FROM b1)),
  'uso-real-6: devolução leva o motivo por item no comentário');
SELECT t.ok((SELECT count(*) FROM public.report_events WHERE report_id = (SELECT (j->'report'->>'id')::uuid FROM b1)
               AND event_type = 'comment' AND data->>'kind' = 'item_rejected'
               AND data->>'expense_id' = (SELECT j->'expense'->>'id' FROM b1) AND data->>'comment' = 'sem comprovante') = 1,
  'uso-real-6: evento por item reprovado no histórico');
SELECT t.ok((SELECT count(*) FROM public.expense_reviews WHERE report_id = (SELECT (j->'report'->>'id')::uuid FROM b1)) = 0,
  'uso-real-6: revisões da rodada anterior continuam sendo limpas');
-- Gestor que já citou o item no comentário: não repete a lista.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM b1));
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision, comment)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'rejected', 'ainda sem nota')$q$,
  (SELECT j->'expense'->>'id' FROM b1), (SELECT j->'report'->>'id' FROM b1)));
SELECT public.admin_decide_report((SELECT (j->'report'->>'id')::uuid FROM b1), 'rejected', '• táxi aeroporto: ainda sem nota');
RESET role;
SELECT t.ok((SELECT last_rejection_comment = '• táxi aeroporto: ainda sem nota' FROM public.reports WHERE id = (SELECT (j->'report'->>'id')::uuid FROM b1)),
  'uso-real-6: item já citado no comentário não é repetido');
-- Reenvio e aprovação depois da correção.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
SELECT t.ok((SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM b1)) IS NOT NULL), 'devolver: reenvio ok');
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.ok((SELECT public.admin_decide_report((SELECT (j->'report'->>'id')::uuid FROM b1), 'approved')->>'decision') = 'approved',
  'devolver: aprovação depois do reenvio ok (revisões limpas)');

-- ================================================================ despesa fora do prazo
-- Relatório da Bia está aprovado: nova despesa do mesmo ciclo fica pendente.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
CREATE TEMP TABLE late AS SELECT public.create_expense_in_current_report('estacionamento', 1500, t.d(1), '00000000-0000-0000-0000-0000000000f2') AS j;
GRANT SELECT ON late TO authenticated;
SELECT t.ok((SELECT (j->>'late')::boolean FROM late), 'fora do prazo: despesa entra como pendente');
CREATE TEMP TABLE bman AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON bman TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.reports (id, org_id, user_id, title, status) VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', 'Manual', 'draft')$q$, (SELECT id FROM bman)));
SELECT t.raises(format($q$INSERT INTO public.report_items (report_id, expense_id) VALUES (%L, %L)$q$,
  (SELECT id FROM bman), (SELECT j->'expense'->>'id' FROM late)), 'policy', 'A3: pendente de fora do prazo não entra em relatório manual pelo cliente');
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.ok((SELECT public.decide_late_expense((SELECT (j->'expense'->>'id')::uuid FROM late), 'this_month')->>'destino') = 'this_month',
  'fora do prazo: decide_late_expense this_month ok');
RESET role;
SELECT t.ok((SELECT status = 'approved' AND late_decision = 'this_month' FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM late)),
  'fora do prazo: entra aprovada no relatório aprovado');

-- ================================================================ não reembolsável (uso-real-3 / dd-1 / regras-extra-2)
SELECT t.as_user('00000000-0000-0000-0000-0000000000e3');
CREATE TEMP TABLE nr AS SELECT public.create_expense_in_current_report('jantar no cartão da empresa', 5000, t.d(3), '00000000-0000-0000-0000-0000000000f1',
  NULL, NULL, 'corporate_card', 'BRL', false) AS j;
GRANT SELECT ON nr TO authenticated;
CREATE TEMP TABLE nr2 AS SELECT public.create_expense_in_current_report('lanche', 2000, t.d(3), '00000000-0000-0000-0000-0000000000f1') AS j;
GRANT SELECT ON nr2 TO authenticated;
SELECT t.ok((SELECT (j->'expense'->>'reimbursable_cents')::int FROM nr2) = 2000,
  'regras: não reembolsável do mesmo dia não consome o teto (lanche de 20 sai inteiro)');
-- Bia: relatório aprovado tem táxi 80 + almoço 28 + estacionamento 15 = 123 a pagar.
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT (pp->>'a_pagar_cents')::int FROM json_array_elements(public.get_admin_financial_overview()->'por_pessoa') pp
              WHERE pp->>'user_id' = '00000000-0000-0000-0000-0000000000e2') = 12300, 'overview: a pagar da Bia = 123,00');
-- Caio envia o relatório com nr e nr2: aguardando conta só o reembolsável.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e3');
SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM nr));
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT (pp->>'aguardando_aprovacao_cents')::int FROM json_array_elements(public.get_admin_financial_overview()->'por_pessoa') pp
              WHERE pp->>'user_id' = '00000000-0000-0000-0000-0000000000e3') = 2000,
  'overview: não reembolsável conta 0 em aguardando aprovação');

-- ================================================================ D3
RESET role;
SELECT t.ok((SELECT cycle_start FROM public.cycle_bounds(gen_random_uuid(), DATE '2026-10-24')) = DATE '2026-09-25',
  'D3: org sem política usa corte 25 (24/10 ainda é do ciclo que começou em 25/09)');
-- Org nova sem expense_policies: get_or_create_current_report cria a política e usa 25.
INSERT INTO public.organizations (id, name) VALUES ('00000000-0000-0000-0000-0000000000b1', 'Org sem política');
INSERT INTO public.org_domains (org_id, domain) VALUES ('00000000-0000-0000-0000-0000000000b1', 'nova.o2inc.com.br');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000b9', 'dora@nova.o2inc.com.br', '{"full_name":"Dora Nova"}');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.expense_policies WHERE org_id = '00000000-0000-0000-0000-0000000000b1'),
  'D3: org nova começa sem política');
SELECT t.as_user('00000000-0000-0000-0000-0000000000b9');
CREATE TEMP TABLE cur AS SELECT public.get_or_create_current_report() AS j;
RESET role;
SELECT t.ok((SELECT EXTRACT(DAY FROM (j->>'start_date')::date) = 25 AND EXTRACT(DAY FROM (j->>'due_date')::date) = 25 FROM cur),
  'D3: get_or_create_current_report em org sem política usa corte 25');

-- ================================================================ B7
SELECT t.ok(NOT has_function_privilege('anon', 'public.admin_decide_report(uuid,text,text)', 'EXECUTE'), 'B7: anon sem EXECUTE em admin_decide_report');
SELECT t.ok(NOT has_function_privilege('anon', 'public.mark_expenses_paid(uuid[])', 'EXECUTE'), 'B7: anon sem EXECUTE em mark_expenses_paid');
SELECT t.ok(NOT has_function_privilege('anon', 'public.get_admin_financial_overview()', 'EXECUTE'), 'B7: anon sem EXECUTE em get_admin_financial_overview');
SELECT t.ok(has_function_privilege('authenticated', 'public.submit_report(uuid)', 'EXECUTE'), 'B7: authenticated mantém EXECUTE em submit_report');
SELECT t.ok(NOT has_function_privilege('authenticated', 'public.reconcile_notification_deliveries()', 'EXECUTE'), 'C2: reconciliação não é RPC pública');
SELECT t.ok(NOT has_function_privilege('authenticated', 'public.admin_assign_role(uuid,public.app_role)', 'EXECUTE'), 'B7: admin_assign_role (morta) fora de authenticated');

-- ================================================================ C1
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.rows($q$INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('00000000-0000-0000-0000-0000000000e1', 'https://push/1', 'k', 'a')$q$);
SELECT t.ok(t.rows($q$INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('00000000-0000-0000-0000-0000000000e1', 'https://push/1', 'k2', 'a2')
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth$q$) = 1, 'C1: upsert com conflito em push_subscriptions funciona');

-- ================================================================ C2
RESET role;
INSERT INTO public.notifications (id, user_id, org_id, title, emailed_at, email_request_id, pushed_at, push_request_id, email_attempts) VALUES
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'ok', now(), 9001, now(), 9002, 0),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '401', now(), 9003, now(), 9004, 0),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'timeout 3a', now(), 9005, now(), NULL, 2),
  ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'em voo', now(), 9007, now(), NULL, 0);
INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg) VALUES
  (9001, 200, '{"id":"x"}', false, NULL),
  (9002, 200, '{"sent":1}', false, NULL),
  (9003, 401, '{"error":"unauthorized"}', false, NULL),
  (9004, 502, NULL, false, NULL),
  (9005, NULL, NULL, true, 'Timeout of 5000 ms reached');
SELECT t.ok(public.reconcile_notification_deliveries() = 2, 'C2: reconciliação reabre e-mail e push que falharam (2)');
SELECT t.ok((SELECT emailed_at IS NOT NULL AND email_request_id IS NULL AND pushed_at IS NOT NULL AND email_attempts = 0
               FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000c001'), 'C2: 200 fica carimbado');
SELECT t.ok((SELECT emailed_at IS NULL AND pushed_at IS NULL AND email_attempts = 1 AND push_attempts = 1
               FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000c002'), 'C2: 401/502 voltam para a fila');
SELECT t.ok((SELECT emailed_at IS NOT NULL AND email_attempts = 3 FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000c003'),
  'C2: terceira falha desiste (fica carimbada)');
SELECT t.ok((SELECT emailed_at IS NOT NULL AND email_request_id = 9007 FROM public.notifications WHERE id = '00000000-0000-0000-0000-00000000c004'),
  'C2: pedido sem resposta ainda fica em voo');

-- ================================================================ F2
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.ok((SELECT bool_and(public.consume_receipt_validation_quota(3)) FROM generate_series(1, 3)), 'F2: 3 leituras dentro da cota');
SELECT t.ok(NOT public.consume_receipt_validation_quota(3), 'F2: a 4ª leitura com limite 3 é recusada');
SELECT t.ok(public.consume_receipt_validation_quota(), 'F2: limite padrão (60/h) ainda libera');
SELECT t.raises($q$SELECT count(*) FROM public.receipt_validation_usage$q$, 'permission', 'F2: tabela de uso não é legível pelo cliente');

RESET role;
\echo 'blindagem: todos os testes passaram'
ROLLBACK;
