/**
 * Sprint 6 — Camera-first quick expense capture.
 *
 * Fluxo:
 * 1. `capture` — abre câmera (mobile via `capture="environment"`) ou
 *    file picker (desktop). Loader enquanto user escolhe arquivo.
 * 2. `review` — preview + OCR via `useValidateReceipt`. User salva como
 *    despesa avulsa OU vai pra `edit` pra refinar.
 * 3. `edit` — form mínimo (descrição, valor, data) com mesmas validations
 *    do ExpenseFormDialog (zod). Submit cria despesa.
 *
 * HEIC é convertido pra JPEG via `convertHeicToJpeg` antes do preview/OCR.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Camera, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCreateExpense } from '@/hooks/useExpenses';
import { useValidateReceipt } from '@/hooks/useValidateReceipt';
import { convertHeicToJpeg } from '@/lib/convertHeic';
import { formatCurrency } from '@/lib/constants';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export type QuickExpenseStep = 'capture' | 'review' | 'edit';

export interface QuickExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback após criar despesa (pra refresh local). */
  onCreated?: () => void;
  /** Permite override do step inicial nos testes. */
  initialStep?: QuickExpenseStep;
}

const formSchema = z.object({
  date: z.date({ required_error: 'Selecione uma data' }),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.string().min(1, 'Valor é obrigatório'),
});

type FormData = z.infer<typeof formSchema>;

function parseAmountToCents(amount: string): number {
  return Math.round(parseFloat(amount.replace(',', '.') || '0') * 100);
}

