import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPermissionError } from '@/lib/permissionError';

export function useReviewExpense() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      expenseId,
      reportId,
      decision,
      comment,
    }: {
      expenseId: string;
      reportId: string;
      decision: 'approved' | 'rejected';
      comment?: string;
    }) => {
      // Upsert: if review already exists for this expense+report, update it
      // expense_reviews já existe nos types gerados; remover cast (B9).
      const { data, error } = await supabase
        .from('expense_reviews')
        .upsert(
          {
            expense_id: expenseId,
            report_id: reportId,
            reviewer_id: profile!.id,
            decision,
            comment: comment || null,
          },
          { onConflict: 'expense_id,report_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      // A Fila decide pelo estado da revisão (useReports): sem isto, ao voltar do
      // Detalhe ela seguia mostrando "Revisar" até o cache vencer.
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) => {
      // A policy de UPDATE só deixa quem revisou alterar a própria revisão: com dois
      // aprovadores, o erro de RLS cru não diz nada a quem tentou.
      if (isPermissionError(error)) {
        toast.error(
          'Outro aprovador já revisou esta despesa e só ele pode alterar a revisão. Peça a ele, ou devolva o relatório com o motivo.',
        );
        return;
      }
      toast.error('Erro ao salvar revisão: ' + error.message);
    },
  });
}
