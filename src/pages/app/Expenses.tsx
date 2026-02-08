import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { AddToReportDialog } from '@/components/expenses/AddToReportDialog';
import { useExpenses, useDeleteExpense, Expense } from '@/hooks/useExpenses';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, FileText, Receipt, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Expenses() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddToReportOpen, setIsAddToReportOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const { data: expenses, isLoading } = useExpenses({
    status: statusFilter,
    search,
  });

  const deleteExpense = useDeleteExpense();

  const handleEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsFormOpen(true);
  };

  const handleDelete = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsDeleteOpen(true);
  };

  const handleAddToReport = (expense: Expense) => {
    setSelectedExpense(expense);
    setIsAddToReportOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedExpense) {
      await deleteExpense.mutateAsync(selectedExpense.id);
      setIsDeleteOpen(false);
      setSelectedExpense(null);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedExpense(null);
  };

  return (
    <AppShell>
      <PageHeader
        title="Despesas"
        description="Gerencie suas despesas e comprovantes"
        actions={
          <Button onClick={() => setIsFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Despesa
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="draft">Rascunho</TabsTrigger>
            <TabsTrigger value="submitted">Enviadas</TabsTrigger>
            <TabsTrigger value="approved">Aprovadas</TabsTrigger>
            <TabsTrigger value="rejected">Reprovadas</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar despesas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : expenses?.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="Nenhuma despesa encontrada"
          description="Crie sua primeira despesa para começar a gerenciar seus gastos."
          action={
            <Button onClick={() => setIsFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Despesa
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses?.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {expense.category?.name || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[expense.payment_method]}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={expense.status} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(expense.amount_cents, expense.currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {expense.status === 'draft' && (
                          <>
                            <DropdownMenuItem onClick={() => handleEdit(expense)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAddToReport(expense)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Adicionar a Relatório
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(expense)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                        {expense.status !== 'draft' && (
                          <DropdownMenuItem onClick={() => handleEdit(expense)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Ver detalhes
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
      <ExpenseFormDialog
        open={isFormOpen}
        onOpenChange={handleFormClose}
        expense={selectedExpense}
      />

      <AddToReportDialog
        open={isAddToReportOpen}
        onOpenChange={setIsAddToReportOpen}
        expense={selectedExpense}
      />

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Excluir despesa"
        description="Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteExpense.isPending}
      />
    </AppShell>
  );
}
