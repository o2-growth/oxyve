import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminOverview } from '@/hooks/useAdminOverview';
import { useExpenses } from '@/hooks/useExpenses';
import { useReports } from '@/hooks/useReports';
import { useDashboardContext } from '@/hooks/useCurrentReport';
import { formatCurrency, formatDate } from '@/lib/constants';
import { FileText, TrendingUp, Clock, CheckCircle2, Undo2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrentReportCard } from '@/components/dashboard/CurrentReportCard';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { PushPermissionPrompt } from '@/components/notifications/PushPermissionPrompt';

export default function Dashboard() {
  const { profile, isManager } = useAuth();
  
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: reports, isLoading: reportsLoading } = useReports();
  const { data: dashboardContext, isLoading: contextLoading } = useDashboardContext();

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  const isLoading = expensesLoading || reportsLoading || contextLoading;

  // Para gestor a RLS devolve os relatórios da org inteira; o placar do Início é
  // pessoal, então conta só os do próprio usuário.
  const myReports = reports?.filter((r) => r.user_id === profile?.id) ?? [];
  const draftReports = myReports.filter((r) => r.status === 'draft').length;
  const submittedReports = myReports.filter((r) => r.status === 'submitted').length;
  const approvedReports = myReports.filter((r) => r.status === 'approved').length;

  // Calculate current report expenses using dashboard context
  const currentReportId = dashboardContext?.current_report?.id;
  const currentReportExpenses = currentReportId ? {
    total_cents: expenses
      ?.filter((e) => e.report?.id === currentReportId)
      .reduce((sum, e) => sum + e.amount_cents, 0) || 0,
    count: expenses
      ?.filter((e) => e.report?.id === currentReportId)
      .length || 0,
  } : null;

  const { data: adminOverview } = useAdminOverview();
  const latePending = adminOverview?.fora_do_prazo?.length ?? 0;

  // Relatório do próprio usuário devolvido pelo gestor: vira faixa no topo do Início.
  // `useReports` descarta last_rejection_comment no mapeamento, então lemos direto.
  const { data: returnedReports } = useQuery({
    queryKey: ['reports', 'returned', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('id, title, last_rejection_comment, returned_at')
        .eq('user_id', profile!.id)
        .eq('status', 'draft')
        .not('last_rejection_comment', 'is', null)
        .order('returned_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).filter((r) => (r.last_rejection_comment ?? '').trim() !== '');
    },
  });

  // Gestor/admin: a RLS devolve relatórios da empresa; cada linha diz de quem é.
  const recentReports = reports?.slice(0, 5) ?? [];
  const periodExpenses = expenses?.filter((e) => e.report?.id === currentReportId).slice(0, 5) ?? [];

  const pendingApproval = isManager
    ? reports?.filter((r) => r.status === 'submitted' && r.user_id !== profile?.id).length || 0
    : 0;

  return (
    <AppShell>
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Veja o resumo das suas despesas e relatórios"
      />

      {/* Sprint 7 — push permission prompt (aparece após 30s, no-op sem VAPID). */}
      <div className="mb-4">
        <PushPermissionPrompt />
      </div>

      {/* Devolução do gestor: o colaborador vê antes de qualquer outra coisa. */}
      {returnedReports?.map((ret) => (
        <Link
          key={ret.id}
          to={`/app/reports/${ret.id}`}
          data-testid="returned-report-banner"
          className="mb-4 flex min-h-11 flex-col gap-2 rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm transition-colors hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              Seu relatório <strong>{ret.title}</strong> foi devolvido:{' '}
              {(ret.last_rejection_comment ?? '').trim().replace(/[.!?…]+$/, '')}
            </span>
          </span>
          <span className="shrink-0 font-medium text-destructive">Corrigir e reenviar →</span>
        </Link>
      ))}

      {/* Aprovador: o que espera decisão vem antes do próprio relatório. */}
      {pendingApproval > 0 && (
        <Link
          to="/app/reports?tab=approval"
          className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm transition-colors hover:bg-primary/15"
        >
          <span>
            <strong className="o2-num">{pendingApproval}</strong>{' '}
            {pendingApproval === 1 ? 'relatório aguardando' : 'relatórios aguardando'} sua aprovação
          </span>
          <span className="font-medium text-primary">Revisar →</span>
        </Link>
      )}

      {latePending > 0 && (
        <Link
          to="/app/gestao"
          className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[hsl(var(--status-event)/0.5)] bg-[hsl(var(--status-event)/0.08)] px-4 py-3 text-sm transition-colors hover:bg-[hsl(var(--status-event)/0.14)]"
        >
          <span>
            <strong className="o2-num">{latePending}</strong>{' '}
            {latePending === 1 ? 'despesa lançada após o envio aguarda' : 'despesas lançadas após o envio aguardam'} sua decisão
          </span>
          <span className="font-medium">Decidir →</span>
        </Link>
      )}

      {/* Current Period Report Card */}
      <div className="mb-6 md:mb-8">
        <CurrentReportCard
          onAddExpense={() => setExpenseDialogOpen(true)}
          reportExpenses={currentReportExpenses}
        />
      </div>

      {/* Stats como PLACAR — hierarquia do dinheiro, entrada em stagger */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Período Atual — valor em moeda (R$ menor e muted, número grita) */}
        <Card className="o2-rise" style={{ animationDelay: '0ms' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <span className="o2-eyebrow">{isManager ? 'Seu período atual' : 'Período atual'}</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-9 w-28" />
            ) : (
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-mono text-sm text-muted-foreground">R$</span>
                <span className="o2-display tabular-nums text-3xl sm:text-4xl text-foreground">
                  {new Intl.NumberFormat('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format((currentReportExpenses?.total_cents || 0) / 100)}
                </span>
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {(currentReportExpenses?.count || 0) === 1 ? '1 despesa' : `${currentReportExpenses?.count || 0} despesas`}
            </p>
          </CardContent>
        </Card>

        {/* Rascunhos */}
        <Card className="o2-rise" style={{ animationDelay: '60ms' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <span className="o2-eyebrow">{isManager ? 'Seus rascunhos' : 'Rascunhos'}</span>
              <Clock className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-9 w-14" />
            ) : (
              <div className="mt-2 o2-display tabular-nums text-3xl sm:text-4xl text-foreground">
                {draftReports}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">Aguardando envio</p>
          </CardContent>
        </Card>

        {/* Enviados */}
        <Card className="o2-rise" style={{ animationDelay: '120ms' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <span className="o2-eyebrow">{isManager ? 'Seus enviados' : 'Enviados'}</span>
              <FileText className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-9 w-14" />
            ) : (
              <div className="mt-2 o2-display tabular-nums text-3xl sm:text-4xl text-foreground">
                {submittedReports}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">Em aprovação</p>
          </CardContent>
        </Card>

        {/* Aprovados — único número em verde (destaque) */}
        <Card className="o2-rise" style={{ animationDelay: '180ms' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <span className="o2-eyebrow">{isManager ? 'Seus aprovados' : 'Aprovados'}</span>
              <CheckCircle2 className="h-4 w-4 text-primary hidden sm:block" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-9 w-14" />
            ) : (
              <div className="mt-2 o2-display tabular-nums text-3xl sm:text-4xl text-primary">
                {approvedReports}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">Relatórios aprovados</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity - stack on mobile */}
      <div className="mt-6 md:mt-8 grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">
              {isManager ? 'Suas despesas do período' : 'Despesas do período'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Despesas do seu relatório atual</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : !currentReportExpenses?.count ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                Nenhuma despesa neste período
              </p>
            ) : (
              <ul className="space-y-2">
                {periodExpenses.map((expense) => {
                  const capped =
                    !expense.is_event &&
                    expense.reimbursable_cents != null &&
                    expense.reimbursable_cents < expense.amount_cents;
                  return (
                    <li
                      key={expense.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm" title={expense.description}>
                          {expense.description}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="o2-num">{formatDate(expense.date)}</span>
                          {isManager && expense.owner?.full_name && (
                            <span className="truncate">• {expense.owner.full_name}</span>
                          )}
                          {expense.is_event && (
                            <span className="shrink-0 rounded border border-amber-500/50 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                              Evento
                            </span>
                          )}
                          {capped && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                              Limitado ao teto
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="o2-num font-semibold text-sm sm:text-base">
                          {formatCurrency(capped ? expense.reimbursable_cents ?? 0 : expense.amount_cents, expense.currency)}
                        </p>
                        {capped && (
                          <p className="o2-num text-[11px] text-muted-foreground">
                            de {formatCurrency(expense.amount_cents, expense.currency)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">
              {isManager ? 'Relatórios recentes da empresa' : 'Relatórios recentes'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {isManager ? 'Os 5 últimos relatórios da empresa' : 'Seus últimos 5 relatórios'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recentReports.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                Nenhum relatório encontrado
              </p>
            ) : (
              <ul className="space-y-2">
                {recentReports.map((report) => {
                  const reimb = report.reimbursable_cents ?? report.total_cents ?? 0;
                  const total = report.total_cents ?? 0;
                  const owner = report.user_id === profile?.id ? 'Você' : report.user?.full_name || 'Colaborador';
                  return (
                    <li key={report.id}>
                      <Link
                        to={`/app/reports/${report.id}`}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">{report.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {isManager && <>{owner} • </>}
                            {report.expense_count === 1 ? '1 despesa' : `${report.expense_count ?? 0} despesas`}
                          </p>
                        </div>
                        <div className="ml-2 shrink-0 text-right">
                          <p className="o2-num font-semibold text-sm sm:text-base">{formatCurrency(reimb)}</p>
                          {reimb !== total && (
                            <p className="o2-num text-[11px] text-muted-foreground">de {formatCurrency(total)}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Form Dialog */}
      <ExpenseFormDialog 
        open={expenseDialogOpen} 
        onOpenChange={setExpenseDialogOpen}
        useCurrentReportFlow={true}
      />
    </AppShell>
  );
}