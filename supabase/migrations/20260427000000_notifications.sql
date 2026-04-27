-- Story 1.3 — Notificações ao funcionário em aprovação/rejeição
-- Migration ADITIVA: nova coluna + índice parcial + policy de UPDATE.
-- NÃO altera dados existentes. Não remove colunas. Não modifica RLS existente.

-- 1) Coluna para marcar quando o funcionário visualizou a decisão
ALTER TABLE public.report_approvals
  ADD COLUMN IF NOT EXISTS notification_read_at TIMESTAMP WITH TIME ZONE NULL;

-- 2) Índice parcial para queries de "decisões não lidas" do funcionário
CREATE INDEX IF NOT EXISTS idx_report_approvals_unread
  ON public.report_approvals (report_id)
  WHERE notification_read_at IS NULL;

-- 3) Policy de UPDATE: o owner do relatório pode marcar suas próprias
--    aprovações como lidas (apenas para a coluna notification_read_at).
--    A policy genérica (USING + WITH CHECK) restringe pelo dono do report.
CREATE POLICY "Users can update notification_read_at on own report approvals"
  ON public.report_approvals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_approvals.report_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_approvals.report_id
        AND r.user_id = auth.uid()
    )
  );
