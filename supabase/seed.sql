-- Bootstrap da primeira organização.
--
-- O app não tem tela para criar a org inicial: handle_new_user faz auto-join
-- pelo domínio em org_domains e bootstrap_user exige um convite em org_invites.
-- As duas portas pressupõem uma org que já exista, então ela nasce aqui.
-- Idempotente: pode rodar de novo sem duplicar.

do $$
declare _org uuid;
begin
  select id into _org from public.organizations where name = 'O2 Inc.' limit 1;

  if _org is null then
    insert into public.organizations (name) values ('O2 Inc.') returning id into _org;
  end if;

  -- Auto-join: quem entra com e-mail @o2inc.com.br cai nesta org como employee.
  insert into public.org_domains (org_id, domain)
  select _org, 'o2inc.com.br'
  where not exists (
    select 1 from public.org_domains where lower(domain) = 'o2inc.com.br'
  );

  insert into public.expense_categories (org_id, name, kind)
  select _org, v.name, v.kind
    from (values
      ('Alimentação', 'food'),
      ('Transporte',  'transport'),
      ('Hospedagem',  'other'),
      ('Outros',      'other')
    ) as v(name, kind)
   where not exists (
     select 1 from public.expense_categories c
      where c.org_id = _org and c.name = v.name
   );

  -- Política com os defaults do schema; ajustável depois em Configurações.
  insert into public.expense_policies (org_id)
  select _org
  where not exists (
    select 1 from public.expense_policies where org_id = _org
  );
end $$;
