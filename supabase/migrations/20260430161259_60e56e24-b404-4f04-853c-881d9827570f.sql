-- Sprint 1 — DEC-005: desativar org morta 70aa944f-f8bd-4bb9-8498-ff5c9ec998c8
BEGIN;

-- 1. Backup defensivo (CTAS) antes de mexer em qualquer coisa.
CREATE TABLE IF NOT EXISTS public._archive_org_70aa944f AS
  SELECT 'profiles'::text AS src, row_to_json(p)::jsonb AS data
    FROM public.profiles p
   WHERE p.org_id = '70aa944f-f8bd-4bb9-8498-ff5c9ec998c8'
  UNION ALL
  SELECT 'expenses', row_to_json(e)::jsonb
    FROM public.expenses e
   WHERE e.org_id = '70aa944f-f8bd-4bb9-8498-ff5c9ec998c8'
  UNION ALL
  SELECT 'reports', row_to_json(r)::jsonb
    FROM public.reports r
   WHERE r.org_id = '70aa944f-f8bd-4bb9-8498-ff5c9ec998c8';

-- 2. Mover profile(s) restantes para a org principal mantendo a role.
UPDATE public.profiles
   SET org_id = '21b53d25-aa01-45dc-a64a-9f239a32d4f7'
 WHERE org_id = '70aa944f-f8bd-4bb9-8498-ff5c9ec998c8';

-- 3. Renomear org antiga para sinalizar arquivamento.
UPDATE public.organizations
   SET name = '[ARCHIVED] ' || name
 WHERE id = '70aa944f-f8bd-4bb9-8498-ff5c9ec998c8'
   AND name NOT LIKE '[ARCHIVED] %';

COMMIT;