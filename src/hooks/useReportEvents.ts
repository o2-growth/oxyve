/**
 * Sprint 2 — GAP-G011: hook pra buscar histórico de eventos de relatório.
 * Tabela `report_events` (vide migration 20260430180000_create_report_events).
 *
 * Como a tabela ainda não está no types.ts gerado, fazemos cast leve.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReportEventType =
  | 'created'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'expense_added'
  | 'expense_removed'
  | 'comment';

export interface ReportEvent {
  id: string;
  report_id: string;
  actor_id: string | null;
  event_type: ReportEventType;
  data: Record<string, unknown>;
  created_at: string;
  actor?: { full_name: string | null } | null;
}

export function useReportEvents(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report-events', reportId],
    queryFn: async () => {
      if (!reportId) return [] as ReportEvent[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await ((supabase as unknown) as any)
        .from('report_events')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data || []) as ReportEvent[];

      // Buscar nomes de profiles (1 query agregada).
      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))
      );
      const profiles: Record<string, string | null> = {};
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds);
        for (const p of profs || []) {
          profiles[p.id] = p.full_name;
        }
      }

      return rows.map((r) => ({
        ...r,
        actor: r.actor_id ? { full_name: profiles[r.actor_id] ?? null } : null,
      }));
    },
    enabled: !!reportId,
  });
}
