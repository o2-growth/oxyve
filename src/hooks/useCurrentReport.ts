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
  submitted_at?: string;
  submitted_late?: boolean;
  created_at: string;
}

export interface DashboardContext {
  current_report: CurrentReport;
  pending_due_report: (CurrentReport & { days_overdue: number }) | null;
  days_until_due: number;
  today: string;
}

export interface CreateExpenseInReportResult {
  expense: {
    id: string;
    description: string;
    amount_cents: number;
    date: string;
    is_out_of_policy: boolean;
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

export function useDashboardContext() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-context'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_context');
      if (error) throw error;
      return data as unknown as DashboardContext;
    },
    enabled: !!user,
  });
}

/**
 * B4 — Sprint 0: trocada de useMutation por useQuery para evitar race
 * condition (resposta antiga sobrescrevendo nova). React Query dedupe por
 * queryKey + cache resolve sem precisar de debounce explícito.
 */
export function useReportForDate(date: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['report-for-date', date, user?.id],
    queryFn: async () => {
      if (!date) return null;
      const { data, error } = await supabase.rpc('get_or_create_report_for_date', {
        p_date: date,
      });
      if (error) throw error;
      return data as unknown as CurrentReport;
    },
    enabled: !!date && !!user,
    staleTime: 30_000,
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
      is_event?: boolean;
      distance_km?: number | null;
    }) => {
      const { data, error } = await supabase.rpc('create_expense_in_current_report', {
        p_description: input.description,
        p_amount_cents: input.amount_cents,
        p_date: input.date,
        p_category_id: input.category_id || undefined,
        p_cost_center_id: input.cost_center_id || undefined,
        p_project_id: input.project_id || undefined,
        p_payment_method: input.payment_method || 'personal_card',
        p_currency: input.currency || 'BRL',
        p_is_reimbursable: input.is_reimbursable ?? true,
        p_notes: input.notes || undefined,
        p_receipt_path: input.receipt_path || undefined,
        p_is_event: input.is_event ?? false,
        p_distance_km: input.distance_km ?? undefined,
      });
      if (error) throw error;
      return data as unknown as CreateExpenseInReportResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      
      if (data.is_out_of_policy) {
        toast.warning('Despesa registrada como exceção — vai para revisão do aprovador.');
      } else {
        toast.success('Despesa criada!');
      }
    },
    onError: (error) => {
      // Mensagens do motor de política (RAISE EXCEPTION) já são legíveis para o
      // usuário — mostra direto, sem o prefixo genérico de erro.
      const msg = error.message || 'Não foi possível criar a despesa.';
      const isPolicyBlock = /limite|política|politica|período|periodo|relatório|relatorio/i.test(msg);
      toast.error(isPolicyBlock ? msg : 'Erro ao criar despesa: ' + msg);
    },
  });
}

export function useCreateExpenseMultiday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      description: string;
      amount_cents_per_day: number;
      start_date: string;
      end_date: string;
      category_id?: string | null;
      cost_center_id?: string | null;
      project_id?: string | null;
      payment_method?: string;
      currency?: string;
      is_reimbursable?: boolean;
      notes?: string | null;
      is_event?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('create_expense_multiday', {
        p_description: input.description,
        p_amount_cents_per_day: input.amount_cents_per_day,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_category_id: input.category_id || undefined,
        p_cost_center_id: input.cost_center_id || undefined,
        p_project_id: input.project_id || undefined,
        p_payment_method: input.payment_method || 'personal_card',
        p_currency: input.currency || 'BRL',
        p_is_reimbursable: input.is_reimbursable ?? true,
        p_notes: input.notes || undefined,
        p_is_event: input.is_event ?? false,
      });
      if (error) throw error;
      return data as unknown as { count: number; expenses: unknown[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      toast.success(`${data.count} despesa(s) criada(s) — uma por dia.`);
    },
    onError: (error) => {
      const msg = error.message || 'Não foi possível criar as despesas.';
      const isPolicyBlock = /limite|política|politica|período|periodo|data/i.test(msg);
      toast.error(isPolicyBlock ? msg : 'Erro ao criar despesas: ' + msg);
    },
  });
}

export function useSubmitReportRpc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.rpc('submit_report', {
        p_report_id: reportId,
      });
      if (error) throw error;
      return data as unknown as { report: CurrentReport; submitted_late: boolean };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      
      if (data.submitted_late) {
        toast.warning('Relatório enviado com atraso');
      } else {
        toast.success('Relatório enviado para aprovação!');
      }
    },
    onError: (error) => {
      toast.error('Erro ao enviar relatório: ' + error.message);
    },
  });
}

// B15: useSubmitReport (manual) removido. Use `useSubmitReportRpc` (acima).
// A versão manual divergia do RPC `submit_report` que aplica regras de
// late-submission e atualiza status do expenses dentro do banco.