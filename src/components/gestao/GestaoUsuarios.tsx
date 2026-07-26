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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useOrgMembers,
  useSetUserRole,
  type OrgMember,
  type OrgRole,
} from '@/hooks/useOrgMembers';
import { format } from 'date-fns';
import { ShieldOff, Users } from 'lucide-react';

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: 'employee', label: 'Colaborador' },
  { value: 'manager', label: 'Gestor' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_LABELS: Record<OrgRole, string> = {
  employee: 'Colaborador',
  manager: 'Gestor',
  admin: 'Admin',
};

const ROLE_BADGE_VARIANT: Record<
  OrgRole,
  'default' | 'secondary' | 'outline'
> = {
  admin: 'default',
  manager: 'secondary',
  employee: 'outline',
};

function RoleBadge({ role }: { role: OrgRole | null }) {
  if (!role) {
    return <Badge variant="outline">Sem papel</Badge>;
  }
  return <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>;
}

function LastSignIn({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-muted-foreground">Nunca acessou</span>;
  }
  return <span className="o2-num">{format(new Date(value), 'dd/MM/yyyy')}</span>;
}

function MemberRow({ member }: { member: OrgMember }) {
  const setUserRole = useSetUserRole();

  return (
    <TableRow className="transition-colors duration-150">
      <TableCell className="font-sans font-medium">
        {member.full_name || 'Sem nome'}
      </TableCell>
      <TableCell className="font-mono text-[13px] text-muted-foreground">
        {member.email}
      </TableCell>
      <TableCell>
        <RoleBadge role={member.role} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        <LastSignIn value={member.last_sign_in_at} />
      </TableCell>
      <TableCell>
        <Select
          value={member.role ?? undefined}
          disabled={setUserRole.isPending}
          onValueChange={(value) =>
            setUserRole.mutate({
              p_user_id: member.user_id,
              p_role: value as OrgRole,
            })
          }
        >
          <SelectTrigger className="h-9 w-[150px] text-muted-foreground">
            <SelectValue placeholder="Definir papel" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

export function GestaoUsuarios() {
  const { data, isLoading, isError } = useOrgMembers();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Usuários</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Gerencie os membros da organização e seus papéis
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <EmptyState
            icon={<ShieldOff className="h-6 w-6" />}
            title="Acesso restrito aos administradores."
            description="Você não tem permissão para gerenciar os usuários da organização."
          />
        ) : isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum usuário"
            description="Ainda não há membros na organização."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Nome</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">E-mail</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Papel</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Último acesso</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((member) => (
                  <MemberRow key={member.user_id} member={member} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
