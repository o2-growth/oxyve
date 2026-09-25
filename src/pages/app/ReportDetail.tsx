import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useReport, useRemoveExpenseFromReport } from '@/hooks/useReports';
import { useSubmitReportRpc } from '@/hooks/useCurrentReport';
import { useApproveReportRpc, useMarkReportPaidRpc } from '@/hooks/useReportActions';
import { useReviewExpense } from '@/hooks/useReviewExpense';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Trash2, Receipt, Wallet,
  MessageSquare, Clock, AlertTriangle, Loader2, Paperclip,
  ListChecks, ThumbsUp, ThumbsDown, MoreHorizontal, Download, FileSpreadsheet, FileText, History,
  Undo2, Info,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import type { ExportableReport } from '@/lib/exportReport';
import { ReportHistory } from '@/components/reports/ReportHistory';

// Sprint 3 — tipagem dos itens do relatório (consumidos via select com joins).
// Os hooks devolvem `unknown[]` por causa dos relacionamentos dinâmicos do
// PostgREST; centralizamos a interpretação aqui.
interface ReportExpense {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  currency?: string | null;
  payment_method?: string;
  is_reimbursable?: boolean | null;
  is_out_of_policy?: boolean | null;
  receipt_path?: string | null;
  category?: { name: string } | null;
  cost_center?: { name: string } | null;
}
interface ReportItem {
  id: string;
  expense: ReportExpense;
  review_decision?: 'approved' | 'rejected' | null;
  review_comment?: string | null;
}
interface ReportApproval {
  id: string;
  decision: 'approved' | 'rejected';
  decided_at: string;
  comment?: string | null;
  approver?: { full_name?: string | null } | null;
}
interface ReportExtras {
  start_date?: string | null;
  end_date?: string | null;
  submitted_late?: boolean | null;
  last_rejection_comment?: string | null;
  returned_at?: string | null;
}

/** Campos de regra de reembolso que o `useReport` ainda não traz no join. */
interface ExpenseRules {
  id: string;
  reimbursable_cents: number | null;
  food_days: number;
  is_event: boolean;
  is_out_of_policy: boolean;
  notes: string | null;
  late_decision: string | null;
}

/** Linha já interpretada: tudo que a UI precisa para uma despesa do relatório. */
interface Row {
  item: ReportItem;
  e: ReportExpense;
  amount: number;
  /** Quanto dessa despesa entra no reembolso (0 se não reembolsável). */
  reimb: number;
  capped: boolean;
  foodDays: number;
  outOfPolicy: boolean;
  outReason: string | null;
  latePending: boolean;
  notReimbursable: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Descrição longa sem espaço não pode empurrar o layout: quebra em qualquer ponto.
const WRAP = '[overflow-wrap:anywhere]';

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ReportExpense | null>(null);

  // Individual expense rejection dialog
  const [rejectExpenseId, setRejectExpenseId] = useState<string | null>(null);
  const [rejectExpenseComment, setRejectExpenseComment] = useState('');

  const items = useMemo(
    () => ((report?.items as ReportItem[] | undefined) ?? []).filter((it) => !!it.expense),
    [report?.items]
  );
  const expenseIds = useMemo(() => items.map((it) => it.expense.id).sort(), [items]);

