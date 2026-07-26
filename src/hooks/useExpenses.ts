import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ExpenseReport {
  id: string;
  title: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
}

export interface Expense {
  id: string;
  org_id: string;
  user_id: string;
  date: string;
  description: string;
  category_id: string | null;
  amount_cents: number;
  currency: string;
  payment_method: 'personal_card' | 'corporate_card' | 'cash' | 'other';
  is_reimbursable: boolean;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  receipt_path: string | null;
  notes: string | null;
  cost_center_id: string | null;
  project_id: string | null;
  is_out_of_policy: boolean;
  is_event: boolean;
  distance_km: number | null;
  created_at: string;
  updated_at: string;
  category?: { name: string } | null;
  cost_center?: { name: string; code: string | null } | null;
  project?: { name: string; code: string | null } | null;
  report?: ExpenseReport | null;
}

export interface ExpenseInput {
  date: string;
  description: string;
  category_id?: string | null;
  amount_cents: number;
  currency?: string;
  payment_method: 'personal_card' | 'corporate_card' | 'cash' | 'other';
  is_reimbursable: boolean;
  receipt_path?: string | null;
  notes?: string | null;
  cost_center_id?: string | null;
  project_id?: string | null;
  is_event?: boolean;
  distance_km?: number | null;
}

export type ExpenseTab = 'all' | 'loose' | 'open' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'exceptions';

export interface ExpenseFilters {
  tab?: ExpenseTab;
  startDate?: string;
  endDate?: string;
  search?: string;
  categoryId?: string;
  paymentMethod?: string;
  isReimbursable?: boolean | null;
  costCenterId?: string;
  projectId?: string;
}

// Helper to determine which tab an expense belongs to
export function getExpenseTab(expense: Expense): ExpenseTab {
  const report = expense.report;
  
  // Pagas: report.status == 'paid' OR expense.status == 'paid'
  if (report?.status === 'paid' || expense.status === 'paid') {
    return 'paid';
  }
  
  // Reprovadas: report.status == 'rejected' OR expense.status == 'rejected'
  if (report?.status === 'rejected' || expense.status === 'rejected') {
    return 'rejected';
  }
  
  // Aprovadas: report.status == 'approved' OR expense.status == 'approved'
  if (report?.status === 'approved' || expense.status === 'approved') {
    return 'approved';
  }
  
  // Enviadas: report.status == 'submitted' OR expense.status == 'submitted'
  if (report?.status === 'submitted' || expense.status === 'submitted') {
    return 'submitted';
  }
  
  // Abertas: report != null AND report.status == 'draft' AND expense.status == 'draft'
  if (report && report.status === 'draft' && expense.status === 'draft') {
    return 'open';
  }
  
  // Avulsas: report == null AND status == 'draft'
  if (!report && expense.status === 'draft') {
    return 'loose';
  }
  
  return 'all';
}

