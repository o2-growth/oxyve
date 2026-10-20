import { useAuth } from '@/contexts/AuthContext';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { MultiDayExpenseDialog } from '@/components/expenses/MultiDayExpenseDialog';
import { AddToReportDialog } from '@/components/expenses/AddToReportDialog';
import { ExpenseFiltersPopover, AdvancedFilters } from '@/components/expenses/ExpenseFiltersPopover';
import { ExpensesTable } from '@/components/expenses/ExpensesTable';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { canAddExpenseToReport, canDeleteExpense } from '@/components/expenses/expenseActions';
import { ReceiptPreviewDialog } from '@/components/reports/ReceiptPreviewDialog';
import {
  useExpenses,
  useExpenseCounts,
  useDeleteExpense,
  useDeleteExpenses,
  Expense,
  ExpenseTab,
} from '@/hooks/useExpenses';
import { Plus, Search, Receipt, CalendarIcon, Trash2, FileText, Filter, CalendarDays } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const TAB_CONFIG: { value: ExpenseTab; label: string; emptyMessage: string }[] = [
  { value: 'all', label: 'Todas', emptyMessage: 'Nenhuma despesa encontrada' },
  { value: 'exceptions', label: 'Exceções', emptyMessage: 'Nenhuma despesa fora da política — tudo em conformidade' },
  { value: 'loose', label: 'Avulsas', emptyMessage: 'Nenhuma despesa avulsa' },
  { value: 'open', label: 'Abertas', emptyMessage: 'Nenhuma despesa aberta' },
  { value: 'submitted', label: 'Enviadas', emptyMessage: 'Nenhuma despesa enviada' },
  { value: 'approved', label: 'Aprovadas', emptyMessage: 'Nenhuma despesa aprovada' },
  { value: 'rejected', label: 'Reprovadas', emptyMessage: 'Nenhuma despesa reprovada' },
  { value: 'paid', label: 'Pagas', emptyMessage: 'Nenhuma despesa paga' },
];

