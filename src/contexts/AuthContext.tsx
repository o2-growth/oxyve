import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { bootstrapUser } from '@/hooks/useBootstrap';

// Sprint 1 — GAP-G021/G022: campos bancários + CPF/CNPJ adicionados ao profile.
// Os types gerados pelo Supabase ainda não incluem essas colunas (regen
// pendente — Aria-6). Mantemos opcionais para tolerar a defasagem temporária.
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

interface Profile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  currency: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account?: string | null;
  pix_key?: string | null;
  pix_key_type?: PixKeyType | null;
  cpf_cnpj?: string | null;
}

interface UserRole {
  role: 'employee' | 'manager' | 'admin';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  isLoading: boolean;
  isBootstrapping: boolean;
  isAdmin: boolean;
  isManager: boolean;
  bootstrapError: string | null;
  isRecoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, inviteToken?: string | null) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INVITE_STORAGE_KEY = 'oxyve.pendingInviteToken';

function readPendingInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearPendingInviteToken() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  // Sprint 3.2: PASSWORD_RECOVERY do Supabase. Setado quando usuário chega via
  // link de reset de senha. Faz Login.tsx mostrar form de nova senha em vez do
  // form de login normal, e impede PublicRoute de redirecionar pra dashboard.
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // Guarda contra duplicate bootstrap por usuário (B3 / Aria-1).
  const bootstrappedUserId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = no rows. Outros erros, log silencioso (B14).
        console.warn('fetchProfile error:', profileError);
      }
      if (profileData) {
        // Cast por causa de Sprint 1: novas colunas (bank_*, cpf_cnpj,
        // pix_key*) ainda não estão nos types gerados (Aria-6 pendente).
        // No runtime, select('*') já as traz quando a migration aplicar.
        setProfile(profileData as unknown as Profile);
      }

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesError) {
        console.warn('fetchProfile roles error:', rolesError);
      }
      if (rolesData) {
        setRoles(rolesData as UserRole[]);
      }
    } catch (err) {
      // Log silencioso, evita derrubar UI por erro de rede transitório.
      console.warn('fetchProfile exception:', err);
    }
  }, []);

  const runBootstrap = useCallback(
    async (userId: string) => {
      if (bootstrappedUserId.current === userId) {
        return;
      }
      bootstrappedUserId.current = userId;
      setIsBootstrapping(true);
      setBootstrapError(null);
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (!existingProfile) {
          const inviteToken = readPendingInviteToken();
          await bootstrapUser(inviteToken);
          // Sucesso → invite consumido; limpar.
          clearPendingInviteToken();
        }

        await fetchProfile(userId);
      } catch (error) {
        // Resetar guard para permitir retry.
        bootstrappedUserId.current = null;
        const message = error instanceof Error ? error.message : 'Erro ao inicializar conta.';
        // Mensagens amigáveis para erros conhecidos do RPC bootstrap_user.
        let friendly = message;
        if (message.includes('invite_required')) {
          friendly = 'Convite necessário ou expirado. Solicite um novo convite ao seu administrador.';
        } else if (message.includes('email_not_confirmed')) {
          friendly = 'Confirme seu email antes de continuar.';
        } else if (message.includes('not_authenticated')) {
          friendly = 'Sessão expirada. Faça login novamente.';
        }
        console.error('Bootstrap error:', error);
        setBootstrapError(friendly);
      } finally {
        setIsBootstrapping(false);
      }
    },
    [fetchProfile]
  );

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  const retryBootstrap = useCallback(async () => {
    // Para retry "limpo": deslogar e voltar à tela de login.
    setBootstrapError(null);
    bootstrappedUserId.current = null;
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    // Confiar APENAS em onAuthStateChange — o evento INITIAL_SESSION cobre
    // sessões existentes (B2/B3/Aria-1).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      // Sprint 3.2: detectar fluxo de reset de senha. Quando user clica no link
      // do email, Supabase JS popula a sessão e dispara PASSWORD_RECOVERY.
      // Marcamos o flag pra UI renderizar form de nova senha em vez de redirecionar.
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }

      if (nextSession?.user) {
        // Defer (setTimeout 0) evita reentrância dentro do handler do auth.
        setTimeout(() => {
          void runBootstrap(nextSession.user.id);
        }, 0);
      } else {
        bootstrappedUserId.current = null;
        setProfile(null);
        setRoles([]);
        setBootstrapError(null);
        setIsRecoveryMode(false);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [runBootstrap]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    inviteToken?: string | null,
  ) => {
    // Persistir token em sessionStorage para o bootstrap consumir após o
    // INITIAL_SESSION/SIGNED_IN dispatch.
    if (inviteToken) {
      try {
        window.sessionStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
      } catch {
        /* noop */
      }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        },
      },
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/dashboard` },
    });
    return { error };
  };

  const signOut = async () => {
    bootstrappedUserId.current = null;
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setBootstrapError(null);
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      // Reset do flag de recovery — login.tsx já vai redirecionar via PublicRoute.
      setIsRecoveryMode(false);
    }
    return { error };
  };

  const isAdmin = roles.some((r) => r.role === 'admin');
  const isManager = roles.some((r) => r.role === 'manager' || r.role === 'admin');

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isLoading,
        isBootstrapping,
        isAdmin,
        isManager,
        bootstrapError,
        isRecoveryMode,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshProfile,
        retryBootstrap,
        requestPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
