
-- Create expense_reviews table for individual expense decisions
CREATE TABLE public.expense_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (expense_id, report_id)
);

-- Enable RLS
ALTER TABLE public.expense_reviews ENABLE ROW LEVEL SECURITY;

-- Managers/admins can insert reviews for expenses in their org
CREATE POLICY "Managers can insert expense reviews"
ON public.expense_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  is_manager_or_admin(auth.uid())
  AND reviewer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = expense_reviews.report_id
      AND r.org_id = get_user_org_id(auth.uid())
  )
);

-- Managers can view reviews for their org
CREATE POLICY "Managers can view org expense reviews"
ON public.expense_reviews
FOR SELECT
TO authenticated
USING (
  is_manager_or_admin(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = expense_reviews.report_id
      AND r.org_id = get_user_org_id(auth.uid())
  )
);

-- Users can view reviews for their own expenses
CREATE POLICY "Users can view own expense reviews"
ON public.expense_reviews
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = expense_reviews.report_id
      AND r.user_id = auth.uid()
  )
);

-- Managers can update reviews (change decision)
CREATE POLICY "Managers can update expense reviews"
ON public.expense_reviews
FOR UPDATE
TO authenticated
USING (
  is_manager_or_admin(auth.uid())
  AND reviewer_id = auth.uid()
);

-- Managers can delete reviews (reset decision)
CREATE POLICY "Managers can delete expense reviews"
ON public.expense_reviews
FOR DELETE
TO authenticated
USING (
  is_manager_or_admin(auth.uid())
  AND reviewer_id = auth.uid()
);
