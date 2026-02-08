import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useReports } from '@/hooks/useReports';
import { useCurrentReport } from '@/hooks/useCurrentReport';
import { formatCurrency } from '@/lib/constants';
import { FileText, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrentReportCard } from '@/components/dashboard/CurrentReportCard';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';

export default function Dashboard() {
  const { profile, isManager } = useAuth();
  const navigate = useNavigate();
  
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: reports, isLoading: reportsLoading } = useReports();
  const { data: currentReport, isLoading: currentReportLoading } = useCurrentReport();

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  const isLoading = expensesLoading || reportsLoading || currentReportLoading;

  // Calculate stats
  const draftReports = reports?.filter((r) => r.status === 'draft').length || 0;
  const submittedReports = reports?.filter((r) => r.status === 'submitted').length || 0;
  const approvedReports = reports?.filter((r) => r.status === 'approved').length || 0;

  // Calculate current report expenses
  const currentReportExpenses = currentReport ? {
    total_cents: expenses
      ?.filter((e) => (e as any).report?.id === currentReport.id)
      .reduce((sum, e) => sum + e.amount_cents, 0) || 0,
    count: expenses
      ?.filter((e) => (e as any).report?.id === currentReport.id)
      .length || 0,
  } : null;

  const pendingApproval = reports?.filter((r) => r.status === 'submitted').length || 0;

  return (
    <AppShell>
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Veja o resumo das suas despesas e relatórios"
      />

      {/* Current Period Report Card */}
      <div className="mb-8">
        <CurrentReportCard 
          onAddExpense={() => setExpenseDialogOpen(true)}
          reportExpenses={currentReportExpenses}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Período Atual
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(currentReportExpenses?.total_cents || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {currentReportExpenses?.count || 0} despesas
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Relatórios em Rascunho
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{draftReports}</div>
            )}
            <p className="text-xs text-muted-foreground">Aguardando envio</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Aprovação
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{submittedReports}</div>
            )}
            <p className="text-xs text-muted-foreground">Relatórios enviados</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aprovados
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-status-approved" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{approvedReports}</div>
            )}
            <p className="text-xs text-muted-foreground">Relatórios aprovados</p>
          </CardContent>
        </Card>
      </div>

      {/* Manager Section */}
      {isManager && pendingApproval > 0 && (
        <Card className="mt-8 border-status-submitted/50 bg-status-submitted/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-status-submitted" />
              Relatórios Pendentes de Aprovação
            </CardTitle>
            <CardDescription>
              Você tem {pendingApproval} relatório(s) aguardando sua análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button 
              onClick={() => navigate('/app/reports?status=submitted')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Ver Relatórios Pendentes
            </button>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas do Período</CardTitle>
            <CardDescription>Despesas do relatório atual</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !currentReportExpenses?.count ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma despesa neste período
              </p>
            ) : (
              <div className="space-y-3">
                {expenses
                  ?.filter((e) => (e as any).report?.id === currentReport?.id)
                  .slice(0, 5)
                  .map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{expense.description}</p>
                          {(expense as any).is_out_of_policy && (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                              Fora da política
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(expense.date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(expense.amount_cents, expense.currency)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relatórios Recentes</CardTitle>
            <CardDescription>Seus últimos 5 relatórios</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : reports?.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum relatório encontrado
              </p>
            ) : (
              <div className="space-y-3">
                {reports?.slice(0, 5).map((report) => (
                  <div
                    key={report.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/app/reports/${report.id}`)}
                  >
                    <div>
                      <p className="font-medium">{report.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {report.expense_count} despesa(s)
                      </p>
                    </div>
                    <p className="font-semibold">
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
