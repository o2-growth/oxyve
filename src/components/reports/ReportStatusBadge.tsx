import { StatusBadge } from '@/components/ui/StatusBadge';
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
  return (
    <StatusBadge
      status={report.status}
      type="report"
      returned={isReturnedReport(report)}
      className={className}
    />
  );
}
