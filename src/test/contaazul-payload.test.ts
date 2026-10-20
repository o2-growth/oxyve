/**
 * Conta Azul — montagem da conta a pagar e cálculo do vencimento (módulos puros
 * da edge contaazul-sync).
 */
import { describe, it, expect } from 'vitest';
import {
  centavosParaReais,
  cpfDoPerfil,
  descricaoConta,
  formatarCpf,
  montarContaAPagar,
  montarPessoa,
  reaisParaCentavos,
  type DespesaInput,
  type MontarInput,
} from '../../supabase/functions/_shared/contaazul/payload.ts';
import {
  calcularVencimento,
  dataSaoPaulo,
  normalizarDia,
  somarDias,
} from '../../supabase/functions/_shared/contaazul/vencimento.ts';

const desp = (over: Partial<DespesaInput>): DespesaInput => ({
  id: Math.random().toString(36).slice(2),
  description: 'x',
  status: 'approved',
  is_reimbursable: true,
  reimbursable_cents: 1000,
  category_id: 'cat-almoco',
  category_name: 'Almoço',
  kind: 'food',
  sector: 'Comercial',
  ...over,
});

const base = (over: Partial<MontarInput> = {}): MontarInput => ({
  report: { id: 'r-1', title: 'Out 2026', end_date: '2026-10-31' },
  dataAprovacao: '2026-11-03',
  nomeFuncionario: 'Bia Souza',
  pessoaId: 'pessoa-1',
  contaFinanceiraId: 'conta-1',
  diaVencimento: 25,
  expenses: [desp({})],
  categoryMap: [
    { expense_category_id: 'cat-almoco', kind: null, ca_categoria_id: 'ca-alim' },
    { expense_category_id: null, kind: 'transport', ca_categoria_id: 'ca-transp' },
  ],
  sectorMap: [{ sector: 'Comercial', ca_centro_custo_id: 'cc-com' }],
  ...over,
});

describe('vencimento', () => {
  it('aprovado antes do dia 25 vence no 25 do mesmo mês', () => {
    expect(calcularVencimento('2026-11-03')).toBe('2026-11-25');
  });
  it('aprovado no próprio dia 25 vence no mesmo dia', () => {
    expect(calcularVencimento('2026-11-25')).toBe('2026-11-25');
  });
  it('aprovado depois do dia 25 vence no 25 do mês seguinte', () => {
    expect(calcularVencimento('2026-11-26')).toBe('2026-12-25');
  });
  it('virada de ano: 26/12 vence em 25/01 do ano seguinte', () => {
    expect(calcularVencimento('2026-12-26')).toBe('2027-01-25');
    expect(calcularVencimento('2026-12-31', 10)).toBe('2027-01-10');
  });
  it('dia configurável e fora de 1..28 cai no padrão 25', () => {
    expect(calcularVencimento('2026-02-05', 10)).toBe('2026-02-10');
    expect(calcularVencimento('2026-02-11', 10)).toBe('2026-03-10');
    expect(normalizarDia(31)).toBe(25);
    expect(normalizarDia(0)).toBe(25);
    expect(normalizarDia(28)).toBe(28);
  });
  it('data da aprovação é a de São Paulo, não a de UTC', () => {
    // 23h30 de 25/11 em Brasília = 02h30 de 26/11 em UTC.
    expect(dataSaoPaulo('2026-11-26T02:30:00Z')).toBe('2026-11-25');
    expect(calcularVencimento(dataSaoPaulo('2026-11-26T02:30:00Z'))).toBe('2026-11-25');
  });
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-25', 10)).toBe('2027-01-04');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('centavos', () => {
  it('converte sem resíduo de ponto flutuante', () => {
    expect(centavosParaReais(10)).toBe(0.1);
    expect(centavosParaReais(123456)).toBe(1234.56);
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
    expect(reaisParaCentavos(null)).toBe(0);
  });
});