export function useExpenses(filters?: ExpenseFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      // First, fetch expenses with their related data
      let query = supabase
        .from('expenses')
        .select(`
          *,
          category:expense_categories(name),
          cost_center:cost_centers(name, code),
          project:projects(name, code)
        `)
        .order('date', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('date', filters.endDate);
      }
      if (filters?.search) {
        query = query.ilike('description', `%${filters.search}%`);
      }
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      if (filters?.paymentMethod) {
        // B9: tipar via union do schema gerado em vez de `as any`.
        query = query.eq(
          'payment_method',
          filters.paymentMethod as Expense['payment_method']
        );
      }
      if (filters?.isReimbursable !== null && filters?.isReimbursable !== undefined) {
        query = query.eq('is_reimbursable', filters.isReimbursable);
      }
      if (filters?.costCenterId) {
        query = query.eq('cost_center_id', filters.costCenterId);
      }
      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      const { data: expenses, error } = await query;
      if (error) throw error;

      // Fetch report_items to get report linkage
      const expenseIds = expenses?.map(e => e.id) || [];
      
      let reportItems: { expense_id: string; report_id: string }[] = [];
      if (expenseIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('report_items')
          .select('expense_id, report_id')
          .in('expense_id', expenseIds);
        
        if (itemsError) throw itemsError;
        reportItems = items || [];
      }

      // Fetch reports for linked expenses
      const reportIds = [...new Set(reportItems.map(ri => ri.report_id))];
      let reports: { id: string; title: string; status: string }[] = [];
      
      if (reportIds.length > 0) {
        const { data: reportsData, error: reportsError } = await supabase
          .from('reports')
          .select('id, title, status')
          .in('id', reportIds);
        
        if (reportsError) throw reportsError;
        reports = reportsData || [];
      }

      // Build report lookup maps
      const expenseToReport = new Map<string, string>();
      reportItems.forEach(ri => {
        expenseToReport.set(ri.expense_id, ri.report_id);
      });

      const reportMap = new Map<string, ExpenseReport>();
      reports.forEach(r => {
        reportMap.set(r.id, { 
          id: r.id, 
          title: r.title, 
          status: r.status as ExpenseReport['status'] 
        });
      });

      // Combine expenses with report data
      const enrichedExpenses: Expense[] = (expenses || []).map(expense => {
        const reportId = expenseToReport.get(expense.id);
        const report = reportId ? reportMap.get(reportId) : null;
        
        return {
          ...expense,
          report: report || null,
        } as Expense;
      });

      // Apply tab filter
      // "exceptions" é transversal (is_out_of_policy coexiste com qualquer status),
      // então não passa por getExpenseTab.
      if (filters?.tab === 'exceptions') {
        return enrichedExpenses.filter(expense => expense.is_out_of_policy);
      }
      if (filters?.tab && filters.tab !== 'all') {
        return enrichedExpenses.filter(expense => getExpenseTab(expense) === filters.tab);
      }

      return enrichedExpenses;
    },
    enabled: !!profile?.org_id,
  });
}

export function useExpenseCounts() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-counts'],
    queryFn: async () => {
      // Fetch all expenses
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('id, status, is_out_of_policy');
      
      if (error) throw error;

      const expenseIds = expenses?.map(e => e.id) || [];
      
      // Fetch report_items
      let reportItems: { expense_id: string; report_id: string }[] = [];
      if (expenseIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('report_items')
          .select('expense_id, report_id')
          .in('expense_id', expenseIds);
        
        if (itemsError) throw itemsError;
        reportItems = items || [];
      }

      // Fetch reports
      const reportIds = [...new Set(reportItems.map(ri => ri.report_id))];
      let reports: { id: string; status: string }[] = [];
      
      if (reportIds.length > 0) {
        const { data: reportsData, error: reportsError } = await supabase
          .from('reports')
          .select('id, status')
          .in('id', reportIds);
        
        if (reportsError) throw reportsError;
        reports = reportsData || [];
      }

      // Build maps
      const expenseToReport = new Map<string, string>();
      reportItems.forEach(ri => {
        expenseToReport.set(ri.expense_id, ri.report_id);
      });

      const reportMap = new Map<string, { status: string }>();
      reports.forEach(r => {
        reportMap.set(r.id, { status: r.status });
      });

      // Count by tab
      const counts: Record<ExpenseTab, number> = {
        all: 0,
        loose: 0,
        open: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
        paid: 0,
        exceptions: 0,
      };

      (expenses || []).forEach(expense => {
        const reportId = expenseToReport.get(expense.id);
        const report = reportId ? reportMap.get(reportId) : null;
        
        const enriched = {
          ...expense,
          report: report ? { id: reportId!, title: '', status: report.status } : null,
        } as Expense;
        
        const tab = getExpenseTab(enriched);
        counts.all++;
        if (tab !== 'all') {
          counts[tab]++;
        }
        if (expense.is_out_of_policy) {
          counts.exceptions++;
        }
      });

      return counts;
    },
    enabled: !!profile?.org_id,
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, category:expense_categories(name), cost_center:cost_centers(name, code), project:projects(name, code)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Expense;
    },
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const { data, error } = await supabase
        .from('expenses')
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
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      toast.success('Despesa criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar despesa: ' + error.message);
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: ExpenseInput & { id: string }) => {
      const { data, error } = await supabase
        .from('expenses')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['expense', variables.id] });
      toast.success('Despesa atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar despesa: ' + error.message);
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      toast.success('Despesa excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir despesa: ' + error.message);
    },
  });
}

export function useDeleteExpenses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('expenses').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      toast.success('Despesas excluídas!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir despesas: ' + error.message);
    },
  });
}

export function useCategories() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.org_id,
  });
}

export function useCostCenters() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.org_id,
  });
}

export function useProjects() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.org_id,
  });
}
