/**
 * Sprint 3 — Aria-11: observabilidade frontend via Sentry.
 *
 * Política:
 *   - VITE_SENTRY_DSN ausente → no-op total. Não polui dev nem teste.
 *   - tracesSampleRate 0.1 (10% das transações) — barato e suficiente.
 *   - replaysSessionSampleRate 0 em prod por privacidade. Replays só
 *     em sessões com erro (errorSample 1.0).
 *   - Browser tracing + Replay habilitados quando DSN existir.
 *
 * Uso:
 *   - `initSentry()` em main.tsx antes do createRoot.
 *   - `<SentryErrorBoundary>` envolvendo as rotas (extensão do
 *     ErrorBoundary atual em src/components/ErrorBoundary.tsx).
 */

import * as Sentry from '@sentry/react';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No-op silencioso. Logamos só em dev pra deixar claro.
    if (import.meta.env.DEV) {
      console.info('[sentry] VITE_SENTRY_DSN não configurado — telemetria desabilitada.');
    }
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
  initialized = true;
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;

/** Helper pra reportar erro manualmente — no-op se DSN ausente. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
