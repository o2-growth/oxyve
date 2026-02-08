import { AppShell } from '@/components/layout/AppShell';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Shield } from 'lucide-react';
import { InvitesList } from '@/components/settings/InvitesList';

export default function SettingsTeam() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <AppShell>
        <SettingsLayout>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Acesso restrito</p>
              <p className="text-muted-foreground">
                Apenas administradores podem gerenciar a equipe.
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
            <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
            <p className="text-muted-foreground">
              Convide novos membros para sua organização
            </p>
          </div>

          <InvitesList />
        </div>
      </SettingsLayout>
    </AppShell>
  );
}