describe('montarContaAPagar', () => {
  it('monta descrição, competência, referência, parcela única com PIX e observação com link', () => {
    const r = montarContaAPagar(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.payload;
    expect(p.descricao).toBe('Reembolso Bia Souza — Out 2026');
    expect(p.data_competencia).toBe('2026-10-31');
    expect(p.referencia_externa).toBe('oxyve-report-r-1');
    expect(p.id_fornecedor).toBe('pessoa-1');
    expect(p.conta_financeira).toBe('conta-1');
    expect(p.valor).toBe(10);
    expect(p.condicao_pagamento.parcelas).toEqual([
      {
        descricao: 'Reembolso Bia Souza — Out 2026',
        data_vencimento: '2026-11-25',
        conta_financeira: 'conta-1',
        detalhe_valor: { valor_bruto: 10 },
        metodo_pagamento: 'PIX_PAGAMENTO_INSTANTANEO',
      },
    ]);
    expect(p.observacao).toContain('https://oxyve.vercel.app/app/reports/r-1');
    expect(p.observacao).toContain('1 item reembolsável');
  });

  it('soma do rateio (categorias e centros) bate centavo a centavo com o valor', () => {
    // 3 x R$ 0,10 + R$ 0,20 — o clássico 0.1+0.2 do ponto flutuante.
    const expenses = [
      desp({ reimbursable_cents: 10 }),
      desp({ reimbursable_cents: 10, sector: 'Operação' }),
      desp({ reimbursable_cents: 10 }),
      desp({ reimbursable_cents: 20, category_id: 'cat-uber', category_name: 'Uber', kind: 'transport', sector: null }),
      desp({ reimbursable_cents: 33333, category_id: 'cat-uber', category_name: 'Uber', kind: 'transport', sector: null }),
    ];
    const r = montarContaAPagar(
      base({
        expenses,
        sectorMap: [
          { sector: 'Comercial', ca_centro_custo_id: 'cc-com' },
          { sector: 'Operação', ca_centro_custo_id: 'cc-op' },
          { sector: 'Geral', ca_centro_custo_id: 'cc-geral' },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valorCents).toBe(33383);
    expect(r.payload.valor).toBe(333.83);
    const somaCat = r.rateioCents.reduce((s, c) => s + c.cents, 0);
    expect(somaCat).toBe(r.valorCents);
    for (const c of r.rateioCents) {
      expect(c.centros.reduce((s, x) => s + x.cents, 0)).toBe(c.cents);
    }
    // E em reais, como vai no JSON, também fecha (comparado em centavos).
    const somaReais = r.payload.rateio.reduce((s, c) => s + Math.round(c.valor * 100), 0);
    expect(somaReais).toBe(r.valorCents);
    expect(r.payload.rateio).toEqual([
      {
        id_categoria: 'ca-alim',
        valor: 0.3,
        rateio_centro_custo: [
          { id_centro_custo: 'cc-com', valor: 0.2 },
          { id_centro_custo: 'cc-op', valor: 0.1 },
        ],
      },
      { id_categoria: 'ca-transp', valor: 333.53, rateio_centro_custo: [{ id_centro_custo: 'cc-geral', valor: 333.53 }] },
    ]);
  });

  it('despesa não reembolsável, recusada, rascunho ou sem valor fica fora', () => {
    const r = montarContaAPagar(
      base({
        expenses: [
          desp({ reimbursable_cents: 3000 }),
          desp({ reimbursable_cents: 5000, is_reimbursable: false }),
          desp({ reimbursable_cents: 7000, status: 'rejected' }),
          desp({ reimbursable_cents: 7000, status: 'draft' }),
          desp({ reimbursable_cents: 0 }),
          desp({ reimbursable_cents: 1500, status: 'paid' }),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valorCents).toBe(4500);
    expect(r.itens).toBe(2);
    expect(r.payload.observacao).toContain('2 itens reembolsáveis');
  });

  it('relatório só com não reembolsável não vira conta', () => {
    const r = montarContaAPagar(base({ expenses: [desp({ is_reimbursable: false })] }));
    expect(r).toEqual({ ok: false, erro: 'Relatório sem valor reembolsável aprovado.' });
  });

  it('categoria sem de-para (nem pelo tipo) gera erro e não envia', () => {
    const r = montarContaAPagar(
      base({ expenses: [desp({}), desp({ category_id: 'cat-hotel', category_name: 'Hotel', kind: 'other' })] }),
    );
    expect(r).toEqual({ ok: false, erro: 'Categoria Hotel sem correspondente no Conta Azul.' });
  });

  it('várias categorias sem de-para aparecem juntas, em ordem', () => {
    const r = montarContaAPagar(
      base({
        categoryMap: [],
        expenses: [desp({ category_name: 'Uber', category_id: 'u' }), desp({ category_name: 'Almoço' })],
      }),
    );
    expect(r).toEqual({ ok: false, erro: 'Categorias Almoço, Uber sem correspondente no Conta Azul.' });
  });

  it('tipo serve de fallback quando a categoria não tem de-para; sem categoria cai em "other"', () => {
    const r = montarContaAPagar(
      base({
        categoryMap: [
          { expense_category_id: null, kind: 'food', ca_categoria_id: 'ca-food' },
          { expense_category_id: null, kind: 'other', ca_categoria_id: 'ca-outros' },
        ],
        expenses: [desp({}), desp({ category_id: null, category_name: null, kind: null, sector: null })],
        sectorMap: [],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.rateio).toEqual([
      { id_categoria: 'ca-food', valor: 10 },
      { id_categoria: 'ca-outros', valor: 10 },
    ]);
  });

  it('setor sem de-para: rateio sem centro de custo; mistura na mesma categoria omite e avisa', () => {
    const r = montarContaAPagar(base({ expenses: [desp({}), desp({ sector: 'Diretoria' })] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.rateio).toEqual([{ id_categoria: 'ca-alim', valor: 20 }]);
    expect(r.payload.observacao).toContain('Centro de custo omitido');

    const semNenhum = montarContaAPagar(base({ sectorMap: [] }));
    expect(semNenhum.ok && semNenhum.payload.rateio).toEqual([{ id_categoria: 'ca-alim', valor: 10 }]);
    expect(semNenhum.ok && semNenhum.payload.observacao).not.toContain('omitido');
  });

  it('sem conta financeira configurada não monta', () => {
    expect(montarContaAPagar(base({ contaFinanceiraId: null }))).toEqual({
      ok: false,
      erro: 'Conta financeira do Conta Azul não configurada.',
    });
  });

  it('sem data final usa a data da aprovação como competência', () => {
    const r = montarContaAPagar(base({ report: { id: 'r', title: 'Avulso', end_date: null } }));
    expect(r.ok && r.payload.data_competencia).toBe('2026-11-03');
  });

  it('vencimento segue o dia configurado e vira o ano', () => {
    const r = montarContaAPagar(base({ dataAprovacao: '2026-12-28', diaVencimento: 25 }));
    expect(r.ok && r.vencimento).toBe('2027-01-25');
    expect(r.ok && r.payload.condicao_pagamento.parcelas[0].data_vencimento).toBe('2027-01-25');
  });
});

describe('pessoa do funcionário', () => {
  it('CPF do perfil: só 11 dígitos servem', () => {
    expect(cpfDoPerfil('123.456.789-09')).toBe('12345678909');
    expect(cpfDoPerfil('12345678000199')).toBeNull();
    expect(cpfDoPerfil(null)).toBeNull();
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
  });
  it('corpo do POST /v1/pessoas: física, fornecedor, CPF formatado', () => {
    expect(montarPessoa('Bia', '12345678909', 'bia@o2inc.com.br')).toEqual({
      nome: 'Bia',
      tipo_pessoa: 'Física',
      cpf: '123.456.789-09',
      ativo: true,
      perfis: [{ tipo_perfil: 'Fornecedor' }],
      email: 'bia@o2inc.com.br',
    });
  });
  it('descrição tem nome e título', () => {
    expect(descricaoConta('', 'Out 2026')).toBe('Reembolso colaborador — Out 2026');
  });
});
