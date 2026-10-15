import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, LoadError } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useReports, type Report } from '@/hooks/useReports';
import { useApproveReportRpc } from '@/hooks/useReportActions';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildRejectionDraft,
  canApproveDirectly,
  canRejectDirectly,
  isAwaitingApprovalBy,
} from '@/components/reports/reportRules';
import { formatCurrency, formatDate } from '@/lib/constants';
import { Eye, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const despesas = (n: number) => `${n} ${n === 1 ? 'despesa' : 'despesas'}`;

const EMPTY_REVIEW = { total: 0, reviewed: 0, rejected: 0 };

/**
 * Situação da revisão item a item. A fila segue a regra do Detalhe: aprovar direto
 * só com tudo revisado e nada reprovado; reprovar só com tudo revisado. Antes a
 * fila aprovava em um clique e o item reprovado na revisão era aprovado e pago.
 */
function decisionState(report: Report) {
  const review = report.review ?? { ...EMPTY_REVIEW, total: report.expense_count ?? 0 };
  const pending = Math.max(review.total - review.reviewed, 0);
  const label =
    review.total === 0
      ? 'Sem despesas'
      : review.rejected > 0
        ? `${review.rejected === 1 ? '1 item reprovado' : `${review.rejected} itens reprovados`} na revisão`
        : pending > 0
          ? `Revisão: ${review.reviewed} de ${review.total}`
          : 'Revisão completa';
  return {
    canApprove: canApproveDirectly(review),
    canReject: canRejectDirectly(review),
    hasRejected: review.rejected > 0,
    label,
  };
}

export function ApprovalQueue() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useReports({ status: 'submitted' });
  // Mesmo critério do contador da aba e do Início: o próprio relatório fica fora.
  const reports = data?.filter((r) => isAwaitingApprovalBy(r, profile?.id));
  const approveReport = useApproveReportRpc();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');

  const selectedReport = reports?.find(r => r.id === selectedReportId);
  const dialogSummary = selectedReport
    ? `${selectedReport.title} — ${formatCurrency(selectedReport.reimbursable_cents ?? 0)} a reembolsar (${formatCurrency(selectedReport.total_cents ?? 0)} lançado)`
    : '';

  const openApprove = (reportId: string) => {
    setSelectedReportId(reportId);
    setDecision('approved');
    setComment('');
  };

  const openReject = (report: Report) => {
    setSelectedReportId(report.id);
    setDecision('rejected');
    // O banco apaga a revisão por item ao devolver: o motivo de cada item vai no texto.
    setComment(buildRejectionDraft(report.rejected_items ?? []));
  };

  const trimmed = comment.trim();
  const missingReason = decision === 'rejected' && !trimmed;

  const handleSubmit = async () => {
    if (!selectedReportId || !decision || missingReason) return;
    try {
      await approveReport.mutateAsync({
        reportId: selectedReportId,
        decision,
        comment: trimmed || undefined,
      });
    } catch {
      // O hook já mostra o toast; o diálogo fica aberto para tentar de novo.
      return;
    }
    setSelectedReportId(null);
    setDecision(null);
    setComment('');
  };

  const decisionDialog = (
    <Dialog open={!!selectedReportId} onOpenChange={(open) => !open && setSelectedReportId(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {decision === 'approved' ? 'Aprovar Relatório' : 'Reprovar Relatório'}
          </DialogTitle>
          <DialogDescription>
            {dialogSummary}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder={decision === 'rejected' ? 'Motivo da reprovação (obrigatório)' : 'Comentário (opcional)'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[100px]"
        />

        {missingReason && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Informe o motivo da reprovação
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setSelectedReportId(null)}>
            Cancelar
          </Button>
          <Button
            variant={decision === 'rejected' ? 'destructive' : 'default'}
            onClick={handleSubmit}
            disabled={approveReport.isPending || missingReason}
          >
            {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {decision === 'approved' ? 'Aprovar' : 'Reprovar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <LoadError onRetry={() => refetch()} />;
  }

  if (!reports?.length) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="Nenhum relatório pendente"
        description="Não há relatórios aguardando aprovação no momento."
      />
    );
  }

  // Mobile card view
  if (isMobile) {
    return (
      <>
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{report.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.user?.full_name || 'Colaborador'}
                    </p>
                    {report.start_date && report.end_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(report.start_date)} - {formatDate(report.end_date)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="o2-eyebrow">A reembolsar</p>
                    <p className="o2-num font-bold text-lg">
                      {formatCurrency(report.reimbursable_cents ?? 0)}
                    </p>
                    {(report.total_cents ?? 0) !== (report.reimbursable_cents ?? 0) && (
                      <p className="o2-num text-xs text-muted-foreground">
                        {formatCurrency(report.total_cents ?? 0)} lançado
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {despesas(report.expense_count ?? 0)}
                    </p>
                  </div>
                </div>

                {report.submitted_late && (
                  <Badge variant="outline" className="mt-2 text-xs border-amber-500 text-amber-600">
                    <Clock className="mr-1 h-3 w-3" />
                    Enviado com atraso
                  </Badge>
                )}

                <ReviewStatus report={report} className="mt-2" />

                <div className="mt-4 flex gap-2">
                  <Button
                    variant={decisionState(report).canApprove ? 'outline' : 'default'}
                    size="sm"
                    className="h-11 flex-1"
                    onClick={() => navigate(`/app/reports/${report.id}`)}
                    aria-label={`Revisar despesas de ${report.title}`}
                  >
                    <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                    Revisar
                  </Button>
                  {decisionState(report).canReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 flex-1"
                      onClick={() => openReject(report)}
                      aria-label={`Reprovar ${report.title}`}
                    >
                      <XCircle className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />
                      Reprovar
                    </Button>
                  )}
                  {decisionState(report).canApprove && (
                    <Button
                      size="sm"
                      className="h-11 flex-1"
                      onClick={() => openApprove(report.id)}
                      aria-label={`Aprovar ${report.title}`}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                      Aprovar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {decisionDialog}
      </>
    );
  }

  // Desktop table view
  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Despesas</TableHead>
              <TableHead>Revisão</TableHead>
              <TableHead className="text-right">A reembolsar</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{report.title}</span>
                    {report.submitted_late && (
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                        Atrasado
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {report.user?.full_name || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {report.start_date && report.end_date
                    ? `${formatDate(report.start_date)} - ${formatDate(report.end_date)}`
                    : '-'}
                </TableCell>
                <TableCell className="o2-num">{report.expense_count}</TableCell>
                <TableCell>
                  <ReviewStatus report={report} />
                </TableCell>
                <TableCell className="text-right">
                  <p className="o2-num font-semibold">{formatCurrency(report.reimbursable_cents ?? 0)}</p>
                  {(report.total_cents ?? 0) !== (report.reimbursable_cents ?? 0) && (
                    <p className="o2-num text-xs text-muted-foreground">
                      {formatCurrency(report.total_cents ?? 0)} lançado
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    {decisionState(report).canApprove ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/app/reports/${report.id}`)}
                        aria-label={`Revisar despesas de ${report.title}`}
                        title="Revisar despesas"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : (
                      // Sem revisão completa (ou com item reprovado) a decisão é no Detalhe.
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => navigate(`/app/reports/${report.id}`)}
                        aria-label={`Revisar despesas de ${report.title}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        Revisar
                      </Button>
                    )}
                    {decisionState(report).canReject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReject(report)}
                        aria-label={`Reprovar ${report.title}`}
                        title="Reprovar"
                      >
                        <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    )}
                    {decisionState(report).canApprove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openApprove(report.id)}
                        aria-label={`Aprovar ${report.title}`}
                        title="Aprovar"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {decisionDialog}
    </>
  );
}

function ReviewStatus({ report, className }: { report: Report; className?: string }) {
  const state = decisionState(report);
  return (
    <p
      className={cn(
        'flex items-center gap-1 text-xs',
        state.hasRejected ? 'text-destructive' : state.canApprove ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
    >
      {state.hasRejected && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {state.label}
    </p>
  );
}
