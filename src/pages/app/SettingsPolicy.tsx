import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useExpensePolicy, useUpdateExpensePolicy, type ExpensePolicy } from '@/hooks/usePolicy';
import { CostCentersList } from '@/components/settings/CostCentersList';
import { ProjectsList } from '@/components/settings/ProjectsList';
import { DepartmentsList } from '@/components/settings/DepartmentsList';
import { ExpenseTypesList } from '@/components/settings/ExpenseTypesList';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Shield, ArrowLeft, Check, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const CURRENCIES = [
  { value: 'BRL', label: 'Real (BRL)' },
  { value: 'USD', label: 'Dólar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

const CUTOFF_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

// Switch: agrupa cliques repetidos no mesmo campo. Select e teto salvam na hora.
const SWITCH_DEBOUNCE_MS = 400;

// Padrão do banco desde 20260725130000 (a coluna e a regra vigente usam 25).
const DEFAULT_CUTOFF_DAY = 25;
const DEFAULT_FOOD_LIMIT_CENTS = 3000;

type PolicyField =
  | 'cycle_cutoff_day'
  | 'food_daily_limit_cents'
  | 'default_currency'
  | 'require_cost_center'
  | 'require_project'
  | 'require_receipt';
type PolicyPatch = Partial<Pick<ExpensePolicy, PolicyField>>;

/** Converte o texto do input (R$) em centavos; null se vazio ou inválido. */
function parseFoodLimitCents(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isFinite(cents) ? cents : null;
}

export default function SettingsPolicy() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: policy, isLoading, dataUpdatedAt } = useExpensePolicy();
  const updatePolicy = useUpdateExpensePolicy();

  // Valores escolhidos que ainda não voltaram do servidor: a tela mostra o que
  // o admin escolheu na hora, sem o switch "voltar" esperando a rede.
  const [draft, setDraft] = useState<PolicyPatch>({});
  // Debounce por campo: mudar um campo nunca cancela o save de outro.
  const timersRef = useRef(new Map<PolicyField, ReturnType<typeof setTimeout>>());
  const pendingRef = useRef<PolicyPatch>({});
  const policyIdRef = useRef<string | undefined>(policy?.id);
  policyIdRef.current = policy?.id;
  const mutateRef = useRef(updatePolicy.mutate);
  mutateRef.current = updatePolicy.mutate;
  const lastSavedRef = useRef<Date | null>(null);

  // Track if we just saved (for showing "Salvo" indicator)
  const justSaved = updatePolicy.isSuccess && !updatePolicy.isPending;

  // Update last saved time when mutation succeeds
  useEffect(() => {
    if (updatePolicy.isSuccess) {
      lastSavedRef.current = new Date();
    }
  }, [updatePolicy.isSuccess]);

  const sendField = useCallback((field: PolicyField) => {
    timersRef.current.delete(field);
    if (!(field in pendingRef.current)) return;
    const value = pendingRef.current[field];
    delete pendingRef.current[field];
    const id = policyIdRef.current;
    if (!id) return;

    // Ao terminar (ok ou erro), a tela volta a seguir o cache da query, que o
    // hook já atualizou de forma otimista (ou desfez no erro).
    const clearDraft = () =>
      setDraft((d) => {
        if (field in pendingRef.current || d[field] !== value) return d;
        const next = { ...d };
        delete next[field];
        return next;
      });
    mutateRef.current({ id, [field]: value }, { onSettled: clearDraft });
  }, []);

  const saveField = useCallback(
    <K extends PolicyField>(field: K, value: ExpensePolicy[K], delayMs = 0) => {
      if (!policy?.id) return;
      setDraft((d) => ({ ...d, [field]: value }));
      pendingRef.current = { ...pendingRef.current, [field]: value };

      const timer = timersRef.current.get(field);
      if (timer) clearTimeout(timer);
      if (delayMs <= 0) {
        sendField(field);
      } else {
        timersRef.current.set(field, setTimeout(() => sendField(field), delayMs));
      }
    },
    [policy?.id, sendField]
  );

  // Ao sair da página, envia o que estava pendente em vez de descartar.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const [field, timer] of Array.from(timers.entries())) {
        clearTimeout(timer);
        sendField(field);
      }
    };
  }, [sendField]);

  const view = { ...policy, ...draft };
  const cutoffDay = view.cycle_cutoff_day ?? DEFAULT_CUTOFF_DAY;
  const foodLimitCents = view.food_daily_limit_cents ?? DEFAULT_FOOD_LIMIT_CENTS;

  if (isLoading) {
    return (
      <AppShell>
        <SettingsLayout>
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        </SettingsLayout>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <SettingsLayout>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Acesso restrito</p>
              <p className="text-muted-foreground mb-6">
                Apenas administradores podem gerenciar a política de despesas.
              </p>
              <Button variant="outline" onClick={() => navigate('/app/settings/profile')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </CardContent>
          </Card>
        </SettingsLayout>
      </AppShell>
    );
  }

  const lastUpdate = policy?.updated_at ? new Date(policy.updated_at) : null;

  return (
    <AppShell>
      <SettingsLayout>
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Política de Despesa da minha Empresa</h1>
              <p className="text-muted-foreground">
                Configure as regras de despesas da sua organização
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {updatePolicy.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : justSaved ? (
                <>
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-primary">Salvo</span>
                </>
              ) : lastUpdate ? (
                <span>
                  Última atualização: {format(lastUpdate, "HH:mm", { locale: ptBR })}
                </span>
              ) : null}
            </div>
          </div>

          <Tabs defaultValue="policy" className="w-full">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="policy">Política Geral</TabsTrigger>
              <TabsTrigger value="departments">Departamentos</TabsTrigger>
              <TabsTrigger value="expense-types">Tipos de Despesa</TabsTrigger>
              <TabsTrigger value="cost-centers">Centros de Custo</TabsTrigger>
              <TabsTrigger value="projects">Projetos</TabsTrigger>
            </TabsList>

            <TabsContent value="policy" className="mt-6 space-y-6">
              {/* Cycle Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>Ciclo de Reembolso</CardTitle>
                  <CardDescription>
                    Configure o período mensal de fechamento dos relatórios
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {(() => {
                        const c = cutoffDay;
                        const fim = c === 1 ? 'último dia do mês' : `dia ${c - 1}`;
                        return `O ciclo começa no dia ${c} de um mês e termina no ${fim} do mês seguinte. O relatório do ciclo vence no dia ${c}, quando o próximo começa.`;
                      })()}
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cutoff-day">Dia de corte mensal</Label>
                      <Select
                        value={String(cutoffDay)}
                        onValueChange={(value) => saveField('cycle_cutoff_day', parseInt(value, 10))}
                      >
                        <SelectTrigger id="cutoff-day" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CUTOFF_DAYS.map((day) => (
                            <SelectItem key={day} value={String(day)}>
                              Dia {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Dia em que um ciclo começa e o relatório do anterior vence
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="food-limit">Teto de alimentação por dia (R$)</Label>
                      <Input
                        id="food-limit"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        className="h-11 w-32"
                        defaultValue={(foodLimitCents / 100).toFixed(2)}
                        key={foodLimitCents}
                        onBlur={(e) => {
                          const cents = parseFoodLimitCents(e.target.value);
                          // Vazio ou 0 seria salvo como 0, que o banco trata
                          // como "sem limite": toda refeição reembolsada cheia.
                          if (cents === null || cents <= 0) {
                            toast.error('Informe um teto de alimentação maior que zero.');
                            e.target.value = (foodLimitCents / 100).toFixed(2);
                            return;
                          }
                          if (cents !== foodLimitCents) {
                            saveField('food_daily_limit_cents', cents);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Nunca bloqueia o lançamento: o reembolso de cada refeição fica limitado a este
                        valor por dia; nota de vários dias vale dias × teto; o mês vai até dias úteis ×
                        teto. Evento e viagem ficam fora do teto.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* General Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Configurações Gerais</CardTitle>
                  <CardDescription>
                    Defina os requisitos obrigatórios para lançamento de despesas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="currency">Moeda padrão</Label>
                    <Select
                      value={view.default_currency || 'BRL'}
                      onValueChange={(value) => saveField('default_currency', value)}
                    >
                      <SelectTrigger id="currency" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium">Campos obrigatórios</h4>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="require-cost-center">Centro de custo obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir seleção de centro de custo ao criar despesas
                        </p>
                      </div>
                      <Switch
                        id="require-cost-center"
                        checked={view.require_cost_center ?? false}
                        onCheckedChange={(checked) =>
                          saveField('require_cost_center', checked, SWITCH_DEBOUNCE_MS)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="require-project">Projeto obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir seleção de projeto ao criar despesas
                        </p>
                      </div>
                      <Switch
                        id="require-project"
                        checked={view.require_project ?? false}
                        onCheckedChange={(checked) =>
                          saveField('require_project', checked, SWITCH_DEBOUNCE_MS)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="require-receipt">Comprovante obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir upload de comprovante ao criar despesas
                        </p>
                      </div>
                      <Switch
                        id="require-receipt"
                        checked={view.require_receipt ?? false}
                        onCheckedChange={(checked) =>
                          saveField('require_receipt', checked, SWITCH_DEBOUNCE_MS)
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="departments" className="mt-6">
              <DepartmentsList />
            </TabsContent>

            <TabsContent value="expense-types" className="mt-6">
              <ExpenseTypesList />
            </TabsContent>

            <TabsContent value="cost-centers" className="mt-6">
              <CostCentersList />
            </TabsContent>

            <TabsContent value="projects" className="mt-6">
              <ProjectsList />
            </TabsContent>
          </Tabs>
        </div>
      </SettingsLayout>
    </AppShell>
  );
}
