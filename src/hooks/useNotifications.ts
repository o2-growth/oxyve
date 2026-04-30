/**
 * Sprint 2 — GAP-G012: hooks de notificações persistentes.
 * Tabela `notifications` + função SECURITY DEFINER `create_notification`
 * (vide migration 20260430170000). RLS garante que cada usuário só lê
 * suas próprias notificações.
 *
 * Como `notifications` ainda não está no types.ts gerado pelo Lovable,
 * usamos `(supabase as any).from('notifications')` em call sites — quando
 * o Lovable regenerar, podemos trocar para tipagem forte sem mudar API
 * pública desse módulo.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tipos públicos (independem do schema gerado).
export type NotificationCategory =
  | 'action_required'
  | 'my_expenses'
  | 'reports'
  | 'other';

export interface NotificationRow {
  id: string;
  user_id: string;
  org_id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

// Cast utilitário enquanto types.ts não conhece a tabela.
type SupabaseUntyped = {
  from: (table: string) => {
    select: (cols: string) => unknown;
  };
};

function rawSupabase() {
  return supabase as unknown as SupabaseUntyped;
}

interface UseNotificationsOptions {
  category?: NotificationCategory;
  unreadOnly?: boolean;
  limit?: number;
}

export function useNotifications(opts: UseNotificationsOptions = {}) {
  const { user } = useAuth();
  const limit = opts.limit ?? 50;

  return useQuery({
    queryKey: ['notifications', user?.id, opts],
    queryFn: async () => {
      if (!user?.id) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = rawSupabase().from('notifications').select('*');
      q = q.eq('user_id', user.id);
      if (opts.category) q = q.eq('category', opts.category);
      if (opts.unreadOnly) q = q.is('read_at', null);
      q = q.order('created_at', { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadNotificationsCount() {
  const { data } = useNotifications({ unreadOnly: true, limit: 100 });
  return data?.length ?? 0;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (rawSupabase() as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (rawSupabase() as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
