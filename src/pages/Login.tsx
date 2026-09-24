import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { O2Rings } from '@/components/brand/O2Rings';
import { O2Logo } from '@/components/brand/O2Logo';

// Google "G" icon (lucide-react não tem ícone do Google) — SVG inline com as
// 4 cores oficiais da marca.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l3.99-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.1C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

// Quando o Auth recusa o login (o hook hook_restringe_dominio barra e-mail fora
// da O2), o Supabase volta para o redirectTo com o motivo na URL — na query ou
// no fragmento, conforme o fluxo. Lê dos dois e limpa a URL para o aviso não
// reaparecer num refresh.
function readOAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const description =
    query.get('error_description') ?? hash.get('error_description') ?? query.get('error') ?? hash.get('error');
  if (!description) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return description.replace(/\+/g, ' ');
}

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Os anéis O2 aceleram durante o redirect — são o loader cerimonial da marca.
  const busy = isGoogleLoading;

  useEffect(() => {
    setAuthError(readOAuthError());
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error('Erro ao entrar com Google: ' + error.message);
      setIsGoogleLoading(false);
    }
    // Em caso de sucesso o navegador é redirecionado ao Google; o botão fica
    // desabilitado até a página sair.
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ===== Palco da marca — herói (desktop) ===== */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border/50 p-12 lg:flex">
        {/* Lockup O2 no topo */}
        <O2Logo size={28} className="relative z-10 opacity-90" />


        {/* Herói central: anéis + título display */}
        <div className="relative z-10 flex flex-col items-start gap-9">
          <div className="relative flex items-center justify-center">
            {/* Glow radial verde-lima atrás do símbolo */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-24"
              style={{
                background:
                  'radial-gradient(circle at center, hsl(var(--primary) / 0.15), transparent 70%)',
              }}
            />
            <O2Rings size={220} breathing spinning fast={busy} className="relative" />
          </div>

          <div className="space-y-4">
            <p className="o2-eyebrow">O2 INC · REEMBOLSO</p>
            <h1 className="o2-display text-6xl leading-[0.9] text-foreground">
              Oxy VE
              <span className="mt-3 block text-2xl text-muted-foreground">
                Gestão de despesas
              </span>
            </h1>
          </div>
        </div>

        {/* Rodapé discreto */}
        <p className="o2-num relative z-10 text-xs text-muted-foreground">
          © 2026 O2 Inc · Oxy VE
        </p>
      </div>

      {/* ===== Card de login ===== */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-8 lg:w-1/2">
        {/* Herói compacto no mobile (anéis no topo) */}
        <div className="mb-8 flex flex-col items-center gap-4 text-center lg:hidden">
          <div className="relative flex items-center justify-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-10"
              style={{
                background:
                  'radial-gradient(circle at center, hsl(var(--primary) / 0.15), transparent 70%)',
              }}
            />
            <O2Rings size={80} breathing spinning fast={busy} className="relative" />
          </div>
          <div className="space-y-1">
            <p className="o2-eyebrow">O2 INC · REEMBOLSO</p>
            <h1 className="o2-display text-3xl text-foreground">Oxy VE</h1>
          </div>
        </div>

        <Card className="w-full max-w-md o2-rise border border-border/60 bg-card shadow-2xl">
          <CardHeader className="space-y-1">
            <p className="o2-eyebrow">Acessar conta</p>
            <CardTitle className="text-2xl">Bem-vindo</CardTitle>
            <CardDescription>Entre com sua conta Google da O2 Inc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authError && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {authError}
              </p>
            )}
            <Button
              type="button"
              className="w-full gap-2"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? <O2Rings size={16} spinning fast /> : <GoogleIcon className="h-4 w-4" />}
              Entrar com Google
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Acesso restrito a e-mails @o2inc.com.br.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
