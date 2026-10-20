-- Testes da integração com o Conta Azul (migration 20261020120000).
--
-- NÃO roda no CI. Rodar num Postgres local com todas as migrations aplicadas,
-- por exemplo `supabase db reset` e depois:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conta_azul.sql
-- Tudo roda numa transação com ROLLBACK no fim: não deixa dado nenhum.
-- Cada bloco imprime "ok - ..." ou aborta com "FALHOU: ...".
--
-- Cobre: trigger de 'pendente' na aprovação, RLS (funcionário/gestor/admin não
-- leem tokens), guarda dos campos ca_* contra PATCH, idempotência do estado
-- (reserva única, reabertura de 'enviando' parado, reenvio), quitação vinda do
-- Conta Azul, trava da renovação e o dispatcher do cron.

\set ON_ERROR_STOP 1
BEGIN;

CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon, service_role;

CREATE FUNCTION t.ok(_cond boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', _msg; END IF;
  RAISE NOTICE 'ok - %', _msg;
END $$;

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

CREATE FUNCTION t.rows(_sql text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE _sql; GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END $$;

CREATE FUNCTION t.as_user(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', _uid::text, true), set_config('role', 'authenticated', true);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, anon, service_role;

CREATE FUNCTION t.d(_offset int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date - _offset;
$$;
GRANT EXECUTE ON FUNCTION t.d(int) TO authenticated;

-- Aprova um relatório enviado como o gestor: revisa todos os itens e decide.
CREATE FUNCTION t.aprovar(_report uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM t.as_user('00000000-0000-0000-0000-0000000000a9');
  INSERT INTO public.expense_reviews (expense_id, report_id, reviewer_id, decision)
  SELECT ri.expense_id, ri.report_id, '00000000-0000-0000-0000-0000000000a9', 'approved'
    FROM public.report_items ri WHERE ri.report_id = _report;
  PERFORM public.admin_decide_report(_report, 'approved');
  RESET role;
END $$;

-- ---------------------------------------------------------------- seed
INSERT INTO public.organizations (id, name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'O2 teste');
INSERT INTO public.org_domains (org_id, domain) VALUES ('00000000-0000-0000-0000-0000000000a1', 'teste.o2inc.com.br');
INSERT INTO public.expense_policies (org_id, food_daily_limit_cents, cycle_cutoff_day)
VALUES ('00000000-0000-0000-0000-0000000000a1', 3000, 25);
INSERT INTO public.expense_categories (id, org_id, name, kind, sector) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'Alimentação', 'food', 'Comercial'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'Transporte', 'transport', NULL);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'ana@teste.o2inc.com.br', '{"full_name":"Ana Souza"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'bia@teste.o2inc.com.br', '{"full_name":"Bia Lima"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'gestor@teste.o2inc.com.br', '{"full_name":"Gil Gestor"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@teste.o2inc.com.br', '{"full_name":"Adm"}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a9', 'manager'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin')
ON CONFLICT DO NOTHING;

SELECT t.ok((SELECT count(*) = 1 FROM cron.job WHERE jobname = 'contaazul-sync' AND schedule = '*/5 * * * *'),
  'cron: contaazul-sync agendado a cada 5 min');

-- Relatórios da Bia e da Ana, enviados.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e2');
CREATE TEMP TABLE bia AS SELECT public.create_expense_in_current_report('táxi', 4000, t.d(1), '00000000-0000-0000-0000-0000000000f2') AS j;
GRANT SELECT ON bia TO authenticated;
SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM bia));
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
CREATE TEMP TABLE ana AS SELECT public.create_expense_in_current_report('almoço', 2500, t.d(1), '00000000-0000-0000-0000-0000000000f1') AS j;
CREATE TEMP TABLE ana2 AS SELECT public.create_expense_in_current_report('jantar no cartão', 7000, t.d(1), '00000000-0000-0000-0000-0000000000f1',
  NULL, NULL, 'corporate_card', 'BRL', false) AS j;
GRANT SELECT ON ana, ana2 TO authenticated;
SELECT public.submit_report((SELECT (j->'report'->>'id')::uuid FROM ana));
RESET role;
CREATE TEMP TABLE rep AS
SELECT (SELECT (j->'report'->>'id')::uuid FROM ana) AS ana, (SELECT (j->'report'->>'id')::uuid FROM bia) AS bia;
GRANT SELECT ON rep TO authenticated, service_role;

-- ================================================================ trigger de pendente
-- Sem integração ativa: aprovar não marca nada (só guarda a data da aprovação).
SELECT t.aprovar((SELECT bia FROM rep));
SELECT t.ok((SELECT status = 'approved' AND ca_status IS NULL AND ca_approved_at IS NOT NULL FROM public.reports WHERE id = (SELECT bia FROM rep)),
  'pendente: sem conexão, aprovado fica sem ca_status (mas com ca_approved_at)');

-- Conexão criada pelo callback (service_role) mas ainda inativa: também não marca.
INSERT INTO public.contaazul_connection (org_id, access_token, refresh_token, token_expires_at, id_empresa, empresa_nome, ativo)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'ACCESS-SECRETO', 'REFRESH-SECRETO', now() + interval '1 hour', 'emp-1', 'O2 Inc', false);

-- Admin ativa pelo RPC (exige conta financeira).
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.raises($q$SELECT public.contaazul_save_config(NULL, NULL, 25, true)$q$, 'conta financeira', 'config: ativar sem conta financeira falha');
SELECT t.raises($q$SELECT public.contaazul_save_config('cf-1', 'Itaú', 31, false)$q$, '1 a 28', 'config: dia 31 é recusado');
SELECT t.ok((SELECT (public.contaazul_save_config('cf-1', 'Itaú', 25, true)->>'ativo')::boolean), 'config: admin ativa com conta financeira');
RESET role;

SELECT t.aprovar((SELECT ana FROM rep));
SELECT t.ok((SELECT ca_status = 'pendente' AND ca_attempts = 0 FROM public.reports WHERE id = (SELECT ana FROM rep)),
  'pendente: com integração ativa, aprovar marca ca_status=pendente');
SELECT t.ok((SELECT count(*) = 0 FROM net.http_request_queue), 'pendente: trigger não faz HTTP');

-- ================================================================ RLS e grants
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.raises($q$SELECT access_token FROM public.contaazul_connection$q$, 'permission denied', 'rls: funcionário não lê tokens');
SELECT t.raises($q$SELECT public.contaazul_get_config()$q$, 'Acesso restrito', 'rls: funcionário não lê a configuração');
SELECT t.raises($q$SELECT public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10)$q$, 'permission denied', 'rls: funcionário não reserva envio');
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.raises($q$SELECT refresh_token FROM public.contaazul_connection$q$, 'permission denied', 'rls: gestor não lê tokens');
SELECT t.raises($q$SELECT public.contaazul_get_config()$q$, 'Acesso restrito', 'rls: gestor não lê a configuração');
SELECT t.raises($q$SELECT public.contaazul_set_sector_map('Comercial', 'cc-1', 'Comercial')$q$, 'Acesso restrito', 'rls: gestor não mexe no de-para');
SELECT t.raises(format($q$SELECT public.contaazul_reenviar(%L)$q$, (SELECT ana FROM rep)), 'Acesso restrito', 'rls: gestor não reenvia');
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.raises($q$SELECT * FROM public.contaazul_connection$q$, 'permission denied', 'rls: nem o admin lê a tabela de tokens');
SELECT t.raises($q$SELECT * FROM public.contaazul_oauth_state$q$, 'permission denied', 'rls: state do OAuth só no service_role');
SELECT t.raises(format($q$SELECT public.contaazul_marcar_pago(%L)$q$, (SELECT ana FROM rep)), 'permission denied', 'rls: admin não chama a função de quitação do sistema');
SELECT t.ok((SELECT (c->>'conectado')::boolean AND c->>'empresa_nome' = 'O2 Inc' AND c::text NOT LIKE '%SECRETO%'
               FROM (SELECT public.contaazul_get_config() AS c) x),
  'rls: admin lê a configuração sem token nenhum');

-- De-para: escrita só pelo RPC, leitura do admin.
SELECT public.contaazul_set_category_map('00000000-0000-0000-0000-0000000000f1', NULL, 'ca-alim', 'Alimentação');
SELECT public.contaazul_set_category_map(NULL, 'transport', 'ca-transp', 'Transporte');
SELECT public.contaazul_set_category_map('00000000-0000-0000-0000-0000000000f1', NULL, 'ca-alim-2', 'Refeições');
SELECT public.contaazul_set_sector_map('Comercial', 'cc-com', 'Comercial');
SELECT public.contaazul_set_sector_map(NULL, 'cc-geral', 'Geral');
SELECT t.ok((SELECT count(*) = 2 FROM public.contaazul_category_map), 'de-para: admin lê (upsert não duplica)');
SELECT t.ok((SELECT ca_categoria_id = 'ca-alim-2' FROM public.contaazul_category_map WHERE expense_category_id = '00000000-0000-0000-0000-0000000000f1'),
  'de-para: segunda gravação atualiza');
SELECT t.ok((SELECT count(*) = 2 FROM public.contaazul_sector_map WHERE sector IN ('Comercial', 'Geral')), 'de-para: setor nulo vira Geral');
SELECT t.raises($q$SELECT public.contaazul_set_category_map('00000000-0000-0000-0000-0000000000f1', 'food', 'x', 'x')$q$, 'não os dois', 'de-para: categoria e tipo juntos são recusados');
SELECT t.raises($q$INSERT INTO public.contaazul_category_map (org_id, kind, ca_categoria_id) VALUES ('00000000-0000-0000-0000-0000000000a1', 'other', 'x')$q$,
  'permission denied', 'de-para: INSERT direto é recusado');
SELECT public.contaazul_set_category_map(NULL, 'transport', '', NULL);
SELECT t.ok((SELECT count(*) = 1 FROM public.contaazul_category_map), 'de-para: vazio remove');
SELECT public.contaazul_set_category_map(NULL, 'transport', 'ca-transp', 'Transporte');
SELECT t.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT t.ok((SELECT count(*) = 0 FROM public.contaazul_category_map), 'de-para: gestor não enxerga');
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT json_array_length(public.contaazul_list_reports(50)) = 2), 'tela: lista os dois relatórios aprovados');
SELECT t.ok((SELECT (x->>'total_cents')::int = 2500 AND x->>'ca_status' = 'pendente'
               FROM json_array_elements(public.contaazul_list_reports(50)) x WHERE x->>'id' = (SELECT ana::text FROM rep)),
  'tela: total do relatório só com o reembolsável');
