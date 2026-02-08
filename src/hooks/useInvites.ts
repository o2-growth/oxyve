import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface OrgInvite {
  id: string;
  org_id: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export function useInvites() {
  const { profile, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_invites')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as OrgInvite[];
    },
    enabled: !!profile?.org_id && isAdmin,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (input: { email: string; role: 'employee' | 'manager' | 'admin' }) => {
      const { data, error } = await supabase
        .from('org_invites')
        .insert({
          email: input.email,
          role: input.role,
          org_id: profile!.org_id!,
          invited_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as OrgInvite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast.success('Convite criado!');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Já existe um convite para este email.');
      } else {
        toast.error('Erro ao criar convite: ' + error.message);
      }
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_invites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast.success('Convite excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });
}

export function getInviteLink(token: string): string {
  return `${window.location.origin}/login?invite=${token}`;
}