export default function Expenses() {
  const { isManager, profile } = useAuth();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ExpenseTab>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMultiDayOpen, setIsMultiDayOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isAddToReportOpen, setIsAddToReportOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Adicionar a relatório" do menu de uma despesa x botão do lote. Antes o diálogo
  // usava a seleção sempre que havia itens marcados, mesmo vindo do menu de outra.
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [receiptTarget, setReceiptTarget] = useState<{ path: string; title: string } | null>(null);

  // Atalho do PWA (manifest: /app/expenses?new=1) abre direto o formulário de nova despesa.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSelectedExpense(null);
    setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  // Stagger o2-rise só na PRIMEIRA carga da lista — troca de aba/filtro é instantânea.
  const firstListLoad = useRef(true);
  useEffect(() => {
    if (!isLoading && expenses) {
      firstListLoad.current = false;
    }
  }, [isLoading, expenses]);

  // Count active advanced filters
  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.categoryId) count++;
    if (advancedFilters.paymentMethod) count++;
    if (advancedFilters.isReimbursable !== null && advancedFilters.isReimbursable !== undefined) count++;
    if (advancedFilters.costCenterId) count++;
    if (advancedFilters.projectId) count++;
    if (startDate || endDate) count++;
    return count;
  }, [advancedFilters, startDate, endDate]);

  // Get selected expenses
  const selectedExpenses = useMemo(() => {
    return expenses?.filter((e) => selectedIds.has(e.id)) || [];
  }, [expenses, selectedIds]);

  // Lote segue as mesmas regras do menu individual (expenseActions): só despesas
  // próprias, e "adicionar" exige avulsa sem decisão pendente do gestor.
  const canDeleteSelected = useMemo(() => {
    return (
      selectedExpenses.length > 0 &&
      selectedExpenses.every((e) => canDeleteExpense(e, profile?.id))
    );
  }, [selectedExpenses, profile?.id]);

  const canAddToReport = useMemo(() => {
    return (
      selectedExpenses.length > 0 &&
      selectedExpenses.every((e) => canAddExpenseToReport(e, profile?.id))
    );
  }, [selectedExpenses, profile?.id]);

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
    setAddMode('single');
    setIsAddToReportOpen(true);
  };

  const handleBulkAddToReport = () => {
    setAddMode('bulk');
    setIsAddToReportOpen(true);
  };

  const handleViewReceipt = (expense: Expense) => {
    if (expense.receipt_path) setReceiptTarget({ path: expense.receipt_path, title: expense.description });
  };

  const openNewExpense = () => {
    setSelectedExpense(null);
    setIsFormOpen(true);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const confirmDelete = async () => {
    if (selectedExpense) {
      await deleteExpense.mutateAsync(selectedExpense.id);
      setIsDeleteOpen(false);
      setSelectedExpense(null);
    }
  };

  const confirmBulkDelete = async () => {
    // Só o que está na lista e passou nas regras (a seleção pode ter ids de outra aba).
    if (selectedExpenses.length > 0) {
      await deleteExpenses.mutateAsync(selectedExpenses.map((e) => e.id));
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
        title={isManager ? 'Despesas da empresa' : 'Despesas'}
        description={isManager ? 'Todas as despesas da O2, com o nome de quem lançou' : 'Gerencie suas despesas e comprovantes'}
        actions={
          <div className="hidden md:flex items-center gap-2">
            {selectedExpenses.length > 0 && (
              <>
                {canAddToReport && (
                  <Button
                    variant="outline"
                    onClick={handleBulkAddToReport}
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Adicionar a relatório ({selectedExpenses.length})
                  </Button>
                )}
                {canDeleteSelected && (
                  <Button
                    variant="outline"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir ({selectedExpenses.length})
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" onClick={() => setIsMultiDayOpen(true)} className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Vários dias
            </Button>
            <Button onClick={openNewExpense} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Despesa
            </Button>
          </div>
        }
      />

      {/* Celular (<768px, onde o header esconde os botões): lançamento manual e vários
          dias. A captura por foto continua no botão central da barra inferior. */}
      <div className="mb-4 flex gap-2 md:hidden">
        <Button variant="outline" size="sm" onClick={openNewExpense} className="h-11 flex-1 gap-1">
          <Plus className="h-4 w-4" />
          Nova despesa
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsMultiDayOpen(true)} className="h-11 flex-1 gap-1">
          <CalendarDays className="h-4 w-4" />
          Vários dias
        </Button>
      </div>

      {/* Ações em lote no celular — mesmo corte (md) do header, para não duplicar. */}
      {selectedExpenses.length > 0 && (
        <div className="mb-4 flex gap-2 md:hidden">
          {canAddToReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkAddToReport}
              className="flex-1 gap-1"
            >
              <FileText className="h-4 w-4" />
              Relatório ({selectedExpenses.length})
            </Button>
          )}
          {canDeleteSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="flex-1 gap-1 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Excluir ({selectedExpenses.length})
            </Button>
          )}
        </div>
      )}

      {/* Tabs with counters - scrollable on mobile */}
      {/* A máscara esmaece a borda direita no celular: sinal de que as abas continuam. */}
      <div className="mb-4 md:mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] md:[mask-image:none]">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="inline-flex h-auto gap-1 p-1 min-w-max">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-h-11 md:min-h-0 gap-1.5 font-mono uppercase tracking-[0.08em] text-[11px] data-[state=active]:shadow-sm whitespace-nowrap"
              >
                {tab.label}
                {counts && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-mono tabular-nums',
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

      {/* Filters - stack on mobile */}
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row gap-3 md:items-end">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar despesas..."
            aria-label="Buscar despesas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 md:h-10"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2">
          {/* Date filters - hidden on mobile, in popover */}
          {!isMobile && (
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
          )}

          {/* Advanced Filters */}
          <ExpenseFiltersPopover
            filters={advancedFilters}
            onChange={setAdvancedFilters}
            activeCount={advancedFilterCount}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 md:h-16 w-full" />
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
              <Button onClick={openNewExpense} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Despesa
              </Button>
            ) : undefined
          }
        />
      ) : isMobile ? (
        // Mobile: Card layout
        <div className="space-y-3">
          {expenses?.map((expense, i) => (
            <div
              key={expense.id}
              className={firstListLoad.current ? 'o2-rise' : undefined}
              style={
                firstListLoad.current
                  ? { animationDelay: `${Math.min(i, 8) * 40}ms` }
                  : undefined
              }
            >
              <ExpenseCard
                expense={expense}
                isSelected={selectedIds.has(expense.id)}
                onSelect={toggleSelection}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddToReport={handleAddToReport}
                onViewReceipt={handleViewReceipt}
              />
            </div>
          ))}
        </div>
      ) : (
        // Desktop: Table layout
        <ExpensesTable
          expenses={expenses || []}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddToReport={handleAddToReport}
          onViewReceipt={handleViewReceipt}
        />
      )}

      {/* Dialogs */}
      <ExpenseFormDialog
        open={isFormOpen}
        onOpenChange={handleFormClose}
        expense={selectedExpense}
        useCurrentReportFlow={true}
      />

      <MultiDayExpenseDialog
        open={isMultiDayOpen}
        onOpenChange={setIsMultiDayOpen}
      />

      <AddToReportDialog
        open={isAddToReportOpen}
        onOpenChange={setIsAddToReportOpen}
        expense={addMode === 'single' ? selectedExpense : null}
        expenseIds={addMode === 'bulk' ? selectedExpenses.map((e) => e.id) : undefined}
        onAdded={() => {
          if (addMode === 'bulk') setSelectedIds(new Set());
          setSelectedExpense(null);
        }}
      />

      <ReceiptPreviewDialog
        path={receiptTarget?.path ?? null}
        title={receiptTarget?.title}
        onOpenChange={(open) => !open && setReceiptTarget(null)}
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
        description={`Tem certeza que deseja excluir ${selectedExpenses.length} despesa(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmBulkDelete}
        isLoading={deleteExpenses.isPending}
      />
    </AppShell>
  );
}