import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/constants';
import { Report } from '@/hooks/useReports';
import { ChevronRight, Clock } from 'lucide-react';

interface ReportCardProps {
  report: Report;
}

export function ReportCard({ report }: ReportCardProps) {
  return (
    <Link
      to={`/app/reports/${report.id}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
    <Card className="transition-colors hover:bg-muted/50 active:bg-muted">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{report.title}</p>
              <StatusBadge status={report.status} type="report" />
            </div>
            
            {report.user?.full_name && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {report.user.full_name}
              </p>
            )}
            
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {report.start_date && report.end_date && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(report.start_date)} - {formatDate(report.end_date)}
                </span>
              )}
              
              {report.submitted_late && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                  <Clock className="mr-1 h-3 w-3" />
                  Atrasado
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mt-1">
              {report.expense_count === 1 ? '1 despesa' : `${report.expense_count ?? 0} despesas`}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="o2-num font-bold text-lg">
                {formatCurrency(report.reimbursable_cents ?? report.total_cents ?? 0)}
              </p>
              {report.reimbursable_cents != null && (report.total_cents ?? 0) !== report.reimbursable_cents && (
                <p className="o2-num text-xs text-muted-foreground">
                  de {formatCurrency(report.total_cents ?? 0)} lançado
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
    </Link>
  );
}
