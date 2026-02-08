import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface FloatingActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}

export function FloatingActionButton({
  icon: Icon,
  label,
  onClick,
  className,
}: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className={cn(
        'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:hidden z-50',
        'flex items-center justify-center',
        className
      )}
      aria-label={label}
    >
      <Icon className="h-6 w-6" />
    </Button>
  );
}
