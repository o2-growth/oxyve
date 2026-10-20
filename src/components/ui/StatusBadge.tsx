import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EXPENSE_STATUS_LABELS, REPORT_STATUS_LABELS } from '@/lib/constants';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  PencilLine,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

interface StatusBadgeProps {
  status: Status;
  type?: 'expense' | 'report';
  isOutOfPolicy?: boolean;
  /** Relatório devolvido pelo gestor (rascunho com motivo): selo próprio. */
  returned?: boolean;
  className?: string;
}

// Selo legível de relance: cor forte com borda, ícone e texto de 12px. O chip
// mono de 10px com fundo quase transparente sumia nas listas (usuários não viam
// se a despesa estava enviada, aprovada ou paga).
const CHIP_BASE =
  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none whitespace-nowrap';

const ICONS: Record<Status, LucideIcon> = {
  draft: PencilLine,
  submitted: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  paid: Banknote,
};

export function StatusBadge({ status, type = 'expense', isOutOfPolicy, returned, className }: StatusBadgeProps) {
  const labels = type === 'expense' ? EXPENSE_STATUS_LABELS : REPORT_STATUS_LABELS;

  // Fora da política — carimbo âmbar de auditoria.
  if (isOutOfPolicy) {
    return (
      <Badge className={cn(CHIP_BASE, 'status-out-of-policy', className)} variant="secondary">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Fora da política
      </Badge>
    );
  }

  if (returned) {
    return (
      <Badge className={cn(CHIP_BASE, 'status-rejected', className)} variant="secondary">
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
        Devolvido
      </Badge>
    );
  }

  const Icon = ICONS[status];
  return (
    <Badge
      className={cn(
        CHIP_BASE,
        status === 'draft' && 'status-draft',
        status === 'submitted' && 'status-submitted',
        status === 'approved' && 'status-approved',
        status === 'rejected' && 'status-rejected',
        status === 'paid' && 'status-paid',
        className
      )}
      variant="secondary"
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {labels[status]}
    </Badge>
  );
}
