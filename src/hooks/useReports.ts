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
  reimbursable_cents?: number;
  expense_count?: number;
  submitted_at?: string | null;
  submitted_late?: boolean;
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
      receipt_path: string | null;
      is_out_of_policy: boolean;
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

/**
 * Aria-2: N+1 fix.
 *
 * Antes: 1 select em reports + N selects em report_items + N selects em
 * profiles = 1 + 2N queries (~101 para 50 relatórios).
 *
 * Depois: 1 select com nested resources do PostgREST trazendo
 * report_items.expense (amount_cents, is_reimbursable) e o user (profiles!user_id).
 *
 * Tipagem: o gerador do Supabase ainda não conhece a relação inversa
 * profiles!user_id (depende de FK explícita), então mantemos um cast
 * narrow no shape final. Após Aria-6 (regen types), revisitar.
 */
type ReportRow = {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: Report['status'];
  created_at: string;
  updated_at: string;
  user: { full_name: string | null } | { full_name: string | null }[] | null;
  items: Array<{
    expense:
      | { amount_cents: number | null; is_reimbursable: boolean | null }
      | { amount_cents: number | null; is_reimbursable: boolean | null }[]
      | null;
  }>;
};

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function useReports(filters?: { status?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reports', filters],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select(
          `*,
          user:profiles!user_id(full_name),
          items:report_items(expense:expenses(amount_cents, is_reimbursable))`
        )
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as Report['status']);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as ReportRow[];

      return rows.map((row): Report => {
        const items = row.items ?? [];
        let total_cents = 0;
        let reimbursable_cents = 0;
        for (const item of items) {
          const expense = pickFirst(item.expense);
          const amount = expense?.amount_cents ?? 0;
          total_cents += amount;
          if (expense?.is_reimbursable) reimbursable_cents += amount;
        }
        return {
          id: row.id,
          org_id: row.org_id,
          user_id: row.user_id,
          title: row.title,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          total_cents,
          reimbursable_cents,
          expense_count: items.length,
          user: pickFirst(row.user),
        };
      });
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
        .select('id, expense:expenses(id, date, description, amount_cents, currency, receipt_path, is_out_of_policy, category:expense_categories(name))')
        .eq('report_id', id);

      const { data: approvals } = await supabase
        .from('report_approvals')
        .select('id, decision, comment, decided_at, approver_id')
        .eq('report_id', id)
        .order('decided_at', { ascending: false });

      // Fetch expense reviews for this report
      const { data: expenseReviews } = await supabase
        .from('expense_reviews')
        .select('*')
        .eq('report_id', id);

      const approvalsWithProfiles = await Promise.all(
        (approvals || []).map(async (approval) => {
          if (!approval.approver_id) {
            return { ...approval, approver: null };
          }
          const { data: approverData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', approval.approver_id)
            .single();
          return { ...approval, approver: approverData };
        })
      );

      // Map expense reviews by expense_id for quick lookup.
      type ReviewRow = {
        expense_id: string;
        decision: 'approved' | 'rejected' | null;
        comment: string | null;
      };
      const reviewsByExpenseId: Record<string, ReviewRow> = {};
      (expenseReviews || []).forEach((review) => {
        const r = review as ReviewRow;
        reviewsByExpenseId[r.expense_id] = r;
      });

      // Attach review info to each item.
      type ItemRow = {
        id: string;
        expense: { id: string; amount_cents?: number | null } | null;
      };
      const itemsWithReviews = ((items || []) as ItemRow[]).map((item) => {
        const review = item.expense ? reviewsByExpenseId[item.expense.id] : undefined;
        return {
          ...item,
          review_decision: review?.decision || null,
          review_comment: review?.comment || null,
        };
      });

      const total_cents = itemsWithReviews.reduce(
        (sum, item) => sum + (item.expense?.amount_cents || 0),
        0
      ) || 0;

      return {
        ...report,
        user: profileData,
        items: itemsWithReviews,
        approvals: approvalsWithProfiles || [],
        total_cents,
        expense_count: itemsWithReviews.length,
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
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      toast.success('Despesa adicionada ao relatório!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar despesa: ' + error.message);
    },
  });
}

export function useAddExpensesToReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, expenseIds }: { reportId: string; expenseIds: string[] }) => {
      const items = expenseIds.map((expenseId) => ({
        report_id: reportId,
        expense_id: expenseId,
      }));
      const { error } = await supabase.from('report_items').insert(items);
      if (error) throw error;
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      toast.success('Despesas adicionadas ao relatório!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar despesas: ' + error.message);
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

// B15: implementação manual de submitReport removida.
// O fluxo oficial agora é o RPC `submit_report`, exposto em
// `useSubmitReportRpc` (src/hooks/useCurrentReport.ts), que:
//  - valida que o relatório tem ao menos uma despesa,
//  - atualiza status do report + expenses atomicamente no banco,
//  - retorna `submitted_late` para sinalizar atraso.
// Mantemos só o RPC para evitar duas fontes de verdade divergentes.

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
