import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
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

      {/* Filters */}
      <div className="mb-6">
        <Tabs value={statusFilter} onValueChange={handleStatusChange}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="draft">Rascunho</TabsTrigger>
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
