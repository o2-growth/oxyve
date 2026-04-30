import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Expense } from '@/hooks/useExpenses';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { MoreHorizontal, Pencil, Trash2, FileText, Eye, Paperclip, Image, FileIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExpensesTableProps {
  expenses: Expense[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onAddToReport: (expense: Expense) => void;
  onViewReceipt?: (expense: Expense) => void;
}

export function ExpensesTable({
  expenses,
  selectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onAddToReport,
  onViewReceipt,
}: ExpensesTableProps) {
  const allSelected = expenses.length > 0 && expenses.every((e) => selectedIds.has(e.id));
  const someSelected = expenses.some((e) => selectedIds.has(e.id)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(expenses.map((e) => e.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const getReceiptIcon = (path: string | null) => {
    if (!path) return null;
    
    const ext = path.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <Image className="h-4 w-4 text-muted-foreground" />;
    }
    if (ext === 'pdf') {
      return <FileIcon className="h-4 w-4 text-destructive" />;
    }
    return <Paperclip className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Selecionar todas"
                className={cn(someSelected && 'data-[state=checked]:bg-primary/50')}
              />
            </TableHead>
            <TableHead className="w-10">
              <Paperclip className="h-4 w-4" />
            </TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Tipo</TableHead>
            {/* GAP-G005: centro de custo na lista */}
            <TableHead>Centro de Custo</TableHead>
            <TableHead>Relatório</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow 
              key={expense.id}
              className={cn(selectedIds.has(expense.id) && 'bg-muted/50')}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(expense.id)}
                  onCheckedChange={() => toggleOne(expense.id)}
                  aria-label={`Selecionar despesa ${expense.description}`}
                />
              </TableCell>
              <TableCell>
                {expense.receipt_path ? (
                  <button
                    onClick={() => onViewReceipt?.(expense)}
                    className="flex h-8 w-8 items-center justify-center rounded bg-muted hover:bg-muted/80 transition-colors"
                    title="Ver comprovante"
                  >
                    {getReceiptIcon(expense.receipt_path)}
                  </button>
                ) : (
                  <div className="h-8 w-8" />
                )}
              </TableCell>
              <TableCell className="font-medium whitespace-nowrap">
                {formatDate(expense.date)}
              </TableCell>
              <TableCell className="max-w-48">
                <div className="flex items-center gap-2">
                  <span className="truncate">{expense.description}</span>
                  {expense.is_out_of_policy && (
                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                      Fora da política
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {expense.category?.name || '-'}
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {expense.cost_center
                  ? expense.cost_center.code
                    ? `${expense.cost_center.code} - ${expense.cost_center.name}`
                    : expense.cost_center.name
                  : '-'}
              </TableCell>
              <TableCell>
                {expense.report ? (
                  <Badge variant="outline" className="font-normal">
                    {expense.report.title}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap">
                {formatCurrency(expense.amount_cents, expense.currency)}
              </TableCell>
              <TableCell>
                <StatusBadge status={expense.status} />
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {PAYMENT_METHOD_LABELS[expense.payment_method]}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {expense.status === 'draft' && !expense.report ? (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(expense)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAddToReport(expense)}>
                          <FileText className="mr-2 h-4 w-4" />
                          Adicionar a Relatório
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(expense)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(expense)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalhes
                        </DropdownMenuItem>
                        {expense.receipt_path && (
                          <DropdownMenuItem onClick={() => onViewReceipt?.(expense)}>
                            <Paperclip className="mr-2 h-4 w-4" />
                            Ver comprovante
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