RESET role;

-- ================================================================ guarda dos campos ca_*
-- Dono do rascunho não grava estado de envio nem o id da pessoa no Conta Azul.
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
CREATE TEMP TABLE rasc AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON rasc TO authenticated;
SELECT t.rows(format($q$INSERT INTO public.reports (id, org_id, user_id, title, status, ca_status, ca_parcela_id)
  VALUES (%L, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'Avulso', 'draft', 'enviado', 'forjada')$q$,
  (SELECT id FROM rasc)));
SELECT t.ok((SELECT ca_status IS NULL AND ca_parcela_id IS NULL FROM public.reports WHERE id = (SELECT id FROM rasc)),
  'guarda: INSERT do cliente zera ca_*');
SELECT t.rows(format($q$UPDATE public.reports SET ca_status = 'pago_sync', ca_attempts = 99, title = 'Avulso 2' WHERE id = %L$q$, (SELECT id FROM rasc)));
SELECT t.ok((SELECT ca_status IS NULL AND ca_attempts = 0 AND title = 'Avulso 2' FROM public.reports WHERE id = (SELECT id FROM rasc)),
  'guarda: PATCH do cliente ignora ca_*, o resto vale');
RESET role;
UPDATE public.profiles SET ca_pessoa_id = 'pessoa-ana', cpf_cnpj = '12345678909' WHERE id = '00000000-0000-0000-0000-0000000000e1';
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.rows($q$UPDATE public.profiles SET ca_pessoa_id = 'pessoa-de-outro', full_name = 'Ana S.' WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$);
RESET role;
SELECT t.ok((SELECT ca_pessoa_id = 'pessoa-ana' AND full_name = 'Ana S.' FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000e1'),
  'guarda: funcionário não troca o próprio ca_pessoa_id');
SELECT t.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT t.rows($q$UPDATE public.profiles SET cpf_cnpj = '98765432100' WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$);
RESET role;
SELECT t.ok((SELECT ca_pessoa_id IS NULL FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000e1'),
  'guarda: trocar o CPF desfaz o vínculo com a pessoa do Conta Azul');

-- ================================================================ idempotência do estado
SET ROLE service_role;
CREATE TEMP TABLE claim1 AS SELECT public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10) AS id;
SELECT t.ok((SELECT array_agg(id) = ARRAY[(SELECT ana FROM rep)] FROM claim1), 'estado: reserva devolve o pendente');
SELECT t.ok((SELECT ca_status = 'enviando' AND ca_attempts = 1 AND ca_claimed_at IS NOT NULL FROM public.reports WHERE id = (SELECT ana FROM rep)),
  'estado: reservado vira enviando, tentativa 1');
SELECT t.ok((SELECT count(*) = 0 FROM public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10)),
  'estado: segunda reserva não pega o mesmo (nada de envio em dobro)');
