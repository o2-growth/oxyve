import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardContext, useSubmitReportRpc, CurrentReport } from '@/hooks/useCurrentReport';
import { formatCurrency } from '@/lib/constants';
import { Plus, Send, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const pluralDays = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

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
      {/* Relatório de ciclo anterior ainda aberto. Leva à revisão em vez de enviar
          em um toque: enviar sem ver a lista deixava passar duplicata. */}
      {pending_due_report && (
        <Alert className="border-destructive/60 bg-destructive/10 text-foreground">
          <AlertTriangle className="h-4 w-4 !text-destructive" />
          <AlertTitle>
            {pending_due_report.days_overdue > 0 ? 'Relatório atrasado' : 'Relatório vence hoje'}
          </AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              O relatório "{pending_due_report.title}" ainda não foi enviado
              {pending_due_report.days_overdue > 0
                ? ` — ${pluralDays(pending_due_report.days_overdue)} de atraso.`
                : ' e o prazo termina hoje.'}
            </span>
            <Button asChild size="sm" variant="outline" className="h-11 shrink-0">
              <Link to={`/app/reports/${pending_due_report.id}`}>
                <Send className="mr-2 h-4 w-4" />
                Revisar e enviar
              </Link>
            </Button>
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
                {/* Um sinal de prazo por tela: com relatório anterior pendente, o
                    alerta vermelho acima é o sinal — o selo do ciclo novo contradiria. */}
                {current_report.status === 'draft' && !pending_due_report && (
                  <Badge variant={isDueToday || isOverdue ? "outline" : "secondary"} className={cn(
                    "text-xs",
                    isDueToday && "border-amber-500 text-amber-700 dark:text-amber-400",
                    isOverdue && "border-destructive text-destructive"
                  )}>
                    <Clock className="mr-1 h-3 w-3" />
                    {days_until_due > 0
                      ? `${pluralDays(days_until_due)} para enviar`
                      : isDueToday
                        ? 'Enviar hoje'
                        : `${pluralDays(Math.abs(days_until_due))} de atraso`
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
                {(reportExpenses?.count || 0) === 1 ? '1 despesa' : `${reportExpenses?.count || 0} despesas`} no período
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
                  (isDueToday || isOverdue) && "bg-amber-700 text-white hover:bg-amber-800"
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