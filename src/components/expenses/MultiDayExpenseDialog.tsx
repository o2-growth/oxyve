/**
 * Onda 3d — lançamento multi-dia.
 *
 * Dialog focado para lançar uma despesa recorrente por vários dias (ex.:
 * alimentação de seg a sex): o usuário escolhe a categoria, o período e o valor
 * POR DIA. Chama a RPC create_expense_multiday, que gera uma despesa por dia
 * reusando o motor de política (teto diário, ciclo, evento) de forma atômica.
 */
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, PartyPopper, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/constants';
import { useActiveExpenseTypes, type ExpenseType } from '@/hooks/useExpenseTypes';
import { useCreateExpenseMultiday } from '@/hooks/useCurrentReport';

interface MultiDayExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const KIND_LABEL: Record<string, string> = {
  food: 'Alimentação',
  transport: 'Transporte',
  other: 'Outros',
};
const KIND_ORDER = ['food', 'transport', 'other'];

function groupByKind(types: ExpenseType[]) {
  const groups = new Map<string, ExpenseType[]>();
  for (const t of types) {
    const k = t.kind ?? 'other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return KIND_ORDER.filter((k) => groups.has(k)).map((k) => ({
    kind: k,
    label: KIND_LABEL[k] ?? k,
    items: groups.get(k)!,
  }));
}

const schema = z
  .object({
    category_id: z.string().min(1, 'Escolha a categoria'),
    start_date: z.date({ required_error: 'Data inicial obrigatória' }),
    end_date: z.date({ required_error: 'Data final obrigatória' }),
    amount_per_day: z.string().min(1, 'Informe o valor por dia'),
    description: z.string().min(1, 'Descrição obrigatória'),
    is_event: z.boolean(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'A data final deve ser igual ou posterior à inicial',
    path: ['end_date'],
  });

type FormData = z.infer<typeof schema>;

export function MultiDayExpenseDialog({
  open,
  onOpenChange,
  onCreated,
}: MultiDayExpenseDialogProps) {
  const { data: categories = [] } = useActiveExpenseTypes();
  const createMultiday = useCreateExpenseMultiday();
  const grouped = useMemo(() => groupByKind(categories), [categories]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: '',
      start_date: new Date(),
      end_date: new Date(),
      amount_per_day: '',
      description: '',
      is_event: false,
    },
  });

  const start = form.watch('start_date');
  const end = form.watch('end_date');
  const amountStr = form.watch('amount_per_day');

  const days =
    start && end && end >= start ? differenceInCalendarDays(end, start) + 1 : 0;
  const perDayCents = Math.round(
    parseFloat((amountStr || '0').replace(',', '.') || '0') * 100,
  );
  const totalCents = days * perDayCents;

  const onSubmit = async (data: FormData) => {
    try {
      await createMultiday.mutateAsync({
        description: data.description,
        amount_cents_per_day: Math.round(
          parseFloat(data.amount_per_day.replace(',', '.')) * 100,
        ),
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
        category_id: data.category_id,
        is_event: data.is_event,
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
                  <FormLabel className="o2-eyebrow">Categoria</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Escolha a categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {grouped.map((g) => (
                        <SelectGroup key={g.kind}>
                          <SelectLabel>{g.label}</SelectLabel>
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
                  <FormLabel className="o2-eyebrow">Descrição</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Almoço presencial" className="h-12 font-sans" {...field} />
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
                    <FormLabel className="o2-eyebrow">De</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn('h-12 pl-3 text-left font-normal o2-num', !field.value && 'text-muted-foreground')}
                          >
                            {field.value ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Início</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="pointer-events-auto" />
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
                    <FormLabel className="o2-eyebrow">Até</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn('h-12 pl-3 text-left font-normal o2-num', !field.value && 'text-muted-foreground')}
                          >
                            {field.value ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Fim</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(d) => start && d < start} initialFocus className="pointer-events-auto" />
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
                  <FormLabel className="o2-eyebrow">Valor por dia (R$)</FormLabel>
                  <FormControl>
                    <Input placeholder="0,00" className="h-12 o2-num" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {days > 0 && perDayCents > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="o2-eyebrow mb-1.5">Resumo do lançamento</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="o2-num text-sm text-muted-foreground">
                    {days} {days === 1 ? 'dia' : 'dias'} × {formatCurrency(perDayCents)}
                  </span>
                  <span className="o2-num text-lg font-semibold tracking-tight text-primary">
                    {formatCurrency(totalCents)}
                  </span>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="is_event"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start justify-between gap-3 rounded-lg border p-3 space-y-0">
                  <div className="space-y-0.5">
                    <FormLabel className="o2-eyebrow flex items-center gap-1.5">
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
