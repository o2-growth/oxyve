import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface FloatingActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
  /**
   * Sprint 6: ícone pequeno no canto superior direito (badge),
   * usado pra sinalizar ação secundária (ex.: "Plus" sobre "Camera").
   */
  badgeIcon?: LucideIcon;
  /**
   * Sprint 6: aplica `animate-pulse` (controlado pelo caller para
   * desligar após primeira aparição).
   */
  pulse?: boolean;
  /**
   * Sprint 6: por padrão FAB é mobile-only (`md:hidden`).
   * Quando `responsive=true`, fica visível em ambos viewports —
   * o caller decide o comportamento ao clicar.
   */
  responsive?: boolean;
}

export function FloatingActionButton({
  icon: Icon,
  label,
  onClick,
  className,
  badgeIcon: BadgeIcon,
  pulse = false,
  responsive = false,
}: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className={cn(
        'fixed right-4 bottom-20 lg:bottom-6 h-14 w-14 rounded-full shadow-xl z-50',
        'flex items-center justify-center transition-transform hover:scale-105',
        responsive ? 'block' : 'md:hidden',
        pulse && 'animate-pulse',
        className
      )}
      aria-label={label}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
      {BadgeIcon && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center',
            'rounded-full bg-primary-foreground text-primary',
            'border-2 border-primary shadow'
          )}
        >
          <BadgeIcon className="h-3 w-3" />
        </span>
      )}
    </Button>
  );
}
