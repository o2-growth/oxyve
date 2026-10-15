import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/constants';
import { possibleDuplicateWarning } from '@/lib/possibleDuplicate';
import { decisionErrorMessage } from '@/lib/businessError';

export interface CurrentReport {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  due_date: string;
  cycle_key: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  submitted_at?: string;
  submitted_late?: boolean;
  created_at: string;
}

export interface DashboardContext {
  current_report: CurrentReport;
  pending_due_report: (CurrentReport & { days_overdue: number }) | null;
  days_until_due: number;
  today: string;
}

export interface CreateExpenseInReportResult {
  expense: {
    id: string;
    description: string;
    amount_cents: number;
    reimbursable_cents: number | null;
    date: string;
    is_out_of_policy: boolean;
    possible_duplicate_of?: string | null;
  };
  /** null quando `late`: o ciclo já foi enviado e a despesa ficou avulsa. */
  report: CurrentReport | null;
  late?: boolean;
  late_report?: CurrentReport | null;
  is_out_of_policy: boolean;
  /** Mesma data+valor+categoria de outra despesa sua: salva, mas o gestor vê o alerta. */
  possible_duplicate?: boolean;
  possible_duplicate_of?: string | null;
}

export interface CreateExpenseMultidayResult {
  count: number;
  expenses: CreateExpenseInReportResult[];
  /** Quantos dias coincidiram com outra despesa (data+valor+categoria). */
  possible_duplicates?: number;
}

export function useCurrentReport() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-report'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_or_create_current_report');
      if (error) throw error;
      return data as unknown as CurrentReport;
    },
    enabled: !!user,
  });
}

export function useDashboardContext() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-context'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_context');
      if (error) throw error;
      return data as unknown as DashboardContext;
    },
    enabled: !!user,
  });
}

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Dia de corte quando a política não tem um: o banco usa COALESCE(cycle_cutoff_day, 25)
 * em get_or_create_report_for_date e get_or_create_current_report (o default da coluna
 * também é 25). Com 24 aqui, a tela buscava o relatório de outro ciclo.
 */
export const DEFAULT_CYCLE_CUTOFF_DAY = 25;

/**
 * Limites do ciclo que contém `date` (YYYY-MM-DD), com a mesma conta de
 * get_or_create_report_for_date: começa no dia de corte, termina na véspera do corte
 * seguinte e leva o mês do vencimento no título. Só para exibir — quem cria é o banco.
 */
export function cycleForDate(date: string, cutoffDayInput?: number | null) {
  const cutoffDay = cutoffDayInput || DEFAULT_CYCLE_CUTOFF_DAY;
  const [y, m, d] = date.split('-').map(Number);
  const start = d >= cutoffDay ? new Date(y, m - 1, cutoffDay) : new Date(y, m - 2, cutoffDay);
  const due = new Date(start.getFullYear(), start.getMonth() + 1, cutoffDay);
  const end = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1);
  return {
    start_date: ymd(start),
    end_date: ymd(end),
    due_date: ymd(due),
    cycle_key: ymd(due).slice(0, 7),
    title: `Relatório ${MONTH_ABBR[due.getMonth()]} ${due.getFullYear()}`,
  };
}

/**
 * Relatório do ciclo que contém a data, só leitura. Antes chamava
 * get_or_create_report_for_date, que criava um relatório vazio a cada data escolhida
 * no formulário (e o vazio vencido virava alerta de "relatório atrasado"). A criação
 * fica com create_expense_in_current_report, ao salvar. null = ainda não existe.
 */
export function useReportForDate(date: string | null, cutoffDayInput?: number | null) {
  const cutoffDay = cutoffDayInput || DEFAULT_CYCLE_CUTOFF_DAY;
  const { user } = useAuth();

  return useQuery({
    queryKey: ['report-for-date', date, cutoffDay, user?.id],
    queryFn: async () => {
      if (!date || !user) return null;
      // Mesma busca da RPC (dono + cycle_key do ciclo pelo corte atual). Por intervalo de
      // datas, um relatório de antes de mudarem o dia de corte aparecia aqui e a despesa
      // ia para outro. Filtro por dono: gestor enxerga os relatórios da empresa pela RLS.
      const { data, error } = await supabase
        .from('reports')
        .select('id, title, start_date, end_date, due_date, cycle_key, status, submitted_at, submitted_late, created_at')
        .eq('user_id', user.id)
        .eq('cycle_key', cycleForDate(date, cutoffDay).cycle_key)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CurrentReport | null) ?? null;
    },
    enabled: !!date && !!user,
    staleTime: 30_000,
  });
}

