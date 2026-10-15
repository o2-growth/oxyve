-- Testes das decisões de negócio da rodada 4 (migration 20261015130000).
--
-- NÃO roda no CI. Rodar num Postgres local com todas as migrations aplicadas,
-- por exemplo `supabase db reset` e depois:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/decisoes.sql
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
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'ana@teste.o2inc.com.br', '{"full_name":"Ana Souza"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'bia@teste.o2inc.com.br', '{"full_name":"Bia Lima"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'gestor@teste.o2inc.com.br', '{"full_name":"Gil Gestor"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@teste.o2inc.com.br', '{"full_name":"Adm"}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a9', 'manager'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin')
ON CONFLICT DO NOTHING;
-- Dados de pagamento da Ana, para o painel (decisão 4).
UPDATE public.profiles SET pix_key = 'ana@pix.test', pix_key_type = 'email', bank_name = 'Banco T',
       bank_branch = '0001', bank_account = '12345-6'
 WHERE id = '00000000-0000-0000-0000-0000000000e1';

-- ================================================================ decisão 3: duplicidade
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
CREATE TEMP TABLE d1 AS SELECT public.create_expense_in_current_report('táxi cliente', 2500, t.d(2), '00000000-0000-0000-0000-0000000000f2') AS j;
CREATE TEMP TABLE d2 AS SELECT public.create_expense_in_current_report('táxi volta', 2500, t.d(2), '00000000-0000-0000-0000-0000000000f2') AS j;
GRANT SELECT ON d1, d2 TO authenticated;
SELECT t.ok((SELECT (j->>'possible_duplicate')::boolean = false FROM d1),
  'dup: primeira despesa não é marcada');
SELECT t.ok((SELECT j->>'possible_duplicate_of' IS NULL AND j->'expense'->>'possible_duplicate_of' IS NULL FROM d1),
  'dup: primeira despesa sem possible_duplicate_of');
SELECT t.ok((SELECT (j->>'possible_duplicate')::boolean FROM d2), 'dup: mesma data+valor+categoria é salva (não bloqueia) e volta possible_duplicate=true');
SELECT t.ok((SELECT j->>'possible_duplicate_of' = (SELECT j->'expense'->>'id' FROM d1)
               AND j->'expense'->>'possible_duplicate_of' = (SELECT j->'expense'->>'id' FROM d1) FROM d2),
  'dup: possible_duplicate_of aponta para a primeira (no topo e na linha)');
SELECT t.ok((SELECT j->'report'->>'id' IS NOT NULL AND NOT (j->>'late')::boolean FROM d2), 'dup: entra no relatório do ciclo como qualquer despesa');

-- Outra categoria ou outro valor não é duplicidade.
CREATE TEMP TABLE d3 AS SELECT public.create_expense_in_current_report('almoço', 2500, t.d(2), '00000000-0000-0000-0000-0000000000f1') AS j;
GRANT SELECT ON d3 TO authenticated;
SELECT t.ok((SELECT NOT (j->>'possible_duplicate')::boolean FROM d3), 'dup: mesma data e valor em outra categoria não marca');

-- Edição que desfaz a coincidência limpa; a que refaz marca de novo.
SELECT t.rows(format($q$UPDATE public.expenses SET amount_cents = 2600 WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM d2)));
SELECT t.ok((SELECT possible_duplicate_of IS NULL FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM d2)),
  'dup: mudar o valor limpa possible_duplicate_of');
SELECT t.rows(format($q$UPDATE public.expenses SET amount_cents = 2500 WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM d2)));
SELECT t.ok((SELECT possible_duplicate_of = (SELECT (j->'expense'->>'id')::uuid FROM d1) FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM d2)),
  'dup: voltar ao valor igual marca de novo');
-- PATCH direto não apaga o alerta (o guard repõe o calculado).
SELECT t.rows(format($q$UPDATE public.expenses SET possible_duplicate_of = NULL, description = 'táxi volta (editado)' WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM d2)));
SELECT t.ok((SELECT possible_duplicate_of IS NOT NULL AND description = 'táxi volta (editado)' FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM d2)),
  'dup: PATCH de possible_duplicate_of é ignorado, o resto da edição vale');
-- INSERT direto (useCreateExpense) também é marcado pelo banco.
CREATE TEMP TABLE d4 AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON d4 TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.expenses (id, org_id, user_id, date, description, amount_cents, category_id, status, possible_duplicate_of)
  VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', t.d(2), 'táxi avulso', 2500,
          '00000000-0000-0000-0000-0000000000f2', 'draft', NULL)$q$, (SELECT id FROM d4)));
-- No teste tudo tem o mesmo created_at (uma transação), então vale qualquer uma das duas.
SELECT t.ok((SELECT possible_duplicate_of IN ((SELECT (j->'expense'->>'id')::uuid FROM d1), (SELECT (j->'expense'->>'id')::uuid FROM d2))
               FROM public.expenses WHERE id = (SELECT id FROM d4)),
  'dup: INSERT direto em rascunho também é marcado');
