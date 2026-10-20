/**
 * Aba Conta Azul da Gestão: conexão, configuração, de-para e reenvio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Tela com três cards e várias consultas: o padrão de 5 s estoura em máquina carregada.
vi.setConfig({ testTimeout: 20_000 });

let config: Record<string, unknown>;
let reports: unknown[];
let catMap: unknown[];
let setorMap: unknown[];

const rpc = vi.fn(async (fn: string, _args?: unknown) => {
  if (fn === 'contaazul_get_config') return { data: config, error: null };
  if (fn === 'contaazul_list_reports') return { data: reports, error: null };
  return { data: null, error: null };
});
const invoke = vi.fn(async (name: string, _opts?: unknown) => {
  if (name === 'contaazul-sync') {
    return {
      data: {
        categorias: [
          { id: 'ca-ref', nome: 'Refeições', extra: 'Despesas com pessoal' },
          { id: 'ca-transp', nome: 'Deslocamento' },
        ],
        centros_custo: [{ id: 'cc-com', nome: 'Comercial', extra: '01' }],
        contas_financeiras: [
          { id: 'cf-itau', nome: 'Itaú PJ', extra: 'CONTA_CORRENTE' },
          { id: 'cf-inter', nome: 'Inter' },
        ],
      },
      error: null,
    };
  }
  if (name === 'contaazul-oauth?action=start') return { data: { url: 'https://login.contaazul.com/#/oauth/authorize?x=1' }, error: null };
  return { data: { ok: true }, error: null };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    functions: { invoke: (name: string, opts?: unknown) => invoke(name, opts) },
    from: (table: string) => ({
      select: () => Promise.resolve({ data: table === 'contaazul_category_map' ? catMap : setorMap, error: null }),
    }),
  },
}));
vi.mock('@/hooks/useExpenseTypes', () => ({
  useExpenseTypes: () => ({
    isLoading: false,
    data: [
      { id: 'cat-almoco', name: 'Almoço', kind: 'food', sector: 'Comercial', is_active: true },
      { id: 'cat-uber', name: 'Uber', kind: 'transport', sector: null, is_active: true },
    ],
  }),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

import { GestaoContaAzul } from '@/components/gestao/GestaoContaAzul';

function renderTela() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GestaoContaAzul />
    </QueryClientProvider>,
  );
}

const conectado = (over: Record<string, unknown> = {}) => ({
  conectado: true,
  precisa_reconectar: false,
  ativo: true,
  empresa_nome: 'O2 Inc',
  connected_at: '2026-10-20T12:00:00Z',
  conta_financeira_id: 'cf-itau',
  conta_financeira_nome: 'Itaú PJ',
  dia_vencimento: 25,
  last_sync_at: null,
  last_poll_at: null,
  last_error: null,
  ...over,
});

describe('GestaoContaAzul', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    rpc.mockClear();
    invoke.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    config = conectado();
    reports = [];
    catMap = [];
    setorMap = [];
  });

  it('sem conexão: botão Conectar leva ao authorize do Conta Azul e não busca listas', async () => {
    config = { ...conectado(), conectado: false, ativo: false, empresa_nome: null, conta_financeira_id: null };
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, configurable: true });
    renderTela();
    expect(await screen.findByText('Não conectado')).toBeInTheDocument();
    expect(screen.getByText('Conecte o Conta Azul para escolher as correspondências.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Conectar Conta Azul/ }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://login.contaazul.com/#/oauth/authorize?x=1'));
    expect(invoke).toHaveBeenCalledWith('contaazul-oauth?action=start', { method: 'GET' });
    expect(invoke).not.toHaveBeenCalledWith('contaazul-sync', expect.anything());
  });

  it('conexão caída pede reconexão e mostra o erro', async () => {
    config = conectado({ precisa_reconectar: true, last_error: 'O acesso foi revogado no Conta Azul. Reconecte na aba Conta Azul da Gestão.' });
    renderTela();
    expect(await screen.findByRole('button', { name: /Reconectar Conta Azul/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('O acesso foi revogado');
  });

  it('conectado: empresa, contas financeiras do Conta Azul e salvar configuração', async () => {
    renderTela();
    expect(await screen.findByText(/Conectado · O2 Inc/)).toBeInTheDocument();
    const conta = screen.getByLabelText('Conta financeira') as HTMLSelectElement;
    await vi.waitFor(() => expect(within(conta).getByRole('option', { name: 'Inter' })).toBeInTheDocument());
    expect(conta.value).toBe('cf-itau');
    fireEvent.change(conta, { target: { value: 'cf-inter' } });
    fireEvent.change(screen.getByLabelText('Dia de vencimento'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('contaazul_save_config', {
        p_conta_financeira_id: 'cf-inter',
        p_conta_financeira_nome: 'Inter',
        p_dia_vencimento: 10,
        p_ativo: true,
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Configuração do Conta Azul salva.');
  });

  it('dia de vencimento fora de 1..28 não salva', async () => {
    renderTela();
    const dia = await screen.findByLabelText('Dia de vencimento');
    fireEvent.change(dia, { target: { value: '30' } });
    expect(screen.getByRole('button', { name: 'Salvar configuração' })).toBeDisabled();
  });

  it('de-para: categoria, tipo e setor gravam pelo RPC; vazio remove', async () => {
    catMap = [{ expense_category_id: 'cat-uber', kind: null, ca_categoria_id: 'ca-velha', ca_categoria_nome: 'Táxi (antiga)' }];
    renderTela();
    const almoco = (await screen.findByLabelText('Categoria do Conta Azul para Almoço')) as HTMLSelectElement;
    await vi.waitFor(() => expect(almoco).not.toBeDisabled());
    expect(within(almoco).getByRole('option', { name: 'Refeições (Despesas com pessoal)' })).toBeInTheDocument();
    fireEvent.change(almoco, { target: { value: 'ca-ref' } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('contaazul_set_category_map', {
        p_expense_category_id: 'cat-almoco',
        p_kind: null,
        p_ca_categoria_id: 'ca-ref',
        p_ca_categoria_nome: 'Refeições',
      }),
    );

    // Valor salvo que não está mais na lista continua visível pelo nome.
    const uber = screen.getByLabelText('Categoria do Conta Azul para Uber') as HTMLSelectElement;
    expect(uber.value).toBe('ca-velha');
    expect(within(uber).getByRole('option', { name: 'Táxi (antiga)' })).toBeInTheDocument();
    fireEvent.change(uber, { target: { value: '' } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('contaazul_set_category_map', {
        p_expense_category_id: 'cat-uber',
        p_kind: null,
        p_ca_categoria_id: '',
        p_ca_categoria_nome: '',
      }),
    );

    fireEvent.change(screen.getByLabelText('Categoria do Conta Azul para Transporte (tipo)'), { target: { value: 'ca-transp' } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('contaazul_set_category_map', expect.objectContaining({ p_kind: 'transport', p_ca_categoria_id: 'ca-transp' })),
    );

    // Setores: Geral sempre, e os das categorias.
    expect(screen.getByLabelText('Centro de custo para Geral')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Centro de custo para Comercial'), { target: { value: 'cc-com' } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('contaazul_set_sector_map', {
        p_sector: 'Comercial',
        p_ca_centro_custo_id: 'cc-com',
        p_ca_centro_custo_nome: 'Comercial',
      }),
    );
  });

  it('relatórios: erro mostra a mensagem e Reenviar; enviado não tem botão; não enviado tem Enviar', async () => {
    reports = [
      { id: 'r1', title: 'Out 2026', status: 'approved', user_id: 'u1', full_name: 'Ana', ca_status: 'erro', ca_error: 'Funcionário sem CPF no perfil.', ca_sent_at: null, ca_attempts: 1, ca_vencimento: null, tem_conta: false, total_cents: 4250 },
      { id: 'r2', title: 'Out 2026', status: 'approved', user_id: 'u2', full_name: 'Bia', ca_status: 'enviado', ca_error: null, ca_sent_at: '2026-10-20T12:00:00Z', ca_attempts: 1, ca_vencimento: '2026-10-25', tem_conta: true, total_cents: 1000 },
      { id: 'r3', title: 'Set 2026', status: 'approved', user_id: 'u3', full_name: 'Caio', ca_status: null, ca_error: null, ca_sent_at: null, ca_attempts: 0, ca_vencimento: null, tem_conta: false, total_cents: 500 },
    ];
    renderTela();
    expect(await screen.findByText('Funcionário sem CPF no perfil.')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?42,50/)).toBeInTheDocument();
    expect(screen.getByText(/vence 25\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /de Bia/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar Set 2026 de Caio' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar Out 2026 de Ana' }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('contaazul_reenviar', { p_report_id: 'r1' }));
    expect(toastSuccess).toHaveBeenCalledWith('Relatório na fila de envio. Sai no próximo ciclo (até 5 min).');
  });

  it('envio desativado: Reenviar fica desabilitado', async () => {
    config = conectado({ ativo: false });
    reports = [
      { id: 'r1', title: 'Out 2026', status: 'approved', user_id: 'u1', full_name: 'Ana', ca_status: 'erro', ca_error: 'x', ca_sent_at: null, ca_attempts: 1, ca_vencimento: null, tem_conta: false, total_cents: 100 },
    ];
    renderTela();
    expect(await screen.findByRole('button', { name: 'Reenviar Out 2026 de Ana' })).toBeDisabled();
  });

  it('desconectar pede confirmação e chama a edge', async () => {
    renderTela();
    fireEvent.click(await screen.findByRole('button', { name: /Desconectar/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('contaazul-oauth', { body: { action: 'desconectar' } }));
    expect(toastSuccess).toHaveBeenCalledWith('Conta Azul desconectado.');
  });
});
