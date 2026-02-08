import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useCostCenters,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
  CostCenter,
} from '@/hooks/usePolicy';
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function CostCentersList() {
  const { data: costCenters, isLoading } = useCostCenters();
  const createCostCenter = useCreateCostCenter();
  const updateCostCenter = useUpdateCostCenter();
  const deleteCostCenter = useDeleteCostCenter();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });

  const handleOpenForm = (costCenter?: CostCenter) => {
    if (costCenter) {
      setSelected(costCenter);
      setFormData({ name: costCenter.name, code: costCenter.code || '' });
    } else {
      setSelected(null);
      setFormData({ name: '', code: '' });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      await updateCostCenter.mutateAsync({
        id: selected.id,
        name: formData.name,
        code: formData.code || undefined,
      });
    } else {
      await createCostCenter.mutateAsync({
        name: formData.name,
        code: formData.code || undefined,
      });
    }
    setIsFormOpen(false);
  };

  const handleToggleActive = async (costCenter: CostCenter) => {
    await updateCostCenter.mutateAsync({
      id: costCenter.id,
      is_active: !costCenter.is_active,
    });
  };

  const handleDelete = (costCenter: CostCenter) => {
    setSelected(costCenter);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (selected) {
      await deleteCostCenter.mutateAsync(selected.id);
      setIsDeleteOpen(false);
      setSelected(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Centros de Custo</CardTitle>
            <CardDescription>
              Gerencie os centros de custo da sua organização
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {costCenters?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nenhum centro de custo cadastrado
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costCenters?.map((cc) => (
                  <TableRow key={cc.id}>
                    <TableCell className="font-medium">{cc.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {cc.code || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cc.is_active}
                          onCheckedChange={() => handleToggleActive(cc)}
                        />
                        <Badge variant={cc.is_active ? 'default' : 'secondary'}>
                          {cc.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenForm(cc)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(cc)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {selected ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do centro de custo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ex: Marketing"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, code: e.target.value }))
                  }
                  placeholder="Ex: MKT-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createCostCenter.isPending || updateCostCenter.isPending}
              >
                {(createCostCenter.isPending || updateCostCenter.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {selected ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Excluir centro de custo"
        description="Tem certeza que deseja excluir este centro de custo? Despesas vinculadas perderão a referência."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteCostCenter.isPending}
      />
    </>
  );
}
