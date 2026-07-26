import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { bootstrapUser } from '@/hooks/useBootstrap';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { O2Rings } from '@/components/brand/O2Rings';

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

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

const signupSchema = z
  .object({
    fullName: z.string().min(2, 'Informe seu nome completo'),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem',
  });

const forgotSchema = z.object({
  email: z.string().email('Email inválido'),
});

// Sprint 3.2 — form de definir nova senha após PASSWORD_RECOVERY.
const recoverySchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem',
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;
type ForgotFormValues = z.infer<typeof forgotSchema>;
type RecoveryFormValues = z.infer<typeof recoverySchema>;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithGoogle, requestPasswordReset, isRecoveryMode, updatePassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const inviteToken = searchParams.get('invite');
  const hasInvite = !!inviteToken;
  // Estado agregado de "trabalhando" — faz os anéis O2 acelerarem no submit
  // (eles são o loader cerimonial da marca; nunca um spinner genérico).
  const busy = isLoading || isGoogleLoading;

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const forgotForm = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const recoveryForm = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const handleRecovery = async (values: RecoveryFormValues) => {
    setIsLoading(true);
    const { error } = await updatePassword(values.password);
    setIsLoading(false);
    if (error) {
      toast.error('Erro ao definir nova senha: ' + error.message);
      return;
    }
    toast.success('Senha alterada com sucesso!');
    navigate('/app/dashboard');
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error('Erro ao entrar com Google: ' + error.message);
      setIsGoogleLoading(false);
      return;
    }
    // Em caso de sucesso o navegador é redirecionado ao Google/OAuth; não
    // resetamos o loading para manter o botão desabilitado durante o redirect.
  };

  const handleLogin = async (values: LoginFormValues) => {
    setIsLoading(true);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      toast.error('Erro ao entrar: ' + error.message);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    navigate('/app/dashboard');
  };

  const handleSignup = async (values: SignupFormValues) => {
    // Auto-join por domínio: qualquer @o2inc pode criar conta — o trigger
    // handle_new_user cria o profile na org. Convite deixou de ser obrigatório.
    setIsLoading(true);

    const { error: signUpError } = await signUp(
      values.email,
      values.password,
      values.fullName,
      inviteToken,
    );

    // Se conta já existe, tentar signIn + bootstrap.
    if (signUpError) {
      const message = signUpError.message || '';
      const alreadyRegistered =
        message.toLowerCase().includes('already') ||
        message.toLowerCase().includes('registered');

      if (!alreadyRegistered) {
        toast.error('Erro ao cadastrar: ' + message);
        setIsLoading(false);
        return;
      }

      const { error: signInError } = await signIn(values.email, values.password);
      if (signInError) {
        toast.error('Conta já existe, mas a senha está incorreta. ' + signInError.message);
        setIsLoading(false);
        return;
      }

      try {
        await bootstrapUser(inviteToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao consumir convite.';
        toast.error(msg);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      navigate('/app/dashboard');
      return;
    }

    // Após signUp, tentar signIn (Supabase pode auto-loggar se email confirm desabilitado).
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { error: signInError } = await signIn(values.email, values.password);
      if (signInError) {
        toast.error(
          'Conta criada. Verifique seu email para confirmar antes de entrar.',
        );
        setIsLoading(false);
        return;
      }
    }

    // bootstrap_user será chamado pelo AuthContext após o evento SIGNED_IN
    // (token foi persistido em sessionStorage pelo signUp).
    setIsLoading(false);
    navigate('/app/dashboard');
  };

  const handleForgotPassword = async (values: ForgotFormValues) => {
    setIsLoading(true);
    const { error } = await requestPasswordReset(values.email);
    if (error) {
      toast.error('Erro ao enviar email: ' + error.message);
    } else {
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
      setShowForgotPassword(false);
    }
    setIsLoading(false);
  };

  // Sprint 3.2 — fluxo de redefinição de senha após o usuário clicar no link
  // do email de recovery. AuthContext setou isRecoveryMode true ao receber o
  // evento PASSWORD_RECOVERY do Supabase JS.
  if (isRecoveryMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
        <Card className="w-full max-w-md o2-rise border border-border/60 bg-card shadow-2xl">
          <CardHeader className="items-center space-y-3 text-center">
            <O2Rings size={72} breathing spinning fast={busy} />
            <div className="space-y-1">
              <p className="o2-eyebrow">O2 INC · REEMBOLSO</p>
              <CardTitle className="text-2xl">Definir nova senha</CardTitle>
              <CardDescription>Escolha uma senha nova para sua conta</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={recoveryForm.handleSubmit(handleRecovery)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-password">Nova senha</Label>
                <Input
                  id="recovery-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...recoveryForm.register('password')}
                />
                {recoveryForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {recoveryForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-confirm">Confirmar nova senha</Label>
                <Input
                  id="recovery-confirm"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...recoveryForm.register('confirmPassword')}
                />
                {recoveryForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {recoveryForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                Salvar nova senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
        <Card className="w-full max-w-md o2-rise border border-border/60 bg-card shadow-2xl">
          <CardHeader className="items-center space-y-3 text-center">
            <O2Rings size={72} breathing spinning fast={busy} />
            <div className="space-y-1">
              <p className="o2-eyebrow">O2 INC · REEMBOLSO</p>
              <CardTitle className="text-2xl">Recuperar senha</CardTitle>
              <CardDescription>Informe seu email para receber o link de recuperação</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  {...forgotForm.register('email')}
                />
                {forgotForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {forgotForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                <Mail className="h-4 w-4" />
                Enviar link de recuperação
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowForgotPassword(false)}
              >
                Voltar ao login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ===== Palco da marca — herói (desktop) ===== */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border/50 p-12 lg:flex">
        {/* Lockup O2 no topo */}
        <img
          src="/brand/o2-logo-white.png"
          alt="O2 Inc."
          className="relative z-10 h-6 w-auto opacity-90"
        />

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
            <p className="o2-eyebrow">{hasInvite ? 'Criar conta' : 'Acessar conta'}</p>
            <CardTitle className="text-2xl">Bem-vindo</CardTitle>
            <CardDescription>
              {hasInvite
                ? 'Você foi convidado! Crie sua conta para continuar.'
                : 'Entre na sua conta'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={hasInvite ? 'signup' : 'login'} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup" data-testid="signup-tab">
                    Cadastrar
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <LoginFormBlock
                    form={loginForm}
                    onSubmit={handleLogin}
                    isLoading={isLoading}
                    onForgot={() => setShowForgotPassword(true)}
                    onGoogle={handleGoogleSignIn}
                    isGoogleLoading={isGoogleLoading}
                  />
                </TabsContent>

                <TabsContent value="signup">
                  <SignupFormBlock
                    form={signupForm}
                    onSubmit={handleSignup}
                    isLoading={isLoading}
                    onGoogle={handleGoogleSignIn}
                    isGoogleLoading={isGoogleLoading}
                  />
                </TabsContent>
              </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Separador "ou" + botão de login com Google, reutilizado nas abas de login e
// cadastro. bg-card casa com o fundo do Card (ver components/ui/card.tsx).
function GoogleAuthSection({
  label,
  onGoogle,
  isGoogleLoading,
  isLoading,
}: {
  label: string;
  onGoogle: () => void;
  isGoogleLoading: boolean;
  isLoading: boolean;
}) {
  return (
    <>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">ou</span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={onGoogle}
        disabled={isLoading || isGoogleLoading}
      >
        {isGoogleLoading ? (
          <O2Rings size={16} spinning fast />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        {label}
      </Button>
    </>
  );
}

interface LoginBlockProps {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
  isLoading: boolean;
  onForgot: () => void;
  onGoogle: () => void;
  isGoogleLoading: boolean;
}

function LoginFormBlock({ form, onSubmit, isLoading, onForgot, onGoogle, isGoogleLoading }: LoginBlockProps) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" placeholder="seu@email.com" {...form.register('email')} />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Senha</Label>
          <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">
            Esqueceu a senha?
          </button>
        </div>
        <Input
          id="login-password"
          type="password"
          placeholder="••••••••"
          {...form.register('password')}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        Entrar
      </Button>
      <GoogleAuthSection
        label="Entrar com Google"
        onGoogle={onGoogle}
        isGoogleLoading={isGoogleLoading}
        isLoading={isLoading}
      />
    </form>
  );
}

interface SignupBlockProps {
  form: ReturnType<typeof useForm<SignupFormValues>>;
  onSubmit: (values: SignupFormValues) => void | Promise<void>;
  isLoading: boolean;
  onGoogle: () => void;
  isGoogleLoading: boolean;
}

function SignupFormBlock({ form, onSubmit, isLoading, onGoogle, isGoogleLoading }: SignupBlockProps) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Nome completo</Label>
        <Input id="signup-name" type="text" placeholder="Seu nome" {...form.register('fullName')} />
        {form.formState.errors.fullName && (
          <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="seu@email.com"
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Senha</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          {...form.register('password')}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirmar senha</Label>
        <Input
          id="signup-confirm"
          type="password"
          placeholder="••••••••"
          {...form.register('confirmPassword')}
        />
        {form.formState.errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {form.formState.errors.confirmPassword.message}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        Criar conta
      </Button>
      <GoogleAuthSection
        label="Cadastrar com Google"
        onGoogle={onGoogle}
        isGoogleLoading={isGoogleLoading}
        isLoading={isLoading}
      />
    </form>
  );
}
