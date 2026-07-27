import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GestaoUsuarios } from '@/components/gestao/GestaoUsuarios';
import { GestaoCategorias } from '@/components/gestao/GestaoCategorias';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/constants';
import {
  useAdminOverview,
  type PersonRow,
} from '@/hooks/useAdminOverview';
import {
  Wallet,
  TrendingUp,
  Banknote,
  Users,
  ShieldOff,
  Building2,
  AlertTriangle,
  XCircle,
  CalendarRange,
  CheckCircle2,
} from 'lucide-react';

/** Formata uma data ISO "yyyy-MM-dd" para "dd/MM/yyyy" sem sofrer com
 *  deslocamento de timezone (não passa por Date/UTC). */
function formatIsoDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Carimbo de auditoria — chip pill mono uppercase (âmbar p/ exceção).
const STAMP =
  'inline-flex shrink-0 items-center gap-1 rounded-full font-mono font-medium uppercase text-[10px] leading-none tracking-[0.08em] px-1.5 py-1';

interface DrillExpense {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  is_out_of_policy: boolean;
  is_event: boolean;
  category?: { name: string } | null;
}

/* ------------------------------------------------------------------ */
/* Drill-down: lançamentos de uma pessoa                               */
/* ------------------------------------------------------------------ */

function PersonExpensesDialog({
  person,
  onClose,
}: {
  person: PersonRow | null;
  onClose: () => void;
}) {
  const userId = person?.user_id ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-person-expenses', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, category:expense_categories(name)')
        .eq('user_id', userId as string)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as unknown as DrillExpense[];
    },
  });

  const queryClient = useQueryClient();
  const payable = (data ?? []).filter(
    (e) => e.status === 'submitted' || e.status === 'approved',
  );
  const payableTotal = payable.reduce((s, e) => s + e.amount_cents, 0);

  const markPaid = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.rpc('mark_expenses_paid', {
        p_expense_ids: payable.map((e) => e.id),
      } as never);
      if (error) throw error;
      return res as unknown as { paid: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      queryClient.invalidateQueries({ queryKey: ['admin-person-expenses', userId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(`${res.paid} lançamento(s) marcado(s) como pago(s).`);
      onClose();
    },
    onError: (e) =>
      toast.error('Erro ao confirmar pagamento: ' + (e as Error).message),
  });

  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto !animate-none">
        <DialogHeader>
          <DialogTitle>{person?.full_name || 'Colaborador'}</DialogTitle>
          <DialogDescription>
            Lançamentos do colaborador
            {person ? ` — total a pagar ${formatCurrency(person.a_pagar_cents)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Não foi possível carregar os lançamentos"
            description="Tente novamente em instantes."
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title="Nenhum lançamento"
            description="Este colaborador ainda não possui despesas registradas."
          />
        ) : (
          <div className="space-y-2">
            {data.map((expense) => (
              <div
                key={expense.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-sans font-medium text-sm truncate">
                      {expense.description}
                    </p>
                    {expense.is_out_of_policy && (
                      <span className={`${STAMP} status-out-of-policy`}>
                        <AlertTriangle className="h-3 w-3" />
                        Exc · Revisar
                      </span>
                    )}
                    {expense.is_event && (
                      <span
                        className={`${STAMP} border border-[hsl(var(--status-event)/0.4)] text-[hsl(var(--status-event))]`}
                      >
                        <CalendarRange className="h-3 w-3" />
                        Evento
                      </span>
                    )}
                  </div>
                  <p className="o2-num mt-0.5 text-[11px] text-muted-foreground">
                    {formatIsoDate(expense.date)}
                    {expense.category?.name ? ` • ${expense.category.name}` : ''}
                  </p>
                  <div className="mt-1.5">
                    <StatusBadge status={expense.status} />
                  </div>
                </div>
                <p className="o2-num shrink-0 font-semibold text-sm">
                  {formatCurrency(expense.amount_cents, expense.currency)}
                </p>
              </div>
            ))}
          </div>
        )}

        {payable.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {payable.length} lançamento(s) aguardando pagamento
            </p>
            <Button
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar pagamento ({formatCurrency(payableTotal)})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function Gestao() {
  const { data, isLoading, isError } = useAdminOverview();
  const [selectedPerson, setSelectedPerson] = useState<PersonRow | null>(null);

  const people = useMemo(
    () =>
      [...(data?.por_pessoa ?? [])].sort(
        (a, b) => b.a_pagar_cents - a.a_pagar_cents,
      ),
    [data],
  );

  const sectors = useMemo(
    () =>
      [...(data?.por_setor ?? [])].sort(
        (a, b) => b.total_cents - a.total_cents,
      ),
    [data],
  );

  // Estado de acesso restrito (RPC bloqueia não-admins).
  if (isError) {
    return (
      <AppShell>
        <PageHeader
          title="Gestão"
          description="Painel financeiro da organização"
        />
        <EmptyState
          icon={<ShieldOff className="h-6 w-6" />}
          title="Acesso restrito aos administradores."
          description="Você não tem permissão para visualizar o painel de gestão financeira."
        />
      </AppShell>
    );
  }

  const org = data?.org;
  const cycle = data?.cycle;
  const realizadoCents =
    (org?.food_realized_cents ?? 0) + (org?.transport_realized_cents ?? 0);

  const kpis = [
    {
      label: 'Orçamento alimentação',
      value: org?.food_budget_cents ?? 0,
      icon: Wallet,
      hint: cycle ? `${cycle.business_days} dias úteis` : undefined,
    },
    {
      label: 'Realizado',
      value: realizadoCents,
      icon: TrendingUp,
      hint: 'Alimentação + transporte',
    },
    {
      label: 'Total a pagar',
      value: org?.total_a_pagar_cents ?? 0,
      icon: Banknote,
      hint: 'No ciclo atual',
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Gestão"
        description="Painel administrativo da organização"
      />

      <Tabs defaultValue="financeiro" className="w-full">
        <TabsList className="mb-4 md:mb-6">
          <TabsTrigger value="financeiro" className="font-mono text-[11px] uppercase tracking-wider">
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="font-mono text-[11px] uppercase tracking-wider">
            Usuários
          </TabsTrigger>
          <TabsTrigger value="categorias" className="font-mono text-[11px] uppercase tracking-wider">
            Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="mt-0">
      {/* Ciclo atual */}
      <div className="mb-4 md:mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarRange className="h-4 w-4 shrink-0" />
        {isLoading || !cycle ? (
          <Skeleton className="h-4 w-56" />
        ) : (
          <span>
            Ciclo{' '}
            <span className="o2-num font-medium text-foreground">{cycle.cycle_key}</span>
            {' · '}
            <span className="o2-num">
              {formatIsoDate(cycle.start)} – {formatIsoDate(cycle.end)}
            </span>
            {' · '}
            <span className="o2-num">{cycle.business_days}</span> dias úteis
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="o2-eyebrow">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="o2-display tabular-nums text-2xl sm:text-3xl text-foreground">
                  {formatCurrency(kpi.value)}
                </div>
              )}
              {kpi.hint && (
                <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Colaboradores (contagem, não moeda) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="o2-eyebrow">Colaboradores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="o2-display tabular-nums text-2xl sm:text-3xl text-foreground">
                {org?.colaboradores ?? 0}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Ativos no ciclo</p>
          </CardContent>
        </Card>
      </div>

      {/* Por pessoa */}
      <Card className="mt-6 md:mt-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Por pessoa</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Realizado e projeção por colaborador — clique para ver os lançamentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : people.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Nenhum colaborador no ciclo"
              description="Ainda não há dados de gastos para este período."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-wider">
                    Colaborador
                  </TableHead>
                  <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">
                    Alimentação (real. / proj.)
                  </TableHead>
                  <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">
                    Transporte (real. / proj.)
                  </TableHead>
                  <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">
                    Total a pagar
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow
                    key={person.user_id}
                    className="cursor-pointer transition-colors duration-150"
                    onClick={() => setSelectedPerson(person)}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-sans font-medium">{person.full_name}</span>
                        {(person.recusados > 0 || person.excecoes > 0) && (
                          <div className="flex flex-wrap gap-1">
                            {person.recusados > 0 && (
                              <span className={`${STAMP} status-out-of-policy`}>
                                <XCircle className="h-3 w-3" />
                                <span className="o2-num">{person.recusados}</span> recusado
                                {person.recusados > 1 ? 's' : ''}
                              </span>
                            )}
                            {person.excecoes > 0 && (
                              <span className={`${STAMP} status-out-of-policy`}>
                                <AlertTriangle className="h-3 w-3" />
                                <span className="o2-num">{person.excecoes}</span> exceç
                                {person.excecoes > 1 ? 'ões' : 'ão'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right o2-num">
                      <span className="font-medium">
                        {formatCurrency(person.food_realized_cents)}
                      </span>
                      <span className="text-muted-foreground">
                        {' / '}
                        {formatCurrency(person.food_projected_cents)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right o2-num">
                      <span className="font-medium">
                        {formatCurrency(person.transport_realized_cents)}
                      </span>
                      <span className="text-muted-foreground">
                        {' / '}
                        {formatCurrency(person.transport_projected_cents)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold o2-num">
                      {formatCurrency(person.a_pagar_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Por setor */}
      <Card className="mt-6 md:mt-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Por setor</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Distribuição dos gastos realizados por setor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sectors.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="Sem dados por setor"
              description="Nenhum gasto atribuído a setores neste ciclo."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Alimentação</TableHead>
                  <TableHead className="text-right">Transporte</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectors.map((sector) => (
                  <TableRow key={sector.sector}>
                    <TableCell className="font-medium">{sector.sector}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(sector.food_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(sector.transport_cents)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(sector.total_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drill-down */}
      <PersonExpensesDialog
        person={selectedPerson}
        onClose={() => setSelectedPerson(null)}
      />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-0">
          <GestaoUsuarios />
        </TabsContent>

        <TabsContent value="categorias" className="mt-0">
          <GestaoCategorias />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
