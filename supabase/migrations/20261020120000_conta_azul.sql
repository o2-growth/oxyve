-- Integração com o Conta Azul: relatório aprovado vira conta a pagar no ERP,
-- pagamento sincroniza nos dois sentidos (baixa lá quando paga aqui; paga aqui
-- quando quitada lá). Ver docs/conta-azul.md.
--
-- Só aditiva: CREATE TABLE/INDEX, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, CREATE POLICY/TRIGGER e GRANT/REVOKE. Nenhuma linha existente é
-- alterada: relatórios já aprovados só entram no envio pelo botão "Enviar" da
-- tela (contaazul_reenviar), nunca por backfill.
--
-- O HTTP com o Conta Azul fica todo na edge function contaazul-sync; o banco só
-- guarda estado e marca o que está pendente.

-- ---------------------------------------------------------------------------
-- Conexão (1 por org): tokens e configuração
-- ---------------------------------------------------------------------------
-- Tokens ficam em colunas que só o service_role lê: RLS ligada, sem policy, e
-- sem GRANT para anon/authenticated. A tela lê a configuração por
-- contaazul_get_config(), que nunca devolve token.
CREATE TABLE IF NOT EXISTS public.contaazul_connection (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- Trava da renovação: o refresh token do Conta Azul roda a cada uso; duas
  -- renovações ao mesmo tempo invalidariam a conexão.
  refresh_lock_until timestamptz,
  id_empresa text,
  empresa_nome text,
  connected_at timestamptz,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conta_financeira_id text,
  conta_financeira_nome text,
  dia_vencimento integer NOT NULL DEFAULT 25 CHECK (dia_vencimento BETWEEN 1 AND 28),
  ativo boolean NOT NULL DEFAULT false,
  -- Conexão revogada/expirada: o sync para até alguém reconectar.
  precisa_reconectar boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_poll_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contaazul_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contaazul_connection FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contaazul_connection TO service_role;

-- state do OAuth (CSRF): gerado no start, consumido uma vez no callback.
CREATE TABLE IF NOT EXISTS public.contaazul_oauth_state (
  state text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
ALTER TABLE public.contaazul_oauth_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contaazul_oauth_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contaazul_oauth_state TO service_role;

-- ---------------------------------------------------------------------------
-- De-para
-- ---------------------------------------------------------------------------
-- Categoria do Oxy VE → categoria financeira do Conta Azul. Uma linha por
-- categoria, ou por tipo (food/transport/other) como fallback.
CREATE TABLE IF NOT EXISTS public.contaazul_category_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  kind text CHECK (kind IN ('food', 'transport', 'other')),
  ca_categoria_id text NOT NULL CHECK (btrim(ca_categoria_id) <> ''),
  ca_categoria_nome text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contaazul_category_map_alvo CHECK ((expense_category_id IS NULL) <> (kind IS NULL)),
  CONSTRAINT contaazul_category_map_categoria_uniq UNIQUE (org_id, expense_category_id),
  CONSTRAINT contaazul_category_map_kind_uniq UNIQUE (org_id, kind)
);
ALTER TABLE public.contaazul_category_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contaazul_category_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contaazul_category_map TO authenticated;
GRANT ALL ON public.contaazul_category_map TO service_role;
-- O FK de expense_category_id precisa achar as linhas no ON DELETE.
CREATE INDEX IF NOT EXISTS contaazul_category_map_categoria_idx
  ON public.contaazul_category_map (expense_category_id) WHERE expense_category_id IS NOT NULL;

-- Setor (expense_categories.sector; NULL = 'Geral') → centro de custo.
CREATE TABLE IF NOT EXISTS public.contaazul_sector_map (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sector text NOT NULL CHECK (btrim(sector) <> ''),
  ca_centro_custo_id text NOT NULL CHECK (btrim(ca_centro_custo_id) <> ''),
  ca_centro_custo_nome text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, sector)
);
ALTER TABLE public.contaazul_sector_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contaazul_sector_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contaazul_sector_map TO authenticated;
GRANT ALL ON public.contaazul_sector_map TO service_role;

-- Leitura só para admin da própria org; escrita só pelas RPCs abaixo.
CREATE POLICY "Conta Azul: admin le de-para de categoria"
  ON public.contaazul_category_map FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND org_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Conta Azul: admin le de-para de setor"
  ON public.contaazul_sector_map FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND org_id = public.get_user_org_id(auth.uid()));