SELECT t.ok((SELECT (d->'report'->>'ca_attempts')::int = 1 AND json_array_length(d->'expenses') = 2
                AND d->'config'->>'conta_financeira_id' = 'cf-1' AND d->'employee'->>'cpf_cnpj' = '98765432100'
                AND d->'report'->>'approved_at' IS NOT NULL AND json_array_length(d->'category_map') = 2
               FROM (SELECT public.contaazul_report_data((SELECT ana FROM rep)) AS d) x),
  'estado: report_data traz relatório, despesas, de-para e config');
RESET role;

SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.raises(format($q$SELECT public.contaazul_reenviar(%L)$q$, (SELECT ana FROM rep)), 'em andamento', 'estado: não reenvia enquanto está enviando');
RESET role;

-- Função caiu no meio (sem resposta): 'enviando' parado há 10+ min volta, com a tentativa 2.
UPDATE public.reports SET ca_claimed_at = now() - interval '11 minutes' WHERE id = (SELECT ana FROM rep);
SET ROLE service_role;
SELECT t.ok((SELECT count(*) = 1 FROM public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10)),
  'estado: enviando parado é reaberto');
SELECT t.ok((SELECT ca_attempts = 2 FROM public.reports WHERE id = (SELECT ana FROM rep)),
  'estado: tentativa 2 (o sync procura no Conta Azul antes de criar)');
