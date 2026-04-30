-- Sprint 3 — Backfill `report_events` para relatórios criados antes do trigger.
-- Lovable-flag: triggers de audit (20260430180000) só populam a partir do INSERT/UPDATE.
-- Reports legados ficam sem histórico, então escrevemos eventos sintéticos baseados
-- no estado atual da tabela `reports`. Idempotente (NOT EXISTS guards).
--
-- Não populamos `expense_added` retroativo: dispararia 100s de eventos sem valor
-- informacional (não temos timestamp granular do item).

BEGIN;

-- 1) 'created' para todo report.
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, r.user_id, 'created',
       jsonb_build_object('title', r.title, 'backfill', true),
       r.created_at
  FROM public.reports r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.report_events re
    WHERE re.report_id = r.id AND re.event_type = 'created'
 );

-- 2) 'submitted' para reports já enviados.
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, r.user_id, 'submitted',
       jsonb_build_object('submitted_at', r.submitted_at, 'backfill', true),
       COALESCE(r.submitted_at, r.created_at)
  FROM public.reports r
 WHERE r.status IN ('submitted', 'approved', 'rejected', 'paid')
   AND NOT EXISTS (
   SELECT 1 FROM public.report_events re
    WHERE re.report_id = r.id AND re.event_type = 'submitted'
 );

-- 3) 'approved' / 'rejected' / 'paid' usando updated_at como aproximação.
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, r.user_id, r.status::text,
       jsonb_build_object('status', r.status, 'backfill', true),
       r.updated_at
  FROM public.reports r
 WHERE r.status IN ('approved', 'rejected', 'paid')
   AND NOT EXISTS (
   SELECT 1 FROM public.report_events re
    WHERE re.report_id = r.id AND re.event_type = r.status::text
 );

COMMIT;
