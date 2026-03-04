import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReport, useRemoveExpenseFromReport } from '@/hooks/useReports';
import { useSubmitReportRpc } from '@/hooks/useCurrentReport';
import { useApproveReportRpc, useMarkReportPaidRpc } from '@/hooks/useReportActions';
import { useReviewExpense } from '@/hooks/useReviewExpense';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/constants';
import { toast } from 'sonner';
import { 
  ArrowLeft, Send, CheckCircle2, XCircle, Trash2, Receipt, Wallet, 
  MessageSquare, Clock, AlertTriangle, Loader2, Paperclip, ExternalLink,
  ListChecks, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, isManager, isAdmin } = useAuth();

  const { data: report, isLoading } = useReport(id!);
  const submitReport = useSubmitReportRpc();
  const approveReport = useApproveReportRpc();
  const markAsPaid = useMarkReportPaidRpc();
  const removeExpense = useRemoveExpenseFromReport();
  const reviewExpense = useReviewExpense();

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isPaidOpen, setIsPaidOpen] = useState(false);
  const [comment, setComment] = useState('');
  
  // Individual expense rejection dialog
  const [rejectExpenseId, setRejectExpenseId] = useState<string | null>(null);
  const [rejectExpenseComment, setRejectExpenseComment] = useState('');

  const isOwner = report?.user_id === user?.id;
  const canEdit = isOwner && report?.status === 'draft';
  const canApprove = isManager && (!isOwner || isAdmin) && report?.status === 'submitted';
  const canMarkPaid = isAdmin && report?.status === 'approved';
  const showReviewStatus = report?.status === 'rejected' || report?.status === 'approved' || report?.status === 'submitted';

  // Count reviewed expenses (those with a decision from expense_reviews)
  const totalExpenses = report?.items?.length || 0;
  const reviewedItems = useMemo(() => {
    return (report?.items || []).filter((item: any) => item.review_decision);
  }, [report?.items]);
  const reviewedCount = reviewedItems.length;
  const allReviewed = totalExpenses > 0 && reviewedCount >= totalExpenses;
  const reviewProgress = totalExpenses > 0 ? (reviewedCount / totalExpenses) * 100 : 0;
  const hasRejected = reviewedItems.some((item: any) => item.review_decision === 'rejected');

  const handleApproveExpense = async (expenseId: string) => {
    await reviewExpense.mutateAsync({
      expenseId,
      reportId: id!,
      decision: 'approved',
    });
  };

  const handleOpenRejectExpense = (expenseId: string) => {
    setRejectExpenseId(expenseId);
    setRejectExpenseComment('');
  };

  const handleRejectExpense = async () => {
    if (!rejectExpenseId || !rejectExpenseComment) return;
    await reviewExpense.mutateAsync({
      expenseId: rejectExpenseId,
      reportId: id!,
      decision: 'rejected',
      comment: rejectExpenseComment,
    });
    setRejectExpenseId(null);
    setRejectExpenseComment('');
  };

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
    if (!comment) return;
    await approveReport.mutateAsync({ reportId: id!, decision: 'rejected', comment });
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

  const openReceipt = async (receiptPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(receiptPath, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Erro ao abrir comprovante');
    }
  };

  // Review badge for individual expense
  const ExpenseReviewBadge = ({ decision, comment: reviewComment }: { decision: string | null; comment: string | null }) => {
    if (!decision) return null;
    if (decision === 'approved') {
      return (
        <Badge className="bg-green-500/20 text-green-700 border-green-500/30 gap-1">
          <ThumbsUp className="h-3 w-3" />
          Aprovada
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
        <ThumbsDown className="h-3 w-3" />
        Reprovada
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <EmptyState 
          icon={<Receipt className="h-6 w-6" />} 
          title="Relatório não encontrado" 
          action={<Button onClick={() => navigate('/app/reports')}>Voltar</Button>} 
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/reports')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <PageHeader 
        title={report.title} 
        description={
          report.user?.full_name 
            ? `Por ${report.user.full_name}${(report as any).start_date && (report as any).end_date 
                ? ` • ${format(parseISO((report as any).start_date), "dd MMM", { locale: ptBR })} - ${format(parseISO((report as any).end_date), "dd MMM yyyy", { locale: ptBR })}` 
                : ''}`
            : undefined
        }
      />

      {/* Status and Actions Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={report.status} type="report" />
          {(report as any).submitted_late && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              <Clock className="mr-1 h-3 w-3" />
              Enviado com atraso
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button 
              onClick={() => setIsSubmitOpen(true)} 
              disabled={!report.items?.length}
              className="gap-2"
              size={isMobile ? "default" : "sm"}
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Enviar para Aprovação</span>
              <span className="sm:hidden">Enviar</span>
            </Button>
          )}
          {canApprove && (
            <>
              <Button 
                variant="outline" 
                onClick={() => setIsRejectOpen(true)} 
                className="gap-2"
                size={isMobile ? "default" : "sm"}
                disabled={!allReviewed}
                title={!allReviewed ? `Revise todas as ${totalExpenses} despesas antes` : undefined}
              >
                <XCircle className="h-4 w-4 text-destructive" />
                {hasRejected ? 'Reprovar Relatório' : 'Reprovar'}
              </Button>
              <Button 
                onClick={() => setIsApproveOpen(true)} 
                className="gap-2"
                size={isMobile ? "default" : "sm"}
                disabled={!allReviewed || hasRejected}
                title={!allReviewed ? `Revise todas as ${totalExpenses} despesas antes` : hasRejected ? 'Há despesas reprovadas' : undefined}
              >
                <CheckCircle2 className="h-4 w-4" />
                Aprovar Relatório
              </Button>
            </>
          )}
          {canMarkPaid && (
            <Button 
              onClick={() => setIsPaidOpen(true)} 
              className="gap-2"
              size={isMobile ? "default" : "sm"}
            >
              <Wallet className="h-4 w-4" />
              Marcar como Pago
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Expenses List */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Despesas</CardTitle>
              <CardDescription>{report.items?.length || 0} despesa(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {!report.items?.length ? (
                <EmptyState 
                  icon={<Receipt className="h-6 w-6" />} 
                  title="Nenhuma despesa" 
                  description="Adicione despesas pela página de despesas." 
                  className="py-8" 
                />
              ) : isMobile ? (
                // Mobile: Card view
                <div className="space-y-3">
                  {report.items.map((item: any) => (
                    <div 
                      key={item.id} 
                      className={`rounded-lg border p-3 space-y-2 transition-colors ${
                        item.review_decision === 'approved' ? 'border-green-500/40 bg-green-500/5' : 
                        item.review_decision === 'rejected' ? 'border-destructive/40 bg-destructive/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.expense.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(item.expense.date)} • {item.expense.category?.name || 'Sem categoria'}
                          </p>
                        </div>
                        <p className="font-semibold shrink-0">
                          {formatCurrency(item.expense.amount_cents, item.expense.currency)}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.expense.is_out_of_policy && (
                            <Badge variant="outline" className="text-xs border-destructive text-destructive">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Fora da política
                            </Badge>
                          )}
                          {item.expense.receipt_path && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-xs gap-1"
                              onClick={() => openReceipt(item.expense.receipt_path)}
                            >
                              <Paperclip className="h-3 w-3" />
                              Ver
                            </Button>
                          )}
                          {showReviewStatus && (
                            <ExpenseReviewBadge decision={item.review_decision} comment={item.review_comment} />
                          )}
                        </div>
                        <div className="flex gap-1">
                          {canApprove && !item.review_decision && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs gap-1 text-green-600 border-green-500/50 hover:bg-green-500/10"
                                onClick={() => handleApproveExpense(item.expense.id)}
                                disabled={reviewExpense.isPending}
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10"
                                onClick={() => handleOpenRejectExpense(item.expense.id)}
                                disabled={reviewExpense.isPending}
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {canApprove && item.review_decision && (
                            <div className="flex gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={() => handleApproveExpense(item.expense.id)}
                                disabled={reviewExpense.isPending}
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={() => handleOpenRejectExpense(item.expense.id)}
                                disabled={reviewExpense.isPending}
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {canEdit && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-destructive"
                              onClick={() => handleRemoveExpense(item.expense.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Show rejection reason */}
                      {item.review_decision === 'rejected' && item.review_comment && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Motivo:</strong> {item.review_comment}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // Desktop: Table view
                <div className="space-y-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Anexo</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        {(canApprove || showReviewStatus) && <TableHead className="text-center">Revisão</TableHead>}
                        {canEdit && <TableHead className="w-12"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.items.map((item: any) => (
                        <>
                          <TableRow 
                            key={item.id} 
                            className={
                              item.review_decision === 'approved' ? 'bg-green-500/5' : 
                              item.review_decision === 'rejected' ? 'bg-destructive/5' : ''
                            }
                          >
                            <TableCell>{formatDate(item.expense.date)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{item.expense.description}</span>
                                {item.expense.is_out_of_policy && (
                                  <Badge variant="outline" className="text-xs border-destructive text-destructive">
                                    Fora da política
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.expense.category?.name || '-'}
                            </TableCell>
                            <TableCell>
                              {item.expense.receipt_path ? (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 gap-1"
                                  onClick={() => openReceipt(item.expense.receipt_path)}
                                >
                                  <Paperclip className="h-4 w-4" />
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.expense.amount_cents, item.expense.currency)}
                            </TableCell>
                            {(canApprove || showReviewStatus) && (
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  {canApprove && !item.review_decision && (
                                    <>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1 text-green-600 border-green-500/50 hover:bg-green-500/10"
                                        onClick={() => handleApproveExpense(item.expense.id)}
                                        disabled={reviewExpense.isPending}
                                      >
                                        <ThumbsUp className="h-3 w-3" />
                                        Aprovar
                                      </Button>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1 text-destructive border-destructive/50 hover:bg-destructive/10"
                                        onClick={() => handleOpenRejectExpense(item.expense.id)}
                                        disabled={reviewExpense.isPending}
                                      >
                                        <ThumbsDown className="h-3 w-3" />
                                        Reprovar
                                      </Button>
                                    </>
                                  )}
                                  {item.review_decision && (
                                    <div className="flex items-center gap-2">
                                      <ExpenseReviewBadge decision={item.review_decision} comment={item.review_comment} />
                                      {canApprove && (
                                        <div className="flex gap-1">
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7"
                                            onClick={() => handleApproveExpense(item.expense.id)}
                                            disabled={reviewExpense.isPending}
                                            title="Alterar para Aprovada"
                                          >
                                            <ThumbsUp className="h-3 w-3" />
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7"
                                            onClick={() => handleOpenRejectExpense(item.expense.id)}
                                            disabled={reviewExpense.isPending}
                                            title="Alterar para Reprovada"
                                          >
                                            <ThumbsDown className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {!canApprove && !item.review_decision && showReviewStatus && (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </div>
                              </TableCell>
                            )}
                            {canEdit && (
                              <TableCell>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive" 
                                  onClick={() => handleRemoveExpense(item.expense.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                          {/* Show rejection reason below the row */}
                          {item.review_decision === 'rejected' && item.review_comment && (
                            <TableRow key={`${item.id}-comment`} className="bg-destructive/5 hover:bg-destructive/5">
                              <TableCell colSpan={canEdit ? 7 : 6} className="py-2">
                                <div className="flex items-start gap-2 text-sm text-destructive pl-2">
                                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                  <span><strong>Motivo:</strong> {item.review_comment}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval History */}
          {report.approvals && report.approvals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <MessageSquare className="h-5 w-5" />
                  Histórico de Aprovação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.approvals.map((approval: any) => (
                  <div key={approval.id} className="flex gap-4">
                    <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      approval.decision === 'approved' 
                        ? 'bg-green-500/20 text-green-600' 
                        : 'bg-destructive/20 text-destructive'
                    }`}>
                      {approval.decision === 'approved' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {approval.decision === 'approved' ? 'Aprovado' : 'Reprovado'} por {approval.approver?.full_name || 'Gestor'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(approval.decided_at).toLocaleString('pt-BR')}
                      </p>
                      {approval.comment && (
                        <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{approval.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={report.status} type="report" />
            </div>
            <Separator />
            {canApprove && totalExpenses > 0 && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ListChecks className="h-4 w-4" />
                      Revisão
                    </span>
                    <span className={allReviewed ? 'text-primary font-medium' : ''}>
                      {reviewedCount} de {totalExpenses}
                    </span>
                  </div>
                  <Progress value={reviewProgress} className="h-2" />
                  {hasRejected && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Há despesas reprovadas
                    </p>
                  )}
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Despesas</span>
              <span>{report.expense_count || 0}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatCurrency(report.total_cents || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit Confirmation */}
      <ConfirmDialog 
        open={isSubmitOpen} 
        onOpenChange={setIsSubmitOpen} 
        title="Enviar para Aprovação" 
        description={`Enviar relatório com ${report.expense_count} despesa(s) totalizando ${formatCurrency(report.total_cents || 0)}?`} 
        confirmLabel="Enviar" 
        onConfirm={handleSubmit} 
        isLoading={submitReport.isPending} 
      />

      {/* Approve Dialog */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Relatório</DialogTitle>
            <DialogDescription>
              Aprovar "{report.title}" - {formatCurrency(report.total_cents || 0)}?
            </DialogDescription>
          </DialogHeader>
          <Textarea 
            placeholder="Comentário (opcional)" 
            value={comment} 
            onChange={(e) => setComment(e.target.value)} 
            className="min-h-[100px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsApproveOpen(false)}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={approveReport.isPending}>
              {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Report Dialog */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Relatório</DialogTitle>
            <DialogDescription>Reprovar "{report.title}"?</DialogDescription>
          </DialogHeader>
          <Textarea 
            placeholder="Motivo da reprovação (obrigatório)" 
            value={comment} 
            onChange={(e) => setComment(e.target.value)} 
            className="min-h-[100px]"
          />
          {!comment && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Informe o motivo da reprovação
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={approveReport.isPending || !comment}
            >
              {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Individual Expense Dialog */}
      <Dialog open={!!rejectExpenseId} onOpenChange={(open) => !open && setRejectExpenseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Despesa</DialogTitle>
            <DialogDescription>Informe o motivo da reprovação desta despesa.</DialogDescription>
          </DialogHeader>
          <Textarea 
            placeholder="Motivo da reprovação (obrigatório)" 
            value={rejectExpenseComment} 
            onChange={(e) => setRejectExpenseComment(e.target.value)} 
            className="min-h-[100px]"
            autoFocus
          />
          {!rejectExpenseComment && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              O motivo é obrigatório
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectExpenseId(null)}>Cancelar</Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectExpense} 
              disabled={reviewExpense.isPending || !rejectExpenseComment}
            >
              {reviewExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reprovar Despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Confirmation */}
      <ConfirmDialog 
        open={isPaidOpen} 
        onOpenChange={setIsPaidOpen} 
        title="Marcar como Pago" 
        description={`Confirmar pagamento de ${formatCurrency(report.total_cents || 0)}?`} 
        confirmLabel="Confirmar Pagamento" 
        onConfirm={handleMarkPaid} 
        isLoading={markAsPaid.isPending} 
      />
    </AppShell>
  );
}
