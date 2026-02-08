import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardContext, useSubmitReportRpc, CurrentReport } from '@/hooks/useCurrentReport';
import { formatCurrency } from '@/lib/constants';
import { Plus, Send, Clock, AlertTriangle, CalendarClock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CurrentReportCardProps {
  onAddExpense: () => void;
  reportExpenses?: {
    total_cents: number;
    count: number;
  } | null;
}

export function CurrentReportCard({ onAddExpense, reportExpenses }: CurrentReportCardProps) {
  const { data: context, isLoading } = useDashboardContext();
  const submitReport = useSubmitReportRpc();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!context) return null;

  const { current_report, pending_due_report, days_until_due, today } = context;

  const handleSubmit = (report: CurrentReport) => {
    submitReport.mutate(report.id);
  };

  // Check due status
  const isDueToday = days_until_due === 0;
  const isOverdue = days_until_due < 0;

  return (
    <div className="space-y-4">
      {/* Pending overdue report alert */}
      {pending_due_report && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Relatório atrasado</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              O relatório "{pending_due_report.title}" está {pending_due_report.days_overdue} dia(s) atrasado.
            </span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handleSubmit(pending_due_report)}
              disabled={submitReport.isPending}
              className="shrink-0"
            >
              {submitReport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Due today alert */}
      {isDueToday && current_report.status === 'draft' && !pending_due_report && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <CalendarClock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-600">Prazo de envio hoje!</AlertTitle>
          <AlertDescription>
            O relatório do período atual deve ser enviado até o fim do dia.
          </AlertDescription>
        </Alert>
      )}

      {/* Current period card */}
      <Card className={cn(
        isDueToday && current_report.status === 'draft' && "border-amber-500/50",
        isOverdue && current_report.status === 'draft' && "border-destructive/50"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-lg sm:text-xl">{current_report.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                <span>
                  {format(parseISO(current_report.start_date), "dd 'de' MMM", { locale: ptBR })} 
                  {' - '}
                  {format(parseISO(current_report.end_date), "dd 'de' MMM", { locale: ptBR })}
                </span>
                {current_report.status === 'draft' && (
                  <Badge variant={isDueToday ? "outline" : "secondary"} className={cn(
                    "text-xs",
                    isDueToday && "border-amber-500 text-amber-600"
                  )}>
                    <Clock className="mr-1 h-3 w-3" />
                    {days_until_due > 0 
                      ? `${days_until_due} dias para enviar`
                      : isDueToday 
                        ? 'Enviar hoje'
                        : `${Math.abs(days_until_due)} dias atrasado`
                    }
                  </Badge>
                )}
                {current_report.status === 'submitted' && (
                  <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                    Aguardando aprovação
                  </Badge>
                )}
                {current_report.status === 'approved' && (
                  <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                    Aprovado
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-2xl sm:text-3xl font-bold">
                {formatCurrency(reportExpenses?.total_cents || 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reportExpenses?.count || 0} despesa(s) no período
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={onAddExpense} 
              className="flex-1 h-12 sm:h-10"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Despesa
            </Button>
            
            {current_report.status === 'draft' && (
              <Button 
                variant={isDueToday || isOverdue ? "default" : "outline"}
                onClick={() => handleSubmit(current_report)}
                disabled={submitReport.isPending || (reportExpenses?.count || 0) === 0}
                className={cn(
                  "flex-1 h-12 sm:h-10",
                  (isDueToday || isOverdue) && "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {submitReport.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar Relatório
              </Button>
            )}
          </div>

          {(reportExpenses?.count || 0) === 0 && current_report.status === 'draft' && (
            <p className="text-xs text-muted-foreground text-center">
              Adicione despesas antes de enviar o relatório
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}