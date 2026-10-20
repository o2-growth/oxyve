import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, AlertTriangle } from 'lucide-react';
import {
  useCreateExpense,
  useUpdateExpense,
  Expense,
} from '@/hooks/useExpenses';
import { useActiveExpenseTypes, ExpenseType } from '@/hooks/useExpenseTypes';
import { groupBySector } from '@/lib/categoryGroups';
import { useExpensePolicy, useActiveCostCenters, useActiveProjects } from '@/hooks/usePolicy';
import { useDashboardContext, useCreateExpenseInReport, useReportForDate, cycleForDate, CurrentReport, DEFAULT_CYCLE_CUTOFF_DAY } from '@/hooks/useCurrentReport';
import { PAYMENT_METHOD_LABELS, formatCurrency, parseAmountToCents, parseDecimalBR, amountFieldError, endOfToday, minExpenseDate, formatAmountInput, previewFoodCents, MAX_EXPENSE_AGE_DAYS } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';
import { ReceiptUpload } from './ReceiptUpload';
import { ReceiptValidation } from './ReceiptValidation';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useValidateReceipt, receiptPolicyBlocks, readingReview } from '@/hooks/useValidateReceipt';
import { attachReceipt, receiptFileProblem, receiptHash } from '@/lib/receipts';
import { convertHeicToJpeg } from '@/lib/convertHeic';
import { READ_WARN_BOX, READ_WARN_FIELD, READ_WARN_TEXT } from './readingWarning';

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  useCurrentReportFlow?: boolean;
}

