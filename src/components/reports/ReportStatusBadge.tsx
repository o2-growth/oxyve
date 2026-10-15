import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { isReturnedReport } from '@/components/reports/reportRules';
import type { Report } from '@/hooks/useReports';

/**
 * Status do relatório nas listas. Devolvido pelo gestor volta como rascunho no
 * banco; sem este selo ele aparecia como "Aberto" comum e o autor não achava.
 */
export function ReportStatusBadge({
  report,
  className,
}: {
  report: Pick<Report, 'status' | 'last_rejection_comment'>;
  className?: string;
}) {
  if (isReturnedReport(report)) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'status-rejected border-transparent rounded-full font-mono font-medium uppercase text-[10px] leading-none tracking-[0.08em] px-2 py-1',
          className,
        )}
      >
        Devolvido
      </Badge>
    );
  }
  return <StatusBadge status={report.status} type="report" className={className} />;
}