-- Apagar a original (rascunho avulso) não trava: o FK zera e o banco recalcula.
CREATE TEMP TABLE d5 AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON d5 TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.expenses (id, org_id, user_id, date, description, amount_cents, category_id, status)
  VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', t.d(4), 'estacionamento', 1800,
          '00000000-0000-0000-0000-0000000000f2', 'draft')$q$, (SELECT id FROM d5)));
CREATE TEMP TABLE d6 AS SELECT public.create_expense_in_current_report('estacionamento 2', 1800, t.d(4), '00000000-0000-0000-0000-0000000000f2') AS j;
GRANT SELECT ON d6 TO authenticated;
SELECT t.ok((SELECT (j->>'possible_duplicate_of')::uuid = (SELECT id FROM d5) FROM d6), 'dup: estacionamento 2 aponta para o avulso');
SELECT t.ok(t.rows(format($q$DELETE FROM public.expenses WHERE id = %L$q$, (SELECT id FROM d5))) = 1, 'dup: apagar a original funciona');
SELECT t.ok((SELECT possible_duplicate_of IS NULL FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM d6)),
  'dup: a cópia fica sem alerta depois que a original some');

-- Comprovante repetido continua bloqueado.
SELECT t.rows(format($q$UPDATE public.expenses SET receipt_hash = 'hash-1' WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM d1)));
SELECT t.raises(format($q$UPDATE public.expenses SET receipt_hash = 'hash-1' WHERE id = %L$q$, (SELECT j->'expense'->>'id' FROM d3)),
  'comprovante já foi lançado', 'hash: anexar o mesmo comprovante em outra despesa é bloqueado');
SELECT t.raises($q$SELECT public.create_expense_in_current_report('outra', 999, t.d(1), '00000000-0000-0000-0000-0000000000f2',
  NULL, NULL, 'personal_card', 'BRL', true, NULL, NULL, false, NULL, 1, 'hash-1')$q$,
  'comprovante já foi lançado', 'hash: lançar pela RPC com comprovante repetido é bloqueado');

-- Vários dias: cada dia traz o aviso e o topo soma.
CREATE TEMP TABLE m1 AS SELECT public.create_expense_multiday('diária', 1500, t.d(6), t.d(5), '00000000-0000-0000-0000-0000000000f2') AS j;
CREATE TEMP TABLE m2 AS SELECT public.create_expense_multiday('diária', 1500, t.d(6), t.d(5), '00000000-0000-0000-0000-0000000000f2') AS j;
GRANT SELECT ON m1, m2 TO authenticated;
SELECT t.ok((SELECT (j->>'count')::int = 2 AND (j->>'possible_duplicates')::int = 0 FROM m1), 'multiday: primeira leva sem duplicidade');
SELECT t.ok((SELECT (j->>'count')::int = 2 AND (j->>'possible_duplicates')::int = 2
               AND (j->'expenses'->0->>'possible_duplicate')::boolean FROM m2), 'multiday: repetir o período salva e marca os 2 dias');

-- Não reembolsável no mesmo relatório (para o pagamento lá embaixo).
CREATE TEMP TABLE nr AS SELECT public.create_expense_in_current_report('jantar no cartão', 7000, t.d(2), '00000000-0000-0000-0000-0000000000f1',
  NULL, NULL, 'corporate_card', 'BRL', false) AS j;
GRANT SELECT ON nr TO authenticated;

-- ================================================================ decisão 2: revisão item a item
-- Revisão em rascunho (antes do envio) não entra: senão a aprovação passaria sem revisão.
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.raises(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'approved')$q$,
  (SELECT j->'expense'->>'id' FROM d1), (SELECT j->'report'->>'id' FROM d1)), 'policy', 'revisão: não grava revisão em relatório ainda em rascunho');

SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.ok((SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM d1)) IS NOT NULL), 'fluxo: envio antecipado ok');
CREATE TEMP TABLE rep AS SELECT (j->'report'->>'id')::uuid AS id FROM d1;
GRANT SELECT ON rep TO authenticated;

SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
-- O gestor enxerga o alerta na revisão.
SELECT t.ok((SELECT count(*) FROM public.expenses e JOIN public.report_items ri ON ri.expense_id = e.id
              WHERE ri.report_id = (SELECT id FROM rep) AND e.possible_duplicate_of IS NOT NULL) >= 1,
  'dup: gestor vê possible_duplicate_of nas despesas do relatório');
SELECT t.raises(format($q$SELECT public.admin_decide_report(%L, 'approved')$q$, (SELECT id FROM rep)),
  'Revise todos os itens', 'aprovar sem revisar nenhum item falha');
SELECT t.raises(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'approved')$q$,
  (SELECT id FROM d4), (SELECT id FROM rep)), 'policy', 'revisão: não grava revisão de despesa que não é item do relatório');
