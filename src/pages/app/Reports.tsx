import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || 'all';
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const { isManager } = useAuth();
  const { data: reports, isLoading } = useReports({ status: statusFilter });
  const deleteReport = useDeleteReport();

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!reports) return { total: 0, reimbursable: 0, nonReimbursable: 0, average: 0 };
    
    const total = reports.reduce((sum, r) => sum + (r.total_cents || 0), 0);
    const reimbursable = reports.reduce((sum, r) => sum + (r.reimbursable_cents || 0), 0);
    const nonReimbursable = total - reimbursable;
    const average = reports.length > 0 ? total / reports.length : 0;

    return { total, reimbursable, nonReimbursable, average };
  }, [reports]);

  const handleStatusChange = (status: string) => {
    if (status === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', status);
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
        description="Agrupe despesas em relatórios e envie para aprovação"
        actions={
          <Button onClick={() => setIsFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Relatório
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{formatCurrency(stats.total)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Receipt className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reembolsável</p>
              <p className="text-xl font-bold">{formatCurrency(stats.reimbursable)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Não Reembolsável</p>
              <p className="text-xl font-bold">{formatCurrency(stats.nonReimbursable)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Média por Relatório</p>
              <p className="text-xl font-bold">{formatCurrency(stats.average)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <Tabs value={statusFilter} onValueChange={handleStatusChange}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="draft">Abertos</TabsTrigger>
            <TabsTrigger value="submitted">Enviados</TabsTrigger>
            <TabsTrigger value="approved">Aprovados</TabsTrigger>
            <TabsTrigger value="rejected">Reprovados</TabsTrigger>
            <TabsTrigger value="paid">Pagos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
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
            <Button onClick={() => setIsFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Relatório
            </Button>
          }
        />
      ) : (
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
                            onClick={() => handleDelete(report)}
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
