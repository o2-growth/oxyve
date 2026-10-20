-- Categorias que faltavam em relação ao VExpenses.
--
-- A migration 20261006120000 recriou Alimentação e Deslocamento por setor.
-- Faltavam: Viagens e Estadias por setor, o setor Tech (que não existia na
-- lista anterior) e quatro categorias gerais usadas no VExpenses.
--
-- Só INSERT. Nada é desativado aqui: Hospedagem e Outros continuam como estão
-- até o admin decidir. Idempotente: rodar de novo não duplica nem reativa
-- nada que um admin desligou.

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

  INSERT INTO public.expense_categories (org_id, name, kind, sector, is_active)
  SELECT _org, n.name, n.kind, n.sector, true
    FROM (
      SELECT 'Viagens e Estadias – ' || s.setor AS name, 'other' AS kind, s.setor AS sector
        FROM (VALUES
          ('Administrativo'), ('Comercial'), ('Marketing'), ('Expansão'), ('Tax'),
          ('CaaS'), ('Customer Success'), ('Education'), ('SaaS'), ('Tech')
        ) AS s(setor)
      UNION ALL
      SELECT * FROM (VALUES
        ('Alimentação – Tech', 'food', 'Tech'),
        ('Deslocamento – Tech', 'transport', 'Tech'),
        ('Eventos Comerciais', 'other', NULL),
        ('Eventos Internos', 'other', NULL),
        ('Materiais de Uso e Consumo', 'other', NULL),
        ('Software e Tecnologia', 'other', NULL)
      ) AS g(name, kind, sector)
    ) AS n
   WHERE NOT EXISTS (
     SELECT 1 FROM public.expense_categories c
      WHERE c.org_id = _org AND c.name = n.name
   );
END $$;

COMMIT;
