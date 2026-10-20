/**
 * Onda 3d — lançamento multi-dia.
 *
 * Dialog focado para lançar uma despesa recorrente por vários dias (ex.:
 * alimentação de vários dias): o usuário escolhe a categoria, o período e o valor
 * POR DIA. Chama a RPC create_expense_multiday, que gera uma despesa por dia
 * reusando o motor de política (teto diário, ciclo, evento) de forma atômica.
 */
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, PartyPopper, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, parseAmountToCents, formatAmountInput, endOfToday, minExpenseDate } from '@/lib/constants';
import { multiDaySchema } from './multiDaySchema';
import { useActiveExpenseTypes } from '@/hooks/useExpenseTypes';
import { groupBySector } from '@/lib/categoryGroups';
import { useCreateExpenseMultiday } from '@/hooks/useCurrentReport';
import { useExpensePolicy } from '@/hooks/usePolicy';
import { useFoodCapAmount } from '@/hooks/useFoodCapAmount';
import { FoodCapHint } from './FoodCapHint';

interface MultiDayExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}


type FormData = z.infer<typeof multiDaySchema>;

export function MultiDayExpenseDialog({
  open,
  onOpenChange,
  onCreated,
}: MultiDayExpenseDialogProps) {
  const { data: categories = [] } = useActiveExpenseTypes();
  const createMultiday = useCreateExpenseMultiday();
  const grouped = useMemo(() => groupBySector(categories), [categories]);

  const form = useForm<FormData>({
    resolver: zodResolver(multiDaySchema),
    defaultValues: {
      category_id: '',
      start_date: new Date(),
      end_date: new Date(),
      amount_per_day: '',
      description: '',
      is_event: false,
      notes: '',
    },
  });

  const watchedIsEvent = form.watch('is_event');
  const watchedCategoryId = form.watch('category_id');
  const { data: policy } = useExpensePolicy();
  const foodDailyLimit = (policy as { food_daily_limit_cents?: number | null } | undefined)?.food_daily_limit_cents ?? 3000;
  const isFood = categories.find((c) => c.id === watchedCategoryId)?.kind === 'food';
  // Valor é por dia: em alimentação (sem evento) o lançado fica em até 1 × teto por dia.
  const foodCap = useFoodCapAmount({
    active: isFood && !watchedIsEvent,
    dailyLimitCents: foodDailyLimit,
    days: 1,
    setAmount: (v) => form.setValue('amount_per_day', v, { shouldValidate: true }),
  });
  const { reset: resetFoodCap } = foodCap;
  useEffect(() => {
    if (!open) resetFoodCap();
  }, [open, resetFoodCap]);

  const start = form.watch('start_date');
  const end = form.watch('end_date');
  const amountStr = form.watch('amount_per_day');

  const days =
    start && end && end >= start ? differenceInCalendarDays(end, start) + 1 : 0;
  const parsedPerDay = parseAmountToCents(amountStr || '');
  const perDayCents = Number.isNaN(parsedPerDay) ? 0 : parsedPerDay;
  const totalCents = days * perDayCents;

  const onSubmit = async (data: FormData) => {
    try {
      await createMultiday.mutateAsync({
        description: data.description,
        amount_cents_per_day: parseAmountToCents(data.amount_per_day),
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
        category_id: data.category_id,
        is_event: data.is_event,
        notes: data.is_event ? data.notes?.trim() : undefined,
        payment_method: 'personal_card',
        is_reimbursable: true,
      });
      onCreated?.();
      onOpenChange(false);
      form.reset();
    } catch {
      // toast vem do hook
    }
  };

  const isSaving = createMultiday.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Lançar vários dias
          </DialogTitle>
          <DialogDescription>
            Gera uma despesa por dia no período. Cada dia respeita o limite diário.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Escolha a categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {grouped.map((g) => (
                        <SelectGroup key={g.sector}>
                          <SelectLabel>{g.sector}</SelectLabel>
                          {g.items.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Almoço presencial" className="h-12" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>De</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn('h-12 pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                          >
                            {field.value ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Início</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d > endOfToday() || d < minExpenseDate()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Até</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn('h-12 pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                          >
                            {field.value ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Fim</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d > endOfToday() || d < minExpenseDate() || (!!start && d < start)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="amount_per_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor por dia (R$)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0,00"
                      className="h-12"
                      inputMode="decimal"
                      {...field}
                      onBlur={() => {
                        const formatted = formatAmountInput(field.value);
                        field.onChange(formatted);
                        foodCap.onAmountBlur(formatted);
                        field.onBlur();
                      }}
                    />
                  </FormControl>
                  <FoodCapHint cap={foodCap} amount={field.value} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {days > 0 && perDayCents > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="font-medium">{days}</span> dia(s) ×{' '}
                <span className="font-medium">{formatCurrency(perDayCents)}</span> ={' '}
                <span className="font-semibold">{formatCurrency(totalCents)}</span> no total
              </div>
            )}

            <FormField
              control={form.control}
              name="is_event"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start justify-between gap-3 rounded-lg border p-3 space-y-0">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-1.5">
                      <PartyPopper className="h-4 w-4 text-muted-foreground" />
                      Evento
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Exceção aprovada pela Diretoria — libera o teto diário e vai para revisão.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {watchedIsEvent && (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Motivo da exceção <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva por que essas despesas fogem do combinado..."
                        className="min-h-[72px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} className="h-12">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="h-12">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lançar {days > 0 ? `${days} dia(s)` : ''}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
