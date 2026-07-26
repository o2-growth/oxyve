import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Gestão de usuários da organização (painel admin).
 *
 * Consome as RPCs `get_org_members` (listagem) e `set_user_role` (alteração
 * de papel). O backend bloqueia não-admins: a RPC retorna erro, tratado na
 * UI como "Acesso restrito aos administradores". A troca de papel também é
 * bloqueada quando o admin tenta alterar o próprio papel — a mensagem de erro
 * do backend é repassada ao usuário via toast.
 */

export type OrgRole = 'employee' | 'manager' | 'admin';

export interface OrgMember {
  user_id: string;
  full_name: string | null;
  email: string;
  role: OrgRole | null;
  last_sign_in_at: string | null;
}

export function useOrgMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      // A RPC ainda não está nos types gerados do Supabase (regen pendente).
      // Cast do nome via `as never` mantém o restante da chamada type-safe.
      const { data, error } = await supabase.rpc('get_org_members' as never);
      if (error) throw error;
      return data as unknown as OrgMember[];
    },
    enabled: !!user,
    // Erro de permissão (não-admin) não deve ser repetido.
    retry: false,
  });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { p_user_id: string; p_role: OrgRole }) => {
      const { data, error } = await supabase.rpc(
        'set_user_role' as never,
        vars as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success('Papel atualizado');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
