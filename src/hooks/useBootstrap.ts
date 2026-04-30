import { supabase } from '@/integrations/supabase/client';

export interface BootstrapResult {
  status: 'existing' | 'invited';
  org_id?: string;
  role?: 'employee' | 'manager' | 'admin';
  profile?: unknown;
}

/**
 * Bootstrap do usuário pós-signup. Sprint 0: invite token é OBRIGATÓRIO.
 * Erros possíveis (vindos do RAISE EXCEPTION da function SQL):
 *   - 'invite_required'
 *   - 'email_not_confirmed'
 *   - 'not_authenticated'
 */
export async function bootstrapUser(inviteToken: string | null): Promise<BootstrapResult> {
  const { data, error } = await supabase.rpc('bootstrap_user', {
    p_invite_token: inviteToken,
  });

  if (error) {
    throw error;
  }

  return data as unknown as BootstrapResult;
}
