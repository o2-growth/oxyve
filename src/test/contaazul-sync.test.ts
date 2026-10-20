/**
 * Conta Azul — regras do sync (envio idempotente, pessoa, baixa, quitação) e
 * renovação do token com trava, com fetch e banco falsos.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContaAzulApi } from '../../supabase/functions/_shared/contaazul/api.ts';
import {
  conferirQuitacao,
  enviarRelatorio,
  lancarBaixa,
  sincronizarOrg,
  type ReportData,
  type SyncStore,
} from '../../supabase/functions/_shared/contaazul/sync.ts';
import { obterAccessToken, type ConexaoTokens, type TokenStore } from '../../supabase/functions/_shared/contaazul/tokens.ts';
import type { Relogio } from '../../supabase/functions/_shared/contaazul/ratelimit.ts';

/* ---------------------------------------------------------------- fetch falso */

type Resp = { status: number; body?: unknown } | 'timeout';
type Rota = (req: { query: URLSearchParams; body: unknown; headers: Record<string, string> }) => Resp;
interface Chamada { method: string; path: string; query: URLSearchParams; body: unknown; headers: Record<string, string> }

function fetchFalso(rotas: Record<string, Rota | Resp[]>) {
  const chamadas: Chamada[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown = init?.body;
    if (typeof body === 'string' && body.startsWith('{')) body = JSON.parse(body);
    chamadas.push({ method, path: url.pathname, query: url.searchParams, body, headers });
    const rota = rotas[`${method} ${url.pathname}`];
    if (!rota) throw new Error(`rota não prevista: ${method} ${url.pathname}`);
    const r = Array.isArray(rota) ? (rota.length > 1 ? rota.shift()! : rota[0]) : rota({ query: url.searchParams, body, headers });
    if (r === 'timeout') throw new DOMException('timeout', 'TimeoutError');
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fn, chamadas };
}

const relogio: Relogio = { now: () => 0, sleep: async () => {} };
const api = (f: typeof fetch) =>
  new ContaAzulApi({ fetch: f, token: async () => 'TOKEN', aguardarVez: async () => {}, relogio });

/* ---------------------------------------------------------------- banco falso */

interface Estado {
  ca_status: string | null;
  ca_error: string | null;
  ca_attempts: number;
  ca_parcela_id: string | null;
  ca_conta_id: string | null;
  ca_vencimento: string | null;
  status: string;
}

function dados(over: Partial<ReportData['report']> = {}, emp: Partial<NonNullable<ReportData['employee']>> = {}): ReportData {
  return {
    report: {
      id: 'r1', org_id: 'o1', user_id: 'u1', title: 'Out 2026', status: 'approved', end_date: '2026-10-31',
      approved_at: '2026-11-03T15:00:00Z', ca_status: 'enviando', ca_attempts: 1, ca_vencimento: null,
      ca_conta_id: null, ca_parcela_id: null, ...over,
    },
    employee: { id: 'u1', full_name: 'Bia Souza', email: 'bia@o2inc.com.br', cpf_cnpj: '12345678909', ca_pessoa_id: null, ...emp },
    expenses: [
      { id: 'e1', status: 'approved', is_reimbursable: true, reimbursable_cents: 3000, category_id: 'c1', category_name: 'Almoço', kind: 'food', sector: 'Comercial' },
      { id: 'e2', status: 'approved', is_reimbursable: true, reimbursable_cents: 1255, category_id: 'c2', category_name: 'Uber', kind: 'transport', sector: null },
      { id: 'e3', status: 'approved', is_reimbursable: false, reimbursable_cents: 9999, category_id: 'c1', category_name: 'Almoço', kind: 'food', sector: null },
    ],
    category_map: [
      { expense_category_id: 'c1', kind: null, ca_categoria_id: 'ca-alim' },
      { expense_category_id: null, kind: 'transport', ca_categoria_id: 'ca-transp' },
    ],
    sector_map: [{ sector: 'Comercial', ca_centro_custo_id: 'cc-com' }],
    config: { conta_financeira_id: 'conta-1', dia_vencimento: 25 },
  };
}

