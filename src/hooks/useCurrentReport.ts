import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CurrentReport {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  due_date: string;
  cycle_key: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  created_at: string;
}

export interface CreateExpenseInReportResult {
  expense: {
    id: string;
    description: string;
    amount_cents: number;
    date: string;
    is_out_of_policy: boolean;
    // ... other fields
  };
  report: CurrentReport;
  is_out_of_policy: boolean;
}

export function useCurrentReport() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-report'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_or_create_current_report');
      if (error) throw error;
      return data as unknown as CurrentReport;
    },
    enabled: !!user,
  });
}

export function useCreateExpenseInReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      description: string;
      amount_cents: number;
      date: string;
      category_id?: string | null;
      cost_center_id?: string | null;
      project_id?: string | null;
      payment_method?: string;
      currency?: string;
      is_reimbursable?: boolean;
      notes?: string | null;
      receipt_path?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_expense_in_current_report', {
        p_description: input.description,
        p_amount_cents: input.amount_cents,
        p_date: input.date,
        p_category_id: input.category_id || null,
        p_cost_center_id: input.cost_center_id || null,
        p_project_id: input.project_id || null,
        p_payment_method: input.payment_method || 'personal_card',
        p_currency: input.currency || 'BRL',
        p_is_reimbursable: input.is_reimbursable ?? true,
        p_notes: input.notes || null,
        p_receipt_path: input.receipt_path || null,
      });
      if (error) throw error;
      return data as unknown as CreateExpenseInReportResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      
      if (data.is_out_of_policy) {
        toast.warning('Despesa criada, mas está fora da política de limite diário');
      } else {
        toast.success('Despesa criada!');
      }
    },
    onError: (error) => {
      toast.error('Erro ao criar despesa: ' + error.message);
    },
  });
}

export function useSubmitReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase
        .from('reports')
        .update({ status: 'submitted' })
        .eq('id', reportId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Relatório enviado para aprovação!');
    },
    onError: (error) => {
      toast.error('Erro ao enviar relatório: ' + error.message);
    },
  });
}
