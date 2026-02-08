import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EXPENSE_STATUS_LABELS, REPORT_STATUS_LABELS } from '@/lib/constants';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

interface StatusBadgeProps {
  status: Status;
  type?: 'expense' | 'report';
  className?: string;
}

export function StatusBadge({ status, type = 'expense', className }: StatusBadgeProps) {
  const labels = type === 'expense' ? EXPENSE_STATUS_LABELS : REPORT_STATUS_LABELS;
  
  return (
    <Badge
      className={cn(
        'font-medium',
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
