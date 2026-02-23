import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  SelectItem,
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
import { useExpensePolicy, useActiveCostCenters, useActiveProjects } from '@/hooks/usePolicy';
import { useDashboardContext, useCreateExpenseInReport, useReportForDate, CurrentReport } from '@/hooks/useCurrentReport';
import { PAYMENT_METHOD_LABELS, formatCurrency } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';
import { ReceiptUpload } from './ReceiptUpload';
import { ReceiptValidation } from './ReceiptValidation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useValidateReceipt } from '@/hooks/useValidateReceipt';
import { convertHeicToJpeg } from '@/lib/convertHeic';

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  useCurrentReportFlow?: boolean;
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
  const reportForDate = useReportForDate();
  const { data: categories } = useActiveExpenseTypes();
  const { data: policy } = useExpensePolicy();
  const { data: costCenters = [] } = useActiveCostCenters();
  const { data: projects = [] } = useActiveProjects();
  const { data: dashboardContext } = useDashboardContext();

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseType | null>(null);
  const [currentReportForDate, setCurrentReportForDate] = useState<CurrentReport | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const receiptValidation = useValidateReceipt();

  const isEditing = !!expense;
  const isReadOnly = expense && expense.status !== 'draft';
  const hasExistingReceipt = expense?.receipt_path ? true : false;
  const hasReceipt = receiptFile !== null || hasExistingReceipt;
  const categoryRequiresReceipt = selectedCategory?.requires_receipt || false;
  const requiresReceipt = policy?.require_receipt || categoryRequiresReceipt;

  // Build dynamic schema based on policy
  const formSchema = z.object({
    date: z.date({ required_error: 'Selecione uma data' }),
    description: z.string().min(1, 'Descrição é obrigatória'),
    category_id: z.string().optional(),
    amount: z.string().min(1, 'Valor é obrigatório'),
    payment_method: z.enum(['personal_card', 'corporate_card', 'cash', 'other']),
    is_reimbursable: z.boolean(),
    notes: z.string().optional(),
    cost_center_id: z.string().optional(),
    project_id: policy?.require_project 
      ? z.string().min(1, 'Projeto é obrigatório') 
      : z.string().optional(),
  });

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
      notes: '',
      cost_center_id: '',
      project_id: '',
    },
  });

  // Watch category changes
  const watchedCategoryId = form.watch('category_id');
  const watchedDate = form.watch('date');
  const watchedAmount = form.watch('amount');
  
  useEffect(() => {
    if (watchedCategoryId && categories) {
      const cat = categories.find(c => c.id === watchedCategoryId);
      setSelectedCategory(cat || null);
    } else {
      setSelectedCategory(null);
    }
  }, [watchedCategoryId, categories]);

  // Update report for selected date
  useEffect(() => {
    if (useCurrentReportFlow && watchedDate && !isEditing) {
      const dateStr = format(watchedDate, 'yyyy-MM-dd');
      reportForDate.mutate(dateStr, {
        onSuccess: (report) => {
          setCurrentReportForDate(report);
        },
      });
    }
  }, [watchedDate, useCurrentReportFlow, isEditing]);

  useEffect(() => {
    if (expense) {
      form.reset({
        date: new Date(expense.date),
        description: expense.description,
        category_id: expense.category_id || '',
        amount: (expense.amount_cents / 100).toFixed(2).replace('.', ','),
        payment_method: expense.payment_method,
        is_reimbursable: expense.is_reimbursable,
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
        notes: '',
        cost_center_id: '',
        project_id: '',
      });
      setReceiptFile(null);
      setReceiptPreview(null);
      if (dashboardContext?.current_report) {
        setCurrentReportForDate(dashboardContext.current_report);
      }
    }
  }, [expense, form, open, dashboardContext]);

  const triggerValidation = useCallback((file: File) => {
    const dateVal = form.getValues('date');
    const amountStr = form.getValues('amount');
    if (!dateVal || !amountStr) return;
    const formDate = format(dateVal, 'yyyy-MM-dd');
    const formAmountCents = Math.round(parseFloat(amountStr.replace(',', '.') || '0') * 100);
    receiptValidation.validate(file, formDate, formAmountCents);
  }, [form, receiptValidation]);

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      receiptValidation.reset();
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

    setReceiptFile(processedFile);
    
    if (processedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(processedFile);
      triggerValidation(processedFile);
    } else {
      setReceiptPreview(null);
      receiptValidation.reset();
    }
  };

  // Re-validate when date or amount changes after file is attached
  useEffect(() => {
    if (receiptFile && receiptFile.type.startsWith('image/') && receiptValidation.status !== 'idle' && receiptValidation.status !== 'validating') {
      triggerValidation(receiptFile);
    }
  }, [watchedDate, watchedAmount]);

  const uploadReceipt = async (expenseId: string): Promise<string | null> => {
    if (!receiptFile || !profile?.org_id) return null;

    const fileExt = receiptFile.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const reportId = currentReportForDate?.id || 'unassigned';
    const filePath = `${profile.org_id}/${profile.id}/${reportId}/${expenseId}/${fileName}`;

    const { error } = await supabase.storage
      .from('receipts')
      .upload(filePath, receiptFile);

    if (error) throw error;
    return filePath;
  };

  const onSubmit = async (data: FormData) => {
    if (requiresReceipt && !hasReceipt && !isEditing) {
      form.setError('root', { message: 'Comprovante é obrigatório' });
      return;
    }

    setIsUploading(true);

    try {
      const amountCents = Math.round(
        parseFloat(data.amount.replace(',', '.')) * 100
      );

      const payload = {
        date: format(data.date, 'yyyy-MM-dd'),
        description: data.description,
        category_id: data.category_id || null,
        amount_cents: amountCents,
        payment_method: data.payment_method,
        is_reimbursable: data.is_reimbursable,
        notes: data.notes || null,
        cost_center_id: data.cost_center_id || null,
        project_id: data.project_id || null,
        receipt_path: null as string | null,
      };

      if (isEditing && expense) {
        // Upload receipt if new file
        if (receiptFile) {
          payload.receipt_path = await uploadReceipt(expense.id);
        }
        await updateExpense.mutateAsync({ id: expense.id, ...payload });
      } else if (useCurrentReportFlow) {
        // Create expense in report flow
        const result = await createExpenseInReport.mutateAsync(payload);
        
        // Upload receipt after expense is created
        if (receiptFile && result.expense?.id) {
          const receiptPath = await uploadReceipt(result.expense.id);
          if (receiptPath) {
            await supabase
              .from('expenses')
              .update({ receipt_path: receiptPath })
              .eq('id', result.expense.id);
          }
        }
      } else {
        await createExpense.mutateAsync(payload);
      }

      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar despesa. Verifique o comprovante.');
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = createExpense.isPending || updateExpense.isPending || createExpenseInReport.isPending || isUploading;
  const requireReceiptError = requiresReceipt && !hasReceipt && !isEditing;

  const dailyLimitInfo = selectedCategory?.daily_limit_cents 
    ? `Limite diário: ${formatCurrency(selectedCategory.daily_limit_cents)}`
    : null;

  const displayReport = currentReportForDate || dashboardContext?.current_report;

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Period indicator */}
        {useCurrentReportFlow && displayReport && (
          <Alert>
            <AlertDescription className="text-sm">
              Período: {format(parseISO(displayReport.start_date), 'dd/MM')} - {format(parseISO(displayReport.end_date), 'dd/MM')} ({displayReport.title})
            </AlertDescription>
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
                        className={cn(
                          'h-12 pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
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
                      disabled={(date) => date > new Date()}
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
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="0,00"
                    {...field}
                    disabled={isReadOnly}
                    className="h-12"
                    inputMode="decimal"
                  />
                </FormControl>
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
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ex: Almoço com cliente"
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
                    {categories?.filter(c => c.is_active).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                        {cat.daily_limit_cents && (
                          <span className="text-muted-foreground ml-1">
                            (até {formatCurrency(cat.daily_limit_cents)}/dia)
                          </span>
                        )}
                      </SelectItem>
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

        {/* Project */}
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
          <ReceiptValidation
            status={receiptValidation.status}
            divergences={receiptValidation.divergences}
            errorMessage={receiptValidation.errorMessage}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Observações adicionais..."
                  {...field}
                  disabled={isReadOnly}
                  className="min-h-[80px]"
                />
              </FormControl>
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