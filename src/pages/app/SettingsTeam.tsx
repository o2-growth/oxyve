import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, ArrowLeft } from 'lucide-react';
import { InvitesList } from '@/components/settings/InvitesList';

export default function SettingsTeam() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <AppShell>
        <SettingsLayout>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Acesso restrito</p>
              <p className="text-muted-foreground mb-6">
                Apenas administradores podem gerenciar a equipe.
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
