/**
 * LoadingScreen — fallback usado pelo Suspense quando uma rota lazy ainda
 * não carregou. Mantém o mesmo visual dos outros estados de loading do app
 * (spinner centralizado, mesma classe que ProtectedRoute usa).
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div
        role="status"
        aria-label="Carregando"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  );
}

export default LoadingScreen;
