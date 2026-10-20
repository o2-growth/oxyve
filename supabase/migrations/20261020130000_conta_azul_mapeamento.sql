-- Mapeamento inicial Oxy VE → Conta Azul da O2 (lido do plano de contas real em 2026-10-20).
-- Só INSERT ... ON CONFLICT DO NOTHING: não sobrescreve o que um admin ajustar na tela.
-- Nada é criado ou alterado no Conta Azul; só guardamos os IDs dos cadastros que já existem lá.
DO $$
DECLARE _org uuid;
BEGIN
  SELECT id INTO _org FROM public.organizations WHERE name = 'O2 Inc.' LIMIT 1;
  IF _org IS NULL THEN RAISE NOTICE 'Org O2 Inc. não encontrada; nada a fazer.'; RETURN; END IF;

  INSERT INTO public.contaazul_category_map (org_id, expense_category_id, ca_categoria_id, ca_categoria_nome)
  SELECT _org, c.id, v.ca_id, v.ca_nome
    FROM (VALUES
      ('Alimentação – Administrativo', '65e244d8-f94d-4448-80f9-90dbc3afaba2', '6.22 Custo com Alimentação - Administrativo'),
      ('Deslocamento – Administrativo', '0b3d4d74-5290-4fe0-a7ca-82748cbed6b6', '6.23 Custo com Deslocamento - Administrativo'),
      ('Alimentação – CaaS', '8a59c0cd-d3eb-448e-8f90-6d353a641c46', '5.1.3 Custo com Alimentação - CaaS'),
      ('Deslocamento – CaaS', '8c1d978a-a6ad-4c08-b4c4-eba90a8d30dc', '5.1.2 Custo com Deslocamento - CaaS'),
      ('Alimentação – Comercial', 'd76f1920-a5ff-4308-95ac-6f00e795b20c', '9.06 Custo com Alimentação - Comercial'),
      ('Deslocamento – Comercial', '911345d7-7538-431c-ac78-94c915c2b8c1', '9.07 Custo com Deslocamento - Comercial'),
      ('Alimentação – Customer Success', '6a015ed7-8a00-4437-8f02-ad9966e74403', '5.4.3 Custo com Alimentação - Customer Success'),
      ('Deslocamento – Customer Success', '9a688f6e-ca2f-4d63-8386-bcb4b0f20404', '5.4.2 Custo com Deslocamento - Customer Success'),
      ('Alimentação – Education', 'b7d87811-2036-4f7f-9300-f07cd830aca8', '5.3.3 Custo com Alimentação - Education'),
      ('Deslocamento – Education', '41fa6be1-bffe-4c0c-9428-d5f00a608c7a', '5.3.2Custo com Deslocamento - Education'),
      ('Alimentação – Expansão', '982260fb-d3da-4493-a3f2-6e1a24b8c1b5', '5.5.3 Custo com Alimentação - Expansão'),
      ('Deslocamento – Expansão', 'e842166b-e179-4b6f-b457-9708c64a7844', '5.5.2 Custo com Deslocamento - Expansão'),
      ('Alimentação – Marketing', '09fd79b8-7ec0-4a8e-be44-6580eda1ff4f', '8.06 Custo com Alimentação - Marketing'),
      ('Deslocamento – Marketing', 'c6173b13-99fb-49bf-8aeb-613a27d31002', '8.07 Custo com Deslocamento - Marketing'),
      ('Alimentação – SaaS', '0c46b2a8-4b54-44f1-a93d-f5b009aebd86', '5.2.3 Custo com Alimentação - SaaS'),
      ('Deslocamento – SaaS', 'fbc5638c-1889-49bd-b3e7-76cfb7d3e0e4', '5.2.2 Custo com Deslocamento - SaaS'),
      ('Alimentação – Tax', 'e92e6325-6eaa-43f3-8c85-1846258f336e', '5.6.3 Custo com Alimentação - Tax'),
      ('Deslocamento – Tax', '1ad440d6-179e-4961-9eeb-cbb7b9f33676', '5.6.2 Custo com Deslocamento - Tax'),
      ('Viagens e Estadias – Administrativo', '335e0205-b744-4387-96fb-a4f6ad0d2e10', '6.24 Custo com Viagens e Estadias - Administrativo'),
      ('Viagens e Estadias – Comercial', '2e7eb3bd-0bb4-458c-9699-032b2bd22cbc', '9.08 Viagens e Estadias - Comercial'),
      ('Viagens e Estadias – Marketing', '9af41831-9cea-4ac3-815a-77a5ce1dea5c', '8.08 Viagens e Estadias - Marketing'),
      ('Viagens e Estadias – Expansão', 'ab83ab18-341c-4644-bf68-6e42614b69f3', '5.5.4 Custo com Viagens e Estadias - Expansão'),
      ('Viagens e Estadias – Tax', 'a0873498-d193-46bc-903d-455e07479c66', '5.6.4 Custo com Viagens e Estadias - Tax'),
      ('Viagens e Estadias – CaaS', '9b36b5fc-3513-4e23-9a53-3b0e68dedcaf', '5.1.4 Custo com Viagens e Estadias - CaaS'),
      ('Viagens e Estadias – Customer Success', '768d1eb6-fde1-40d9-873c-0e7892e6ba36', '5.4.4 Custo com Viagens e Estadias - Customer Success'),
      ('Viagens e Estadias – Education', '0364748d-10ba-4d83-b670-4c7421377b29', '5.3.4 Custo com Viagens e Estadias - Education'),
      ('Viagens e Estadias – SaaS', 'c6868fee-d9fd-479b-8258-3a94fc6af587', '5.2.4 Custo com Viagens e Estadias - SaaS'),
      ('Viagens e Estadias – Tech', '3fe1534e-464c-4272-88ae-010097091fbb', '6.34 Custo com Viagens e Estadias - Tech'),
      ('Alimentação – Tech', '74810f05-d208-4aa9-a2f1-ad70e8da4808', '6.33 Custo com Alimentação - Tech'),
      ('Deslocamento – Tech', 'dac1053e-9ea4-42ff-960a-2cead85fcbcd', '6.32 Custo com Deslocamento - Tech'),
      ('Eventos Comerciais', 'd7a720c9-872f-48ef-a94c-e44778516a73', '9.02 Eventos Comerciais'),
      ('Eventos Internos', '7f77acd6-47f8-4a02-bf5f-de530a783f73', '6.18 Eventos Internos'),
      ('Materiais de Uso e Consumo', '33c35e1f-eb71-4596-9335-98ffdbad834a', '6.07 Materiais de Uso e Consumo'),
      ('Software e Tecnologia', '765622af-725e-4fd9-b50c-927003ecb3d8', '14.03 Software e Tecnologia')
    ) AS v(nome, ca_id, ca_nome)
    JOIN public.expense_categories c ON c.org_id = _org AND c.name = v.nome
  ON CONFLICT DO NOTHING;

  INSERT INTO public.contaazul_sector_map (org_id, sector, ca_centro_custo_id, ca_centro_custo_nome)
  SELECT _org, v.sector, v.ca_id, v.ca_nome
    FROM (VALUES
      ('Administrativo', '004d071c-d522-11f0-a550-db3cbd27f28e', 'Administrativo (007)'),
      ('CaaS', 'b664ffb0-d521-11f0-ac11-17ba87403777', 'Caas (001)'),
      ('Comercial', '14c6a5b6-89c4-11f1-a845-c7cef22c1534', 'Comercial (011)'),
      ('Customer Success', '36d433ee-879e-11f1-9177-1b6c39a769ad', 'CS (010)'),
      ('Education', 'dcf162ae-d521-11f0-a4f3-ebf8170f07b6', 'Education (002)'),
      ('Expansão', 'f38c42fe-d521-11f0-a0bc-83f14853005c', 'Expansão (005)'),
      ('Marketing', 'f8a44624-d521-11f0-a0f3-db27a397714b', 'Growth (006)'),
      ('SaaS', 'bafb5560-d521-11f0-9739-bb5ffc8d363d', 'Saas (003)'),
      ('Tax', '12e6a77c-cb98-11f0-84cf-1391bad08461', 'Tax (004)'),
      ('Tech', 'dcb58944-879d-11f1-9e47-8fe605e97929', 'Tech (009)')
    ) AS v(sector, ca_id, ca_nome)
  ON CONFLICT DO NOTHING;

  -- Conta de saída dos reembolsos e vencimento no dia 25. Integração nasce desligada (ativo=false).
  INSERT INTO public.contaazul_connection (org_id, conta_financeira_id, conta_financeira_nome, dia_vencimento, ativo)
  VALUES (_org, 'b7d2a60f-2a83-4b7b-827d-3207276793e6', 'Conta O2 Matriz', 25, false)
  ON CONFLICT DO NOTHING;
END $$;

-- Credenciais do app Conta Azul guardadas no Vault (contaazul_client_id,
-- contaazul_client_secret, contaazul_redirect_uri). As edge functions leem por
-- aqui quando as env CONTAAZUL_* não existem. Só service_role executa.
CREATE OR REPLACE FUNCTION public.contaazul_app_credentials()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
  SELECT json_build_object(
    'client_id', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'contaazul_client_id' LIMIT 1),
    'client_secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'contaazul_client_secret' LIMIT 1),
    'redirect_uri', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'contaazul_redirect_uri' LIMIT 1)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.contaazul_app_credentials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contaazul_app_credentials() TO service_role;
