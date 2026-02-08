import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useReport, useSubmitReport, useApproveReport, useMarkReportAsPaid, useRemoveExpenseFromReport } from '@/hooks/useReports';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/constants';
import { ArrowLeft, Send, CheckCircle2, XCircle, Trash2, Receipt, Wallet, MessageSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isManager, isAdmin } = useAuth();

  const { data: report, isLoading } = useReport(id!);
  const submitReport = useSubmitReport();
  const approveReport = useApproveReport();
  const markAsPaid = useMarkReportAsPaid();
  const removeExpense = useRemoveExpenseFromReport();

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isPaidOpen, setIsPaidOpen] = useState(false);
  const [comment, setComment] = useState('');

  const isOwner = report?.user_id === user?.id;
  const canEdit = isOwner && report?.status === 'draft';
  const canApprove = isManager && !isOwner && report?.status === 'submitted';
  const canMarkPaid = isAdmin && report?.status === 'approved';

  const handleSubmit = async () => {
    await submitReport.mutateAsync(id!);
    setIsSubmitOpen(false);
  };

  const handleApprove = async () => {
    await approveReport.mutateAsync({ reportId: id!, decision: 'approved', comment: comment || undefined });
    setIsApproveOpen(false);
    setComment('');
  };

  const handleReject = async () => {
    await approveReport.mutateAsync({ reportId: id!, decision: 'rejected', comment: comment || undefined });
    setIsRejectOpen(false);
    setComment('');
  };

  const handleMarkPaid = async () => {
    await markAsPaid.mutateAsync(id!);
    setIsPaidOpen(false);
  };

  const handleRemoveExpense = async (expenseId: string) => {
    await removeExpense.mutateAsync({ reportId: id!, expenseId });
  };

  if (isLoading) {
    return <AppShell><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-64 w-full" /></AppShell>;
  }

  if (!report) {
    return <AppShell><EmptyState icon={<Receipt className="h-6 w-6" />} title="Relatório não encontrado" action={<Button onClick={() => navigate('/app/reports')}>Voltar</Button>} /></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/reports')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Voltar
        </Button>
      </div>

      <PageHeader title={report.title} description={report.user?.full_name ? `Criado por ${report.user.full_name}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={report.status} type="report" />
            {canEdit && <Button onClick={() => setIsSubmitOpen(true)} disabled={!report.items?.length} className="gap-2"><Send className="h-4 w-4" />Enviar</Button>}
            {canApprove && (<><Button variant="outline" onClick={() => setIsRejectOpen(true)} className="gap-2 text-destructive"><XCircle className="h-4 w-4" />Reprovar</Button><Button onClick={() => setIsApproveOpen(true)} className="gap-2"><CheckCircle2 className="h-4 w-4" />Aprovar</Button></>)}
            {canMarkPaid && <Button onClick={() => setIsPaidOpen(true)} className="gap-2"><Wallet className="h-4 w-4" />Marcar Pago</Button>}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Despesas</CardTitle><CardDescription>{report.items?.length || 0} despesa(s)</CardDescription></CardHeader>
            <CardContent>
              {!report.items?.length ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="Nenhuma despesa" description="Adicione despesas pela página de despesas." className="py-8" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Valor</TableHead>{canEdit && <TableHead className="w-12"></TableHead>}</TableRow></TableHeader>
                  <TableBody>
                    {report.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.expense.date)}</TableCell>
                        <TableCell>{item.expense.description}</TableCell>
                        <TableCell className="text-muted-foreground">{item.expense.category?.name || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.expense.amount_cents, item.expense.currency)}</TableCell>
                        {canEdit && <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveExpense(item.expense.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {report.approvals && report.approvals.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Histórico</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {report.approvals.map((approval: any) => (
                  <div key={approval.id} className="flex gap-4">
                    <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full ${approval.decision === 'approved' ? 'bg-status-approved/20 text-status-approved' : 'bg-status-rejected/20 text-status-rejected'}`}>
                      {approval.decision === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{approval.decision === 'approved' ? 'Aprovado' : 'Reprovado'} por {approval.approver?.full_name || 'Gestor'}</p>
                      <p className="text-sm text-muted-foreground">{new Date(approval.decided_at).toLocaleString('pt-BR')}</p>
                      {approval.comment && <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{approval.comment}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={report.status} type="report" /></div>
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground">Despesas</span><span>{report.expense_count || 0}</span></div>
            <Separator />
            <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>{formatCurrency(report.total_cents || 0)}</span></div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen} title="Enviar para Aprovação" description={`Enviar relatório com ${report.expense_count} despesa(s)?`} confirmLabel="Enviar" onConfirm={handleSubmit} isLoading={submitReport.isPending} />

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprovar Relatório</DialogTitle><DialogDescription>Aprovar "{report.title}" - {formatCurrency(report.total_cents || 0)}?</DialogDescription></DialogHeader>
          <Textarea placeholder="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setIsApproveOpen(false)}>Cancelar</Button><Button onClick={handleApprove} disabled={approveReport.isPending}>Aprovar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reprovar Relatório</DialogTitle><DialogDescription>Reprovar "{report.title}"?</DialogDescription></DialogHeader>
          <Textarea placeholder="Motivo da reprovação" value={comment} onChange={(e) => setComment(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancelar</Button><Button variant="destructive" onClick={handleReject} disabled={approveReport.isPending}>Reprovar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={isPaidOpen} onOpenChange={setIsPaidOpen} title="Marcar como Pago" description={`Confirmar pagamento de ${formatCurrency(report.total_cents || 0)}?`} confirmLabel="Confirmar" onConfirm={handleMarkPaid} isLoading={markAsPaid.isPending} />
    </AppShell>
  );
}