  // A chave começa com ['report', id]: qualquer invalidação do relatório refaz esta também.
  const { data: rules } = useQuery({
    queryKey: ['report', id, 'expense-rules', expenseIds.join(',')],
    enabled: !!id && expenseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, reimbursable_cents, food_days, is_event, is_out_of_policy, notes, late_decision')
        .in('id', expenseIds);
      if (error) throw error;
      const map: Record<string, ExpenseRules> = {};
      (data ?? []).forEach((r) => {
        map[r.id] = r as ExpenseRules;
      });
      return map;
    },
  });

  const rows: Row[] = useMemo(
    () =>
      items.map((item) => {
        const e = item.expense;
        const rule = rules?.[e.id];
        const amount = e.amount_cents ?? 0;
        const covered = rule?.reimbursable_cents ?? amount;
        const notReimbursable = e.is_reimbursable === false;
        const capped = covered < amount && !rule?.is_event;
        const outOfPolicy = !!(rule?.is_out_of_policy ?? e.is_out_of_policy);
        let outReason: string | null = null;
        if (outOfPolicy && rule?.is_event) {
          outReason = rule.notes?.trim() ? `Evento: ${rule.notes.trim()}` : 'Evento/viagem';
        } else if (capped) {
          outReason = 'Teto de alimentação';
        } else if (outOfPolicy) {
          outReason = 'Fora da política';
        }
        return {
          item,
          e,
          amount,
          reimb: notReimbursable ? 0 : covered,
          capped,
          foodDays: rule?.food_days ?? 1,
          outOfPolicy,
          outReason,
          latePending: rule?.late_decision === 'pending',
          notReimbursable,
        };
      }),
    [items, rules]
  );

  const totalCents = report?.total_cents || 0;
  const reimbursableTotal = rows.reduce((s, r) => s + r.reimb, 0);
  const notReimbursedTotal = Math.max(totalCents - reimbursableTotal, 0);

  const r = report as (typeof report & ReportExtras) | undefined;
  const isOwner = report?.user_id === user?.id;
  const isReturned = report?.status === 'draft' && !!r?.last_rejection_comment;
  const canEdit = isOwner && report?.status === 'draft';
  const canApprove = isManager && (!isOwner || isAdmin) && report?.status === 'submitted';
  const canMarkPaid = isAdmin && report?.status === 'approved';
  const showReviewStatus =
    (isReturned && items.some((it) => it.review_decision)) || report?.status === 'rejected' || report?.status === 'approved' || report?.status === 'submitted';
  const busy = submitReport.isPending || approveReport.isPending || markAsPaid.isPending;

  // Count reviewed expenses (those with a decision from expense_reviews)
  const totalExpenses = items.length;
  const reviewedItems = items.filter((item) => item.review_decision);
  const reviewedCount = reviewedItems.length;
  const allReviewed = totalExpenses > 0 && reviewedCount >= totalExpenses;
  const reviewProgress = totalExpenses > 0 ? (reviewedCount / totalExpenses) * 100 : 0;
  const hasRejected = reviewedItems.some((item) => item.review_decision === 'rejected');

  // Os hooks de ação invalidam só as listas; o detalhe (['report', id]) ficava velho
  // até recarregar. Refaz aqui tudo que a tela e a casca mostram.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['report', id] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
      queryClient.invalidateQueries({ queryKey: ['current-report'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] }),
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    ]);

  // Erros já viram toast nos hooks; aqui só evitamos a rejeição não tratada.
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    try {
      await fn();
      after?.();
    } catch {
      // noop
    } finally {
      await refresh();
    }
  };

  const handleApproveExpense = (expenseId: string) =>
    run(() => reviewExpense.mutateAsync({ expenseId, reportId: id!, decision: 'approved' }));

  const handleOpenRejectExpense = (expenseId: string) => {
    setRejectExpenseId(expenseId);
    setRejectExpenseComment('');
  };

  const handleRejectExpense = async () => {
    if (!rejectExpenseId || !rejectExpenseComment) return;
    await run(
      () =>
        reviewExpense.mutateAsync({
          expenseId: rejectExpenseId,
          reportId: id!,
          decision: 'rejected',
          comment: rejectExpenseComment,
        }),
      () => {
        setRejectExpenseId(null);
        setRejectExpenseComment('');
      }
    );
  };

  const handleSubmit = () => run(() => submitReport.mutateAsync(id!), () => setIsSubmitOpen(false));

  const handleApprove = () =>
    run(
      () => approveReport.mutateAsync({ reportId: id!, decision: 'approved', comment: comment || undefined }),
      () => {
        setIsApproveOpen(false);
        setComment('');
      }
    );

  const handleReject = async () => {
    if (!comment) return;
    await run(
      () => approveReport.mutateAsync({ reportId: id!, decision: 'rejected', comment }),
      () => {
        setIsRejectOpen(false);
        setComment('');
      }
    );
  };

  const handleMarkPaid = () => run(() => markAsPaid.mutateAsync(id!), () => setIsPaidOpen(false));

  const handleRemoveExpense = async () => {
    if (!removeTarget) return;
    await run(
      () => removeExpense.mutateAsync({ reportId: id!, expenseId: removeTarget.id }),
      () => setRemoveTarget(null)
    );
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

  const buildExportable = (): ExportableReport | null => {
    if (!report) return null;
    const expenses = rows.map(({ e }) => ({
      date: e.date,
      description: e.description,
      category: e.category?.name ?? null,
      costCenter: e.cost_center?.name ?? null,
      paymentMethod: e.payment_method ?? 'other',
      amountCents: e.amount_cents ?? 0,
      currency: e.currency ?? 'BRL',
    }));
    return {
      title: report.title,
      authorName: report.user?.full_name ?? null,
      status: report.status,
      startDate: r?.start_date ?? null,
      endDate: r?.end_date ?? null,
      totalCents,
      reimbursableCents: reimbursableTotal,
      expenses,
    };
  };

  const handleExportCsv = async () => {
    const exportable = buildExportable();
    if (!exportable) return;
    try {
      const mod = await import('@/lib/exportReport');
      mod.downloadReportCsv(exportable);
      toast.success('CSV gerado!');
    } catch {
      toast.error('Erro ao gerar CSV');
    }
  };

  const handleExportXlsx = async () => {
    const exportable = buildExportable();
    if (!exportable) return;
    try {
      const mod = await import('@/lib/exportReport');
      mod.downloadReportXlsx(exportable);
      toast.success('Excel gerado!');
    } catch {
      toast.error('Erro ao gerar Excel');
    }
  };

  const handleExportPdf = async () => {
    const exportable = buildExportable();
    if (!exportable) return;
    try {
      // Sprint 3 — dynamic import: jsPDF é pesado (~200KB), não entra no chunk inicial.
      const mod = await import('@/lib/exportReportPdf');
      mod.downloadReportPdf(exportable);
      toast.success('PDF gerado!');
    } catch (err) {
      console.error('[exportReportPdf] erro', err);
      toast.error('Erro ao gerar PDF');
    }
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

  const returnedAtLabel = r?.returned_at
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(r.returned_at))
    : null;

  const actionSize = 'h-11 lg:h-9';

  return (
    <AppShell>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/reports')} className={cn('gap-2', actionSize)}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <PageHeader
        title={report.title}
        description={(() => {
          if (!report.user?.full_name) return undefined;
          const range = r?.start_date && r?.end_date
            ? ` • ${format(parseISO(r.start_date), 'dd MMM', { locale: ptBR })} - ${format(parseISO(r.end_date), 'dd MMM yyyy', { locale: ptBR })}`
            : '';
          return `Por ${report.user.full_name}${range}`;
        })()}
      />

      {/* Devolvido pelo gestor — autor e gestor veem o mesmo motivo. */}
      {isReturned && (
        <Alert className="mb-4 border-destructive/60 bg-destructive/10 text-foreground" data-testid="returned-banner">
          <Undo2 className="h-4 w-4 !text-destructive" />
          <AlertTitle>Relatório devolvido</AlertTitle>
          <AlertDescription className={WRAP}>
            Devolvido pelo gestor{returnedAtLabel ? ` em ${returnedAtLabel}` : ''}: {(r?.last_rejection_comment ?? '').trim().replace(/[.!?…]+$/, '')}.
            {' '}Corrija as despesas e envie de novo.
          </AlertDescription>
        </Alert>
      )}

      {/* Status and Actions Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={report.status} type="report" />
          {r?.submitted_late && (
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
              disabled={!items.length || busy}
              className={cn('gap-2', actionSize)}
            >
              {submitReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{isReturned ? 'Reenviar para aprovação' : 'Enviar para aprovação'}</span>
              <span className="sm:hidden">{isReturned ? 'Reenviar' : 'Enviar'}</span>
            </Button>
          )}
          {canApprove && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsRejectOpen(true)}
                className={cn('gap-2', actionSize)}
                disabled={!allReviewed || busy}
                title={!allReviewed ? `Revise ${totalExpenses === 1 ? 'a despesa' : `as ${totalExpenses} despesas`} antes` : undefined}
              >
                <XCircle className="h-4 w-4 text-destructive" />
                {hasRejected ? 'Reprovar relatório' : 'Reprovar'}
              </Button>
              <Button
                onClick={() => setIsApproveOpen(true)}
                className={cn('gap-2', actionSize)}
                disabled={!allReviewed || hasRejected || busy}
                title={!allReviewed ? `Revise ${totalExpenses === 1 ? 'a despesa' : `as ${totalExpenses} despesas`} antes` : hasRejected ? 'Há despesas reprovadas' : undefined}
              >
                {approveReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aprovar relatório
              </Button>
            </>
          )}
          {canMarkPaid && (
            <Button onClick={() => setIsPaidOpen(true)} className={cn('gap-2', actionSize)} disabled={busy}>
              {markAsPaid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Marcar como pago
            </Button>
          )}

          {/* Sprint 2 — GAP-G009/G011: Mais ações (export + histórico) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={cn('gap-2 min-w-11', actionSize)} aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Mais ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Exportar</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Baixar em CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportXlsx}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Baixar em Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                <FileText className="mr-2 h-4 w-4" />
                Baixar em PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                Exibir histórico
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPIs (GAP-G014) — o que se paga é o valor a reembolsar, não o lançado. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="col-span-2 min-w-0 lg:col-span-1">
          <CardContent className="p-4">
            <p className="o2-eyebrow">A reembolsar</p>
            <p className="o2-display tabular-nums text-2xl sm:text-3xl text-foreground">
              {formatCurrency(reimbursableTotal)}
            </p>
            {notReimbursedTotal > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(notReimbursedTotal)} fora do reembolso (teto ou não reembolsável)
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="o2-eyebrow">Total lançado</p>
            <p className="o2-num text-base sm:text-xl font-semibold">{formatCurrency(totalCents)}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="o2-eyebrow">Despesas</p>
            <p className="o2-num text-base sm:text-xl font-semibold">{items.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Expenses List */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Despesas</CardTitle>
              <CardDescription>{plural(items.length, 'despesa', 'despesas')}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {!items.length ? (
                <EmptyState
                  icon={<Receipt className="h-6 w-6" />}
                  title="Nenhuma despesa"
                  description="Adicione despesas pela página de despesas."
                  className="py-8"
                />
              ) : isMobile ? (
                // Mobile: lista de cards — valor, status e ações sempre visíveis.
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <li
                      key={row.item.id}
                      className={cn(
                        'min-w-0 space-y-2 rounded-lg border p-3 transition-colors',
                        row.item.review_decision === 'approved' && 'border-green-500/40 bg-green-500/5',
                        row.item.review_decision === 'rejected' && 'border-destructive/40 bg-destructive/5'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-sans font-medium line-clamp-2', WRAP)} title={row.e.description}>
                            {row.e.description}
                          </p>
                          <p className="o2-num text-[11px] text-muted-foreground">
                            {formatDate(row.e.date)} • {row.e.category?.name || 'Sem categoria'}
                          </p>
                        </div>
                        <AmountBlock row={row} />
                      </div>

                      <PolicyBadges row={row} />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {showReviewStatus && <ExpenseReviewBadge decision={row.item.review_decision} />}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {row.e.receipt_path && (
                            <Button
                              variant="outline"
                              className="h-11 gap-1 px-3 text-xs"
                              onClick={() => openReceipt(row.e.receipt_path as string)}
                              aria-label="Ver comprovante"
                            >
                              <Paperclip className="h-4 w-4" />
                              Comprovante
                            </Button>
                          )}
                          {canApprove && (
                            <>
                              <Button
                                variant={row.item.review_decision ? 'ghost' : 'outline'}
                                size="icon"
                                className="h-11 w-11 text-green-600 border-green-500/50 hover:bg-green-500/10"
                                onClick={() => handleApproveExpense(row.e.id)}
                                disabled={reviewExpense.isPending}
                                aria-label={row.item.review_decision ? 'Alterar para aprovada' : 'Aprovar despesa'}
                              >
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant={row.item.review_decision ? 'ghost' : 'outline'}
                                size="icon"
                                className="h-11 w-11 text-destructive border-destructive/50 hover:bg-destructive/10"
                                onClick={() => handleOpenRejectExpense(row.e.id)}
                                disabled={reviewExpense.isPending}
                                aria-label={row.item.review_decision ? 'Alterar para reprovada' : 'Reprovar despesa'}
                              >
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive"
                              onClick={() => setRemoveTarget(row.e)}
                              aria-label="Remover do relatório"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {row.item.review_decision === 'rejected' && row.item.review_comment && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className={WRAP}>
                            <strong>Motivo:</strong> {row.item.review_comment}
                          </AlertDescription>
                        </Alert>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                // Desktop: tabela. min-w-0 no grid + overflow-x-auto garantem que nada
                // empurre a página; a descrição quebra e corta em 2 linhas.
                <div className="-mx-2 overflow-x-auto px-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24 font-mono text-[11px] uppercase tracking-wider">Data</TableHead>
                        <TableHead className="font-mono text-[11px] uppercase tracking-wider">Descrição</TableHead>
                        <TableHead className="w-14 font-mono text-[11px] uppercase tracking-wider">Anexo</TableHead>
                        <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">Valor</TableHead>
                        {(canApprove || showReviewStatus) && (
                          <TableHead className="text-center font-mono text-[11px] uppercase tracking-wider">Revisão</TableHead>
                        )}
                        {canEdit && <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const colCount = 4 + (canApprove || showReviewStatus ? 1 : 0) + (canEdit ? 1 : 0);
                        return (
                          <React.Fragment key={row.item.id}>
                            <TableRow
                              className={cn(
                                row.item.review_decision === 'approved' && 'bg-green-500/5',
                                row.item.review_decision === 'rejected' && 'bg-destructive/5'
                              )}
                            >
                              <TableCell className="o2-num whitespace-nowrap align-top text-muted-foreground">
                                {formatDate(row.e.date)}
                              </TableCell>
                              <TableCell className="min-w-[160px] max-w-[320px] align-top">
                                <p className={cn('font-sans line-clamp-2', WRAP)} title={row.e.description}>
                                  {row.e.description}
                                </p>
                                <p className="text-xs text-muted-foreground">{row.e.category?.name || 'Sem categoria'}</p>
                                <PolicyBadges row={row} className="mt-1" />
                              </TableCell>
                              <TableCell className="align-top">
                                {row.e.receipt_path ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openReceipt(row.e.receipt_path as string)}
                                    aria-label="Ver comprovante"
                                    title="Ver comprovante"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="align-top text-right">
                                <AmountBlock row={row} />
                              </TableCell>
                              {(canApprove || showReviewStatus) && (
                                <TableCell className="align-top">
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {canApprove && !row.item.review_decision && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 gap-1 px-2 text-green-600 border-green-500/50 hover:bg-green-500/10"
                                          onClick={() => handleApproveExpense(row.e.id)}
                                          disabled={reviewExpense.isPending}
                                        >
                                          <ThumbsUp className="h-3 w-3" />
                                          Aprovar
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 gap-1 px-2 text-destructive border-destructive/50 hover:bg-destructive/10"
                                          onClick={() => handleOpenRejectExpense(row.e.id)}
                                          disabled={reviewExpense.isPending}
                                        >
                                          <ThumbsDown className="h-3 w-3" />
                                          Reprovar
                                        </Button>
                                      </>
                                    )}
                                    {row.item.review_decision && (
                                      <>
                                        <ExpenseReviewBadge decision={row.item.review_decision} />
                                        {canApprove && (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleApproveExpense(row.e.id)}
                                              disabled={reviewExpense.isPending}
                                              aria-label="Alterar para aprovada"
                                              title="Alterar para aprovada"
                                            >
                                              <ThumbsUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleOpenRejectExpense(row.e.id)}
                                              disabled={reviewExpense.isPending}
                                              aria-label="Alterar para reprovada"
                                              title="Alterar para reprovada"
                                            >
                                              <ThumbsDown className="h-3 w-3" />
                                            </Button>
                                          </>
                                        )}
                                      </>
                                    )}
                                    {!canApprove && !row.item.review_decision && showReviewStatus && (
                                      <span className="text-sm text-muted-foreground">—</span>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              {canEdit && (
                                <TableCell className="align-top">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => setRemoveTarget(row.e)}
                                    aria-label="Remover do relatório"
                                    title="Remover do relatório"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                            {row.item.review_decision === 'rejected' && row.item.review_comment && (
                              <TableRow className="bg-destructive/5 hover:bg-destructive/5">
                                <TableCell colSpan={colCount} className="py-2">
                                  <div className={cn('flex items-start gap-2 pl-2 text-sm text-destructive', WRAP)}>
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span><strong>Motivo:</strong> {row.item.review_comment}</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval History */}
          {report.approvals && report.approvals.length > 0 && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <MessageSquare className="h-5 w-5" />
                  Histórico de aprovação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(report.approvals as ReportApproval[]).map((approval) => (
                  <div key={approval.id} className="flex gap-4">
                    <div className={cn(
                      'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      approval.decision === 'approved' ? 'bg-green-500/20 text-green-600' : 'bg-destructive/20 text-destructive'
                    )}>
                      {approval.decision === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-sans font-medium">
                        {approval.decision === 'approved' ? 'Aprovado' : 'Devolvido'} por {approval.approver?.full_name || 'Gestor'}
                      </p>
                      <p className="o2-num text-xs text-muted-foreground">
                        {new Date(approval.decided_at).toLocaleString('pt-BR')}
                      </p>
                      {approval.comment && (
                        <p className={cn('mt-2 rounded-lg bg-muted p-3 text-sm', WRAP)}>{approval.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary Sidebar */}
        <Card className="h-fit min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={report.status} type="report" />
            </div>
            <Separator />
            {canApprove && totalExpenses > 0 && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ListChecks className="h-4 w-4" />
                      Revisão
                    </span>
                    <span className={cn('o2-num', allReviewed && 'font-medium text-primary')}>
                      {reviewedCount} de {totalExpenses}
                    </span>
                  </div>
                  <Progress value={reviewProgress} className="h-2" />
                  {hasRejected && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Há despesas reprovadas
                    </p>
                  )}
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Despesas</span>
              <span className="o2-num">{items.length}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total lançado</span>
              <span className="o2-num">{formatCurrency(totalCents)}</span>
            </div>
            <Separator />
            <div className="flex flex-wrap justify-between gap-2 text-lg font-semibold">
              <span>A reembolsar</span>
              <span className="o2-num">{formatCurrency(reimbursableTotal)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit Confirmation */}
      <ConfirmDialog
        open={isSubmitOpen}
        onOpenChange={setIsSubmitOpen}
        title={isReturned ? 'Reenviar para aprovação' : 'Enviar para aprovação'}
        description={`Enviar relatório com ${plural(items.length, 'despesa', 'despesas')}: ${formatCurrency(reimbursableTotal)} a reembolsar (${formatCurrency(totalCents)} lançados)?`}
        confirmLabel="Enviar"
        onConfirm={handleSubmit}
        isLoading={submitReport.isPending}
      />

      {/* Remover item — só desvincula; a despesa segue existindo. */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover do relatório"
        description={`Remover do relatório — a despesa continua em Despesas como avulsa.${removeTarget ? ` (${removeTarget.description.slice(0, 80)}${removeTarget.description.length > 80 ? '…' : ''}, ${formatCurrency(removeTarget.amount_cents, removeTarget.currency ?? undefined)})` : ''}`}
        confirmLabel="Remover do relatório"
        variant="destructive"
        onConfirm={handleRemoveExpense}
        isLoading={removeExpense.isPending}
      />

      {/* Approve Dialog */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar relatório</DialogTitle>
            <DialogDescription className={WRAP}>
              Aprovar "{report.title}" — {formatCurrency(reimbursableTotal)} a reembolsar ({formatCurrency(totalCents)} lançados)?
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Comentário (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter className="gap-2">
            <Button className="h-11 lg:h-10" variant="outline" onClick={() => setIsApproveOpen(false)} disabled={approveReport.isPending}>Cancelar</Button>
            <Button className="h-11 lg:h-10" onClick={handleApprove} disabled={approveReport.isPending}>
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
            <DialogTitle>Reprovar relatório</DialogTitle>
            <DialogDescription className={WRAP}>
              "{report.title}" volta para o autor como rascunho, com o seu motivo. Ele corrige e envia de novo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da reprovação (obrigatório)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px]"
          />
          {!comment && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Informe o motivo da reprovação
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button className="h-11 lg:h-10" variant="outline" onClick={() => setIsRejectOpen(false)} disabled={approveReport.isPending}>Cancelar</Button>
            <Button className="h-11 lg:h-10" variant="destructive" onClick={handleReject} disabled={approveReport.isPending || !comment}>
              {approveReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reprovar e devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Individual Expense Dialog */}
      <Dialog open={!!rejectExpenseId} onOpenChange={(open) => !open && setRejectExpenseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar despesa</DialogTitle>
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
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              O motivo é obrigatório
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button className="h-11 lg:h-10" variant="outline" onClick={() => setRejectExpenseId(null)}>Cancelar</Button>
            <Button
              className="h-11 lg:h-10"
              variant="destructive"
              onClick={handleRejectExpense}
              disabled={reviewExpense.isPending || !rejectExpenseComment}
            >
              {reviewExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reprovar despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Confirmation */}
      <ConfirmDialog
        open={isPaidOpen}
        onOpenChange={setIsPaidOpen}
        title="Marcar como pago"
        description={`Confirmar pagamento de ${formatCurrency(reimbursableTotal)} (valor a reembolsar)?`}
        confirmLabel="Confirmar pagamento"
        onConfirm={handleMarkPaid}
        isLoading={markAsPaid.isPending}
      />

      {/* Report History (GAP-G011) */}
      <ReportHistory reportId={id!} open={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
    </AppShell>
  );
}

function ExpenseReviewBadge({ decision }: { decision: string | null | undefined }) {
  if (!decision) return null;
  if (decision === 'approved') {
    return (
      <Badge className="gap-1 border-green-500/30 bg-green-500/20 text-green-700 dark:text-green-400">
        <ThumbsUp className="h-3 w-3" />
        Aprovada
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 border-destructive/30 bg-destructive/20 text-destructive">
      <ThumbsDown className="h-3 w-3" />
      Reprovada
    </Badge>
  );
}

/** Valor da linha: reembolso vs. lançado quando o teto cortou, e dias cobertos. */
function AmountBlock({ row }: { row: Row }) {
  const cur = row.e.currency ?? undefined;
  return (
    <div className="max-w-[11rem] shrink-0 text-right">
      {row.capped && !row.notReimbursable ? (
        <>
          <p className="o2-num font-semibold">{formatCurrency(row.reimb, cur)}</p>
          <p className="o2-num text-[11px] text-muted-foreground">
            Reembolso {formatCurrency(row.reimb, cur)} de {formatCurrency(row.amount, cur)}
          </p>
        </>
      ) : (
        <p className="o2-num font-semibold">{formatCurrency(row.amount, cur)}</p>
      )}
      {row.notReimbursable && <p className="text-[11px] text-muted-foreground">Não reembolsável</p>}
      {row.foodDays > 1 && <p className="text-[11px] text-muted-foreground">cobre {row.foodDays} dias</p>}
    </div>
  );
}

/** Selos de política: motivo da exceção e lançamento fora do prazo. */
function PolicyBadges({ row, className }: { row: Row; className?: string }) {
  if (!row.outReason && !row.latePending) return null;
  const capTip = row.capped
    ? `O teto de alimentação é R$ 30 por dia${row.foodDays > 1 ? ` (× ${row.foodDays} dias)` : ''}. A nota foi de ${formatCurrency(row.amount)}; o reembolso é de ${formatCurrency(row.reimb)}.`
    : null;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {row.outReason && (
        capTip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help gap-1 border-amber-500/50 text-xs text-amber-700 dark:text-amber-400">
                <Info className="h-3 w-3" />
                {row.outReason}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{capTip}</TooltipContent>
          </Tooltip>
        ) : (
          <Badge
            variant="outline"
            className={cn('max-w-full gap-1 border-amber-500/50 text-left text-xs text-amber-700 dark:text-amber-400', WRAP)}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{row.outReason}</span>
          </Badge>
        )
      )}
      {row.latePending && (
        <Badge variant="outline" className="gap-1 border-blue-500/50 text-xs text-blue-700 dark:text-blue-400">
          <Clock className="h-3 w-3" />
          Lançada após o envio — aguarda o gestor
        </Badge>
      )}
    </div>
  );
}
