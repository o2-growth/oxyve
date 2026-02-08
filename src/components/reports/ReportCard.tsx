import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  return (
    <Card 
      className="cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted"
      onClick={() => navigate(`/app/reports/${report.id}`)}
    >
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
              
              {(report as any).submitted_late && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                  <Clock className="mr-1 h-3 w-3" />
                  Atrasado
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mt-1">
              {report.expense_count} despesa(s)
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <p className="font-bold text-lg">
              {formatCurrency(report.total_cents || 0)}
            </p>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
