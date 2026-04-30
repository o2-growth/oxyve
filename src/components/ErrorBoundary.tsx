import { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '@/lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary global (Aria-5).
 *
 * Captura erros de render em qualquer rota / componente filho e mostra
 * uma mensagem amigável com botão "Recarregar". Posicionado dentro do
 * BrowserRouter mas fora do AuthProvider para também capturar falhas no
 * próprio provider.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Sprint 3: log local + envio pro Sentry (no-op se DSN ausente).
    console.error('[ErrorBoundary]', error, errorInfo);
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const message = this.state.error?.message || 'Erro inesperado.';

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-8">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-destructive/50 bg-background p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-destructive">
            Algo deu errado
          </h2>
          <p className="text-sm text-muted-foreground">
            Tivemos um problema ao carregar esta tela. Tente recarregar a página.
            Se o erro persistir, entre em contato com o suporte.
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Detalhes técnicos</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2">
              {message}
            </pre>
          </details>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
