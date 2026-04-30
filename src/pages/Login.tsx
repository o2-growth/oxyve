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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Info } from 'lucide-react';
import { toast } from 'sonner';

// O2 Logo Component
function O2Logo({ size = 'md', inverted = false }: { size?: 'sm' | 'md' | 'lg'; inverted?: boolean }) {
  const sizes = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
  };

  return (
    <div
      className={`flex ${sizes[size]} shrink-0 items-center justify-center rounded-full border-2 ${
        inverted ? 'border-white bg-transparent' : 'border-primary bg-background'
      }`}
    >
      <span className={`font-bold ${inverted ? 'text-white' : 'text-primary'}`}>O2</span>
    </div>
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
  const { signIn, signUp, requestPasswordReset, isRecoveryMode, updatePassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const inviteToken = searchParams.get('invite');
  const hasInvite = !!inviteToken;

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
    if (!inviteToken) {
      toast.error('Você precisa de um convite válido para criar uma conta.');
      return;
    }

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
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mb-4 flex items-center justify-center gap-2">
              <O2Logo />
              <span className="text-2xl font-bold text-foreground">Oxy VE</span>
            </div>
            <CardTitle className="text-2xl">Definir nova senha</CardTitle>
            <CardDescription>
              Escolha uma senha nova para sua conta
            </CardDescription>
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
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mb-4 flex items-center justify-center gap-2">
              <O2Logo />
              <span className="text-2xl font-bold text-foreground">Oxy VE</span>
            </div>
            <CardTitle className="text-2xl">Recuperar senha</CardTitle>
            <CardDescription>
              Informe seu email para receber o link de recuperação
            </CardDescription>
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
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
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
    <div className="flex min-h-screen">
      {/* Left side - Branding (Graphite background) */}
      <div className="hidden w-1/2 flex-col justify-between bg-brand-graphite p-12 lg:flex">
        <div className="flex items-center gap-3">
          <O2Logo inverted />
          <span className="text-2xl font-bold text-white">Oxy VE</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Gerencie suas despesas<br />de forma simples e eficiente
          </h1>
          <p className="text-lg text-white/70">
            Lançe despesas, organize relatórios e acompanhe aprovações em um só lugar.
          </p>
        </div>

        <p className="text-sm text-white/50">© 2024 Oxy VE. Todos os direitos reservados.</p>
      </div>

      {/* Right side - Form */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <Card className="w-full max-w-md border-0 shadow-none lg:shadow-lg lg:border">
          <CardHeader className="space-y-1 text-center lg:text-left">
            <div className="mb-4 flex items-center justify-center gap-2 lg:hidden">
              <O2Logo />
              <span className="text-2xl font-bold">Oxy VE</span>
            </div>
            <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
            <CardDescription>
              {hasInvite
                ? 'Você foi convidado! Crie sua conta para continuar.'
                : 'Entre na sua conta'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasInvite ? (
              <Tabs defaultValue="signup" className="w-full">
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
                  />
                </TabsContent>

                <TabsContent value="signup">
                  <SignupFormBlock
                    form={signupForm}
                    onSubmit={handleSignup}
                    isLoading={isLoading}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Você precisa de um convite. Solicite ao seu administrador.
                  </AlertDescription>
                </Alert>
                <LoginFormBlock
                  form={loginForm}
                  onSubmit={handleLogin}
                  isLoading={isLoading}
                  onForgot={() => setShowForgotPassword(true)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface LoginBlockProps {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
  isLoading: boolean;
  onForgot: () => void;
}

function LoginFormBlock({ form, onSubmit, isLoading, onForgot }: LoginBlockProps) {
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
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

interface SignupBlockProps {
  form: ReturnType<typeof useForm<SignupFormValues>>;
  onSubmit: (values: SignupFormValues) => void | Promise<void>;
  isLoading: boolean;
}

function SignupFormBlock({ form, onSubmit, isLoading }: SignupBlockProps) {
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
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar conta
      </Button>
    </form>
  );
}
