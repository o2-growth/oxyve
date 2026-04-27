import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UnreadDecision {
  id: string;
  report_id: string;
  decision: 'approved' | 'rejected';
  comment: string | null;
  created_at: string;
}

const QUERY_KEY = ['unread-decisions'];

export function useUnreadDecisions() {
  const { user } = useAuth();

  return useQuery<UnreadDecision[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      if (!user) return [];

      // RLS já restringe SELECT em report_approvals para o owner do report.
      // Filtramos só por notification_read_at IS NULL.
      const { data, error } = await supabase
        .from('report_approvals')
        .select('id, report_id, decision, comment, created_at, reports!inner(user_id)')
        .is('notification_read_at', null)
        .eq('reports.user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        report_id: row.report_id,
        decision: row.decision as 'approved' | 'rejected',
        comment: row.comment,
        created_at: row.created_at,
      }));
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Marca todas as decisões de UM relatório como lidas pelo owner.
 * Usado em ReportDetail quando o funcionário acessa seu próprio relatório.
 */
export function useMarkReportDecisionsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('report_approvals')
        .update({ notification_read_at: new Date().toISOString() })
        .eq('report_id', reportId)
        .is('notification_read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