function storeFalso(d: ReportData) {
  const est: Estado = {
    ca_status: d.report.ca_status, ca_error: null, ca_attempts: d.report.ca_attempts, ca_parcela_id: d.report.ca_parcela_id,
    ca_conta_id: d.report.ca_conta_id, ca_vencimento: d.report.ca_vencimento, status: d.report.status,
  };
  const pessoas: Record<string, string> = {};
  const pagosNoOxy: string[] = [];
  let baixaReservada = false;
  const store: SyncStore = {
    reservarPendentes: async () => {
      if (est.ca_status !== 'pendente') return [];
      est.ca_status = 'enviando';
      est.ca_attempts++;
      d.report.ca_attempts = est.ca_attempts;
      return [d.report.id];
    },
    dadosRelatorio: async () => d,
    salvarPessoa: async (u, p) => { pessoas[u] = p; },
    salvarVencimento: async (_id, v) => { est.ca_vencimento = v; d.report.ca_vencimento = v; },
    marcarEnviado: async (_id, r) => {
      Object.assign(est, { ca_status: 'enviado', ca_parcela_id: r.parcelaId, ca_conta_id: r.contaId, ca_error: null });
    },
    marcarErroEnvio: async (_id, m, final) => { if (est.ca_status === 'enviando') Object.assign(est, { ca_status: final ? 'erro' : 'pendente', ca_error: m }); },
    marcarIncerto: async (_id, m) => { est.ca_error = m; },
    listarParaBaixa: async () => (est.status === 'paid' && est.ca_status === 'enviado' ? [{ id: d.report.id, ca_parcela_id: est.ca_parcela_id! }] : []),
    listarParaPolling: async () => (est.status === 'approved' && est.ca_status === 'enviado' ? [{ id: d.report.id, ca_parcela_id: est.ca_parcela_id! }] : []),
    reservarBaixa: async () => {
      if (baixaReservada) return false;
      baixaReservada = true;
      return true;
    },
    marcarPagoSync: async () => { Object.assign(est, { ca_status: 'pago_sync', ca_error: null }); },
    marcarErroPagamento: async (_id, m, final) => { est.ca_error = m; if (final) est.ca_status = 'erro'; },
    marcarConferido: async (_id, aviso) => { est.ca_error = aviso; },
    marcarPagoNoOxy: async (id) => {
      if (est.status !== 'approved') return false;
      pagosNoOxy.push(id);
      Object.assign(est, { status: 'paid', ca_status: 'pago_sync' });
      return true;
    },
  };
  return { store, est, pessoas, pagosNoOxy };
}

const contaCriada = { status: 201, body: { id: 'ev-1', condicao_pagamento: { parcelas: [{ id: 'parc-1', evento: { id: 'ev-1' } }] } } };
const semPessoa = { status: 200, body: { items: [], totalItems: 0 } };
const agora = () => new Date('2026-11-10T12:00:00Z');

