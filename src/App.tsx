import { lazy, Suspense, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingScreen } from "@/components/LoadingScreen";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";

// Aria-3: bundle splitting via React.lazy.
// Cada página vira chunk próprio; o Suspense fallback abaixo cobre o gap
// entre o clique e a chegada do JS da rota.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Expenses = lazy(() => import("./pages/app/Expenses"));
const Reports = lazy(() => import("./pages/app/Reports"));
const ReportDetail = lazy(() => import("./pages/app/ReportDetail"));
const SettingsProfile = lazy(() => import("./pages/app/SettingsProfile"));
const SettingsPassword = lazy(() => import("./pages/app/SettingsPassword"));
const SettingsPolicy = lazy(() => import("./pages/app/SettingsPolicy"));
const SettingsTeam = lazy(() => import("./pages/app/SettingsTeam"));
const Advances = lazy(() => import("./pages/app/Advances"));
const Support = lazy(() => import("./pages/app/Support"));
const NotFound = lazy(() => import("./pages/NotFound"));

function BootstrapErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-8">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-destructive/50 bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-destructive">
          Não foi possível inicializar sua conta
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isBootstrapping, bootstrapError, retryBootstrap } = useAuth();

  if (isLoading || isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (bootstrapError) {
    return (
      <BootstrapErrorBanner
        message={bootstrapError}
        onRetry={() => {
          void retryBootstrap();
        }}
      />
    );
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isRecoveryMode } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Sprint 3.2: durante PASSWORD_RECOVERY, manter usuário em /login pra
  // mostrar form de nova senha em vez de redirecionar pra dashboard.
  if (user && !isRecoveryMode) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/app/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/app/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/app/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />
      <Route path="/app/settings/profile" element={<ProtectedRoute><SettingsProfile /></ProtectedRoute>} />
      <Route path="/app/settings/password" element={<ProtectedRoute><SettingsPassword /></ProtectedRoute>} />
      <Route path="/app/settings/policy" element={<ProtectedRoute><SettingsPolicy /></ProtectedRoute>} />
      <Route path="/app/settings/team" element={<ProtectedRoute><SettingsTeam /></ProtectedRoute>} />
      <Route path="/app/advances" element={<ProtectedRoute><Advances /></ProtectedRoute>} />
      <Route path="/app/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  // Aria-7 / B21: instanciar QueryClient dentro do componente para evitar
  // que múltiplas instâncias (HMR, testes) compartilhem cache global.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <UpdatePrompt />
          <BrowserRouter>
            {/* Sprint 3: ErrorBoundary já reporta ao Sentry via captureException
                no componentDidCatch (DEC-006). Sentry.ErrorBoundary fica disponível
                via @/lib/sentry para casos pontuais que queiram fallback custom. */}
            <ErrorBoundary>
              <Suspense fallback={<LoadingScreen />}>
                <AuthProvider>
                  <AppRoutes />
                </AuthProvider>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
