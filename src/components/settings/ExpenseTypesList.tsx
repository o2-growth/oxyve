import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  useExpenseTypes,
  useCreateExpenseType,
  useUpdateExpenseType,
  useDeleteExpenseType,
  ExpenseType,
} from '@/hooks/useExpenseTypes';
import { useActiveDepartments } from '@/hooks/useDepartments';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/constants';

export function ExpenseTypesList() {
  const { data: types, isLoading } = useExpenseTypes();
  const { data: departments = [] } = useActiveDepartments();
  const createType = useCreateExpenseType();
  const updateType = useUpdateExpenseType();
  const deleteType = useDeleteExpenseType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ExpenseType | null>(null);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [requiresReceipt, setRequiresReceipt] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setDepartmentId('');
    setDailyLimit('');
    setRequiresReceipt(false);
  };

  const openCreate = () => {
    setEditingType(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (type: ExpenseType) => {
    setEditingType(type);
    setName(type.name);
    setDepartmentId(type.department_id || '');
    setDailyLimit(
      type.daily_limit_cents
        ? (type.daily_limit_cents / 100).toFixed(2).replace('.', ',')
        : ''
    );
    setRequiresReceipt(type.requires_receipt);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;

    const dailyLimitCents = dailyLimit
      ? Math.round(parseFloat(dailyLimit.replace(',', '.')) * 100)
      : null;

    const payload = {
      name,
      department_id: departmentId || null,
      daily_limit_cents: dailyLimitCents,
      requires_receipt: requiresReceipt,
    };

    if (editingType) {
      await updateType.mutateAsync({ id: editingType.id, ...payload });
    } else {
      await createType.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleToggleActive = async (type: ExpenseType) => {
    await updateType.mutateAsync({ id: type.id, is_active: !type.is_active });
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteType.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const isSubmitting = createType.isPending || updateType.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Configure tipos de despesa com limites diários e regras específicas.
        </p>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </div>

      {types?.length === 0 ? (
        <EmptyState
          title="Nenhum tipo de despesa"
          description="Crie tipos de despesa para categorizar os gastos."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Limite Diário</TableHead>
              <TableHead>Comprovante</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types?.map((type) => (
              <TableRow key={type.id}>
                <TableCell className="font-medium">{type.name}</TableCell>
                <TableCell>
                  {type.department?.name || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {type.daily_limit_cents ? (
                    formatCurrency(type.daily_limit_cents)
                  ) : (
                    <span className="text-muted-foreground">Sem limite</span>
                  )}
                </TableCell>
                <TableCell>
                  {type.requires_receipt ? (
                    <Badge variant="outline">Obrigatório</Badge>
                  ) : (
                    <span className="text-muted-foreground">Opcional</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={type.is_active}
                      onCheckedChange={() => handleToggleActive(type)}
                    />
                    <Badge variant={type.is_active ? 'default' : 'secondary'}>
                      {type.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(type)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(type.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingType ? 'Editar Tipo de Despesa' : 'Novo Tipo de Despesa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="type-name">Nome *</Label>
              <Input
                id="type-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Alimentação"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Departamento</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se vinculado, apenas funcionários do departamento poderão usar
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-limit">Limite Diário (R$)</Label>
              <Input
                id="daily-limit"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="Ex: 30,00 (deixe vazio para sem limite)"
              />
              <p className="text-xs text-muted-foreground">
                Se definido, o sistema alertará/bloqueará quando excedido
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="requires-receipt"
                checked={requiresReceipt}
                onCheckedChange={(checked) => setRequiresReceipt(checked === true)}
              />
              <Label htmlFor="requires-receipt" className="cursor-pointer">
                Exigir comprovante
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingType ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Tipo de Despesa"
        description="Tem certeza que deseja excluir este tipo? Despesas já vinculadas não serão afetadas."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteType.isPending}
      />
    </div>
  );
}
