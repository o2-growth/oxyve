import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, FileText, Receipt, CalendarIcon, Paperclip } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function Expenses() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddToReportOpen, setIsAddToReportOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const { data: expenses, isLoading } = useExpenses({
    status: statusFilter,
    search,
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
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

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
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
      <div className="mb-6 space-y-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="draft">Avulsas</TabsTrigger>
            <TabsTrigger value="submitted">Enviadas</TabsTrigger>
            <TabsTrigger value="approved">Aprovadas</TabsTrigger>
            <TabsTrigger value="rejected">Reprovadas</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-end gap-4">
          {/* Date filters */}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-36 justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-36 justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                Limpar
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar despesas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
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
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Paperclip className="h-4 w-4" />
                </TableHead>
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
                  <TableCell>
                    {expense.receipt_path && (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {expense.description}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {expense.category?.name || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {PAYMENT_METHOD_LABELS[expense.payment_method]}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={expense.status} />
                  </TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">
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
