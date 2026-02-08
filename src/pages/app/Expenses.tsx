import { useState, useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { AddToReportDialog } from '@/components/expenses/AddToReportDialog';
import { ExpenseFiltersPopover, AdvancedFilters } from '@/components/expenses/ExpenseFiltersPopover';
import { ExpensesTable } from '@/components/expenses/ExpensesTable';
import {
  useExpenses,
  useExpenseCounts,
  useDeleteExpense,
  useDeleteExpenses,
  Expense,
  ExpenseTab,
} from '@/hooks/useExpenses';
import { Plus, Search, Receipt, CalendarIcon, Trash2, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const TAB_CONFIG: { value: ExpenseTab; label: string; emptyMessage: string }[] = [
  { value: 'all', label: 'Todas', emptyMessage: 'Nenhuma despesa encontrada' },
  { value: 'loose', label: 'Avulsas', emptyMessage: 'Nenhuma despesa avulsa' },
  { value: 'open', label: 'Abertas', emptyMessage: 'Nenhuma despesa aberta' },
  { value: 'submitted', label: 'Enviadas', emptyMessage: 'Nenhuma despesa enviada' },
  { value: 'approved', label: 'Aprovadas', emptyMessage: 'Nenhuma despesa aprovada' },
  { value: 'rejected', label: 'Reprovadas', emptyMessage: 'Nenhuma despesa reprovada' },
  { value: 'paid', label: 'Pagas', emptyMessage: 'Nenhuma despesa paga' },
];

export default function Expenses() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ExpenseTab>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isAddToReportOpen, setIsAddToReportOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: counts } = useExpenseCounts();
  const { data: expenses, isLoading } = useExpenses({
    tab: activeTab,
    search,
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
    ...advancedFilters,
  });

  const deleteExpense = useDeleteExpense();
  const deleteExpenses = useDeleteExpenses();

  // Count active advanced filters
  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.categoryId) count++;
    if (advancedFilters.paymentMethod) count++;
    if (advancedFilters.isReimbursable !== null && advancedFilters.isReimbursable !== undefined) count++;
    if (advancedFilters.costCenterId) count++;
    if (advancedFilters.projectId) count++;
    return count;
  }, [advancedFilters]);

  // Get selected expenses
  const selectedExpenses = useMemo(() => {
    return expenses?.filter((e) => selectedIds.has(e.id)) || [];
  }, [expenses, selectedIds]);

  // Check if all selected are deletable (draft + no report)
  const canDeleteSelected = useMemo(() => {
    return (
      selectedExpenses.length > 0 &&
      selectedExpenses.every((e) => e.status === 'draft' && !e.report)
    );
  }, [selectedExpenses]);

  // Check if all selected can be added to report (draft + no report)
  const canAddToReport = useMemo(() => {
    return (
      selectedExpenses.length > 0 &&
      selectedExpenses.every((e) => e.status === 'draft' && !e.report)
    );
  }, [selectedExpenses]);

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

  const confirmBulkDelete = async () => {
    if (selectedIds.size > 0) {
      await deleteExpenses.mutateAsync([...selectedIds]);
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedExpense(null);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as ExpenseTab);
    setSelectedIds(new Set());
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const currentTabConfig = TAB_CONFIG.find((t) => t.value === activeTab);

  return (
    <AppShell>
      <PageHeader
        title="Despesas"
        description="Gerencie suas despesas e comprovantes"
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                {canAddToReport && (
                  <Button
                    variant="outline"
                    onClick={() => setIsAddToReportOpen(true)}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Adicionar a relatório ({selectedIds.size})
                  </Button>
                )}
                {canDeleteSelected && (
                  <Button
                    variant="outline"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir ({selectedIds.size})
                  </Button>
                )}
              </>
            )}
            <Button onClick={() => setIsFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Despesa
            </Button>
          </div>
        }
      />

      {/* Tabs with counters */}
      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2 data-[state=active]:shadow-sm"
              >
                {tab.label}
                {counts && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                      activeTab === tab.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {counts[tab.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
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

        {/* Advanced Filters */}
        <ExpenseFiltersPopover
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          activeCount={advancedFilterCount}
        />

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

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : expenses?.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title={currentTabConfig?.emptyMessage || 'Nenhuma despesa encontrada'}
          description={
            activeTab === 'all'
              ? 'Crie sua primeira despesa para começar a gerenciar seus gastos.'
              : 'Não há despesas nesta categoria no momento.'
          }
          action={
            activeTab === 'all' ? (
              <Button onClick={() => setIsFormOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Despesa
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ExpensesTable
          expenses={expenses || []}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddToReport={handleAddToReport}
        />
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
        expenseIds={selectedIds.size > 0 ? [...selectedIds] : undefined}
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

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title="Excluir despesas"
        description={`Tem certeza que deseja excluir ${selectedIds.size} despesa(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmBulkDelete}
        isLoading={deleteExpenses.isPending}
      />
    </AppShell>
  );
}
