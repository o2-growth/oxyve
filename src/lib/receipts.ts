import { supabase } from '@/integrations/supabase/client';

/**
 * Sobe o comprovante e grava o caminho na despesa. O caminho segue a policy do
 * bucket `receipts`: org/usuário/relatório/despesa/arquivo.
 */
export async function attachReceipt(opts: {
  file: File;
  orgId: string;
  userId: string;
  reportId: string | null | undefined;
  expenseId: string;
}): Promise<string> {
  const ext = opts.file.name.split('.').pop() || 'jpg';
  const path = `${opts.orgId}/${opts.userId}/${opts.reportId || 'unassigned'}/${opts.expenseId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, opts.file);
  if (uploadError) throw uploadError;
  const { error: updateError } = await supabase
    .from('expenses')
    .update({ receipt_path: path })
    .eq('id', opts.expenseId);
  if (updateError) throw updateError;
  return path;
}