-- Erro definitivo, como o sync grava.
UPDATE public.reports SET ca_status = 'erro', ca_error = 'Categoria X sem correspondente no Conta Azul.'
 WHERE id = (SELECT ana FROM rep) AND ca_status = 'enviando';
RESET role;

SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.ok((SELECT public.contaazul_reenviar((SELECT ana FROM rep))->>'ca_status' = 'pendente'), 'estado: reenviar sem conta lá volta para pendente');
SELECT t.ok((SELECT ca_error IS NULL AND ca_attempts = 2 FROM public.reports WHERE id = (SELECT ana FROM rep)),
  'estado: reenviar limpa o erro e mantém a contagem (a próxima confere antes de criar)');
SELECT t.raises(format($q$SELECT public.contaazul_reenviar(%L)$q$, (SELECT ana FROM rep)), 'na fila', 'estado: reenviar duas vezes não duplica');
SELECT t.raises(format($q$SELECT public.contaazul_reenviar(%L)$q$, (SELECT id FROM rasc)), 'aprovado ou pago', 'estado: rascunho não vai para o Conta Azul');
-- Relatório aprovado antes de ativar: entra pelo botão Enviar.
SELECT t.ok((SELECT public.contaazul_reenviar((SELECT bia FROM rep))->>'ca_status' = 'pendente'), 'estado: aprovado antes da ativação entra pelo Enviar');
RESET role;

-- Envio deu certo.
SET ROLE service_role;
SELECT public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10);
UPDATE public.reports SET ca_status = 'enviado', ca_parcela_id = 'parc-ana', ca_conta_id = 'ev-ana', ca_sent_at = now()
 WHERE id = (SELECT ana FROM rep);
UPDATE public.reports SET ca_status = 'erro', ca_parcela_id = 'parc-bia', ca_error = 'Parcela cancelada'
 WHERE id = (SELECT bia FROM rep);
