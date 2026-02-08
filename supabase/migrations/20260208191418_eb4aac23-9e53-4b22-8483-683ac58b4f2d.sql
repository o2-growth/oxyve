-- Storage policies for receipts bucket
-- Path convention: org_id/user_id/report_id/expense_id/filename

-- Allow authenticated users to upload receipts to their own folder
CREATE POLICY "Users can upload own receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to update their own receipts
CREATE POLICY "Users can update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own receipts
CREATE POLICY "Users can delete own receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to read their own receipts
CREATE POLICY "Users can read own receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow managers/admins to read all receipts from their org
CREATE POLICY "Managers can read org receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  AND is_manager_or_admin(auth.uid())
);

-- Add function to decide reports (admin only)
CREATE OR REPLACE FUNCTION public.admin_decide_report(
  p_report_id uuid,
  p_decision text,
  p_comment text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report RECORD;
BEGIN
  -- Get current user and org
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Check if user is admin or manager
  IF NOT is_manager_or_admin(_user_id) THEN
    RAISE EXCEPTION 'Apenas gestores podem aprovar/reprovar relatórios';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;

  -- Get the report
  SELECT * INTO _report
  FROM public.reports
  WHERE id = p_report_id
    AND org_id = _org_id
    AND status = 'submitted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado ou não pode ser processado';
  END IF;

  -- Validate decision
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida. Use approved ou rejected';
  END IF;

  -- Require comment for rejection
  IF p_decision = 'rejected' AND (p_comment IS NULL OR p_comment = '') THEN
    RAISE EXCEPTION 'Comentário obrigatório para reprovação';
  END IF;

  -- Insert approval record
  INSERT INTO public.report_approvals (report_id, approver_id, decision, comment)
  VALUES (p_report_id, _user_id, p_decision::approval_decision, p_comment);

  -- Update report status
  UPDATE public.reports
  SET status = p_decision::report_status, updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO _report;

  -- Update expenses status
  UPDATE public.expenses e
  SET status = p_decision::expense_status, updated_at = now()
  FROM public.report_items ri
  WHERE ri.report_id = p_report_id
    AND ri.expense_id = e.id;

  RETURN json_build_object(
    'report', row_to_json(_report),
    'decision', p_decision
  );
END;
$$;

-- Add function to mark report as paid (admin only)
CREATE OR REPLACE FUNCTION public.mark_report_paid(p_report_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id UUID;
  _org_id UUID;
  _report RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF NOT has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem marcar como pago';
  END IF;

  SELECT org_id INTO _org_id FROM public.profiles WHERE id = _user_id;

  SELECT * INTO _report
  FROM public.reports
  WHERE id = p_report_id
    AND org_id = _org_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado ou não está aprovado';
  END IF;

  -- Update report status
  UPDATE public.reports
  SET status = 'paid', updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO _report;

  -- Update expenses status
  UPDATE public.expenses e
  SET status = 'paid', updated_at = now()
  FROM public.report_items ri
  WHERE ri.report_id = p_report_id
    AND ri.expense_id = e.id;

  RETURN json_build_object('report', row_to_json(_report));
END;
$$;