// Distância em km digitada em pt-BR ("12,5", "1.234"), arredondada a 2 casas.
// parseFloat("1.234") dava 1,234 km e o reembolso saía mil vezes menor.
function parseKm(input: string): number {
  const km = parseDecimalBR(input);
  return Number.isNaN(km) ? NaN : Math.round(km * 100) / 100;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  useCurrentReportFlow = false,
}: ExpenseFormDialogProps) {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const createExpenseInReport = useCreateExpenseInReport();
  const { data: categories } = useActiveExpenseTypes();
  const { data: policy } = useExpensePolicy();
  const queryClient = useQueryClient();
  const foodDailyLimit = (policy as { food_daily_limit_cents?: number | null } | undefined)?.food_daily_limit_cents ?? 3000;
  const { data: costCenters = [] } = useActiveCostCenters();
  const { data: projects = [] } = useActiveProjects();
  const { data: dashboardContext } = useDashboardContext();

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseType | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const receiptValidation = useValidateReceipt();

  // B16: ref para o FileReader em curso, permitindo abortar em unmount /
  // troca de arquivo. Evita setState em componente desmontado.
  const readerRef = useRef<FileReader | null>(null);

  const isEditing = !!expense;
  // Só leitura: despesa já enviada, ou de outro colaborador (gestor vendo a da equipe).
  const isReadOnly = !!(expense && (expense.status !== 'draft' || expense.user_id !== profile?.id));
  const hasExistingReceipt = expense?.receipt_path ? true : false;
  const hasReceipt = receiptFile !== null || hasExistingReceipt;
  const categoryRequiresReceipt = selectedCategory?.requires_receipt || false;
  const requiresReceipt = policy?.require_receipt || categoryRequiresReceipt;

  // B17: schema é memoizado — antes era recriado a cada render, o que
  // forçava o zodResolver a reidentar e quebrava referência estável.
  const formSchema = useMemo(
    () =>
      z
        .object({
          date: z.date({ required_error: 'Selecione uma data' }),
          description: z.string().trim().max(200, 'Até 200 caracteres'),
          category_id: z.string().optional(),
          amount: z
            .string()
            .min(1, 'Valor é obrigatório')
            .refine((v) => !amountFieldError(v), (v) => ({ message: amountFieldError(v) ?? '' })),
          payment_method: z.enum(['personal_card', 'corporate_card', 'cash', 'other']),
          is_reimbursable: z.boolean(),
          is_event: z.boolean(),
          by_km: z.boolean(),
          distance_km: z.string().optional(),
          food_days: z
            .string()
            .optional()
            .refine((v) => !v || (/^\d+$/.test(v) && +v >= 1 && +v <= 31), 'Informe de 1 a 31 dias'),
          notes: z.string().optional(),
          cost_center_id: z.string().optional(),
          project_id: policy?.require_project
            ? z.string().min(1, 'Projeto é obrigatório')
            : z.string().optional(),
        })
        // Exceção de evento (libera o teto diário) exige justificativa escrita.
        .superRefine((val, ctx) => {
          // Descrição só é exigida onde o aprovador precisa de contexto: nota de
          // alimentação que cobre vários dias e reembolso de deslocamento por km.
          const kind = categories?.find((c) => c.id === val.category_id)?.kind;
          const multiDayFood = kind === 'food' && !val.is_event && Number(val.food_days || 1) > 1;
          if ((multiDayFood || val.by_km) && val.description.trim().length < 3) {
            ctx.addIssue({
              path: ['description'],
              code: z.ZodIssueCode.custom,
              message: multiDayFood
                ? 'Descreva as refeições (ex.: 20 marmitas do mês).'
                : 'Descreva o deslocamento (origem, destino e motivo).',
            });
          }
          if (val.is_event && (!val.notes || val.notes.trim().length < 3)) {
            ctx.addIssue({
              path: ['notes'],
              code: z.ZodIssueCode.custom,
              message: 'Descreva em Observações o motivo da exceção de evento.',
            });
          }
        }),
    [policy?.require_project, categories]
  );

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      description: '',
      category_id: '',
      amount: '',
      payment_method: 'personal_card',
      is_reimbursable: true,
      is_event: false,
      by_km: false,
      distance_km: '',
      food_days: '1',
      notes: '',
      cost_center_id: '',
      project_id: '',
    },
  });

  // Watch category changes
  const watchedCategoryId = form.watch('category_id');
  const watchedDate = form.watch('date');
  const watchedAmount = form.watch('amount');
  const watchedByKm = form.watch('by_km');
  const watchedDistanceKm = form.watch('distance_km');
  const watchedIsEvent = form.watch('is_event');
  const isTransport = selectedCategory?.kind === 'transport';
  const isFood = selectedCategory?.kind === 'food';
  const watchedFoodDays = form.watch('food_days');
  const descriptionRequired =
    form.watch('by_km') || (isFood && !form.watch('is_event') && Number(watchedFoodDays || 1) > 1);
  const kmRateCents = policy?.km_rate_cents ?? 120;

  // Fora de categoria de transporte, o modo km não se aplica.
  useEffect(() => {
    if (!isTransport && form.getValues('by_km')) {
      form.setValue('by_km', false);
      form.setValue('distance_km', '');
    }
  }, [isTransport, form]);

  // Veículo próprio (Política 4.4.6): valor = km × tarifa (R$ 1,20), travado —
  // o usuário informa a distância, o sistema calcula o reembolso.
  useEffect(() => {
    if (isTransport && watchedByKm && watchedDistanceKm) {
      const km = parseKm(watchedDistanceKm);
      if (!Number.isNaN(km) && km > 0) {
        const value = ((km * kmRateCents) / 100).toFixed(2).replace('.', ',');
        if (form.getValues('amount') !== value) {
          form.setValue('amount', value, { shouldValidate: true });
        }
      }
    }
  }, [isTransport, watchedByKm, watchedDistanceKm, kmRateCents, form]);

  useEffect(() => {
    if (watchedCategoryId && categories) {
      const cat = categories.find(c => c.id === watchedCategoryId);
      setSelectedCategory(cat || null);
    } else {
      setSelectedCategory(null);
    }
  }, [watchedCategoryId, categories]);

  // B4 — Relatório da data selecionada via useQuery (sem race). Só leitura (D2).
  const dateStrForQuery =
    useCurrentReportFlow && watchedDate && !isEditing
      ? format(watchedDate, 'yyyy-MM-dd')
      : null;
  // O ciclo depende do dia de corte da política: só busca depois que ela carregou.
  const cycleCutoffDay = policy?.cycle_cutoff_day ?? DEFAULT_CYCLE_CUTOFF_DAY;
  const reportForDateQuery = useReportForDate(policy ? dateStrForQuery : null, cycleCutoffDay);
  const currentReportForDate: CurrentReport | null = reportForDateQuery.data ?? null;

  useEffect(() => {
    if (expense) {
      form.reset({
        date: parseISO(expense.date),
        description: expense.description,
        category_id: expense.category_id || '',
        amount: (expense.amount_cents / 100).toFixed(2).replace('.', ','),
        payment_method: expense.payment_method,
        is_reimbursable: expense.is_reimbursable,
        is_event: expense.is_event ?? false,
        by_km: expense.distance_km != null,
        distance_km: expense.distance_km != null ? String(expense.distance_km) : '',
        food_days: String(expense.food_days ?? 1),
        notes: expense.notes || '',
        cost_center_id: expense.cost_center_id || '',
        project_id: expense.project_id || '',
      });
      setReceiptFile(null);
      setReceiptPreview(null);
    } else {
      form.reset({
        date: new Date(),
        description: '',
        category_id: '',
        amount: '',
        payment_method: 'personal_card',
        is_reimbursable: true,
        // Sem estes três o zod recusava o submit em silêncio (boolean undefined).
        is_event: false,
        by_km: false,
        distance_km: '',
        food_days: '1',
        notes: '',
        cost_center_id: '',
        project_id: '',
      });
      setReceiptFile(null);
      setReceiptPreview(null);
    }
  }, [expense, form, open]);

  // Última (arquivo, data, valor) mandada para a leitura: só revalida quando algo muda de
  // fato. Antes o effect reagia ao próprio status da validação e chamava a IA sem parar.
  const lastValidatedRef = useRef<{ file: File; date: string; amount: number } | null>(null);
  const { validate: validateReceipt, reset: resetValidation } = receiptValidation;

  const triggerValidation = useCallback((file: File) => {
    const dateVal = form.getValues('date');
    const amountStr = form.getValues('amount');
    // Antes saía aqui sem valor digitado — e quem anexava a nota primeiro nunca
    // tinha a leitura. Valor 0 = "só extrair", sem acusar divergência.
    const formDate = format(dateVal ?? new Date(), 'yyyy-MM-dd');
    const formAmountCents = parseAmountToCents(amountStr || '') || 0;
    const last = lastValidatedRef.current;
    if (last && last.file === file && last.date === formDate && last.amount === formAmountCents) return;
    lastValidatedRef.current = { file, date: formDate, amount: formAmountCents };
    validateReceipt(file, formDate, formAmountCents);
  }, [form, validateReceipt]);

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      lastValidatedRef.current = null;
      resetValidation();
      return;
    }

    // Convert HEIC to JPEG if needed
    let processedFile = file;
    try {
      setIsConverting(true);
      processedFile = await convertHeicToJpeg(file);
    } catch (err) {
      console.error('HEIC conversion failed:', err);
      toast.error('Não foi possível converter a imagem. Tente outro formato.');
      setIsConverting(false);
      return;
    }
    setIsConverting(false);

    const problem = await receiptFileProblem(processedFile);
    if (problem) {
      toast.error(problem);
      return;
    }

    setReceiptFile(processedFile);

    if (processedFile.type.startsWith('image/')) {
      // B16: cancelar reader anterior (se houver) e guardar instância
      // em ref para abortar em cleanup do useEffect / unmount.
      if (readerRef.current) {
        readerRef.current.abort();
      }
      const reader = new FileReader();
      readerRef.current = reader;
      reader.onloadend = () => {
        if (readerRef.current === reader) {
          setReceiptPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(processedFile);
      triggerValidation(processedFile);
    } else {
      setReceiptPreview(null);
      lastValidatedRef.current = null;
      resetValidation();
    }
  };

  // B16: garantir abort em unmount.
  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.abort();
        readerRef.current = null;
      }
    };
  }, []);

  // Revalida quando data ou valor mudam depois do anexo, com debounce para não chamar a
  // IA a cada tecla. Só depois da leitura inicial (disparada em handleFileChange).
  const watchedDateKey = watchedDate ? format(watchedDate, 'yyyy-MM-dd') : '';
  useEffect(() => {
    if (!receiptFile || !receiptFile.type.startsWith('image/')) return;
    if (lastValidatedRef.current?.file !== receiptFile) return;
    const t = setTimeout(() => triggerValidation(receiptFile), 600);
    return () => clearTimeout(t);
  }, [watchedDateKey, watchedAmount, receiptFile, triggerValidation]);

  // Preenche valor, data e descrição com o que a nota diz — uma vez por arquivo, sem
  // sobrescrever o que a pessoa já digitou. A data decide o ciclo: nota de 24/09 entra
  // no relatório de setembro, não no do dia em que foi lançada.
  const autofilledRef = useRef<File | null>(null);
  useEffect(() => {
    const r = receiptValidation.result;
    if (!r || !receiptFile || isEditing || autofilledRef.current === receiptFile) return;
    autofilledRef.current = receiptFile;
    if (r.issues.includes('not_a_receipt')) {
      toast.warning('Isso não parece um comprovante. Confira a foto anexada — nada foi preenchido.');
      return;
    }
    const filled: string[] = [];
    if (r.extracted_amount_cents && r.extracted_amount_cents > 0 && !form.getValues('amount')) {
      form.setValue('amount', formatAmountInput(String(r.extracted_amount_cents / 100)), { shouldValidate: true });
      filled.push('valor');
    }
    if (r.extracted_date) {
      const d = parseISO(r.extracted_date);
      const current = form.getValues('date');
      if (d <= endOfToday() && d >= minExpenseDate()) {
        if (!current || format(current, 'yyyy-MM-dd') !== r.extracted_date) {
          form.setValue('date', d, { shouldValidate: true });
          filled.push('data');
        }
      } else {
        toast.warning(
          `A nota é de ${format(d, 'dd/MM/yyyy')}, fora da janela de lançamento (até ${MAX_EXPENSE_AGE_DAYS} dias atrás).`,
        );
      }
    }
    if (r.extracted_supplier && !form.getValues('description')) {
      form.setValue('description', r.extracted_supplier.slice(0, 200));
      filled.push('estabelecimento');
    }
    if (!filled.length) return;
    const review = readingReview(r);
    if (review.amount || review.date) {
      toast.warning(`Preenchido pela nota: ${filled.join(', ')}. Leitura com dúvida — confira os campos destacados.`);
    } else {
      toast.success(`Preenchido pela nota: ${filled.join(', ')}. Confira antes de salvar.`);
    }
  }, [receiptValidation.result, receiptFile, isEditing, form]);

  // Destaque enquanto o campo ainda tem o que a leitura duvidosa trouxe; some quando
  // a pessoa corrige.
  const readResult = receiptValidation.result;
  const readReview = receiptValidation.review;
  const canFlag = !isReadOnly && !!receiptFile && !!readResult;
  const flagAmount =
    canFlag &&
    readReview.amount &&
    readResult.extracted_amount_cents != null &&
    parseAmountToCents(watchedAmount || '') === readResult.extracted_amount_cents;
  const flagDate =
    canFlag && readReview.date && !!readResult.extracted_date && watchedDateKey === readResult.extracted_date;

  // Mesmo caminho da captura rápida (lib/receipts): sobe o arquivo e grava path + hash.
  const uploadReceipt = async (expenseId: string, reportId: string | null | undefined) => {
    if (!receiptFile || !profile?.org_id) return;
    await attachReceipt({
      file: receiptFile,
      orgId: profile.org_id,
      userId: profile.id,
      reportId,
      expenseId,
    });
  };

  // A despesa já foi gravada quando isto roda. Se o upload falhar, fecha o diálogo:
  // reenviar o form criaria a despesa de novo (e ela viraria possível duplicidade).
  const uploadAfterSave = async (expenseId: string, reportId: string | null | undefined, failMessage: string) => {
    try {
      await uploadReceipt(expenseId, reportId);
      // receipt_path foi gravado depois do onSuccess da mutation: sem isso a lista e o
      // relatório seguiam mostrando a despesa sem comprovante até o próximo refetch.
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
    } catch (err) {
      console.error('receipt upload failed', err);
      toast.error(failMessage, { duration: 8000 });
    }
  };

  const onSubmit = async (data: FormData) => {
    if (requiresReceipt && !hasReceipt && !isEditing) {
      form.setError('root', { message: 'Comprovante é obrigatório' });
      return;
    }

    if (data.by_km) {
      const km = parseKm(data.distance_km || '');
      if (Number.isNaN(km) || km <= 0) {
        form.setError('distance_km', { message: 'Informe a distância em km' });
        return;
      }
    }

    // Motor de política — comprovante (OCR): PIX, sem CNPJ, cartão sem NF, ou
    // data divergente do dia bloqueiam o lançamento (PO-0002 4.9.1/4.9.3).
    const receiptBlocks = receiptPolicyBlocks(
      receiptValidation.result,
      format(data.date, 'yyyy-MM-dd'),
    );
    if (receiptBlocks.length > 0) {
      form.setError('root', { message: receiptBlocks[0] });
      return;
    }

    setIsUploading(true);

    try {
      const amountCents = Math.round(
        parseAmountToCents(data.amount)
      );

      const payload = {
        date: format(data.date, 'yyyy-MM-dd'),
        description:
          data.description.trim() ||
          `${selectedCategory?.name ?? 'Despesa'} ${format(data.date, 'dd/MM')}`,
        category_id: data.category_id || null,
        amount_cents: amountCents,
        payment_method: data.payment_method,
        is_reimbursable: data.is_reimbursable,
        is_event: data.is_event,
        distance_km:
          data.by_km && data.distance_km
            ? parseKm(data.distance_km)
            : null,
        notes: data.notes || null,
        cost_center_id: data.cost_center_id || null,
        project_id: data.project_id || null,
        food_days: isFood && !data.is_event ? Number(data.food_days || 1) : 1,
        receipt_hash: receiptFile ? await receiptHash(receiptFile) : undefined,
      };

      if (isEditing && expense) {
        // Sem receipt_path no payload: mandar null em toda edição apagava o comprovante
        // anexado. O caminho do arquivo novo é gravado por attachReceipt.
        await updateExpense.mutateAsync({ id: expense.id, ...payload });
        if (receiptFile) {
          await uploadAfterSave(
            expense.id,
            expense.report?.id,
            'Alterações salvas, mas o comprovante novo não subiu. Tente anexar de novo em Despesas › Editar.',
          );
        }
      } else if (useCurrentReportFlow) {
        const result = await createExpenseInReport.mutateAsync(payload);
        if (receiptFile && result.expense?.id) {
          // Despesa tardia não tem `report`; a pasta segue o relatório do período.
          await uploadAfterSave(
            result.expense.id,
            result.report?.id ?? result.late_report?.id,
            'Despesa salva sem comprovante: o arquivo não subiu. Anexe depois em Despesas › Editar.',
          );
        }
      } else {
        await createExpense.mutateAsync(payload);
      }

      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar despesa. Verifique o comprovante.';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = createExpense.isPending || updateExpense.isPending || createExpenseInReport.isPending || isUploading;
  const requireReceiptError = requiresReceipt && !hasReceipt && !isEditing;

  const dailyLimitInfo = selectedCategory?.daily_limit_cents 
    ? `Limite diário: ${formatCurrency(selectedCategory.daily_limit_cents)}`
    : null;

  // Ciclo da data ainda sem relatório: mostra o período calculado e avisa que o
  // relatório nasce ao salvar (antes ele era criado só por escolher a data).
  const reportToBeCreated =
    !isEditing && !!dateStrForQuery && !!policy && reportForDateQuery.isFetched && !currentReportForDate;
  const displayReport = isEditing
    ? null
    : currentReportForDate ||
      (reportToBeCreated && dateStrForQuery ? cycleForDate(dateStrForQuery, cycleCutoffDay) : null) ||
      dashboardContext?.current_report;
  const cycleClosed = !isEditing && !!currentReportForDate && currentReportForDate.status !== 'draft';

  const formContent = (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (errors) => {
          const first = Object.values(errors)[0] as { message?: string } | undefined;
          toast.error(first?.message || 'Revise os campos destacados antes de salvar.');
        })}
        className="space-y-4"
      >
        {/* Period indicator */}
        {useCurrentReportFlow && displayReport && (
          <Alert>
            <AlertDescription className="text-sm">
              Período: {format(parseISO(displayReport.start_date), 'dd/MM')} - {format(parseISO(displayReport.end_date), 'dd/MM')} ({displayReport.title}
              {reportToBeCreated ? ', será criado ao salvar' : ''})
              {cycleClosed && (
                <span className="mt-1 block text-[hsl(var(--status-event))]">
                  Este relatório já foi enviado. A despesa vai ficar avulsa e o gestor decide se ela
                  entra neste mês ou no próximo.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {isEditing && expense?.report && (
          <Alert>
            <AlertDescription className="text-sm">Relatório: {expense.report.title}</AlertDescription>
          </Alert>
        )}

        {/* Date and Amount - stack on mobile */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        disabled={isReadOnly}
                        data-testid="expense-date-btn"
                        className={cn(
                          'h-12 pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground',
                          flagDate && READ_WARN_FIELD,
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'dd/MM/yyyy', { locale: ptBR })
                        ) : (
                          <span>Selecione</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date > endOfToday() || date < minExpenseDate()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {flagDate && <p className={READ_WARN_TEXT}>Confira a data lida</p>}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isFood && !watchedIsEvent ? 'Valor da nota (R$)' : 'Valor (R$)'}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="0,00"
                    {...field}
                    onBlur={(e) => {
                      field.onChange(formatAmountInput(e.target.value));
                      field.onBlur();
                    }}
                    disabled={isReadOnly}
                    readOnly={watchedByKm}
                    className={cn('h-12', watchedByKm && 'bg-muted', flagAmount && READ_WARN_FIELD)}
                    inputMode="decimal"
                    data-testid="expense-amount-input"
                  />
                </FormControl>
                {flagAmount && <p className={READ_WARN_TEXT}>Confira o valor lido</p>}
                {watchedByKm && (
                  <p className="text-xs text-muted-foreground">
                    Calculado: km × {formatCurrency(kmRateCents)}
                  </p>
                )}
                {isFood && !watchedIsEvent && parseAmountToCents(field.value || '') > 0 && (() => {
                  const nota = parseAmountToCents(field.value || '');
                  const lancado = previewFoodCents(nota, foodDailyLimit, Number(watchedFoodDays || 1));
                  return (
                    <p className="text-sm">
                      Valor lançado: <strong className="o2-num">{formatCurrency(lancado)}</strong>
                      {lancado < nota && (
                        <span className="text-xs text-muted-foreground">
                          {' '}— teto de {formatCurrency(foodDailyLimit)}/dia
                        </span>
                      )}
                    </p>
                  );
                })()}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Descrição
                {descriptionRequired ? (
                  <span className="text-destructive"> *</span>
                ) : (
                  <span className="font-normal text-muted-foreground"> (opcional)</span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    descriptionRequired
                      ? watchedByKm
                        ? 'Ex: Escritório → cliente Zaffari, reunião de fechamento'
                        : 'Ex: 20 marmitas do mês'
                      : 'Ex: Almoço com cliente'
                  }
                  {...field}
                  disabled={isReadOnly}
                  className="h-12"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category and Payment - stack on mobile */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Despesa</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isReadOnly}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {groupBySector(categories?.filter(c => c.is_active) ?? []).map((g) => (
                      <SelectGroup key={g.sector}>
                        <SelectLabel>{g.sector}</SelectLabel>
                        {g.items.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                            {cat.daily_limit_cents && (
                              <span className="text-muted-foreground ml-1">
                                (até {formatCurrency(cat.daily_limit_cents)}/dia)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {dailyLimitInfo && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {dailyLimitInfo}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payment_method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma de Pagamento</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isReadOnly}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Veículo próprio — reembolso por km (Política 4.4.6) */}
        {isTransport && !isReadOnly && (
          <div className="rounded-lg border p-3 space-y-3">
            <FormField
              control={form.control}
              name="by_km"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-0.5 pr-3">
                    <FormLabel>Reembolso por quilometragem</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Veículo próprio: {formatCurrency(kmRateCents)}/km. Informe a
                      distância e o percurso; o valor é calculado automaticamente.
                    </p>
                  </div>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {watchedByKm && (
              <FormField
                control={form.control}
                name="distance_km"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distância (km)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: 24"
                        {...field}
                        className="h-12"
                        inputMode="decimal"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Project + Cost Center (GAP-G005) */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="project_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Projeto
                  {policy?.require_project && <span className="text-destructive"> *</span>}
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isReadOnly}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code ? `${p.code} - ${p.name}` : p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cost_center_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Centro de Custo</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isReadOnly}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code ? `${cc.code} - ${cc.name}` : cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Receipt Upload - Mobile optimized */}
        <div className="space-y-2">
          <FormLabel>
            Comprovante
            {requiresReceipt && <span className="text-destructive"> *</span>}
          </FormLabel>
          {isConverting ? (
            <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Convertendo imagem...</span>
            </div>
          ) : (
            <ReceiptUpload
              file={receiptFile}
              preview={receiptPreview}
              hasExistingReceipt={hasExistingReceipt}
              required={requiresReceipt}
              disabled={isReadOnly}
              error={requireReceiptError}
              onFileChange={handleFileChange}
            />
          )}
          {readReview.notAReceipt ? (
            <p className={cn(READ_WARN_BOX, 'font-medium')} data-testid="not-a-receipt-warning">
              Isso não parece um comprovante. Anexe a foto da nota ou preencha os dados à mão.
            </p>
          ) : (
            <>
              <ReceiptValidation
                status={receiptValidation.status}
                divergences={receiptValidation.divergences}
                errorMessage={receiptValidation.errorMessage}
              />
              {readReview.messages.length > 0 && (
                <ul className={cn(READ_WARN_BOX, 'space-y-0.5')} data-testid="reading-issues">
                  {readReview.messages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {isFood && !watchedIsEvent && (
          <FormField
            control={form.control}
            name="food_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dias cobertos por esta nota</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    className="h-11 w-28"
                    disabled={isReadOnly}
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  1 = refeição do dia (reembolso até {formatCurrency(foodDailyLimit)}). Marmitas ou compra
                  para vários dias: informe quantos dias a nota cobre — o teto vira dias ×{' '}
                  {formatCurrency(foodDailyLimit)}, limitado aos dias úteis do mês.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Observações
                {watchedIsEvent && <span className="text-destructive"> *</span>}
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder={
                    watchedIsEvent
                      ? 'Descreva o motivo da exceção de evento...'
                      : 'Observações adicionais...'
                  }
                  {...field}
                  disabled={isReadOnly}
                  className="min-h-[80px]"
                />
              </FormControl>
              {watchedIsEvent && (
                <p className="text-xs text-muted-foreground">
                  Obrigatório: justifique por que essa despesa foge do combinado.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_reimbursable"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isReadOnly}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Reembolsável</FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_event"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isReadOnly}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Evento</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Exceção aprovada pela Diretoria (refeição/despesa de evento). Libera o
                  teto diário e envia para revisão — exige justificativa em Observações.
                </p>
              </div>
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        {!isReadOnly && (
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="h-12">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Despesa'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );

  const title = isReadOnly
    ? 'Detalhes da Despesa'
    : isEditing
    ? 'Editar Despesa'
    : 'Nova Despesa';

  // Use Drawer on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}