import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useReports } from '@/hooks/useReports';
import { useDashboardContext } from '@/hooks/useCurrentReport';
import { formatCurrency } from '@/lib/constants';
import { FileText, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrentReportCard } from '@/components/dashboard/CurrentReportCard';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { PushPermissionPrompt } from '@/components/notifications/PushPermissionPrompt';

export default function Dashboard() {
  const { profile, isManager } = useAuth();
  const navigate = useNavigate();
  
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: reports, isLoading: reportsLoading } = useReports();
  const { data: dashboardContext, isLoading: contextLoading } = useDashboardContext();

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  const isLoading = expensesLoading || reportsLoading || contextLoading;

  // Calculate stats
  const draftReports = reports?.filter((r) => r.status === 'draft').length || 0;
  const submittedReports = reports?.filter((r) => r.status === 'submitted').length || 0;
  const approvedReports = reports?.filter((r) => r.status === 'approved').length || 0;

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

  const pendingApproval = reports?.filter((r) => r.status === 'submitted').length || 0;

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
              <span className="o2-eyebrow">Período Atual</span>
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
              {currentReportExpenses?.count || 0} despesas
            </p>
          </CardContent>
        </Card>

        {/* Rascunhos */}
        <Card className="o2-rise" style={{ animationDelay: '60ms' }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <span className="o2-eyebrow">Rascunhos</span>
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
              <span className="o2-eyebrow">Enviados</span>
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
              <span className="o2-eyebrow">Aprovados</span>
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

      {/* Manager Section */}
      {isManager && pendingApproval > 0 && (
        <Card className="mt-6 md:mt-8 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Relatórios Pendentes de Aprovação
            </CardTitle>
            <CardDescription>
              Você tem {pendingApproval} relatório(s) aguardando sua análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate('/app/reports?status=submitted')}
              className="w-full sm:w-auto h-12 sm:h-10"
            >
              Ver Relatórios Pendentes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity - stack on mobile */}
      <div className="mt-6 md:mt-8 grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Despesas do Período</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Despesas do relatório atual</CardDescription>
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
              <div className="space-y-2">
                {expenses
                  ?.filter((e) => e.report?.id === currentReportId)
                  .slice(0, 5)
                  .map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate text-sm">{expense.description}</p>
                          {expense.is_out_of_policy && (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                              Fora da política
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(expense.date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <p className="font-semibold text-sm sm:text-base shrink-0 ml-2">
                        {formatCurrency(expense.amount_cents, expense.currency)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Relatórios Recentes</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Seus últimos 5 relatórios</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : reports?.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                Nenhum relatório encontrado
              </p>
            ) : (
              <div className="space-y-2">
                {reports?.slice(0, 5).map((report) => (
                  <div
                    key={report.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                    onClick={() => navigate(`/app/reports/${report.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.expense_count} despesa(s)
                      </p>
                    </div>
                    <p className="font-semibold text-sm sm:text-base shrink-0 ml-2">
                      {formatCurrency(report.total_cents || 0)}
                    </p>
                  </div>
                ))}
              </div>
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