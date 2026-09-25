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

/**
 * Confere se o arquivo é mesmo um comprovante legível: imagem que o navegador
 * decodifica ou PDF com assinatura %PDF. Extensão .png com texto dentro passava
 * como comprovante, virava imagem quebrada e o OCR respondia 500.
 * Devolve a mensagem de erro, ou null se estiver ok.
 */
export async function receiptFileProblem(file: File): Promise<string | null> {
  if (file.size === 0) return 'O arquivo está vazio.';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head).startsWith('%PDF') ? null : 'O PDF parece corrompido.';
  }
  if (!file.type.startsWith('image/')) return 'Envie uma foto (JPG, PNG, HEIC) ou um PDF.';
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return null;
  } catch {
    return 'Não consegui abrir essa imagem. Tire a foto de novo ou envie outro arquivo.';
  }
}
