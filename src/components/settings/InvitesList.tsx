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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useInvites, useCreateInvite, useDeleteInvite, getInviteLink, OrgInvite } from '@/hooks/useInvites';
import { Plus, Trash2, Loader2, Copy, Check, UserPlus, Clock, CheckCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ROLE_LABELS: Record<string, string> = {
  employee: 'Colaborador',
  manager: 'Gestor',
  admin: 'Administrador',
};

export function InvitesList() {
  const { data: invites, isLoading } = useInvites();
  const createInvite = useCreateInvite();
  const deleteInvite = useDeleteInvite();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<OrgInvite | null>(null);
  const [formData, setFormData] = useState<{ email: string; role: 'employee' | 'manager' | 'admin' }>({ email: '', role: 'employee' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInvite.mutateAsync(formData);
    setIsFormOpen(false);
    setFormData({ email: '', role: 'employee' });
  };

  const handleDelete = (invite: OrgInvite) => {
    setSelected(invite);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (selected) {
      await deleteInvite.mutateAsync(selected.id);
      setIsDeleteOpen(false);
      setSelected(null);
    }
  };

  const copyLink = async (invite: OrgInvite) => {
    const link = getInviteLink(invite.token);
    await navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pendingInvites = invites?.filter((i) => !i.accepted_at) || [];
  const acceptedInvites = invites?.filter((i) => i.accepted_at) || [];

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
            <CardTitle>Convites</CardTitle>
            <CardDescription>
              Convide novos membros por email. Eles receberão um link para criar conta.
            </CardDescription>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Convite
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pending Invites */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pendentes ({pendingInvites.length})
            </h4>
            {pendingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum convite pendente</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLE_LABELS[invite.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(invite.expires_at), "dd 'de' MMM", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(invite)}
                          >
                            {copiedId === invite.id ? (
                              <Check className="h-4 w-4 text-primary" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(invite)}
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
          </div>

          {/* Accepted Invites */}
          {acceptedInvites.length > 0 && (
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CheckCircle className="h-4 w-4 text-primary" />
                Aceitos ({acceptedInvites.length})
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Aceito em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acceptedInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLE_LABELS[invite.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(invite.accepted_at!), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {invites?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <UserPlus className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum convite enviado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Novo Convite</DialogTitle>
              <DialogDescription>
                Convide um novo membro para sua organização
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="colaborador@empresa.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Cargo</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: 'employee' | 'manager' | 'admin') =>
                    setFormData((prev) => ({ ...prev, role: value }))
                  }
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Colaborador</SelectItem>
                    <SelectItem value="manager">Gestor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
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
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Criar Convite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Excluir convite"
        description="Tem certeza que deseja excluir este convite?"
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteInvite.isPending}
      />
    </>
  );
}
