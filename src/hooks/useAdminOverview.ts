import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Painel Admin de Gestão Financeira.
 *
 * Consome a RPC `get_admin_financial_overview` (sem args). Todos os valores
 * monetários vêm em CENTAVOS — usar `formatCurrency` (@/lib/constants) para
 * exibir. O backend bloqueia não-admins: a RPC retorna erro, tratado na UI
 * como "Acesso restrito aos administradores".
 */

export interface AdminCycle {
  cycle_key: string;
  start: string;
  end: string;
  business_days: number;
}

export interface AdminOrg {
  colaboradores: number;
  food_daily_limit_cents: number;
  food_budget_cents: number;
  food_realized_cents: number;
  transport_realized_cents: number;
  total_a_pagar_cents: number;
}

export interface PersonRow {
  user_id: string;
  full_name: string;
  food_realized_cents: number;
  transport_realized_cents: number;
  a_pagar_cents: number;
  recusados: number;
  excecoes: number;
  transport_projected_cents: number;
  food_projected_cents: number;
}

export interface SectorRow {
  sector: string;
  total_cents: number;
  food_cents: number;
  transport_cents: number;
}

export interface AdminOverview {
  cycle: AdminCycle;
  org: AdminOrg;
  por_pessoa: PersonRow[];
  por_setor: SectorRow[];
}

export function useAdminOverview() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      // A RPC ainda não está nos types gerados do Supabase (regen pendente).
      // Cast do nome via `as never` mantém o restante da chamada type-safe.
      const { data, error } = await supabase.rpc(
        'get_admin_financial_overview' as never,
      );
      if (error) throw error;
      return data as unknown as AdminOverview;
    },
    enabled: !!user,
    // Erro de permissão (não-admin) não deve ser repetido.
    retry: false,
  });
}