SELECT t.ok((SELECT count(*) = 0 FROM public.contaazul_claim_pendentes('00000000-0000-0000-0000-0000000000a1', 10)),
  'estado: enviado não é reservado de novo');
RESET role;
SELECT t.as_user('00000000-0000-0000-0000-0000000000ad');
SELECT t.raises(format($q$SELECT public.contaazul_reenviar(%L)$q$, (SELECT ana FROM rep)), 'já está no Conta Azul', 'estado: enviado não reenvia');
SELECT t.ok((SELECT public.contaazul_reenviar((SELECT bia FROM rep))->>'ca_status' = 'enviado'),
  'estado: erro com conta já criada volta para enviado (não cria outra)');
RESET role;

-- ================================================================ cron
SELECT set_config('app.supabase_url', 'https://proj.supabase.co', true), set_config('app.service_role_key', 'svc', true);
SELECT t.ok(public.dispatch_contaazul_sync() = 1, 'cron: com trabalho (enviado sem polling recente) dispara a edge');
SELECT t.ok((SELECT url = 'https://proj.supabase.co/functions/v1/contaazul-sync' AND body->>'action' = 'cron'
                AND headers->>'Authorization' = 'Bearer svc' FROM net.http_request_queue ORDER BY id DESC LIMIT 1),
  'cron: chama contaazul-sync com action=cron e a service key');
UPDATE public.contaazul_connection SET last_poll_at = now();
UPDATE public.reports SET ca_status = 'pago_sync' WHERE id = (SELECT bia FROM rep);
SELECT t.ok(public.dispatch_contaazul_sync() = 0, 'cron: sem pendente e com polling recente não chama nada');
UPDATE public.contaazul_connection SET last_poll_at = now() - interval '20 minutes', ativo = false;
SELECT t.ok(public.dispatch_contaazul_sync() = 0, 'cron: integração inativa não chama nada');
UPDATE public.contaazul_connection SET ativo = true;

-- ================================================================ quitação no Conta Azul
SET ROLE service_role;
SELECT t.ok(public.contaazul_marcar_pago((SELECT ana FROM rep)), 'quitação: relatório aprovado vira pago');
RESET role;
SELECT t.ok((SELECT status = 'paid' AND ca_status = 'pago_sync' FROM public.reports WHERE id = (SELECT ana FROM rep)),
  'quitação: relatório pago e sincronizado');
SELECT t.ok((SELECT bool_and(e.status = 'paid') FROM public.expenses e JOIN public.report_items ri ON ri.expense_id = e.id
              WHERE ri.report_id = (SELECT ana FROM rep)), 'quitação: despesas aprovadas viram pagas');
SELECT t.ok((SELECT count(*) = 1 FROM public.report_events
              WHERE report_id = (SELECT ana FROM rep) AND event_type = 'paid' AND actor_id IS NULL AND data->>'origem' = 'conta_azul'),
  'quitação: evento paid com actor nulo e origem conta_azul');
SELECT t.ok((SELECT count(*) = 1 FROM public.notifications
              WHERE user_id = '00000000-0000-0000-0000-0000000000e1' AND title = 'Relatório pago'),
  'quitação: funcionário é notificado como no pagamento manual');
SET ROLE service_role;
SELECT t.ok(NOT public.contaazul_marcar_pago((SELECT ana FROM rep)), 'quitação: segunda vez não faz nada');
RESET role;

-- ================================================================ trava da renovação
SET ROLE service_role;
SELECT t.ok(public.contaazul_try_lock_refresh('00000000-0000-0000-0000-0000000000a1', 30), 'trava: primeira execução pega');
SELECT t.ok(NOT public.contaazul_try_lock_refresh('00000000-0000-0000-0000-0000000000a1', 30), 'trava: segunda execução espera');
UPDATE public.contaazul_connection SET refresh_lock_until = NULL;
SELECT t.ok(public.contaazul_try_lock_refresh('00000000-0000-0000-0000-0000000000a1', 30), 'trava: solta, pega de novo');
RESET role;

RESET role;
\echo 'conta_azul: todos os testes passaram'
ROLLBACK;
