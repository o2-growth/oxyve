import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ExpensePolicy {
  id: string;
  org_id: string;
  default_currency: string;
  require_cost_center: boolean;
  require_project: boolean;
  require_receipt: boolean;
  cycle_cutoff_day: number;
  timezone: string;
  enforce_limits_mode: 'warn' | 'block';
  updated_at: string;
}

export interface CostCenter {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Expense Policy
export function useExpensePolicy() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-policy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_policies')
        .select('*')
        .single();
      if (error) throw error;
      return data as ExpensePolicy;
    },
    enabled: !!profile?.org_id,
  });
}

export function useUpdateExpensePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<ExpensePolicy> & { id: string }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('expense_policies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-policy'] });
      toast.success('Política atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar política: ' + error.message);
    },
  });
}

// Cost Centers
export function useCostCenters() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as CostCenter[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useActiveCostCenters() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['cost-centers', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as CostCenter[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: { name: string; code?: string }) => {
      const { data, error } = await supabase
        .from('cost_centers')
        .insert({ ...input, org_id: profile!.org_id! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro de custo criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar: ' + error.message);
    },
  });
}

export function useUpdateCostCenter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name?: string; code?: string; is_active?: boolean }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('cost_centers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro de custo atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });
}

export function useDeleteCostCenter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cost_centers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro de custo excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });
}

// Projects
export function useProjects() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useActiveProjects() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['projects', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: { name: string; code?: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...input, org_id: profile!.org_id! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar: ' + error.message);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name?: string; code?: string; is_active?: boolean }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });
}
