import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useReports } from '@/hooks/useReports';
import { formatCurrency } from '@/lib/constants';
import { Plus, FileText, Receipt, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { profile, isManager } = useAuth();
  const navigate = useNavigate();
  
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: reports, isLoading: reportsLoading } = useReports();

  const isLoading = expensesLoading || reportsLoading;

  // Calculate stats
  const draftReports = reports?.filter((r) => r.status === 'draft').length || 0;
  const submittedReports = reports?.filter((r) => r.status === 'submitted').length || 0;
  const approvedReports = reports?.filter((r) => r.status === 'approved').length || 0;

  const totalExpensesThisMonth = expenses
    ?.filter((e) => {
      const expenseDate = new Date(e.date);
      const now = new Date();
      return (
        expenseDate.getMonth() === now.getMonth() &&
        expenseDate.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, e) => sum + e.amount_cents, 0) || 0;

  const pendingApproval = reports?.filter((r) => r.status === 'submitted').length || 0;

  return (
    <AppShell>
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Veja o resumo das suas despesas e relatórios"
      />

      {/* Quick Actions */}
      <div className="mb-8 flex flex-wrap gap-4">
        <Button onClick={() => navigate('/app/expenses')} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Despesa
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/app/reports')}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Novo Relatório
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas do Mês
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(totalExpensesThisMonth)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {expenses?.filter((e) => {
                const d = new Date(e.date);
                const n = new Date();
                return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
              }).length || 0}{' '}
              despesas
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
            <Receipt className="h-4 w-4 text-muted-foreground" />
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
            <Button onClick={() => navigate('/app/reports?status=submitted')}>
              Ver Relatórios Pendentes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas Recentes</CardTitle>
            <CardDescription>Suas últimas 5 despesas</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : expenses?.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma despesa encontrada
              </p>
            ) : (
              <div className="space-y-3">
                {expenses?.slice(0, 5).map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{expense.description}</p>
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
    </AppShell>
  );
}
