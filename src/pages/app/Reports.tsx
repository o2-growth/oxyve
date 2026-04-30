import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReportFormDialog } from '@/components/reports/ReportFormDialog';
import { ReportCard } from '@/components/reports/ReportCard';
import { ApprovalQueue } from '@/components/reports/ApprovalQueue';
import { useReports, useDeleteReport, Report } from '@/hooks/useReports';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/constants';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Trash2,
  FileText,
  DollarSign,
  Receipt,
  TrendingUp,
  ClipboardCheck,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || 'all';
  const tab = searchParams.get('tab') || 'my-reports';
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const { isManager } = useAuth();
  const isMobile = useIsMobile();
  const { data: reports, isLoading } = useReports({ status: statusFilter });
  const { data: pendingReports } = useReports({ status: 'submitted' });
  // Carrega TUDO uma vez pra calcular contadores nas tabs (GAP-G016).
  // Custo é baixo: o useReports já tem cache 1×.
  const { data: allReports } = useReports({ status: 'all' });
  const deleteReport = useDeleteReport();

  const tabCounts = useMemo(() => {
    const c = { all: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, paid: 0 };
    (allReports || []).forEach((r) => {
      c.all += 1;
      if (r.status in c) c[r.status as keyof typeof c] += 1;
    });
    return c;
  }, [allReports]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!reports) return { total: 0, reimbursable: 0, nonReimbursable: 0, average: 0 };
    
    const total = reports.reduce((sum, r) => sum + (r.total_cents || 0), 0);
    const reimbursable = reports.reduce((sum, r) => sum + (r.reimbursable_cents || 0), 0);
    const nonReimbursable = total - reimbursable;
    const average = reports.length > 0 ? total / reports.length : 0;

    return { total, reimbursable, nonReimbursable, average };
  }, [reports]);

  const pendingCount = pendingReports?.length || 0;

  const handleStatusChange = (status: string) => {
    if (status === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', status);
    }
    setSearchParams(searchParams);
  };

  const handleTabChange = (newTab: string) => {
    searchParams.set('tab', newTab);
    if (newTab === 'approval') {
      searchParams.delete('status');
    }
    setSearchParams(searchParams);
  };

  const handleDelete = (report: Report) => {
    setSelectedReport(report);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedReport) {
      await deleteReport.mutateAsync(selectedReport.id);
      setIsDeleteOpen(false);
      setSelectedReport(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Relatórios"
        description={isManager ? "Gerencie e aprove relatórios de despesas" : "Agrupe despesas em relatórios e envie para aprovação"}
        actions={
          <Button onClick={() => setIsFormOpen(true)} className="gap-2 hidden sm:flex">
            <Plus className="h-4 w-4" />
            Novo Relatório
          </Button>
        }
      />

      {/* Manager: Show tabs for My Reports vs Approval Queue */}
      {isManager ? (
        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
            <TabsTrigger value="my-reports" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Meus Relatórios</span>
              <span className="sm:hidden">Meus</span>
            </TabsTrigger>
            <TabsTrigger value="approval" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Fila de Aprovação</span>
              <span className="sm:hidden">Aprovação</span>
              {pendingCount > 0 && (
                <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-reports" className="space-y-4 mt-4">
            <ReportsContent
              reports={reports}
              isLoading={isLoading}
              stats={stats}
              statusFilter={statusFilter}
              tabCounts={tabCounts}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onCreateNew={() => setIsFormOpen(true)}
              isMobile={isMobile}
              isManager={isManager}
            />
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <ApprovalQueue />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          <ReportsContent
            reports={reports}
            isLoading={isLoading}
            stats={stats}
            statusFilter={statusFilter}
            tabCounts={tabCounts}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCreateNew={() => setIsFormOpen(true)}
            isMobile={isMobile}
            isManager={false}
          />
        </div>
      )}

      {/* Dialogs */}
      <ReportFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} />

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Excluir relatório"
        description="Tem certeza que deseja excluir este relatório? As despesas não serão excluídas."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteReport.isPending}
      />
    </AppShell>
  );
}

interface ReportsContentProps {
  reports: Report[] | undefined;
  isLoading: boolean;
  stats: { total: number; reimbursable: number; nonReimbursable: number; average: number };
  statusFilter: string;
  tabCounts: { all: number; draft: number; submitted: number; approved: number; rejected: number; paid: number };
  onStatusChange: (status: string) => void;
  onDelete: (report: Report) => void;
  onCreateNew: () => void;
  isMobile: boolean;
  isManager: boolean;
}

function ReportsContent({
  reports,
  isLoading,
  stats,
  statusFilter,
  tabCounts,
  onStatusChange,
  onDelete,
  onCreateNew,
  isMobile,
  isManager,
}: ReportsContentProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Summary Cards - hide on mobile for cleaner view */}
      <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
              <p className="text-lg sm:text-xl font-bold">{formatCurrency(stats.total)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Reembolsável</p>
              <p className="text-lg sm:text-xl font-bold">{formatCurrency(stats.reimbursable)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden sm:block">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-muted">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Não Reembolsável</p>
              <p className="text-lg sm:text-xl font-bold">{formatCurrency(stats.nonReimbursable)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden sm:block">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Média</p>
              <p className="text-lg sm:text-xl font-bold">{formatCurrency(stats.average)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-6 overflow-x-auto">
        <Tabs value={statusFilter} onValueChange={onStatusChange}>
          <TabsList className="inline-flex w-max">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'draft', label: 'Abertos' },
              { value: 'submitted', label: 'Enviados' },
              { value: 'approved', label: 'Aprovados' },
              { value: 'rejected', label: 'Reprovados' },
              { value: 'paid', label: 'Pagos' },
            ].map((t) => {
              const count = tabCounts[t.value as keyof typeof tabCounts] ?? 0;
              const active = statusFilter === t.value;
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  {t.label}
                  <span
                    className={
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium ' +
                      (active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : reports?.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Nenhum relatório encontrado"
          description="Crie seu primeiro relatório para agrupar despesas e enviar para aprovação."
          action={
            <Button onClick={onCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Relatório
            </Button>
          }
        />
      ) : isMobile ? (
        // Mobile: Card view
        <div className="space-y-3">
          {reports?.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        // Desktop: Table view
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                {isManager && <TableHead>Colaborador</TableHead>}
                <TableHead>Período</TableHead>
                <TableHead>Despesas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports?.map((report) => (
                <TableRow
                  key={report.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/reports/${report.id}`)}
                >
                  <TableCell className="font-medium">{report.title}</TableCell>
                  {isManager && (
                    <TableCell className="text-muted-foreground">
                      {report.user?.full_name || '-'}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {report.start_date && report.end_date
                      ? `${formatDate(report.start_date)} - ${formatDate(report.end_date)}`
                      : '-'}
                  </TableCell>
                  <TableCell>{report.expense_count}</TableCell>
                  <TableCell>
                    <StatusBadge status={report.status} type="report" />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(report.total_cents || 0)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigate(`/app/reports/${report.id}`)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalhes
                        </DropdownMenuItem>
                        {report.status === 'draft' && (
                          <DropdownMenuItem
                            onClick={() => onDelete(report)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