function centsToInput(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function QuickExpenseSheet({
  open,
  onOpenChange,
  onCreated,
  initialStep = 'capture',
}: QuickExpenseSheetProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoOpenedRef = useRef(false);

  const [step, setStep] = useState<QuickExpenseStep>(initialStep);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [waitingForCamera, setWaitingForCamera] = useState(false);

  const validation = useValidateReceipt();
  const createExpense = useCreateExpense();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      description: '',
      amount: '',
    },
  });

  // Reset state quando o sheet abre/fecha.
  useEffect(() => {
    if (!open) {
      setStep(initialStep);
      setFile(null);
      setPreview(null);
      setWaitingForCamera(false);
      autoOpenedRef.current = false;
      validation.reset();
      form.reset({ date: new Date(), description: '', amount: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Quando entra no step capture E é mobile, dispara o file picker
  // automaticamente — abre câmera.
  useEffect(() => {
    if (open && step === 'capture' && isMobile && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setWaitingForCamera(true);
      // pequeno delay pra animação do drawer não engolir o click sintético.
      const t = setTimeout(() => {
        inputRef.current?.click();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open, step, isMobile]);

  const handleFileSelected = async (selected: File | null) => {
    setWaitingForCamera(false);
    if (!selected) {
      // user cancelou file picker — fecha o sheet (apenas no auto-open).
      if (autoOpenedRef.current && step === 'capture') {
        onOpenChange(false);
      }
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      toast.error('Foto muito grande (>10MB). Tente reduzir a resolução.');
      return;
    }

    let processed = selected;
    try {
      setIsConverting(true);
      processed = await convertHeicToJpeg(selected);
    } catch (err) {
      console.error('HEIC conversion failed:', err);
      toast.error('Não foi possível converter a imagem. Tente outro formato.');
      setIsConverting(false);
      return;
    }
    setIsConverting(false);

    setFile(processed);

    // gera preview
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(processed);

    // dispara OCR — passa data/valor "vazios" só pra extrair valores
    // sem flagar divergência. Como o form ainda não tem valor, validate
    // sempre vai marcar warning/divergence; isso está OK aqui — usamos
    // só o `result.extracted_*` como sugestão.
    const today = format(new Date(), 'yyyy-MM-dd');
    validation.validate(processed, today, 0);

    setStep('review');
  };

  const handleRetake = () => {
    setFile(null);
    setPreview(null);
    validation.reset();
    autoOpenedRef.current = false;
    setStep('capture');
  };

  const handleQuickSave = async () => {
    if (!file) return;
    const extracted = validation.result;
    const description =
      extracted?.extracted_date
        ? `Despesa avulsa ${format(new Date(extracted.extracted_date + 'T00:00:00'), 'dd/MM/yyyy')}`
        : 'Despesa avulsa';

    try {
      await createExpense.mutateAsync({
        date: extracted?.extracted_date || format(new Date(), 'yyyy-MM-dd'),
        description,
        amount_cents: extracted?.extracted_amount_cents ?? 0,
        payment_method: 'personal_card',
        is_reimbursable: true,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      // toast já vem do useCreateExpense.onError
      console.error('quick save failed', err);
    }
  };

  const handleEditSubmit = async (data: FormData) => {
    try {
      await createExpense.mutateAsync({
        date: format(data.date, 'yyyy-MM-dd'),
        description: data.description,
        amount_cents: parseAmountToCents(data.amount),
        payment_method: 'personal_card',
        is_reimbursable: true,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      console.error('edit submit failed', err);
    }
  };

  // Quando entra em edit, pré-popular form com dados extraídos.
  const goToEdit = () => {
    const extracted = validation.result;
    form.reset({
      date: extracted?.extracted_date
        ? new Date(extracted.extracted_date + 'T00:00:00')
        : new Date(),
      description: '',
      amount: centsToInput(extracted?.extracted_amount_cents ?? null),
    });
    setStep('edit');
  };

  const extractedSummary = useMemo(() => {
    const r = validation.result;
    if (!r) return null;
    return {
      date: r.extracted_date,
      amount: r.extracted_amount_cents,
      confidence: r.confidence,
    };
  }, [validation.result]);

  const isSaving = createExpense.isPending;

  const content = (
    <div className="px-4 pb-6 space-y-4 overflow-y-auto" data-testid="quick-expense-content">
      {/* Hidden input — sempre montado pra o ref ficar disponível. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={isMobile ? 'environment' : undefined}
        hidden
        data-testid="quick-expense-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          handleFileSelected(f);
          // Reset input pra permitir re-selecionar mesma foto.
          e.target.value = '';
        }}
      />

      {step === 'capture' && (
        <div
          className="flex flex-col items-center justify-center py-12 gap-4"
          data-testid="step-capture"
        >
          {isConverting ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Convertendo foto...</p>
            </>
          ) : waitingForCamera ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Aguardando câmera...</p>
            </>
          ) : (
            <>
              <Camera className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {isMobile
                  ? 'Toque pra abrir a câmera e fotografar a nota.'
                  : 'Selecione uma foto da nota fiscal.'}
              </p>
              <Button
                onClick={() => inputRef.current?.click()}
                className="h-12 gap-2"
                data-testid="open-camera-btn"
              >
                <Camera className="h-5 w-5" />
                {isMobile ? 'Abrir câmera' : 'Selecionar foto'}
              </Button>
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4" data-testid="step-review">
          {preview && (
            <div className="rounded-lg overflow-hidden border bg-muted/30">
              <img
                src={preview}
                alt="Preview da nota fiscal"
                className="w-full max-h-64 object-contain"
              />
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dados detectados
            </p>
            {validation.status === 'validating' || isConverting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando comprovante...
              </div>
            ) : extractedSummary ? (
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Valor: </span>
                  <span className="font-medium">
                    {extractedSummary.amount != null
                      ? formatCurrency(extractedSummary.amount)
                      : 'não detectado'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Data: </span>
                  <span className="font-medium">
                    {extractedSummary.date
                      ? format(
                          new Date(extractedSummary.date + 'T00:00:00'),
                          'dd/MM/yyyy',
                          { locale: ptBR }
                        )
                      : 'não detectada'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Confiança: </span>
                  <span className="font-medium capitalize">
                    {extractedSummary.confidence}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {validation.errorMessage ||
                  'Não foi possível extrair dados automaticamente.'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleQuickSave}
              disabled={isSaving || validation.status === 'validating'}
              className="h-12"
              data-testid="quick-save-btn"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar como despesa avulsa
            </Button>
            <Button
              variant="outline"
              onClick={goToEdit}
              disabled={isSaving}
              className="h-12"
              data-testid="edit-details-btn"
            >
              Editar detalhes
            </Button>
            <Button
              variant="ghost"
              onClick={handleRetake}
              disabled={isSaving}
              className="h-10 gap-2"
              data-testid="retake-btn"
            >
              <RotateCcw className="h-4 w-4" />
              Tirar outra foto
            </Button>
          </div>
        </div>
      )}

      {step === 'edit' && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleEditSubmit)}
            className="space-y-4"
            data-testid="step-edit"
          >
            {preview && (
              <div className="rounded-lg overflow-hidden border bg-muted/30">
                <img
                  src={preview}
                  alt="Preview da nota fiscal"
                  className="w-full max-h-32 object-contain"
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Almoço com cliente"
                      className="h-12"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0,00"
                        className="h-12"
                        inputMode="decimal"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          disabled={(d) => d > new Date()}
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

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('review')}
                disabled={isSaving}
                className="h-12"
              >
                Voltar
              </Button>
              <Button type="submit" disabled={isSaving} className="h-12">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );

  const title =
    step === 'capture'
      ? 'Nova despesa'
      : step === 'review'
      ? 'Revisar despesa'
      : 'Editar detalhes';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
