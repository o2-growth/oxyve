import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Integração com o Conta Azul (aba da Gestão, só admin).
 *
 * Configuração e lista de envios vêm de RPCs (contaazul_*) que nunca devolvem
 * token. As opções do de-para (categorias, centros de custo, contas
 * financeiras) vêm do próprio Conta Azul pela edge contaazul-sync (action=listar).
 */

export type CaStatus = 'pendente' | 'enviando' | 'enviado' | 'erro' | 'pago_sync';

export interface ContaAzulConfig {
  conectado: boolean;
  precisa_reconectar: boolean;
  ativo: boolean;
  empresa_nome: string | null;
  connected_at: string | null;
  conta_financeira_id: string | null;
  conta_financeira_nome: string | null;
  dia_vencimento: number;
  last_sync_at: string | null;
  last_poll_at: string | null;
  last_error: string | null;
}

export interface CaOpcao {
  id: string;
  nome: string;
  extra?: string | null;
}

export interface ContaAzulOpcoes {
  categorias: CaOpcao[];
  centros_custo: CaOpcao[];
  contas_financeiras: CaOpcao[];
}

export interface CategoryMapRow {
  expense_category_id: string | null;
  kind: string | null;
  ca_categoria_id: string;
  ca_categoria_nome: string | null;
}

export interface SectorMapRow {
  sector: string;
  ca_centro_custo_id: string;
  ca_centro_custo_nome: string | null;
}

export interface ContaAzulReportRow {
  id: string;
  title: string;
  status: string;
  user_id: string;
  full_name: string | null;
  ca_status: CaStatus | null;
  ca_error: string | null;
  ca_sent_at: string | null;
  ca_attempts: number;
  ca_vencimento: string | null;
  tem_conta: boolean;
  total_cents: number;
}

const KEY = ['contaazul'] as const;

/** Mensagem do corpo { error } que as edges devolvem; invoke esconde em error.context. */
export async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> }
    | undefined;
  try {
    const body = (await (ctx?.clone ? ctx.clone().json() : ctx?.json?.())) as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
  } catch {
    // Sem JSON: fica o texto padrão.
  }
  return fallback;
}

export function useContaAzulConfig() {
  return useQuery({
    queryKey: [...KEY, 'config'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contaazul_get_config');
      if (error) throw error;
      return data as unknown as ContaAzulConfig;
    },
  });
}

export function useContaAzulOpcoes(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'opcoes'],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('contaazul-sync', { body: { action: 'listar' } });
      if (error) throw new Error(await invokeErrorMessage(error, 'Não foi possível ler as opções do Conta Azul.'));
      return data as ContaAzulOpcoes;
    },
  });
}

export function useContaAzulMaps() {
  return useQuery({
    queryKey: [...KEY, 'maps'],
    queryFn: async () => {
      const [cat, set] = await Promise.all([
        supabase.from('contaazul_category_map').select('expense_category_id, kind, ca_categoria_id, ca_categoria_nome'),
        supabase.from('contaazul_sector_map').select('sector, ca_centro_custo_id, ca_centro_custo_nome'),
      ]);
      if (cat.error) throw cat.error;
      if (set.error) throw set.error;
      return {
        categorias: (cat.data ?? []) as CategoryMapRow[],
        setores: (set.data ?? []) as SectorMapRow[],
      };
    },
  });
}

export function useContaAzulReports() {
  return useQuery({
    queryKey: [...KEY, 'reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contaazul_list_reports', { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as unknown as ContaAzulReportRow[];
    },
  });
}

export function useContaAzulActions() {
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: KEY });

  const conectar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('contaazul-oauth?action=start', { method: 'GET' });
      if (error) throw new Error(await invokeErrorMessage(error, 'Não foi possível iniciar a conexão.'));
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('Não foi possível iniciar a conexão.');
      return url;
    },
    // Abre o login do Conta Azul em outra aba. O retorno cadastrado no app pode
    // ser um site de terceiro que não carrega: aí o admin cola o endereço na tela.
    onSuccess: (url) => {
      if (!window.open(url, '_blank', 'noopener')) window.location.assign(url);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const concluirColando = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.functions.invoke('contaazul-oauth', { body: { action: 'colar', url } });
      if (error) throw new Error(await invokeErrorMessage(error, 'Não foi possível concluir a conexão.'));
    },
    onSuccess: () => {
      toast.success('Conta Azul conectado.');
      invalidar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const desconectar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('contaazul-oauth', { body: { action: 'desconectar' } });
      if (error) throw new Error(await invokeErrorMessage(error, 'Não foi possível desconectar.'));
    },
    onSuccess: () => {
      invalidar();
      toast.success('Conta Azul desconectado.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const salvarConfig = useMutation({
    mutationFn: async (v: { conta_financeira_id: string | null; conta_financeira_nome: string | null; dia_vencimento: number; ativo: boolean }) => {
      const { error } = await supabase.rpc('contaazul_save_config', {
        p_conta_financeira_id: v.conta_financeira_id ?? '',
        p_conta_financeira_nome: v.conta_financeira_nome ?? '',
        p_dia_vencimento: v.dia_vencimento,
        p_ativo: v.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Configuração do Conta Azul salva.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const salvarCategoria = useMutation({
    mutationFn: async (v: { expense_category_id: string | null; kind: string | null; ca: CaOpcao | null }) => {
      const { error } = await supabase.rpc('contaazul_set_category_map', {
        p_expense_category_id: v.expense_category_id as string,
        p_kind: v.kind as string,
        p_ca_categoria_id: v.ca?.id ?? '',
        p_ca_categoria_nome: v.ca?.nome ?? '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'maps'] });
      toast.success('Correspondência de categoria salva.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const salvarSetor = useMutation({
    mutationFn: async (v: { sector: string; ca: CaOpcao | null }) => {
      const { error } = await supabase.rpc('contaazul_set_sector_map', {
        p_sector: v.sector,
        p_ca_centro_custo_id: v.ca?.id ?? '',
        p_ca_centro_custo_nome: v.ca?.nome ?? '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'maps'] });
      toast.success('Correspondência de setor salva.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reenviar = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.rpc('contaazul_reenviar', { p_report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'reports'] });
      toast.success('Relatório na fila de envio. Sai no próximo ciclo (até 5 min).');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('contaazul-sync', { body: { action: 'sincronizar' } });
      if (error) throw new Error(await invokeErrorMessage(error, 'Não foi possível sincronizar agora.'));
      return data as { erro?: string | null; resumo?: { enviados: number; baixas: number; pagos: number; erros: number } | null };
    },
    onSuccess: (r) => {
      invalidar();
      if (r?.erro) toast.error(r.erro);
      else if (r?.resumo) {
        const { enviados, baixas, pagos, erros } = r.resumo;
        toast.success(`Sincronizado: ${enviados} enviado(s), ${baixas} baixa(s), ${pagos} pago(s)${erros ? `, ${erros} com erro` : ''}.`);
      } else toast.success('Sincronizado.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return { conectar, concluirColando, desconectar, salvarConfig, salvarCategoria, salvarSetor, reenviar, sincronizar };
}
