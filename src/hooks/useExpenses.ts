import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
  created_at: string;
  updated_at: string;
  category?: { name: string } | null;
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
}

export function useExpenses(filters?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      let query = supabase
        .from('expenses')
        .select('*, category:expense_categories(name)')
        .order('date', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as any);
      }
      if (filters?.startDate) {
        query = query.gte('date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('date', filters.endDate);
      }
      if (filters?.search) {
        query = query.ilike('description', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Expense[];
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
        .select('*, category:expense_categories(name)')
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
      toast.success('Despesa excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir despesa: ' + error.message);
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
