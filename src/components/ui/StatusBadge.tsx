import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EXPENSE_STATUS_LABELS, REPORT_STATUS_LABELS } from '@/lib/constants';
import { AlertTriangle } from 'lucide-react';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

interface StatusBadgeProps {
  status: Status;
  type?: 'expense' | 'report';
  isOutOfPolicy?: boolean;
  className?: string;
}

// Chip pill compacto — mono uppercase tabular, o "carimbo" do instrumento.
const CHIP_BASE =
  'border-transparent rounded-full font-mono font-medium uppercase text-[10px] leading-none tracking-[0.08em] tabular-nums px-2 py-1';

export function StatusBadge({ status, type = 'expense', isOutOfPolicy, className }: StatusBadgeProps) {
  const labels = type === 'expense' ? EXPENSE_STATUS_LABELS : REPORT_STATUS_LABELS;

  // Fora da política — carimbo âmbar de auditoria.
  if (isOutOfPolicy) {
    return (
      <Badge
        className={cn(CHIP_BASE, 'status-out-of-policy gap-1', className)}
        variant="secondary"
      >
        <AlertTriangle className="h-3 w-3" />
        Fora da política
      </Badge>
    );
  }

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
      {labels[status]}
    </Badge>
  );
}
