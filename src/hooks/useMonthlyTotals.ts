import { useQuery } from '@tanstack/react-query';
import { addMonths, format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyTotals {
  current_month_cents: number;
  current_month_count: number;
  previous_month_cents: number;
  previous_month_count: number;
  percent_change: number | null;
}

const sumCents = (rows: { amount_cents: number }[] | null) =>
  (rows || []).reduce((acc, r) => acc + r.amount_cents, 0);

export function useMonthlyTotals() {
  return useQuery<MonthlyTotals>({
    queryKey: ['monthly-totals'],
    queryFn: async () => {
      const today = new Date();
      const startCurrent = startOfMonth(today);
      const startNext = startOfMonth(addMonths(today, 1));
      const startPrevious = startOfMonth(subMonths(today, 1));

      const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

      const [currentRes, previousRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('amount_cents')
          .gte('date', fmt(startCurrent))
          .lt('date', fmt(startNext)),
        supabase
          .from('expenses')
          .select('amount_cents')
          .gte('date', fmt(startPrevious))
          .lt('date', fmt(startCurrent)),
      ]);

      if (currentRes.error) throw currentRes.error;
      if (previousRes.error) throw previousRes.error;

      const current_month_cents = sumCents(currentRes.data);
      const previous_month_cents = sumCents(previousRes.data);

      const percent_change =
        previous_month_cents > 0
          ? ((current_month_cents - previous_month_cents) / previous_month_cents) * 100
          : null;

      return {
        current_month_cents,
        current_month_count: currentRes.data?.length || 0,
        previous_month_cents,
        previous_month_count: previousRes.data?.length || 0,
        percent_change,
      };
    },
    staleTime: 60_000,
  });
}
