/**
 * Sprint 7 — DEC-011: card discreto pedindo permissão de push notifications.
 *
 * Comportamento:
 *   - Aparece DEPOIS de 30s de uso (anti-banner-fadiga). Marca em localStorage
 *     pra reaparecer só se o usuário não decidiu (default) e não dispensou.
 *   - Esconde se Notification.permission ∈ {granted, denied} ou já dispensado
 *     ou navegador não suporta push ou VITE_VAPID_PUBLIC_KEY ausente.
 *   - Botão "Ativar" chama subscribe() e some no sucesso (granted).
 *   - Botão "Mais tarde" persiste DISMISS_KEY com timestamp.
 *
 * Uso recomendado: montar em /app/dashboard. Não montar em forms (evita
 * quebrar fluxo de captura de despesa).
 */
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const SHOWN_KEY = 'oxyve.pushPromptShownAt';
const DISMISS_KEY = 'oxyve.pushPromptDismissedAt';
const DISMISS_DAYS = 14;
const DELAY_MS = 30_000;

function isRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_DAYS;
  } catch {
    return false;
  }
}

export function PushPermissionPrompt() {
  const { supported, permission, subscribed, loading, hasVapidKey, subscribe } =
    usePushNotifications();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!supported || !hasVapidKey) return;
    if (permission !== 'default') return;
    if (subscribed) return;
    if (isRecentlyDismissed()) return;

    // Marca primeiro view-time se ainda não houve.
    let firstShownAt: number;
    try {
      const raw = localStorage.getItem(SHOWN_KEY);
      firstShownAt = raw ? Number(raw) : Date.now();
      if (!raw) localStorage.setItem(SHOWN_KEY, String(firstShownAt));
    } catch {
      firstShownAt = Date.now();
    }

    const elapsed = Date.now() - firstShownAt;
    const remaining = Math.max(0, DELAY_MS - elapsed);

    const timer = setTimeout(() => setVisible(true), remaining);
    return () => clearTimeout(timer);
  }, [supported, hasVapidKey, permission, subscribed]);

  // Some imediatamente quando permissão muda pra granted/denied.
  useEffect(() => {
    if (permission === 'granted' || permission === 'denied') {
      setVisible(false);
    }
  }, [permission]);

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) setVisible(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Ativar notificações"
      data-testid="push-permission-prompt"
      className="rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">
            Receba notificações de aprovação no celular
          </p>
          <p className="text-xs text-muted-foreground">
            Avisamos quando seu relatório for aprovado, recusado ou pago — sem precisar abrir o app.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={loading}
              data-testid="push-enable-btn"
            >
              {loading ? 'Ativando…' : 'Ativar'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              data-testid="push-dismiss-btn"
            >
              Mais tarde
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
