import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { decisionErrorMessage } from '@/lib/businessError';

export { decisionErrorMessage };

export function useApproveReportRpc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      decision,
      comment,
    }: {
      reportId: string;
      decision: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const { data, error } = await supabase.rpc('admin_decide_report', {
        p_report_id: reportId,
        p_decision: decision,
        p_comment: comment || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      toast.success(decision === 'approved' ? 'Relatório aprovado!' : 'Relatório reprovado!');
    },
    onError: (error, { decision }) => {
      // Fila e Detalhe podem estar com dado antigo (outro gestor revisou/reprovou):
      // recarrega para os botões refletirem o que o banco viu.
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      toast.error(
        decisionErrorMessage(
          error,
          decision === 'approved' ? 'Erro ao aprovar: ' : 'Erro ao reprovar: ',
        ),
      );
    },
  });
}

export function useMarkReportPaidRpc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.rpc('mark_report_paid', {
        p_report_id: reportId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Relatório marcado como pago!');
    },
    onError: (error) => {
      toast.error(decisionErrorMessage(error, 'Erro ao marcar como pago: '));
    },
  });
}
