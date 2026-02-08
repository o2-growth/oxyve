import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Report {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  created_at: string;
  updated_at: string;
  total_cents?: number;
  expense_count?: number;
  user?: { full_name: string | null } | null;
}

export interface ReportWithItems extends Report {
  items: Array<{
    id: string;
    expense: {
      id: string;
      date: string;
      description: string;
      amount_cents: number;
      currency: string;
      category: { name: string } | null;
    };
  }>;
  approvals: Array<{
    id: string;
    decision: 'approved' | 'rejected';
    comment: string | null;
    decided_at: string;
    approver: { full_name: string | null } | null;
  }>;
}

export interface ReportInput {
  title: string;
  start_date?: string | null;
  end_date?: string | null;
}

export function useReports(filters?: { status?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reports', filters],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as any);
      }

      const { data: reports, error } = await query;
      if (error) throw error;

      const reportsWithTotals = await Promise.all(
        (reports || []).map(async (report) => {
          const { data: items } = await supabase
            .from('report_items')
            .select('expense:expenses(amount_cents)')
            .eq('report_id', report.id);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', report.user_id)
            .single();

          const total_cents = items?.reduce(
            (sum, item: any) => sum + (item.expense?.amount_cents || 0),
            0
          ) || 0;

          return {
            ...report,
            total_cents,
            expense_count: items?.length || 0,
            user: profileData,
          };
        })
      );

      return reportsWithTotals as Report[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const { data: report, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', report.user_id)
        .single();

      const { data: items } = await supabase
        .from('report_items')
        .select('id, expense:expenses(id, date, description, amount_cents, currency, category:expense_categories(name))')
        .eq('report_id', id);

      const { data: approvals } = await supabase
        .from('report_approvals')
        .select('id, decision, comment, decided_at, approver_id')
        .eq('report_id', id)
        .order('decided_at', { ascending: false });

      const approvalsWithProfiles = await Promise.all(
        (approvals || []).map(async (approval) => {
          const { data: approverData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', approval.approver_id)
            .single();
          return { ...approval, approver: approverData };
        })
      );

      const total_cents = items?.reduce(
        (sum, item: any) => sum + (item.expense?.amount_cents || 0),
        0
      ) || 0;

      return {
        ...report,
        user: profileData,
        items: items || [],
        approvals: approvalsWithProfiles || [],
        total_cents,
        expense_count: items?.length || 0,
      } as ReportWithItems;
    },
    enabled: !!id,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: ReportInput) => {
      const { data, error } = await supabase
        .from('reports')
        .insert({
          ...input,
          org_id: profile!.org_id!,
          user_id: profile!.id,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Relatório criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar relatório: ' + error.message);
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: ReportInput & { id: string }) => {
      const { data, error } = await supabase
        .from('reports')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', variables.id] });
      toast.success('Relatório atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar relatório: ' + error.message);
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Relatório excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir relatório: ' + error.message);
    },
  });
}

export function useAddExpenseToReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, expenseId }: { reportId: string; expenseId: string }) => {
      const { error } = await supabase
        .from('report_items')
        .insert({ report_id: reportId, expense_id: expenseId });
      if (error) throw error;
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Despesa adicionada ao relatório!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar despesa: ' + error.message);
    },
  });
}

export function useRemoveExpenseFromReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, expenseId }: { reportId: string; expenseId: string }) => {
      const { error } = await supabase
        .from('report_items')
        .delete()
        .eq('report_id', reportId)
        .eq('expense_id', expenseId);
      if (error) throw error;
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Despesa removida do relatório!');
    },
    onError: (error) => {
      toast.error('Erro ao remover despesa: ' + error.message);
    },
  });
}

export function useSubmitReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data: items } = await supabase
        .from('report_items')
        .select('expense_id')
        .eq('report_id', reportId);

      if (!items?.length) {
        throw new Error('Adicione pelo menos uma despesa ao relatório');
      }

      const { error: reportError } = await supabase
        .from('reports')
        .update({ status: 'submitted' })
        .eq('id', reportId);
      if (reportError) throw reportError;

      const expenseIds = items.map((i) => i.expense_id);
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({ status: 'submitted' })
        .in('id', expenseIds);
      if (expenseError) throw expenseError;
    },
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Relatório enviado para aprovação!');
    },
    onError: (error) => {
      toast.error('Erro ao enviar relatório: ' + error.message);
    },
  });
}

export function useApproveReport() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ reportId, decision, comment }: { reportId: string; decision: 'approved' | 'rejected'; comment?: string }) => {
      const { data: items } = await supabase
        .from('report_items')
        .select('expense_id')
        .eq('report_id', reportId);

      const { error: approvalError } = await supabase.from('report_approvals').insert({
        report_id: reportId,
        approver_id: profile!.id,
        decision,
        comment,
      });
      if (approvalError) throw approvalError;

      const { error: reportError } = await supabase
        .from('reports')
        .update({ status: decision })
        .eq('id', reportId);
      if (reportError) throw reportError;

      if (items?.length) {
        const expenseIds = items.map((i) => i.expense_id);
        const { error: expenseError } = await supabase
          .from('expenses')
          .update({ status: decision })
          .in('id', expenseIds);
        if (expenseError) throw expenseError;
      }
    },
    onSuccess: (_, { reportId, decision }) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(decision === 'approved' ? 'Relatório aprovado!' : 'Relatório reprovado!');
    },
    onError: (error) => {
      toast.error('Erro ao processar aprovação: ' + error.message);
    },
  });
}

export function useMarkReportAsPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data: items } = await supabase
        .from('report_items')
        .select('expense_id')
        .eq('report_id', reportId);

      const { error: reportError } = await supabase
        .from('reports')
        .update({ status: 'paid' })
        .eq('id', reportId);
      if (reportError) throw reportError;

      if (items?.length) {
        const expenseIds = items.map((i) => i.expense_id);
        const { error: expenseError } = await supabase
          .from('expenses')
          .update({ status: 'paid' })
          .in('id', expenseIds);
        if (expenseError) throw expenseError;
      }
    },
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Relatório marcado como pago!');
    },
    onError: (error) => {
      toast.error('Erro ao marcar como pago: ' + error.message);
    },
  });
}
