import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { O2Rings } from '@/components/brand/O2Rings';

interface EmptyStateProps {
  /** Mantido por compatibilidade — o herói visual agora é o O2Rings wireframe. */
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  eyebrow = 'Sem registros',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-8 py-14 text-center',
        className
      )}
    >
      {/* O2Rings wireframe — grande, meio cortado, decorativo (sem verde) */}
      <div className="mb-6 h-16 w-[120px] overflow-hidden" aria-hidden="true">
        <O2Rings wireframe size={120} className="relative -top-4 opacity-40" />
      </div>

      <span className="o2-eyebrow">{eyebrow}</span>
      <h3 className="o2-display mt-3 text-xl text-foreground">{title}</h3>

      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}

      {action && <div className="mt-6 [&_button]:rounded-full">{action}</div>}
    </div>
  );
}
