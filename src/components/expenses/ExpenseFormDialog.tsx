import { useEffect, useState } from 'react';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, Upload, X, FileText, Image as ImageIcon } from 'lucide-react';
import {
  useCreateExpense,
  useUpdateExpense,
  useCategories,
  Expense,
} from '@/hooks/useExpenses';
import { useExpensePolicy, useActiveCostCenters, useActiveProjects } from '@/hooks/usePolicy';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: ExpenseFormDialogProps) {
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const { data: categories } = useCategories();
  const { data: policy } = useExpensePolicy();
  const { data: costCenters = [] } = useActiveCostCenters();
  const { data: projects = [] } = useActiveProjects();

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const isEditing = !!expense;
  const isReadOnly = expense && expense.status !== 'draft';

  // Check if receipt already exists for this expense
  const hasExistingReceipt = expense?.receipt_path ? true : false;
  const hasReceipt = receiptFile !== null || hasExistingReceipt;

  // Build dynamic schema based on policy
  const formSchema = z.object({
    date: z.date({ required_error: 'Selecione uma data' }),
    description: z.string().min(1, 'Descrição é obrigatória'),
    category_id: z.string().optional(),
    amount: z.string().min(1, 'Valor é obrigatório'),
    payment_method: z.enum(['personal_card', 'corporate_card', 'cash', 'other']),
    is_reimbursable: z.boolean(),
    notes: z.string().optional(),
    cost_center_id: policy?.require_cost_center 
      ? z.string().min(1, 'Centro de custo é obrigatório') 
      : z.string().optional(),
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
        cost_center_id: (expense as any).cost_center_id || '',
        project_id: (expense as any).project_id || '',
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
    }
  }, [expense, form, open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setReceiptPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setReceiptPreview(null);
      }
    }
  };

  const removeFile = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  const onSubmit = async (data: FormData) => {
    // Check if receipt is required but not provided
    if (policy?.require_receipt && !hasReceipt && !isEditing) {
      form.setError('root', { message: 'Comprovante é obrigatório' });
      return;
    }

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
    };

    // TODO: Handle file upload to storage bucket when implementing receipt upload
    // For now, just save the expense without the file

    if (isEditing && expense) {
      await updateExpense.mutateAsync({ id: expense.id, ...payload });
    } else {
      await createExpense.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  const isLoading = createExpense.isPending || updateExpense.isPending;
  const requireReceiptError = policy?.require_receipt && !hasReceipt && !isEditing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReadOnly
              ? 'Detalhes da Despesa'
              : isEditing
              ? 'Editar Despesa'
              : 'Nova Despesa'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                              'pl-3 text-left font-normal',
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isReadOnly}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
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
                        <SelectTrigger>
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

            {/* Cost Center and Project */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cost_center_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Centro de Custo
                      {policy?.require_cost_center && <span className="text-destructive"> *</span>}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isReadOnly}
                    >
                      <FormControl>
                        <SelectTrigger>
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
                        <SelectTrigger>
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

            {/* Receipt Upload */}
            <div className="space-y-2">
              <FormLabel>
                Comprovante
                {policy?.require_receipt && <span className="text-destructive"> *</span>}
              </FormLabel>
              
              {!isReadOnly && (
                <>
                  {receiptFile ? (
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                      {receiptPreview ? (
                        <img
                          src={receiptPreview}
                          alt="Preview"
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <FileText className="w-12 h-12 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{receiptFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(receiptFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={removeFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : hasExistingReceipt ? (
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Comprovante já anexado
                      </span>
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                        requireReceiptError && "border-destructive"
                      )}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Clique para selecionar um arquivo
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PNG, JPG ou PDF até 10MB
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                  {requireReceiptError && (
                    <p className="text-sm text-destructive">
                      Comprovante é obrigatório conforme política da empresa
                    </p>
                  )}
                </>
              )}

              {isReadOnly && hasExistingReceipt && (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Comprovante anexado
                  </span>
                </div>
              )}
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
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
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
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
