import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ExpenseKind = 'food' | 'transport' | 'other';

export interface ExpenseType {
  id: string;
  org_id: string;
  name: string;
  department_id: string | null;
  daily_limit_cents: number | null;
  kind: ExpenseKind;
  sector: string | null;
  requires_receipt: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: {
    id: string;
    name: string;
  } | null;
}

export function useExpenseTypes() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select(`
          *,
          department:departments(id, name)
        `)
        .order('name');
      if (error) throw error;
      return data as ExpenseType[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useActiveExpenseTypes() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-types', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select(`
          *,
          department:departments(id, name)
        `)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as ExpenseType[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      department_id?: string | null;
      daily_limit_cents?: number | null;
      kind?: ExpenseKind;
      sector?: string | null;
      requires_receipt?: boolean;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ ...input, org_id: profile!.org_id! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-types'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Tipo de despesa criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar: ' + error.message);
    },
  });
}

export function useUpdateExpenseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      department_id?: string | null;
      daily_limit_cents?: number | null;
      kind?: ExpenseKind;
      sector?: string | null;
      requires_receipt?: boolean;
      is_active?: boolean;
    }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('expense_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-types'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Tipo de despesa atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });
}

export function useDeleteExpenseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expense_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-types'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Tipo de despesa excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });
}
