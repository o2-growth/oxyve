import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
    },
    onError: (error) => {
      toast.error('Erro ao salvar revisão: ' + error.message);
    },
  });
}
