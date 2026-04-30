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
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useReports } from '@/hooks/useReports';
import { useApproveReportRpc } from '@/hooks/useReportActions';
import { formatCurrency, formatDate } from '@/lib/constants';
import { Eye, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export function ApprovalQueue() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: reports, isLoading } = useReports({ status: 'submitted' });
  const approveReport = useApproveReportRpc();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');

  const selectedReport = reports?.find(r => r.id === selectedReportId);

  const openApprove = (reportId: string) => {
    setSelectedReportId(reportId);
    setDecision('approved');
    setComment('');
  };

  const openReject = (reportId: string) => {
    setSelectedReportId(reportId);
    setDecision('rejected');
    setComment('');
  };

  const handleSubmit = async () => {
    if (!selectedReportId || !decision) return;
    
    await approveReport.mutateAsync({
      reportId: selectedReportId,
      decision,
      comment: comment || undefined,
    });

    setSelectedReportId(null);
    setDecision(null);
    setComment('');
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
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
                    <p className="font-bold text-lg">
                      {formatCurrency(report.total_cents || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {report.expense_count} despesa(s)
                    </p>
                  </div>
                </div>

                {report.submitted_late && (
                  <Badge variant="outline" className="mt-2 text-xs border-amber-500 text-amber-600">
                    <Clock className="mr-1 h-3 w-3" />
                    Enviado com atraso
                  </Badge>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/app/reports/${report.id}`)}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    Ver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openReject(report.id)}
                  >
                    <XCircle className="mr-1 h-4 w-4 text-destructive" />
                    Reprovar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => openApprove(report.id)}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Aprovar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Decision Dialog */}
        <Dialog open={!!selectedReportId} onOpenChange={(open) => !open && setSelectedReportId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {decision === 'approved' ? 'Aprovar Relatório' : 'Reprovar Relatório'}
              </DialogTitle>
              <DialogDescription>
                {selectedReport?.title} - {formatCurrency(selectedReport?.total_cents || 0)}
              </DialogDescription>
            </DialogHeader>

            <Textarea
              placeholder={decision === 'rejected' ? 'Motivo da reprovação (obrigatório)' : 'Comentário (opcional)'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[100px]"
            />

            {decision === 'rejected' && !comment && (
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
                disabled={approveReport.isPending || (decision === 'rejected' && !comment)}
              >
                {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {decision === 'approved' ? 'Aprovar' : 'Reprovar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <TableHead className="text-right">Total</TableHead>
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
                <TableCell>{report.expense_count}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(report.total_cents || 0)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/app/reports/${report.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openReject(report.id)}
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openApprove(report.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Decision Dialog */}
      <Dialog open={!!selectedReportId} onOpenChange={(open) => !open && setSelectedReportId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'approved' ? 'Aprovar Relatório' : 'Reprovar Relatório'}
            </DialogTitle>
            <DialogDescription>
              {selectedReport?.title} - {formatCurrency(selectedReport?.total_cents || 0)}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder={decision === 'rejected' ? 'Motivo da reprovação (obrigatório)' : 'Comentário (opcional)'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px]"
          />

          {decision === 'rejected' && !comment && (
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
              disabled={approveReport.isPending || (decision === 'rejected' && !comment)}
            >
              {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decision === 'approved' ? 'Aprovar' : 'Reprovar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