-- ---------------------------------------------------------------------------
-- Estado do envio por relatório e pessoa do funcionário
-- ---------------------------------------------------------------------------
-- ca_status: pendente → enviando → enviado → pago_sync, ou erro.
-- ca_attempts só cresce: a partir da 2ª tentativa o sync procura a conta no
-- Conta Azul antes de criar, para nunca haver duas.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_status text
  CHECK (ca_status IN ('pendente', 'enviando', 'enviado', 'erro', 'pago_sync'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_conta_id text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_parcela_id text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_error text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_sent_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_claimed_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_checked_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_approved_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_vencimento date;
-- Reserva da baixa: duas execuções do sync (cron + "Sincronizar agora") não
-- podem lançar a baixa da mesma parcela duas vezes.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ca_baixa_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS reports_ca_status_idx
  ON public.reports (org_id, ca_status) WHERE ca_status IS NOT NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ca_pessoa_id text;

-- O dono edita o próprio perfil por PATCH; o id da pessoa no Conta Azul é do
-- sistema (apontá-lo para outra pessoa desviaria o reembolso). Trocar o CPF
-- desfaz o vínculo, para o próximo envio procurar a pessoa certa.
CREATE OR REPLACE FUNCTION public.tg_profiles_contaazul_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.cpf_cnpj IS DISTINCT FROM OLD.cpf_cnpj THEN
    NEW.ca_pessoa_id := NULL;
  ELSE
    NEW.ca_pessoa_id := OLD.ca_pessoa_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_contaazul_guard() FROM PUBLIC, anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'profiles_01_contaazul_guard' AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER profiles_01_contaazul_guard
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_contaazul_guard();
  END IF;
END $$;

-- Campos ca_* em reports são do sistema: o cliente não grava (nem no INSERT do
-- rascunho, nem no PATCH). INVOKER de propósito: current_user diz quem chamou.
CREATE OR REPLACE FUNCTION public.tg_reports_contaazul_guard()
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
    NEW.ca_status := NULL; NEW.ca_conta_id := NULL; NEW.ca_parcela_id := NULL;
    NEW.ca_error := NULL; NEW.ca_sent_at := NULL; NEW.ca_attempts := 0;
    NEW.ca_claimed_at := NULL; NEW.ca_checked_at := NULL; NEW.ca_approved_at := NULL;
    NEW.ca_vencimento := NULL; NEW.ca_baixa_claimed_at := NULL;
  ELSE
    NEW.ca_status := OLD.ca_status; NEW.ca_conta_id := OLD.ca_conta_id;
    NEW.ca_parcela_id := OLD.ca_parcela_id; NEW.ca_error := OLD.ca_error;
    NEW.ca_sent_at := OLD.ca_sent_at; NEW.ca_attempts := OLD.ca_attempts;
    NEW.ca_claimed_at := OLD.ca_claimed_at; NEW.ca_checked_at := OLD.ca_checked_at;
    NEW.ca_approved_at := OLD.ca_approved_at; NEW.ca_vencimento := OLD.ca_vencimento;
    NEW.ca_baixa_claimed_at := OLD.ca_baixa_claimed_at;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tg_reports_contaazul_guard() FROM PUBLIC, anon;

-- Ao virar approved: guarda a data da aprovação (base do vencimento) e, com a
-- integração ativa, marca para envio. Sem HTTP aqui: quem envia é o sync.
-- DEFINER para ler contaazul_connection, que o autenticado não enxerga.
CREATE OR REPLACE FUNCTION public.tg_reports_contaazul_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.ca_approved_at := now();
    -- Já tem conta no Conta Azul (ou estado em andamento): não mexe.
    IF NEW.ca_status IS NULL AND NEW.ca_parcela_id IS NULL AND EXISTS (
      SELECT 1 FROM public.contaazul_connection c
       WHERE c.org_id = NEW.org_id AND c.ativo AND c.refresh_token IS NOT NULL
    ) THEN
      NEW.ca_status := 'pendente';
      NEW.ca_error := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tg_reports_contaazul_pendente() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'reports_01_contaazul_guard' AND tgrelid = 'public.reports'::regclass
  ) THEN
    CREATE TRIGGER reports_01_contaazul_guard
      BEFORE INSERT OR UPDATE ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.tg_reports_contaazul_guard();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'reports_02_contaazul_pendente' AND tgrelid = 'public.reports'::regclass
  ) THEN
    CREATE TRIGGER reports_02_contaazul_pendente
      BEFORE UPDATE OF status ON public.reports
      FOR EACH ROW EXECUTE FUNCTION public.tg_reports_contaazul_pendente();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RPCs da tela (só admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contaazul_admin_org()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _org uuid;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _uid;
  IF _org IS NULL THEN RAISE EXCEPTION 'Usuário sem organização.'; END IF;
  RETURN _org;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.contaazul_admin_org() FROM PUBLIC, anon, authenticated;

-- Configuração sem segredo nenhum.
CREATE OR REPLACE FUNCTION public.contaazul_get_config()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org(); _c public.contaazul_connection;
BEGIN
  SELECT * INTO _c FROM public.contaazul_connection WHERE org_id = _org;
  RETURN json_build_object(
    'conectado', _c.refresh_token IS NOT NULL,
    'precisa_reconectar', COALESCE(_c.precisa_reconectar, false),
    'ativo', COALESCE(_c.ativo, false),
    'empresa_nome', _c.empresa_nome,
    'connected_at', _c.connected_at,
    'conta_financeira_id', _c.conta_financeira_id,
    'conta_financeira_nome', _c.conta_financeira_nome,
    'dia_vencimento', COALESCE(_c.dia_vencimento, 25),
    'last_sync_at', _c.last_sync_at,
    'last_poll_at', _c.last_poll_at,
    'last_error', _c.last_error);
END;
$function$;

CREATE OR REPLACE FUNCTION public.contaazul_save_config(
  p_conta_financeira_id text, p_conta_financeira_nome text,
  p_dia_vencimento integer, p_ativo boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org(); _c public.contaazul_connection;
BEGIN
  IF p_dia_vencimento IS NULL OR p_dia_vencimento < 1 OR p_dia_vencimento > 28 THEN
    RAISE EXCEPTION 'Dia de vencimento deve ser de 1 a 28.';
  END IF;
  SELECT * INTO _c FROM public.contaazul_connection WHERE org_id = _org;
  IF p_ativo AND (_c.refresh_token IS NULL OR _c.precisa_reconectar) THEN
    RAISE EXCEPTION 'Conecte o Conta Azul antes de ativar o envio.';
  END IF;
  IF p_ativo AND NULLIF(btrim(COALESCE(p_conta_financeira_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta financeira antes de ativar o envio.';
  END IF;
  INSERT INTO public.contaazul_connection (org_id, conta_financeira_id, conta_financeira_nome, dia_vencimento, ativo)
  VALUES (_org, NULLIF(btrim(p_conta_financeira_id), ''), NULLIF(btrim(p_conta_financeira_nome), ''), p_dia_vencimento, COALESCE(p_ativo, false))
  ON CONFLICT (org_id) DO UPDATE
     SET conta_financeira_id = EXCLUDED.conta_financeira_id,
         conta_financeira_nome = EXCLUDED.conta_financeira_nome,
         dia_vencimento = EXCLUDED.dia_vencimento,
         ativo = EXCLUDED.ativo,
         updated_at = now();
  RETURN public.contaazul_get_config();
END;
$function$;

-- Categoria (p_expense_category_id) OU tipo (p_kind). ca vazio remove o de-para.
CREATE OR REPLACE FUNCTION public.contaazul_set_category_map(
  p_expense_category_id uuid, p_kind text, p_ca_categoria_id text, p_ca_categoria_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org(); _uid uuid := auth.uid();
BEGIN
  IF (p_expense_category_id IS NULL) = (p_kind IS NULL) THEN
    RAISE EXCEPTION 'Informe a categoria ou o tipo, não os dois.';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('food', 'transport', 'other') THEN
    RAISE EXCEPTION 'Tipo inválido.';
  END IF;
  IF p_expense_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = p_expense_category_id AND org_id = _org
  ) THEN
    RAISE EXCEPTION 'Categoria não encontrada.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_ca_categoria_id, '')), '') IS NULL THEN
    DELETE FROM public.contaazul_category_map
     WHERE org_id = _org
       AND expense_category_id IS NOT DISTINCT FROM p_expense_category_id
       AND kind IS NOT DISTINCT FROM p_kind;
    RETURN;
  END IF;

  IF p_expense_category_id IS NOT NULL THEN
    INSERT INTO public.contaazul_category_map (org_id, expense_category_id, ca_categoria_id, ca_categoria_nome, updated_by)
    VALUES (_org, p_expense_category_id, btrim(p_ca_categoria_id), p_ca_categoria_nome, _uid)
    ON CONFLICT (org_id, expense_category_id) DO UPDATE
       SET ca_categoria_id = EXCLUDED.ca_categoria_id, ca_categoria_nome = EXCLUDED.ca_categoria_nome,
           updated_by = EXCLUDED.updated_by, updated_at = now();
  ELSE
    INSERT INTO public.contaazul_category_map (org_id, kind, ca_categoria_id, ca_categoria_nome, updated_by)
    VALUES (_org, p_kind, btrim(p_ca_categoria_id), p_ca_categoria_nome, _uid)
    ON CONFLICT (org_id, kind) DO UPDATE
       SET ca_categoria_id = EXCLUDED.ca_categoria_id, ca_categoria_nome = EXCLUDED.ca_categoria_nome,
           updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.contaazul_set_sector_map(
  p_sector text, p_ca_centro_custo_id text, p_ca_centro_custo_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org(); _sector text := COALESCE(NULLIF(btrim(p_sector), ''), 'Geral');
BEGIN
  IF NULLIF(btrim(COALESCE(p_ca_centro_custo_id, '')), '') IS NULL THEN
    DELETE FROM public.contaazul_sector_map WHERE org_id = _org AND sector = _sector;
    RETURN;
  END IF;
  INSERT INTO public.contaazul_sector_map (org_id, sector, ca_centro_custo_id, ca_centro_custo_nome, updated_by)
  VALUES (_org, _sector, btrim(p_ca_centro_custo_id), p_ca_centro_custo_nome, auth.uid())
  ON CONFLICT (org_id, sector) DO UPDATE
     SET ca_centro_custo_id = EXCLUDED.ca_centro_custo_id, ca_centro_custo_nome = EXCLUDED.ca_centro_custo_nome,
         updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$function$;

-- Relatórios aprovados/pagos com o estado do envio, para a tela.
CREATE OR REPLACE FUNCTION public.contaazul_list_reports(p_limit integer DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(x ORDER BY x.ordem DESC), '[]'::json) FROM (
      SELECT r.id, r.title, r.status::text AS status, r.user_id, p.full_name,
             r.ca_status, r.ca_error, r.ca_sent_at, r.ca_attempts, r.ca_vencimento,
             r.ca_parcela_id IS NOT NULL AS tem_conta,
             COALESCE((
               SELECT SUM(COALESCE(e.reimbursable_cents, e.amount_cents))
                 FROM public.report_items ri JOIN public.expenses e ON e.id = ri.expense_id
                WHERE ri.report_id = r.id AND e.is_reimbursable AND e.status IN ('approved', 'paid')
             ), 0)::bigint AS total_cents,
             COALESCE(r.ca_approved_at, r.updated_at) AS ordem
        FROM public.reports r
        LEFT JOIN public.profiles p ON p.id = r.user_id
       WHERE r.org_id = _org
         AND (r.ca_status IS NOT NULL OR r.status = 'approved')
       ORDER BY COALESCE(r.ca_approved_at, r.updated_at) DESC
       LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
    ) x
  );
END;
$function$;

-- Enviar (nunca enviado) ou reenviar (erro). Com conta já criada lá, volta para
-- 'enviado' (o sync tenta a baixa de novo) em vez de criar outra.
CREATE OR REPLACE FUNCTION public.contaazul_reenviar(p_report_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.contaazul_admin_org(); _r public.reports;
BEGIN
  SELECT * INTO _r FROM public.reports WHERE id = p_report_id AND org_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relatório não encontrado.'; END IF;
  IF _r.status NOT IN ('approved', 'paid') THEN
    RAISE EXCEPTION 'Só relatório aprovado ou pago vai para o Conta Azul.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contaazul_connection c
                  WHERE c.org_id = _org AND c.ativo AND c.refresh_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Integração com o Conta Azul não está ativa.';
  END IF;
  IF _r.ca_status = 'enviando' THEN RAISE EXCEPTION 'Envio em andamento. Aguarde alguns minutos.'; END IF;
  IF _r.ca_status IN ('enviado', 'pago_sync') THEN RAISE EXCEPTION 'Relatório já está no Conta Azul.'; END IF;
  IF _r.ca_status = 'pendente' THEN RAISE EXCEPTION 'Relatório já está na fila de envio.'; END IF;

  UPDATE public.reports
     SET ca_status = CASE WHEN ca_parcela_id IS NOT NULL THEN 'enviado' ELSE 'pendente' END,
         ca_error = NULL,
         ca_approved_at = COALESCE(ca_approved_at, (
           SELECT max(ra.decided_at) FROM public.report_approvals ra
            WHERE ra.report_id = p_report_id AND ra.decision = 'approved'), now())
   WHERE id = p_report_id
  RETURNING * INTO _r;
  RETURN json_build_object('id', _r.id, 'ca_status', _r.ca_status);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.contaazul_get_config() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contaazul_save_config(text, text, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contaazul_set_category_map(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contaazul_set_sector_map(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contaazul_list_reports(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contaazul_reenviar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contaazul_get_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_save_config(text, text, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_set_category_map(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_set_sector_map(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_list_reports(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_reenviar(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funções do sistema (só service_role, usadas pela edge contaazul-sync)
-- ---------------------------------------------------------------------------
-- Reserva até p_limit relatórios para envio. 'enviando' parado há mais de 10
-- min (timeout, função derrubada) volta para a fila; como ca_attempts > 0, o
-- sync procura a conta lá antes de criar outra.
CREATE OR REPLACE FUNCTION public.contaazul_claim_pendentes(p_org uuid, p_limit integer DEFAULT 10)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.reports r
     SET ca_status = 'enviando', ca_attempts = r.ca_attempts + 1, ca_claimed_at = now()
   WHERE r.id IN (
     SELECT r2.id FROM public.reports r2
      WHERE r2.org_id = p_org
        AND r2.status IN ('approved', 'paid')
        AND r2.ca_parcela_id IS NULL
        AND (r2.ca_status = 'pendente'
             OR (r2.ca_status = 'enviando' AND r2.ca_claimed_at < now() - interval '10 minutes'))
      ORDER BY r2.ca_approved_at NULLS LAST, r2.id
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
      FOR UPDATE SKIP LOCKED)
  RETURNING r.id;
END;
$function$;

-- Tudo o que o sync precisa para montar a conta a pagar, numa chamada só.
CREATE OR REPLACE FUNCTION public.contaazul_report_data(p_report_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'report', json_build_object(
      'id', r.id, 'org_id', r.org_id, 'user_id', r.user_id, 'title', r.title,
      'status', r.status::text, 'start_date', r.start_date, 'end_date', r.end_date,
      'approved_at', COALESCE(r.ca_approved_at, (
        SELECT max(ra.decided_at) FROM public.report_approvals ra
         WHERE ra.report_id = r.id AND ra.decision = 'approved')),
      'ca_status', r.ca_status, 'ca_attempts', r.ca_attempts, 'ca_vencimento', r.ca_vencimento,
      'ca_conta_id', r.ca_conta_id, 'ca_parcela_id', r.ca_parcela_id),
    'employee', (SELECT json_build_object('id', p.id, 'full_name', p.full_name, 'email', u.email,
                                          'cpf_cnpj', p.cpf_cnpj, 'ca_pessoa_id', p.ca_pessoa_id)
                   FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.id = r.user_id),
    'expenses', COALESCE((
      SELECT json_agg(json_build_object(
               'id', e.id, 'description', e.description, 'status', e.status::text,
               'is_reimbursable', e.is_reimbursable,
               'reimbursable_cents', COALESCE(e.reimbursable_cents, e.amount_cents),
               'category_id', e.category_id, 'category_name', ec.name,
               'kind', ec.kind, 'sector', ec.sector) ORDER BY e.date, e.id)
        FROM public.report_items ri
        JOIN public.expenses e ON e.id = ri.expense_id
        LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
       WHERE ri.report_id = r.id), '[]'::json),
    'category_map', COALESCE((
      SELECT json_agg(json_build_object('expense_category_id', m.expense_category_id, 'kind', m.kind,
                                        'ca_categoria_id', m.ca_categoria_id))
        FROM public.contaazul_category_map m WHERE m.org_id = r.org_id), '[]'::json),
    'sector_map', COALESCE((
      SELECT json_agg(json_build_object('sector', s.sector, 'ca_centro_custo_id', s.ca_centro_custo_id))
        FROM public.contaazul_sector_map s WHERE s.org_id = r.org_id), '[]'::json),
    'config', (SELECT json_build_object('conta_financeira_id', c.conta_financeira_id,
                                        'dia_vencimento', c.dia_vencimento)
                 FROM public.contaazul_connection c WHERE c.org_id = r.org_id))
  FROM public.reports r WHERE r.id = p_report_id;
$function$;

-- Trava da renovação do token (o refresh token roda a cada uso). Devolve true
-- para quem pegou a trava; os outros esperam e releem o token.
CREATE OR REPLACE FUNCTION public.contaazul_try_lock_refresh(p_org uuid, p_seconds integer DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  UPDATE public.contaazul_connection
     SET refresh_lock_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_seconds, 30), 5), 120))
   WHERE org_id = p_org AND (refresh_lock_until IS NULL OR refresh_lock_until < now());
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END;
$function$;

-- Reserva a baixa de um relatório pago: só uma execução por vez, e a próxima
-- tentativa só depois de 10 min (tempo para uma baixa sem resposta aparecer na
-- parcela, que o sync consulta antes de lançar).
CREATE OR REPLACE FUNCTION public.contaazul_claim_baixa(p_report_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  UPDATE public.reports
     SET ca_baixa_claimed_at = now()
   WHERE id = p_report_id AND status = 'paid' AND ca_status = 'enviado' AND ca_parcela_id IS NOT NULL
     AND (ca_baixa_claimed_at IS NULL OR ca_baixa_claimed_at < now() - interval '10 minutes');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END;
$function$;

-- Quitação vista no Conta Azul: mesmo efeito do mark_report_paid (relatório e
-- despesas aprovadas viram 'paid'), sem exigir admin porque quem paga é o
-- sistema. O gatilho de auditoria grava o evento 'paid'; aqui ele ganha actor
-- nulo e a origem, para o histórico dizer de onde veio.
CREATE OR REPLACE FUNCTION public.contaazul_marcar_pago(p_report_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _r public.reports;
BEGIN
  SELECT * INTO _r FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'approved' THEN
    RETURN false;
  END IF;

  UPDATE public.reports
     SET status = 'paid', ca_status = 'pago_sync', ca_error = NULL, ca_checked_at = now(), updated_at = now()
   WHERE id = p_report_id;
  UPDATE public.expenses e SET status = 'paid', updated_at = now()
    FROM public.report_items ri
   WHERE ri.report_id = p_report_id AND ri.expense_id = e.id AND e.status = 'approved';

  -- Quem pagou foi o sistema: actor nulo mesmo se a sessão tiver um sub.
  UPDATE public.report_events
     SET actor_id = NULL, data = data || jsonb_build_object('origem', 'conta_azul')
   WHERE report_id = p_report_id AND event_type = 'paid' AND created_at = now();
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.contaazul_claim_pendentes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contaazul_report_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contaazul_try_lock_refresh(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contaazul_marcar_pago(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contaazul_claim_baixa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contaazul_claim_baixa(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_claim_pendentes(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_report_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_try_lock_refresh(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.contaazul_marcar_pago(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron: chama a edge contaazul-sync a cada 5 min, só se houver o que fazer
-- ---------------------------------------------------------------------------
-- Mesmo padrão dos dispatchers de notificação: URL e chave pelo app_setting
-- (GUC ou Vault), x-dispatch-token para a edge reconhecer o cron. Sem conexão
-- ativa ou sem trabalho, não faz chamada nenhuma.
CREATE OR REPLACE FUNCTION public.dispatch_contaazul_sync()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  _supabase_url text; _service_key text; _dispatch_tok text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contaazul_connection c
     WHERE c.ativo AND c.refresh_token IS NOT NULL AND NOT c.precisa_reconectar
       AND EXISTS (
         SELECT 1 FROM public.reports r
          WHERE r.org_id = c.org_id
            AND (r.ca_status = 'pendente'
                 OR (r.ca_status = 'enviando' AND r.ca_claimed_at < now() - interval '10 minutes')
                 OR (r.ca_status = 'enviado' AND r.status = 'paid')
                 OR (r.ca_status = 'enviado' AND (c.last_poll_at IS NULL OR c.last_poll_at < now() - interval '15 minutes'))))
  ) THEN
    RETURN 0;
  END IF;

  IF to_regnamespace('net') IS NULL THEN
    RETURN 0;
  END IF;

  BEGIN
    _supabase_url := public.app_setting('app.supabase_url');
    _service_key  := public.app_setting('app.service_role_key');
    _dispatch_tok := public.app_setting('app.dispatch_token');
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  IF COALESCE(_supabase_url, '') = '' OR COALESCE(_service_key, '') = '' THEN
    RETURN 0;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/contaazul-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'x-dispatch-token', coalesce(_dispatch_tok, '')),
    body := jsonb_build_object('action', 'cron'));
  RETURN 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_contaazul_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_contaazul_sync() TO service_role;

DO $$
BEGIN
  PERFORM cron.schedule('contaazul-sync', '*/5 * * * *', 'SELECT public.dispatch_contaazul_sync()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível, contaazul-sync não agendado: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
