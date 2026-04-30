-- Sprint 3 — Backfill report_events para relatórios legados
-- Idempotente: só insere se ainda não existe um evento daquele tipo no report.

-- created: usa created_at do report, actor = author
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, r.user_id, 'created',
       jsonb_build_object('title', r.title, 'backfill', true),
       r.created_at
  FROM public.reports r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.report_events e
    WHERE e.report_id = r.id AND e.event_type = 'created'
 );

-- submitted: usa submitted_at quando existe
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, r.user_id, 'submitted',
       jsonb_build_object('title', r.title, 'submitted_late', COALESCE(r.submitted_late, false), 'backfill', true),
       r.submitted_at
  FROM public.reports r
 WHERE r.submitted_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.report_events e
      WHERE e.report_id = r.id AND e.event_type = 'submitted'
   );

-- approved: pega da tabela report_approvals (decision='approved')
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT DISTINCT ON (ra.report_id)
       ra.report_id, ra.approver_id, 'approved',
       jsonb_build_object('comment', ra.comment, 'backfill', true),
       ra.decided_at
  FROM public.report_approvals ra
  JOIN public.reports r ON r.id = ra.report_id
 WHERE ra.decision = 'approved'
   AND NOT EXISTS (
     SELECT 1 FROM public.report_events e
      WHERE e.report_id = ra.report_id AND e.event_type = 'approved'
   )
 ORDER BY ra.report_id, ra.decided_at ASC;

-- rejected: idem, decision='rejected'
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT DISTINCT ON (ra.report_id)
       ra.report_id, ra.approver_id, 'rejected',
       jsonb_build_object('comment', ra.comment, 'backfill', true),
       ra.decided_at
  FROM public.report_approvals ra
  JOIN public.reports r ON r.id = ra.report_id
 WHERE ra.decision = 'rejected'
   AND NOT EXISTS (
     SELECT 1 FROM public.report_events e
      WHERE e.report_id = ra.report_id AND e.event_type = 'rejected'
   )
 ORDER BY ra.report_id, ra.decided_at ASC;

-- paid: reports com status atual 'paid' (não temos timestamp dedicado, usa updated_at)
INSERT INTO public.report_events (report_id, actor_id, event_type, data, created_at)
SELECT r.id, NULL, 'paid',
       jsonb_build_object('title', r.title, 'backfill', true),
       r.updated_at
  FROM public.reports r
 WHERE r.status = 'paid'
   AND NOT EXISTS (
     SELECT 1 FROM public.report_events e
      WHERE e.report_id = r.id AND e.event_type = 'paid'
   );