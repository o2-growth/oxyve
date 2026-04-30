/**
 * Sprint 7 — DEC-011: Push notifications.
 *
 * Hook que gerencia o ciclo de vida da push subscription do navegador:
 *   - permission: estado atual da Notification API
 *   - subscribed: se há subscription registrada no SW
 *   - subscribe(): pede permissão + assina via PushManager + persiste no Supabase
 *   - unsubscribe(): cancela subscription local e deleta do banco
 *
 * Sem VITE_VAPID_PUBLIC_KEY definido em env, o hook é no-op (subscribed=false
 * permanente, subscribe() lança erro). Mesmo padrão graceful de send-email
 * sem RESEND_API_KEY: a feature simplesmente não ativa, mas o app não quebra.
 *
 * SSR-safe: todos os acessos a window/Notification/serviceWorker passam por
 * checagem de typeof. jsdom dos testes não tem PushManager, então os testes
 * mockam window.Notification + navigator.serviceWorker.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const SESSION_CACHE_KEY = 'oxyve.pushSubscribed';

/**
 * Lazy getter — facilita testes (vi.stubEnv aplicado depois do load).
 */
function getVapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
}

function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * Converte uma chave VAPID base64-url pra Uint8Array (formato exigido
 * pelo PushManager.subscribe).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function bufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface UsePushNotificationsResult {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
  loading: boolean;
  hasVapidKey: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { user } = useAuth();
  const supported = isSupported();
  const vapidKey = getVapidPublicKey();
  const hasVapidKey = vapidKey.length > 0;

  const initialPermission: PushPermission = !supported
    ? 'unsupported'
    : (Notification.permission as PushPermission);

  const [permission, setPermission] = useState<PushPermission>(initialPermission);
  const [subscribed, setSubscribed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(SESSION_CACHE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);

  // Sync inicial: descobre se já há subscription ativa no SW (ex.: usuário
  // havia ativado em sessão anterior). Roda só uma vez.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        const isSubbed = !!sub;
        setSubscribed(isSubbed);
        try {
          window.sessionStorage.setItem(SESSION_CACHE_KEY, isSubbed ? '1' : '0');
        } catch {
          /* noop */
        }
      } catch (err) {
        // SW pode demorar a registrar; falhar silencioso.
        console.warn('[push] sync inicial falhou', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    if (!hasVapidKey) {
      console.warn('[push] VITE_VAPID_PUBLIC_KEY não configurada — subscribe no-op');
      return false;
    }
    if (!user?.id) return false;

    setLoading(true);
    try {
      // 1) Pedir permissão.
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== 'granted') {
        return false;
      }

      // 2) Pegar registration do SW.
      const reg = await navigator.serviceWorker.ready;

      // 3) Subscribe (ou reusa existente).
      let pushSub = await reg.pushManager.getSubscription();
      if (!pushSub) {
        pushSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // 4) Persistir no Supabase. Cast pra unknown porque types.ts ainda
      //    não conhece a tabela (mesmo padrão de useNotifications).
      const json = pushSub.toJSON();
      const p256dh = json.keys?.p256dh ?? bufferToBase64Url(pushSub.getKey?.('p256dh') ?? null);
      const auth = json.keys?.auth ?? bufferToBase64Url(pushSub.getKey?.('auth') ?? null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('push_subscriptions')
        .upsert(
          {
            user_id: user.id,
            endpoint: pushSub.endpoint,
            p256dh,
            auth,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' },
        );

      if (error) {
        console.error('[push] erro persistindo subscription', error);
        // Subscription criada localmente mas não foi pro banco — desfaz.
        try {
          await pushSub.unsubscribe();
        } catch {
          /* noop */
        }
        return false;
      }

      setSubscribed(true);
      try {
        window.sessionStorage.setItem(SESSION_CACHE_KEY, '1');
      } catch {
        /* noop */
      }
      return true;
    } catch (err) {
      console.error('[push] subscribe falhou', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, hasVapidKey, vapidKey, user?.id]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      if (!pushSub) {
        setSubscribed(false);
        return true;
      }

      const endpoint = pushSub.endpoint;
      await pushSub.unsubscribe();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      setSubscribed(false);
      try {
        window.sessionStorage.setItem(SESSION_CACHE_KEY, '0');
      } catch {
        /* noop */
      }
      return true;
    } catch (err) {
      console.error('[push] unsubscribe falhou', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    loading,
    hasVapidKey,
    subscribe,
    unsubscribe,
  };
}
