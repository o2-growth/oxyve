import { format, isToday, isBefore, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Send, Calendar, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useCurrentReport, useSubmitReport, CurrentReport } from '@/hooks/useCurrentReport';
import { formatCurrency } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface CurrentReportCardProps {
  onAddExpense: () => void;
  reportExpenses?: { total_cents: number; count: number } | null;
}

export function CurrentReportCard({ onAddExpense, reportExpenses }: CurrentReportCardProps) {
  const { data: report, isLoading } = useCurrentReport();
  const submitReport = useSubmitReport();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return null;
  }

  const today = new Date();
  const dueDate = parseISO(report.due_date);
  const startDate = parseISO(report.start_date);
  const endDate = parseISO(report.end_date);
  
  const isDueToday = isToday(dueDate);
  const isOverdue = isBefore(dueDate, today) && report.status === 'draft';
  const isDraft = report.status === 'draft';

  const handleSubmit = async () => {
    await submitReport.mutateAsync(report.id);
  };

  return (
    <Card className={cn(
      isOverdue && "border-destructive/50 bg-destructive/5",
      isDueToday && isDraft && "border-status-submitted/50 bg-status-submitted/5"
    )}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {report.title}
            </CardTitle>
            <CardDescription className="mt-1">
              Período: {format(startDate, "dd/MM/yyyy", { locale: ptBR })} — {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
            </CardDescription>
          </div>
          <Badge 
            variant={
              report.status === 'draft' ? 'secondary' : 
              report.status === 'submitted' ? 'outline' : 
              report.status === 'approved' ? 'default' :
              report.status === 'rejected' ? 'destructive' : 'default'
            }
          >
            {report.status === 'draft' && 'Rascunho'}
            {report.status === 'submitted' && 'Enviado'}
            {report.status === 'approved' && 'Aprovado'}
            {report.status === 'rejected' && 'Reprovado'}
            {report.status === 'paid' && 'Pago'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {isOverdue && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Relatório atrasado</AlertTitle>
            <AlertDescription>
              O prazo para envio era {format(dueDate, "dd/MM/yyyy", { locale: ptBR })}. 
              Envie o quanto antes para aprovação.
            </AlertDescription>
          </Alert>
        )}

        {isDueToday && isDraft && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Prazo de envio hoje</AlertTitle>
            <AlertDescription>
              Este é o último dia para enviar seu relatório do período.
            </AlertDescription>
          </Alert>
        )}

        {report.status === 'submitted' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Aguardando aprovação</AlertTitle>
            <AlertDescription>
              Seu relatório foi enviado e está aguardando análise do gestor.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary */}
        {reportExpenses && (
          <div className="flex items-center gap-6 py-3 px-4 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm text-muted-foreground">Total do período</p>
              <p className="text-2xl font-bold">{formatCurrency(reportExpenses.total_cents)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Despesas</p>
              <p className="text-2xl font-bold">{reportExpenses.count}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {isDraft && (
            <>
              <Button onClick={onAddExpense} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Despesa
              </Button>
              <Button 
                variant="outline" 
                onClick={handleSubmit}
                disabled={submitReport.isPending || (reportExpenses?.count === 0)}
                className="gap-2"
              >
                {submitReport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar Relatório
              </Button>
            </>
          )}
        </div>

        {/* Due date info */}
        {isDraft && !isOverdue && !isDueToday && (
          <p className="text-sm text-muted-foreground">
            Prazo para envio: {format(dueDate, "dd 'de' MMMM", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
