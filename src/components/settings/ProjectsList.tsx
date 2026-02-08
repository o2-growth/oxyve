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
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  Project,
} from '@/hooks/usePolicy';
import { Plus, Pencil, Trash2, Loader2, FolderKanban } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function ProjectsList() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });

  const handleOpenForm = (project?: Project) => {
    if (project) {
      setSelected(project);
      setFormData({ name: project.name, code: project.code || '' });
    } else {
      setSelected(null);
      setFormData({ name: '', code: '' });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      await updateProject.mutateAsync({
        id: selected.id,
        name: formData.name,
        code: formData.code || undefined,
      });
    } else {
      await createProject.mutateAsync({
        name: formData.name,
        code: formData.code || undefined,
      });
    }
    setIsFormOpen(false);
  };

  const handleToggleActive = async (project: Project) => {
    await updateProject.mutateAsync({
      id: project.id,
      is_active: !project.is_active,
    });
  };

  const handleDelete = (project: Project) => {
    setSelected(project);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (selected) {
      await deleteProject.mutateAsync(selected.id);
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
            <CardTitle>Projetos</CardTitle>
            <CardDescription>
              Gerencie os projetos da sua organização
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {projects?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum projeto cadastrado</p>
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
                {projects?.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.code || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={project.is_active}
                          onCheckedChange={() => handleToggleActive(project)}
                        />
                        <Badge variant={project.is_active ? 'default' : 'secondary'}>
                          {project.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenForm(project)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(project)}
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
                {selected ? 'Editar Projeto' : 'Novo Projeto'}
              </DialogTitle>
              <DialogDescription>Preencha os dados do projeto</DialogDescription>
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
                  placeholder="Ex: Campanha Q1"
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
                  placeholder="Ex: PRJ-001"
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
                disabled={createProject.isPending || updateProject.isPending}
              >
                {(createProject.isPending || updateProject.isPending) && (
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
        title="Excluir projeto"
        description="Tem certeza que deseja excluir este projeto? Despesas vinculadas perderão a referência."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteProject.isPending}
      />
    </>
  );
}