describe('envio do relatório', () => {
  let d: ReportData;
  beforeEach(() => { d = dados(); });

  it('1ª tentativa: cadastra a pessoa e cria a conta direto (sem procurar antes)', async () => {
    const { store, est, pessoas } = storeFalso(d);
    const f = fetchFalso({
      'GET /v1/pessoas': [semPessoa, semPessoa],
      'POST /v1/pessoas': [{ status: 201, body: { id: 'pessoa-9' } }],
      'POST /v1/financeiro/contas-a-pagar': [contaCriada],
    });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('enviado');
    expect(est).toMatchObject({ ca_status: 'enviado', ca_parcela_id: 'parc-1', ca_conta_id: 'ev-1', ca_vencimento: '2026-11-25' });
    expect(pessoas).toEqual({ u1: 'pessoa-9' });

    const buscas = f.chamadas.filter((c) => c.path === '/v1/pessoas' && c.method === 'GET');
    expect(buscas.map((c) => [c.query.get('documentos'), c.query.get('tipo_perfil')])).toEqual([
      ['12345678909', 'Fornecedor'],
      ['12345678909', 'Cliente'],
    ]);
    expect(f.chamadas.find((c) => c.method === 'POST' && c.path === '/v1/pessoas')!.body).toMatchObject({
      tipo_pessoa: 'Física', cpf: '123.456.789-09', perfis: [{ tipo_perfil: 'Fornecedor' }],
    });
    const post = f.chamadas.find((c) => c.path === '/v1/financeiro/contas-a-pagar')!;
    expect(post.headers.Authorization).toBe('Bearer TOKEN');
    expect(post.body).toMatchObject({
      valor: 42.55,
      id_fornecedor: 'pessoa-9',
      referencia_externa: 'oxyve-report-r1',
      rateio: [
        { id_categoria: 'ca-alim', valor: 30, rateio_centro_custo: [{ id_centro_custo: 'cc-com', valor: 30 }] },
        { id_categoria: 'ca-transp', valor: 12.55 },
      ],
    });
    expect(f.chamadas.some((c) => c.method === 'GET' && c.path === '/v1/financeiro/contas-a-pagar')).toBe(false);
  });

  it('retry depois de timeout: acha a conta já criada e NÃO cria outra', async () => {
    d = dados({ ca_attempts: 2, ca_vencimento: '2026-11-25' }, { ca_pessoa_id: 'pessoa-9' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({
      'GET /v1/financeiro/contas-a-pagar': (req) =>
        req.query.get('referencias') === 'oxyve-report-r1'
          ? { status: 200, body: { itens: [{ id: 'outra', descricao: 'Reembolso Bia Souza — Out 2026', total: 99 }] } }
          : { status: 200, body: { itens: [{ id: 'parc-1', descricao: 'Reembolso Bia Souza — Out 2026', total: 42.55 }] } },
      'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { id: 'parc-1', status: 'PENDENTE', evento: { id: 'ev-1' } } }],
    });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('recuperado');
    expect(est).toMatchObject({ ca_status: 'enviado', ca_parcela_id: 'parc-1', ca_conta_id: 'ev-1' });
    expect(f.chamadas.some((c) => c.method === 'POST')).toBe(false);
    const segunda = f.chamadas.filter((c) => c.path === '/v1/financeiro/contas-a-pagar')[1];
    expect(Object.fromEntries(segunda.query)).toMatchObject({
      descricao: 'Reembolso Bia Souza — Out 2026', valor_de: '42.55', valor_ate: '42.55',
      data_vencimento_de: '2026-09-26', data_vencimento_ate: '2027-01-24',
    });
  });

  it('retry sem conta lá: procura, não acha e cria uma só', async () => {
    d = dados({ ca_attempts: 3, ca_vencimento: '2026-11-25' }, { ca_pessoa_id: 'p' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({
      'GET /v1/financeiro/contas-a-pagar': [{ status: 200, body: { itens: [] } }],
      'POST /v1/financeiro/contas-a-pagar': [contaCriada],
    });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('enviado');
    expect(f.chamadas.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(est.ca_status).toBe('enviado');
  });

  it('timeout no POST: fica "enviando" (incerto), sem repetir o POST', async () => {
    d = dados({}, { ca_pessoa_id: 'p' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({ 'POST /v1/financeiro/contas-a-pagar': ['timeout'] });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('incerto');
    expect(est.ca_status).toBe('enviando');
    expect(est.ca_error).toContain('Sem resposta do Conta Azul');
    expect(f.chamadas.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('400 do Conta Azul vira erro definitivo com a mensagem de lá', async () => {
    d = dados({}, { ca_pessoa_id: 'p' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({ 'POST /v1/financeiro/contas-a-pagar': [{ status: 400, body: { error: 'Categoria inativa' } }] });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('erro');
    expect(est).toMatchObject({ ca_status: 'erro', ca_error: 'Conta Azul recusou ao criar a conta a pagar: Categoria inativa' });
  });

  it('429 persistente volta para a fila até o limite de tentativas', async () => {
    d = dados({}, { ca_pessoa_id: 'p' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({ 'POST /v1/financeiro/contas-a-pagar': [{ status: 429 }] });
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('pendente');
    expect(est.ca_status).toBe('pendente');
    // 1 + 2 repetições do próprio cliente.
    expect(f.chamadas.filter((c) => c.method === 'POST')).toHaveLength(3);

    const d5 = dados({ ca_attempts: 5 }, { ca_pessoa_id: 'p' });
    const s5 = storeFalso(d5);
    const f5 = fetchFalso({
      'GET /v1/financeiro/contas-a-pagar': [{ status: 200, body: { itens: [] } }],
      'POST /v1/financeiro/contas-a-pagar': [{ status: 429 }],
    });
    expect(await enviarRelatorio({ api: api(f5.fn), store: s5.store, agora }, 'r1')).toBe('erro');
    expect(s5.est.ca_status).toBe('erro');
  });

  it('funcionário sem CPF: erro e nenhuma chamada ao Conta Azul', async () => {
    d = dados({}, { cpf_cnpj: null });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({});
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('erro');
    expect(est).toMatchObject({ ca_status: 'erro', ca_error: 'Funcionário sem CPF no perfil.' });
    expect(f.chamadas).toHaveLength(0);
  });

  it('categoria sem de-para: erro antes de cadastrar a pessoa', async () => {
    d = dados();
    d.category_map = [];
    const { store, est } = storeFalso(d);
    const f = fetchFalso({});
    expect(await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1')).toBe('erro');
    expect(est.ca_error).toBe('Categorias Almoço, Uber sem correspondente no Conta Azul.');
    expect(f.chamadas).toHaveLength(0);
  });

  it('pessoa já fornecedora é reaproveitada; mesmo CPF só como cliente pede ação do admin', async () => {
    const a = storeFalso(dados());
    const fa = fetchFalso({
      'GET /v1/pessoas': [{ status: 200, body: { items: [{ id: 'forn-1', documento: '123.456.789-09' }] } }],
      'POST /v1/financeiro/contas-a-pagar': [contaCriada],
    });
    expect(await enviarRelatorio({ api: api(fa.fn), store: a.store, agora }, 'r1')).toBe('enviado');
    expect(a.pessoas).toEqual({ u1: 'forn-1' });
    expect(fa.chamadas.some((c) => c.method === 'POST' && c.path === '/v1/pessoas')).toBe(false);

    const b = storeFalso(dados());
    const fb = fetchFalso({
      'GET /v1/pessoas': (req) =>
        req.query.get('tipo_perfil') === 'Cliente'
          ? { status: 200, body: { items: [{ id: 'cli-1', documento: '12345678909' }] } }
          : semPessoa,
    });
    expect(await enviarRelatorio({ api: api(fb.fn), store: b.store, agora }, 'r1')).toBe('erro');
    expect(b.est.ca_error).toContain('sem o perfil Fornecedor');
  });

  it('vencimento gravado na 1ª tentativa vale nas próximas, mesmo mudando o dia', async () => {
    d = dados({ ca_vencimento: '2026-11-25', ca_attempts: 2 }, { ca_pessoa_id: 'p' });
    d.config = { conta_financeira_id: 'conta-1', dia_vencimento: 10 };
    const { store } = storeFalso(d);
    const f = fetchFalso({
      'GET /v1/financeiro/contas-a-pagar': [{ status: 200, body: { itens: [] } }],
      'POST /v1/financeiro/contas-a-pagar': [contaCriada],
    });
    await enviarRelatorio({ api: api(f.fn), store, agora }, 'r1');
    const post = f.chamadas.find((c) => c.method === 'POST')!.body as { condicao_pagamento: { parcelas: { data_vencimento: string }[] } };
    expect(post.condicao_pagamento.parcelas[0].data_vencimento).toBe('2026-11-25');
  });
});

describe('pagamento', () => {
  it('pago no Oxy VE: lança a baixa PIX na parcela, com o valor em aberto', async () => {
    const d = dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1', status: 'paid' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({
      'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { id: 'parc-1', status: 'PENDENTE', nao_pago: 42.55 } }],
      'POST /v1/financeiro/baixas': [{ status: 200, body: { id: 'b1' } }],
    });
    expect(await lancarBaixa({ api: api(f.fn), store, agora }, { id: 'r1', ca_parcela_id: 'parc-1' }, 'conta-1')).toBe('baixado');
    expect(f.chamadas.find((c) => c.method === 'POST')!.body).toEqual({
      id_parcela: 'parc-1',
      data_pagamento: '2026-11-10',
      conta_financeira: 'conta-1',
      composicao_valor: { valor_bruto: 42.55 },
      metodo_pagamento: 'PIX_PAGAMENTO_INSTANTANEO',
      observacao: 'Reembolso pago pelo Oxy VE.',
    });
    expect(est.ca_status).toBe('pago_sync');
  });

  it('duas execuções juntas (cron + "Sincronizar agora"): só uma lança a baixa', async () => {
    const { store } = storeFalso(dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1', status: 'paid' }));
    const f = fetchFalso({
      'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { id: 'parc-1', status: 'PENDENTE', nao_pago: 42.55 } }],
      'POST /v1/financeiro/baixas': [{ status: 200, body: { id: 'b1' } }],
    });
    const rep = { id: 'r1', ca_parcela_id: 'parc-1' };
    const r = await Promise.all([
      lancarBaixa({ api: api(f.fn), store, agora }, rep, 'conta-1'),
      lancarBaixa({ api: api(f.fn), store, agora }, rep, 'conta-1'),
    ]);
    expect(r.sort()).toEqual(['baixado', 'ignorado']);
    expect(f.chamadas.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('parcela já quitada lá: não lança baixa de novo', async () => {
    const { store, est } = storeFalso(dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1', status: 'paid' }));
    const f = fetchFalso({ 'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { status: 'QUITADO' } }] });
    expect(await lancarBaixa({ api: api(f.fn), store, agora }, { id: 'r1', ca_parcela_id: 'parc-1' }, 'conta-1')).toBe('ja_quitado');
    expect(f.chamadas.some((c) => c.method === 'POST')).toBe(false);
    expect(est.ca_status).toBe('pago_sync');
  });

  it('baixa sem resposta continua "enviado" para conferir no próximo ciclo', async () => {
    const { store, est } = storeFalso(dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1', status: 'paid' }));
    const f = fetchFalso({
      'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { status: 'PENDENTE', nao_pago: 10 } }],
      'POST /v1/financeiro/baixas': ['timeout'],
    });
    expect(await lancarBaixa({ api: api(f.fn), store, agora }, { id: 'r1', ca_parcela_id: 'parc-1' }, 'conta-1')).toBe('erro');
    expect(est.ca_status).toBe('enviado');
  });

  it('quitada no Conta Azul e aprovada aqui: marca pago pelo banco', async () => {
    const { store, est, pagosNoOxy } = storeFalso(dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1' }));
    const f = fetchFalso({ 'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { status: 'QUITADO' } }] });
    expect(await conferirQuitacao({ api: api(f.fn), store, agora }, { id: 'r1', ca_parcela_id: 'parc-1' })).toBe('pago');
    expect(pagosNoOxy).toEqual(['r1']);
    expect(est).toMatchObject({ status: 'paid', ca_status: 'pago_sync' });
  });

  it('em aberto lá: só registra a conferência', async () => {
    const { store, est, pagosNoOxy } = storeFalso(dados({ ca_status: 'enviado', ca_parcela_id: 'parc-1' }));
    const f = fetchFalso({ 'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { status: 'ATRASADO' } }] });
    expect(await conferirQuitacao({ api: api(f.fn), store, agora }, { id: 'r1', ca_parcela_id: 'parc-1' })).toBe('aberto');
    expect(pagosNoOxy).toEqual([]);
    expect(est.ca_status).toBe('enviado');
  });

  it('ciclo da org: envia o pendente e só faz polling depois de 15 min', async () => {
    const d = dados({ ca_status: 'pendente', ca_attempts: 0 }, { ca_pessoa_id: 'p' });
    const { store, est } = storeFalso(d);
    const f = fetchFalso({
      'POST /v1/financeiro/contas-a-pagar': [contaCriada],
      'GET /v1/financeiro/parcelas/parc-1': [{ status: 200, body: { status: 'PENDENTE' } }],
    });
    const ctx = { api: api(f.fn), store, agora };
    const r1 = await sincronizarOrg(ctx, { id: 'o1', conta_financeira_id: 'conta-1', last_poll_at: '2026-11-10T11:50:00Z' });
    expect(r1).toMatchObject({ enviados: 1, poll: false });
    expect(est.ca_status).toBe('enviado');
    const r2 = await sincronizarOrg(ctx, { id: 'o1', conta_financeira_id: 'conta-1', last_poll_at: '2026-11-10T11:40:00Z' });
    expect(r2).toMatchObject({ enviados: 0, poll: true, conferidos: 1 });
  });
});

describe('token', () => {
  const cred = { clientId: 'id', clientSecret: 'sec', redirectUri: 'https://x' };
  function tokenStore(conn: ConexaoTokens, travaLivre = true) {
    const log: string[] = [];
    const store: TokenStore = {
      lerConexao: async () => ({ ...conn }),
      travarRenovacao: async () => { log.push('trava'); return travaLivre; },
      salvarTokens: async (_o, t) => { log.push(`salva:${t.refreshToken}`); Object.assign(conn, { access_token: t.accessToken, refresh_token: t.refreshToken, token_expires_at: t.expiresAt }); },
      soltarTrava: async () => { log.push('solta'); },
      marcarReconectar: async (_o, m) => { log.push(`reconectar:${m}`); },
    };
    return { store, log, conn };
  }
  const agoraTk = () => new Date('2026-10-20T12:00:00Z');

  it('token válido não renova', async () => {
    const { store, log } = tokenStore({ access_token: 'A', refresh_token: 'R', token_expires_at: '2026-10-20T12:50:00Z' });
    const f = fetchFalso({});
    expect(await obterAccessToken('o', { store, fetch: f.fn, credenciais: cred, relogio, agora: agoraTk })).toBe('A');
    expect(log).toEqual([]);
  });

  it('vencendo: renova com trava e guarda o refresh novo (rotação)', async () => {
    const { store, log, conn } = tokenStore({ access_token: 'A', refresh_token: 'R1', token_expires_at: '2026-10-20T12:01:00Z' });
    const f = fetchFalso({ 'POST /oauth/token': [{ status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_in: 3600 } }] });
    expect(await obterAccessToken('o', { store, fetch: f.fn, credenciais: cred, relogio, agora: agoraTk })).toBe('A2');
    expect(log).toEqual(['trava', 'salva:R2', 'solta']);
    expect(conn.refresh_token).toBe('R2');
    expect(new URLSearchParams(f.chamadas[0].body as string).get('refresh_token')).toBe('R1');
  });

  it('trava ocupada: espera e usa o token que a outra execução renovou', async () => {
    const t = tokenStore({ access_token: 'A', refresh_token: 'R1', token_expires_at: '2026-10-20T11:00:00Z' }, false);
    let leituras = 0;
    t.store.lerConexao = async () => {
      leituras++;
      return leituras >= 2
        ? { access_token: 'A-outro', refresh_token: 'R2', token_expires_at: '2026-10-20T13:00:00Z' }
        : { ...t.conn };
    };
    const f = fetchFalso({});
    expect(await obterAccessToken('o', { store: t.store, fetch: f.fn, credenciais: cred, relogio, agora: agoraTk })).toBe('A-outro');
    expect(f.chamadas).toHaveLength(0);
  });

  it('invalid_grant: marca para reconectar e não tenta de novo', async () => {
    const { store, log } = tokenStore({ access_token: null, refresh_token: 'R1', token_expires_at: null });
    const f = fetchFalso({ 'POST /oauth/token': [{ status: 400, body: { error: 'invalid_grant', error_subtype: 'invalid_refresh_token' } }] });
    await expect(obterAccessToken('o', { store, fetch: f.fn, credenciais: cred, relogio, agora: agoraTk })).rejects.toMatchObject({ reconectar: true });
    expect(log[1]).toMatch(/^reconectar:A credencial salva não vale mais/);
  });

  it('invalid_grant porque outra execução já rodou o refresh: usa o token novo, sem reconectar', async () => {
    const t = tokenStore({ access_token: null, refresh_token: 'R1', token_expires_at: null });
    let leituras = 0;
    t.store.lerConexao = async () => {
      leituras++;
      // 1ª e 2ª leitura (antes e depois da trava) veem R1; depois do 400, já está R2.
      return leituras >= 3
        ? { access_token: 'A-outro', refresh_token: 'R2', token_expires_at: '2026-10-20T13:00:00Z' }
        : { ...t.conn };
    };
    const f = fetchFalso({ 'POST /oauth/token': [{ status: 400, body: { error: 'invalid_grant' } }] });
    expect(await obterAccessToken('o', { store: t.store, fetch: f.fn, credenciais: cred, relogio, agora: agoraTk })).toBe('A-outro');
    expect(t.log.some((l) => l.startsWith('reconectar'))).toBe(false);
  });

  it('API com 401: renova uma vez e repete a chamada', async () => {
    let tokens = 0;
    const f = fetchFalso({
      'GET /v1/financeiro/parcelas/p': (req) =>
        req.headers.Authorization === 'Bearer T1' ? { status: 401 } : { status: 200, body: { status: 'PENDENTE' } },
    });
    const a = new ContaAzulApi({
      fetch: f.fn,
      token: async (forcar) => { tokens++; return forcar ? 'T2' : 'T1'; },
      aguardarVez: async () => {},
      relogio,
    });
    expect(await a.obterParcela('p')).toEqual({ status: 'PENDENTE' });
    expect(tokens).toBe(2);
  });
});
