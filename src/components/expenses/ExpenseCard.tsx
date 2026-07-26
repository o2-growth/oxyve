import { Expense } from '@/hooks/useExpenses';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { MoreVertical, Pencil, Trash2, FileText, Eye, Paperclip, Image, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpenseCardProps {
  expense: Expense;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onAddToReport: (expense: Expense) => void;
  onViewReceipt?: (expense: Expense) => void;
}

export function ExpenseCard({
  expense,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAddToReport,
  onViewReceipt,
}: ExpenseCardProps) {
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

  const isDraft = expense.status === 'draft' && !expense.report;

  // Carimbo de auditoria — chip pill mono uppercase âmbar.
  const STAMP =
    'inline-flex shrink-0 items-center rounded-full font-mono font-medium uppercase text-[10px] leading-none tracking-[0.08em] px-1.5 py-1';

  return (
    <Card
      className={cn(
        'transition-colors duration-150 hover:border-primary/40 hover:bg-muted/40',
        isSelected && 'ring-2 ring-primary',
        expense.is_out_of_policy && 'border-l-2 border-l-[hsl(var(--status-event))]'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(expense.id)}
            className="mt-1"
          />

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-sans font-medium truncate text-foreground">{expense.description}</p>
                  {expense.is_event && (
                    <span className={cn(STAMP, 'border border-[hsl(var(--status-event)/0.4)] text-[hsl(var(--status-event))]')}>
                      Evento
                    </span>
                  )}
                  {expense.is_out_of_policy && (
                    <span className={cn(STAMP, 'status-out-of-policy')}>
                      Exc · Revisar
                    </span>
                  )}
                </div>
                <p className="o2-num text-[11px] text-muted-foreground mt-0.5">
                  {formatDate(expense.date)} • {expense.category?.name || 'Sem tipo'}
                </p>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {expense.receipt_path && (
                  <button
                    onClick={() => onViewReceipt?.(expense)}
                    className="flex h-8 w-8 items-center justify-center rounded bg-muted hover:bg-muted/80"
                    title="Ver comprovante"
                  >
                    {getReceiptIcon(expense.receipt_path)}
                  </button>
                )}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isDraft ? (
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
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={expense.status} />
                {expense.report && (
                  <Badge variant="outline" className="font-mono font-normal text-[10px]">
                    {expense.report.title}
                  </Badge>
                )}
              </div>
              <p className="o2-num text-lg font-semibold tracking-tight text-foreground">
                {formatCurrency(expense.amount_cents, expense.currency)}
              </p>
            </div>

            <p className="font-mono text-[11px] text-muted-foreground">
              {PAYMENT_METHOD_LABELS[expense.payment_method]}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
