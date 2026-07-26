import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCurrency } from '@/lib/constants';
import {
  useExpenseTypes,
  useCreateExpenseType,
  useUpdateExpenseType,
  useDeleteExpenseType,
  type ExpenseType,
  type ExpenseKind,
} from '@/hooks/useExpenseTypes';
import { FolderTree, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Rótulos / estilo por tipo (kind)                                    */
/* ------------------------------------------------------------------ */

const KIND_LABELS: Record<ExpenseKind, string> = {
  food: 'Alimentação',
  transport: 'Transporte',
  other: 'Outros',
};

const KIND_BADGE_VARIANT: Record<
  ExpenseKind,
  'default' | 'secondary' | 'outline'
> = {
  food: 'default',
  transport: 'secondary',
  other: 'outline',
};

/* ------------------------------------------------------------------ */
/* Dialog de formulário (criar / editar)                               */
/* ------------------------------------------------------------------ */

const formSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  kind: z.enum(['food', 'transport', 'other']),
  sector: z.string().optional(),
  daily_limit: z.string().optional(),
  requires_receipt: z.boolean(),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ExpenseType | null;
}) {
  const createCategory = useCreateExpenseType();
  const updateCategory = useUpdateExpenseType();
  const isEditing = !!category;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      kind: 'other',
      sector: '',
      daily_limit: '',
      requires_receipt: false,
      is_active: true,
    },
  });

  // Pré-preenche (edição) ou reseta (criação) a cada abertura.
  useEffect(() => {
    if (!open) return;
    if (category) {
      form.reset({
        name: category.name,
        kind: category.kind,
        sector: category.sector ?? '',
        daily_limit:
          category.daily_limit_cents != null
            ? (category.daily_limit_cents / 100).toFixed(2).replace('.', ',')
            : '',
        requires_receipt: category.requires_receipt,
        is_active: category.is_active,
      });
    } else {
      form.reset({
        name: '',
        kind: 'other',
        sector: '',
        daily_limit: '',
        requires_receipt: false,
        is_active: true,
      });
    }
  }, [category, open, form]);

  const onSubmit = async (data: FormData) => {
    // Converte limite diário (reais) para centavos; vazio => sem limite.
    let dailyLimitCents: number | null = null;
    const rawLimit = (data.daily_limit ?? '').trim();
    if (rawLimit !== '') {
      const parsed = parseFloat(rawLimit.replace(',', '.'));
      if (Number.isNaN(parsed) || parsed < 0) {
        form.setError('daily_limit', { message: 'Valor inválido' });
        return;
      }
      dailyLimitCents = Math.round(parsed * 100);
    }

    const sector = (data.sector ?? '').trim();

    const payload = {
      name: data.name.trim(),
      kind: data.kind,
      sector: sector === '' ? null : sector,
      daily_limit_cents: dailyLimitCents,
      requires_receipt: data.requires_receipt,
      is_active: data.is_active,
    };

    try {
      if (isEditing && category) {
        await updateCategory.mutateAsync({ id: category.id, ...payload });
      } else {
        await createCategory.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // Erros já são exibidos via toast nos hooks.
    }
  };

  const isLoading = createCategory.isPending || updateCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar categoria' : 'Nova categoria'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="o2-eyebrow">Nome</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Alimentação"
                      {...field}
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="o2-eyebrow">Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(KIND_LABELS) as ExpenseKind[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {KIND_LABELS[k]}
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
                name="sector"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="o2-eyebrow">Setor</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Opcional"
                        {...field}
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="daily_limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="o2-eyebrow">Limite diário (R$)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Opcional — ex: 50,00"
                      {...field}
                      className="h-11"
                      inputMode="decimal"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requires_receipt"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-1">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="o2-eyebrow">Exige comprovante</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-1">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="o2-eyebrow">Ativa</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading} className="h-11">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Salvar' : 'Criar categoria'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export function GestaoCategorias() {
  const { data: categories, isLoading } = useExpenseTypes();
  const deleteCategory = useDeleteExpenseType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);
  const [toDelete, setToDelete] = useState<ExpenseType | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (category: ExpenseType) => {
    setEditing(category);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteCategory.mutateAsync(toDelete.id);
      setToDelete(null);
    } catch {
      // Erro exibido via toast no hook.
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base sm:text-lg">Categorias</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Tipos de despesa, limites diários e setores da organização
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova categoria</span>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !categories || categories.length === 0 ? (
          <EmptyState
            icon={<FolderTree className="h-6 w-6" />}
            title="Nenhuma categoria"
            description="Crie a primeira categoria de despesa para começar."
            action={
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova categoria
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Nome</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Tipo</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Setor</TableHead>
                  <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">Limite diário</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Ativo</TableHead>
                  <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id} className="transition-colors duration-150">
                    <TableCell className="font-sans font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <Badge variant={KIND_BADGE_VARIANT[cat.kind]}>
                        {KIND_LABELS[cat.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cat.sector ? (
                        <Badge variant="outline" className="font-normal">
                          {cat.sector}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right o2-num">
                      {cat.daily_limit_cents != null
                        ? formatCurrency(cat.daily_limit_cents)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.is_active ? 'default' : 'outline'}>
                        {cat.is_active ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(cat)}
                          aria-label={`Editar ${cat.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(cat)}
                          aria-label={`Excluir ${cat.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir categoria"
        description={
          toDelete
            ? `Tem certeza que deseja excluir "${toDelete.name}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteCategory.isPending}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
