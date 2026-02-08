import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExpensePolicy, useUpdateExpensePolicy } from '@/hooks/usePolicy';
import { CostCentersList } from '@/components/settings/CostCentersList';
import { ProjectsList } from '@/components/settings/ProjectsList';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Shield, ArrowLeft, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CURRENCIES = [
  { value: 'BRL', label: 'Real (BRL)' },
  { value: 'USD', label: 'Dólar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

const DEBOUNCE_DELAY = 600;

export default function SettingsPolicy() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: policy, isLoading, dataUpdatedAt } = useExpensePolicy();
  const updatePolicy = useUpdateExpensePolicy();
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<Date | null>(null);

  // Track if we just saved (for showing "Salvo" indicator)
  const justSaved = updatePolicy.isSuccess && !updatePolicy.isPending;

  // Update last saved time when mutation succeeds
  useEffect(() => {
    if (updatePolicy.isSuccess) {
      lastSavedRef.current = new Date();
    }
  }, [updatePolicy.isSuccess]);

  const handleAutoSave = useCallback(
    (field: string, value: any) => {
      if (!policy?.id) return;

      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new debounce
      debounceRef.current = setTimeout(() => {
        updatePolicy.mutate({
          id: policy.id,
          [field]: value,
        });
      }, DEBOUNCE_DELAY);
    },
    [policy?.id, updatePolicy]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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
            <TabsList>
              <TabsTrigger value="policy">Política Geral</TabsTrigger>
              <TabsTrigger value="cost-centers">Centros de Custo</TabsTrigger>
              <TabsTrigger value="projects">Projetos</TabsTrigger>
            </TabsList>

            <TabsContent value="policy" className="mt-6">
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
                      value={policy?.default_currency || 'BRL'}
                      onValueChange={(value) => handleAutoSave('default_currency', value)}
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
                        <Label>Centro de custo obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir seleção de centro de custo ao criar despesas
                        </p>
                      </div>
                      <Switch
                        checked={policy?.require_cost_center ?? false}
                        onCheckedChange={(checked) =>
                          handleAutoSave('require_cost_center', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Projeto obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir seleção de projeto ao criar despesas
                        </p>
                      </div>
                      <Switch
                        checked={policy?.require_project ?? false}
                        onCheckedChange={(checked) =>
                          handleAutoSave('require_project', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Comprovante obrigatório</Label>
                        <p className="text-sm text-muted-foreground">
                          Exigir upload de comprovante ao criar despesas
                        </p>
                      </div>
                      <Switch
                        checked={policy?.require_receipt ?? false}
                        onCheckedChange={(checked) =>
                          handleAutoSave('require_receipt', checked)
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
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
