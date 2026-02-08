import { supabase } from '@/integrations/supabase/client';

export async function bootstrapUser(): Promise<{
  status: 'existing' | 'invited' | 'domain_match' | 'new_org';
  org_id?: string;
  profile?: any;
}> {
  const { data, error } = await supabase.rpc('bootstrap_user');
  
  if (error) {
    throw error;
  }
  
  return data as {
    status: 'existing' | 'invited' | 'domain_match' | 'new_org';
    org_id?: string;
    profile?: any;
  };
}
