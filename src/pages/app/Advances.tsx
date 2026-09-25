import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

export default function Advances() {
  return (
    <AppShell>
      <PageHeader
        title="Adiantamentos"
        description="Solicite e acompanhe adiantamentos de viagem"
      />

      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Wallet className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Em breve</h3>
          <p className="max-w-md text-muted-foreground">
            A funcionalidade de adiantamentos está em desenvolvimento. Em breve
            você poderá solicitar adiantamentos para viagens e despesas
            corporativas.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
