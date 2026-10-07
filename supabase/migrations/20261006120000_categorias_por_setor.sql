-- Categorias de despesa por setor, como eram no VExpenses e no banco antigo.
--
-- O banco do Lovable Cloud (kulwornnpimjsbmexphd) tinha as categorias no padrão
-- "Tipo – Setor" (Alimentação – Comercial, Deslocamento – Administrativo…), e a
-- migration 20260725170000 extraía o setor desse nome. Na migração para o
-- Supabase próprio (24/09) só o schema veio; o seed.sql criou quatro categorias
-- genéricas, e o setor ficou nulo em todas — o painel Gestão passou a mostrar
-- tudo em "Geral".
--
-- Os nomes exatos das 38 categorias antigas não sobreviveram ao desligamento do
-- banco. Esta migration recria a parte que importa para a política: alimentação
-- (teto diário) e deslocamento (km), uma de cada por setor. Hospedagem e Outros
-- seguem gerais. As genéricas Alimentação e Transporte são desativadas, não
-- apagadas: sem setor, elas furariam o agrupamento do painel.
--
-- Idempotente: rodar de novo não duplica nem reativa nada que um admin desligou.

BEGIN;

DO $$
DECLARE
  _org uuid;
BEGIN
  SELECT id INTO _org FROM public.organizations WHERE name = 'O2 Inc.' LIMIT 1;
  IF _org IS NULL THEN
    RAISE NOTICE 'Org O2 Inc. não encontrada; nada a fazer.';
    RETURN;
  END IF;

  INSERT INTO public.expense_categories (org_id, name, kind, sector)
  SELECT _org, t.tipo || ' – ' || s.setor, t.kind, s.setor
    FROM (VALUES ('Alimentação', 'food'), ('Deslocamento', 'transport')) AS t(tipo, kind)
   CROSS JOIN (VALUES
     ('Administrativo'), ('Comercial'), ('Marketing'), ('Expansão'), ('Tax'),
     ('CaaS'), ('SaaS'), ('Customer Success'), ('Education')
   ) AS s(setor)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.expense_categories c
      WHERE c.org_id = _org AND c.name = t.tipo || ' – ' || s.setor
   );

  -- Genéricas sem setor: só desativa se nenhuma despesa as usa.
  UPDATE public.expense_categories c
     SET is_active = false
   WHERE c.org_id = _org
     AND c.name IN ('Alimentação', 'Transporte')
     AND c.sector IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.category_id = c.id);
END $$;

COMMIT;