export function useCreateExpenseInReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      description: string;
      amount_cents: number;
      date: string;
      category_id?: string | null;
      cost_center_id?: string | null;
      project_id?: string | null;
      payment_method?: string;
      currency?: string;
      is_reimbursable?: boolean;
      notes?: string | null;
      receipt_path?: string | null;
      is_event?: boolean;
      distance_km?: number | null;
      food_days?: number;
      receipt_hash?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_expense_in_current_report', {
        p_description: input.description,
        p_amount_cents: input.amount_cents,
        p_date: input.date,
        p_category_id: input.category_id || undefined,
        p_cost_center_id: input.cost_center_id || undefined,
        p_project_id: input.project_id || undefined,
        p_payment_method: input.payment_method || 'personal_card',
        p_currency: input.currency || 'BRL',
        p_is_reimbursable: input.is_reimbursable ?? true,
        p_notes: input.notes || undefined,
        p_receipt_path: input.receipt_path || undefined,
        p_is_event: input.is_event ?? false,
        p_distance_km: input.distance_km ?? undefined,
        p_food_days: input.food_days ?? 1,
        p_receipt_hash: input.receipt_hash ?? undefined,
      });
      if (error) throw error;
      return data as unknown as CreateExpenseInReportResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      // O relatório do ciclo pode ter acabado de ser criado pela RPC.
      queryClient.invalidateQueries({ queryKey: ['report-for-date'] });

      const e = data.expense;
      // Não bloqueia (decisão 3): avisa quem lança, o gestor vê o selo na revisão.
      const isDuplicate = !!data.possible_duplicate || !!e?.possible_duplicate_of;
      if (isDuplicate) toast.warning(possibleDuplicateWarning(e), { duration: 10000 });
      if (data.late) {
        toast.warning(
          `O ${data.late_report?.title ?? 'relatório deste período'} já foi enviado. A despesa ficou avulsa e o gestor vai decidir se entra neste mês ou no próximo.`,
          { duration: 8000 },
        );
      } else if (e && e.reimbursable_cents != null && e.reimbursable_cents < e.amount_cents) {
        toast.warning(
          `Despesa adicionada ao ${data.report?.title}. Pelo teto de alimentação, o reembolso será de ${formatCurrency(e.reimbursable_cents)} (nota de ${formatCurrency(e.amount_cents)}).`,
          { duration: 8000 },
        );
      } else if (data.is_out_of_policy) {
        toast.warning('Despesa registrada como exceção — vai para revisão do aprovador.');
      } else if (!isDuplicate) {
        // Diz em qual relatório entrou: pela data, a despesa pode cair num ciclo
        // diferente do que o Início está mostrando.
        toast.success(data.report?.title ? `Despesa adicionada ao ${data.report.title}.` : 'Despesa criada!');
      }
    },
    onError: (error) => {
      // Mensagens do motor de política (RAISE EXCEPTION) já são legíveis para o
      // usuário — mostra direto, sem o prefixo genérico de erro.
      // Comprovante repetido ("Este comprovante já foi lançado...") também é P0001.
      const msg = error.message || 'Não foi possível criar a despesa.';
      const isPolicyBlock = /limite|política|politica|período|periodo|relatório|relatorio|comprovante/i.test(msg);
      toast.error(isPolicyBlock ? msg : decisionErrorMessage(error, 'Erro ao criar despesa: '));
    },
  });
}

export function useCreateExpenseMultiday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      description: string;
      amount_cents_per_day: number;
      start_date: string;
      end_date: string;
      category_id?: string | null;
      cost_center_id?: string | null;
      project_id?: string | null;
      payment_method?: string;
      currency?: string;
      is_reimbursable?: boolean;
      notes?: string | null;
      is_event?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('create_expense_multiday', {
        p_description: input.description,
        p_amount_cents_per_day: input.amount_cents_per_day,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_category_id: input.category_id || undefined,
        p_cost_center_id: input.cost_center_id || undefined,
        p_project_id: input.project_id || undefined,
        p_payment_method: input.payment_method || 'personal_card',
        p_currency: input.currency || 'BRL',
        p_is_reimbursable: input.is_reimbursable ?? true,
        p_notes: input.notes || undefined,
        p_is_event: input.is_event ?? false,
      });
      if (error) throw error;
      return data as unknown as CreateExpenseMultidayResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-counts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      queryClient.invalidateQueries({ queryKey: ['report-for-date'] });
      const dups =
        data.possible_duplicates ??
        (data.expenses ?? []).filter((x) => x?.possible_duplicate || x?.expense?.possible_duplicate_of).length;
      if (dups > 0) {
        toast.warning(
          `${data.count} despesa(s) criada(s) — uma por dia. ${dups === 1 ? '1 dia já tinha' : `${dups} dias já tinham`} despesa com mesma data, valor e categoria: foram salvas e o gestor verá o alerta de possível duplicidade.`,
          { duration: 10000 },
        );
      } else {
        toast.success(`${data.count} despesa(s) criada(s) — uma por dia.`);
      }
    },
    onError: (error) => {
      const msg = error.message || 'Não foi possível criar as despesas.';
      const isPolicyBlock = /limite|política|politica|período|periodo|data/i.test(msg);
      toast.error(isPolicyBlock ? msg : decisionErrorMessage(error, 'Erro ao criar despesas: '));
    },
  });
}

export function useSubmitReportRpc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.rpc('submit_report', {
        p_report_id: reportId,
      });
      if (error) throw error;
      return data as unknown as { report: CurrentReport; submitted_late: boolean };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['current-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-context'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      
      if (data.submitted_late) {
        toast.warning('Relatório enviado com atraso');
      } else {
        toast.success('Relatório enviado para aprovação!');
      }
    },
    onError: (error) => {
      toast.error('Erro ao enviar relatório: ' + error.message);
    },
  });
}

// B15: useSubmitReport (manual) removido. Use `useSubmitReportRpc` (acima).
// A versão manual divergia do RPC `submit_report` que aplica regras de
// late-submission e atualiza status do expenses dentro do banco.