-- Revisa todos menos um.
SELECT t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision)
  SELECT ri.expense_id, ri.report_id, '00000000-0000-0000-0000-0000000000a9', 'approved'
    FROM public.report_items ri WHERE ri.report_id = %L AND ri.expense_id <> %L$q$,
  (SELECT id FROM rep), (SELECT j->'expense'->>'id' FROM d2)));
SELECT t.raises(format($q$SELECT public.admin_decide_report(%L, 'approved')$q$, (SELECT id FROM rep)),
  'Revise todos os itens', 'aprovar com um item sem revisão falha');
-- Último item reprovado.
SELECT t.rows(format($q$INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision, comment)
  VALUES (%L, %L, '00000000-0000-0000-0000-0000000000a9', 'rejected', 'parece duplicado')$q$,
  (SELECT j->'expense'->>'id' FROM d2), (SELECT id FROM rep)));
SELECT t.raises(format($q$SELECT public.admin_decide_report(%L, 'approved')$q$, (SELECT id FROM rep)),
  'Reprovar e devolver', 'aprovar com item reprovado falha');
-- Gestor muda de ideia: aprova o item, e o relatório passa.
SELECT t.rows(format($q$UPDATE public.expense_reviews SET decision = 'approved', comment = NULL WHERE expense_id = %L AND report_id = %L$q$,
  (SELECT j->'expense'->>'id' FROM d2), (SELECT id FROM rep)));
SELECT t.ok((SELECT public.admin_decide_report((SELECT id FROM rep), 'approved')->>'decision') = 'approved',
  'aprovar com todos os itens aprovados passa');
RESET role;
SELECT t.ok((SELECT bool_and(e.status = 'approved') FROM public.expenses e JOIN public.report_items ri ON ri.expense_id = e.id
              WHERE ri.report_id = (SELECT id FROM rep)), 'fluxo: itens aprovados');

-- Relatório sem itens não aprova.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
CREATE TEMP TABLE vazio AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON vazio TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.reports (id, org_id, user_id, title, status) VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', 'Vazio', 'draft')$q$,
  (SELECT id FROM vazio)));
RESET role;
-- Põe direto em aprovação (só no teste) para provar a trava da RPC, mesmo que o envio barre antes.
UPDATE public.reports SET status = 'submitted', submitted_at = now() WHERE id = (SELECT id FROM vazio);
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.raises(format($q$SELECT public.admin_decide_report(%L, 'approved')$q$, (SELECT id FROM vazio)),
  'sem despesas', 'relatório sem itens não aprova');

-- ================================================================ decisão 4: dados de pagamento
SELECT t.ok((SELECT pp->>'pix_key' = 'ana@pix.test' AND pp->>'pix_key_type' = 'email' AND pp->>'bank_account' = '12345-6'
               FROM json_array_elements(public.get_admin_financial_overview()->'por_pessoa') pp
              WHERE pp->>'user_id' = '00000000-0000-0000-0000-0000000000e1'), 'painel: por_pessoa traz PIX e conta de quem recebe');
SELECT t.ok((SELECT (pp->>'a_pagar_cents')::int = (
               SELECT SUM(e.reimbursable_cents) FROM public.expenses e JOIN public.report_items ri ON ri.expense_id = e.id
                WHERE ri.report_id = (SELECT id FROM rep) AND e.is_reimbursable)
               FROM json_array_elements(public.get_admin_financial_overview()->'por_pessoa') pp
              WHERE pp->>'user_id' = '00000000-0000-0000-0000-0000000000e1'), 'painel: a pagar ignora a não reembolsável');

-- ================================================================ decisão 1: só admin paga
CREATE TEMP TABLE pagar AS
SELECT array_agg(e.id) AS ids FROM public.expenses e JOIN public.report_items ri ON ri.expense_id = e.id
 WHERE ri.report_id = (SELECT id FROM rep) AND e.is_reimbursable;
GRANT SELECT ON pagar TO authenticated;
SELECT t.raises($q$SELECT public.mark_expenses_paid((SELECT ids FROM pagar))$q$, 'Acesso restrito', 'gestor não paga por pessoa');
SELECT t.raises(format($q$SELECT public.mark_report_paid(%L)$q$, (SELECT id FROM rep)), 'administradores', 'gestor não paga por relatório');
RESET role;
SELECT t.ok((SELECT bool_and(e.status = 'approved') FROM public.expenses e WHERE e.id = ANY((SELECT ids FROM pagar)::uuid[])), 'gestor: nada foi pago');

SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT (public.mark_expenses_paid((SELECT ids FROM pagar))->>'paid')::int = (SELECT cardinality(ids) FROM pagar)),
  'admin paga por pessoa');
RESET role;
SELECT t.ok((SELECT status = 'paid' FROM public.expenses WHERE id = (SELECT (j->'expense'->>'id')::uuid FROM nr)),
  'pagamento: não reembolsável aprovada fecha junto (valor 0)');
SELECT t.ok((SELECT status = 'paid' FROM public.reports WHERE id = (SELECT id FROM rep)), 'pagamento: relatório fica pago');

RESET role;
\echo 'decisoes: todos os testes passaram'
ROLLBACK;
