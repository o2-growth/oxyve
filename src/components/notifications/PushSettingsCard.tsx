/**
 * C5 — liga/desliga as notificações push deste aparelho em Configurações >
 * Perfil. O PushPermissionPrompt só aparece com permissão 'default', então
 * sem este card quem dispensou o aviso ou quer parar de receber não tinha como.
 */
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushSettingsCard() {
  const { supported, permission, subscribed, loading, hasVapidKey, subscribe, unsubscribe } =
    usePushNotifications();

  const blocked = permission === 'denied';
  const disabled = !supported || !hasVapidKey || blocked || loading;

  let hint = 'Avisamos quando um relatório for aprovado, recusado ou pago. Vale só para este aparelho.';
  if (!supported) {
    hint = 'Este navegador não suporta notificações push. No iPhone, instale o app na tela inicial.';
  } else if (!hasVapidKey) {
    hint = 'As notificações push ainda não estão configuradas no Oxy VE.';
  } else if (blocked) {
    hint =
      'Você bloqueou as notificações neste navegador. Libere nas permissões do site e volte aqui para ativar.';
  }

  const handleChange = async (checked: boolean) => {
    if (checked) {
      const ok = await subscribe();
      if (ok) toast.success('Notificações ativadas neste aparelho.');
      else toast.error('Não foi possível ativar as notificações. Tente de novo.');
    } else {
      const ok = await unsubscribe();
      if (ok) toast.success('Notificações desativadas neste aparelho.');
      else toast.error('Não foi possível desativar as notificações. Tente de novo.');
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações
        </CardTitle>
        <CardDescription>Receba avisos no celular sem precisar abrir o app.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="push-switch">Notificações no celular</Label>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </div>
          <Switch
            id="push-switch"
            checked={subscribed && !blocked}
            disabled={disabled}
            onCheckedChange={(checked) => void handleChange(checked)}
            data-testid="push-settings-switch"
          />
        </div>
      </CardContent>
    </Card>
  );
}
