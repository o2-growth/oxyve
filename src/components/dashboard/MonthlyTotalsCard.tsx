import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/constants';

interface MonthlyTotalsCardProps {
  title: string;
  description?: string;
  totalCents: number;
  count: number;
  percentChange?: number | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function VariationBadge({ percent }: { percent: number }) {
  const isUp = percent > 0;
  const isDown = percent < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const colorClass = isUp
    ? 'text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-950/40'
    : isDown
    ? 'text-destructive bg-destructive/10'
    : 'text-muted-foreground bg-muted';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
      )}
    >
      <Icon className="h-3 w-3" />
      {isUp ? '+' : ''}
      {percent.toFixed(1)}%
    </span>
  );
}

export function MonthlyTotalsCard({
  title,
  description,
  totalCents,
  count,
  percentChange,
  isLoading,
  isError,
  onRetry,
}: MonthlyTotalsCardProps) {
  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
            <span>Não foi possível carregar.</span>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !isLoading && totalCents === 0 && count === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  'text-2xl md:text-3xl font-bold',
                  isEmpty && 'text-muted-foreground',
                )}
              >
                {formatCurrency(totalCents)}
              </span>
              {percentChange !== null && percentChange !== undefined && !isEmpty && (
                <VariationBadge percent={percentChange} />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEmpty
                ? 'Nenhuma despesa este mês'
                : `${count} despesa${count === 1 ? '' : 's'}`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
