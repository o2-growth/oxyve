import { useState } from 'react';
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
import { Loader2, Save, Shield } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const CURRENCIES = [
  { value: 'BRL', label: 'Real (BRL)' },
  { value: 'USD', label: 'Dólar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

export default function SettingsPolicy() {
  const { isAdmin } = useAuth();
  const { data: policy, isLoading } = useExpensePolicy();
  const updatePolicy = useUpdateExpensePolicy();

  const [localPolicy, setLocalPolicy] = useState<{
    default_currency: string;
    require_cost_center: boolean;
    require_project: boolean;
    require_receipt: boolean;
  } | null>(null);

  // Initialize local state when policy loads
  const currentPolicy = localPolicy || policy;

  const handleChange = (field: string, value: any) => {
    setLocalPolicy((prev) => ({
      default_currency: prev?.default_currency ?? policy?.default_currency ?? 'BRL',
      require_cost_center: prev?.require_cost_center ?? policy?.require_cost_center ?? false,
      require_project: prev?.require_project ?? policy?.require_project ?? false,
      require_receipt: prev?.require_receipt ?? policy?.require_receipt ?? false,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!policy?.id || !localPolicy) return;
    await updatePolicy.mutateAsync({ id: policy.id, ...localPolicy });
    setLocalPolicy(null);
  };

  const hasChanges = localPolicy !== null;

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
              <p className="text-muted-foreground">
                Apenas administradores podem gerenciar a política de despesas.
              </p>
            </CardContent>
          </Card>
        </SettingsLayout>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Política de Despesa da minha Empresa</h1>
            <p className="text-muted-foreground">
              Configure as regras de despesas da sua organização
            </p>
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
                      value={currentPolicy?.default_currency || 'BRL'}
                      onValueChange={(value) => handleChange('default_currency', value)}
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
                        checked={currentPolicy?.require_cost_center ?? false}
                        onCheckedChange={(checked) =>
                          handleChange('require_cost_center', checked)
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
                        checked={currentPolicy?.require_project ?? false}
                        onCheckedChange={(checked) =>
                          handleChange('require_project', checked)
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
                        checked={currentPolicy?.require_receipt ?? false}
                        onCheckedChange={(checked) =>
                          handleChange('require_receipt', checked)
                        }
                      />
                    </div>
                  </div>

                  {hasChanges && (
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleSave}
                        disabled={updatePolicy.isPending}
                        className="gap-2"
                      >
                        {updatePolicy.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar alterações
                      </Button>
                    </div>
                  )}
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
