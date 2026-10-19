/**
 * validate-receipt — normalização da saída do modelo e prompt (edge function,
 * módulos puros).
 */
import { describe, it, expect } from 'vitest';
import {
  isValidCnpj,
  normalizeAmountCents,
  normalizeCnpj,
  normalizeDate,
  normalizeExtraction,
  normalizeSupplier,
  todayInSaoPaulo,
} from '../../supabase/functions/validate-receipt/normalize.ts';
import {
  EXTRACT_TOOL,
  PRIMARY_MODEL,
  SYSTEM_PROMPT,
  buildChatRequest,
} from '../../supabase/functions/validate-receipt/prompt.ts';

// 19/10/2026 01:30 UTC = 18/10/2026 22:30 em Brasília.
const NOW = new Date('2026-10-19T01:30:00Z');

const good = {
  extracted_date: '2026-10-15',
  extracted_amount_cents: 4590,
  extracted_cnpj: '11.222.333/0001-81',
  extracted_supplier: '  Restaurante   Bom Prato  ',
  receipt_type: 'nota_fiscal',
  confidence: 'high',
  amount_confidence: 'high',
  date_confidence: 'high',
  issues: [],
  expense_kind_hint: 'food',
};

describe('todayInSaoPaulo', () => {
  it('usa o fuso de Brasília, não UTC', () => {
    expect(todayInSaoPaulo(NOW)).toBe('2026-10-18');
    expect(todayInSaoPaulo(new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19');
  });
});

describe('normalizeAmountCents', () => {
  it('aceita inteiro positivo abaixo do teto', () => {
    expect(normalizeAmountCents(4590)).toBe(4590);
    expect(normalizeAmountCents('4590')).toBe(4590);
    expect(normalizeAmountCents(99_999_999)).toBe(99_999_999);
  });

  it('recusa zero, negativo, fração, teto e lixo', () => {
    expect(normalizeAmountCents(0)).toBeNull();
    expect(normalizeAmountCents(-100)).toBeNull();
    expect(normalizeAmountCents(45.9)).toBeNull();
    expect(normalizeAmountCents(100_000_000)).toBeNull();
    expect(normalizeAmountCents('45,90')).toBeNull();
    expect(normalizeAmountCents(null)).toBeNull();
    expect(normalizeAmountCents(Number.NaN)).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('aceita ISO válida até hoje em Brasília', () => {
    expect(normalizeDate('2026-10-15', NOW)).toBe('2026-10-15');
    expect(normalizeDate('2026-10-18', NOW)).toBe('2026-10-18');
  });

  it('recusa data futura no fuso de Brasília (já é dia 19 em UTC)', () => {
    expect(normalizeDate('2026-10-19', NOW)).toBeNull();
  });

  it('aceita dd/mm/aaaa e dd/mm/aa (ano de 2 dígitos = 20xx)', () => {
    expect(normalizeDate('15/10/2026', NOW)).toBe('2026-10-15');
    expect(normalizeDate('15/10/26', NOW)).toBe('2026-10-15');
    expect(normalizeDate('1/9/26', NOW)).toBe('2026-09-01');
  });

  it('recusa data mais antiga que a janela (modelo inventando ano)', () => {
    expect(normalizeDate('2023-10-12', NOW)).toBeNull();
    expect(normalizeDate('12/10/23', NOW)).toBeNull();
    expect(normalizeDate('2026-08-18', NOW)).toBeNull();
    expect(normalizeDate('2026-08-19', NOW)).toBe('2026-08-19');
  });

  it('recusa data inexistente, anterior a 2000 e formato estranho', () => {
    expect(normalizeDate('2026-02-30', NOW)).toBeNull();
    expect(normalizeDate('31/04/2026', NOW)).toBeNull();
    expect(normalizeDate('1999-12-31', NOW)).toBeNull();
    expect(normalizeDate('2026/10/15', NOW)).toBeNull();
    expect(normalizeDate('ontem', NOW)).toBeNull();
    expect(normalizeDate(null, NOW)).toBeNull();
  });
});

describe('CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11444777000161')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
  });

  it('normaliza para só dígitos e descarta inválido (não inventa CNPJ)', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeCnpj('11.222.333/0001-80')).toBeNull();
    expect(normalizeCnpj('123.456.789-09')).toBeNull(); // CPF
    expect(normalizeCnpj(null)).toBeNull();
  });
});

describe('normalizeSupplier', () => {
  it('apara espaços e limita a 80 caracteres', () => {
    expect(normalizeSupplier('  Posto   Ipiranga  ')).toBe('Posto Ipiranga');
    expect(normalizeSupplier('x'.repeat(120))).toHaveLength(80);
    expect(normalizeSupplier('   ')).toBeNull();
    expect(normalizeSupplier(42)).toBeNull();
  });
});

describe('normalizeExtraction', () => {
  it('leitura boa passa limpa', () => {
    expect(normalizeExtraction(good, NOW)).toEqual({
      extracted_date: '2026-10-15',
      extracted_amount_cents: 4590,
      extracted_cnpj: '11222333000181',
      extracted_supplier: 'Restaurante Bom Prato',
      receipt_type: 'nota_fiscal',
      confidence: 'high',
      amount_confidence: 'high',
      date_confidence: 'high',
      issues: [],
      expense_kind_hint: 'food',
    });
  });

  it('valor inválido vira null e derruba a confiança do valor', () => {
    const r = normalizeExtraction({ ...good, extracted_amount_cents: 0 }, NOW);
    expect(r.extracted_amount_cents).toBeNull();
    expect(r.amount_confidence).toBe('low');
    expect(r.date_confidence).toBe('high');
  });

  it('data futura vira null e derruba a confiança da data', () => {
    const r = normalizeExtraction({ ...good, extracted_date: '2027-01-01' }, NOW);
    expect(r.extracted_date).toBeNull();
    expect(r.date_confidence).toBe('low');
  });

  it('foto cortada não deixa valor nem data como certeza', () => {
    const r = normalizeExtraction({ ...good, issues: ['cropped'] }, NOW);
    expect(r.amount_confidence).toBe('medium');
    expect(r.date_confidence).toBe('medium');
    expect(r.extracted_amount_cents).toBe(good.extracted_amount_cents);
  });

  it('sem data lida, o valor também pede conferência', () => {
    const r = normalizeExtraction({ ...good, extracted_date: null, date_confidence: 'low' }, NOW);
    expect(r.extracted_amount_cents).toBe(good.extracted_amount_cents);
    expect(r.amount_confidence).toBe('medium');
  });

  it('resposta no formato antigo herda a confiança geral por campo', () => {
    const r = normalizeExtraction(
      { extracted_date: '2026-10-15', extracted_amount_cents: 4590, confidence: 'medium' },
      NOW,
    );
    expect(r.amount_confidence).toBe('medium');
    expect(r.date_confidence).toBe('medium');
    expect(r.issues).toEqual([]);
    expect(r.expense_kind_hint).toBeNull();
  });

  it('sem confiança geral, deriva do pior campo', () => {
    const { confidence: _c, ...rest } = good;
    expect(normalizeExtraction({ ...rest, date_confidence: 'medium' }, NOW).confidence).toBe('medium');
  });

  it('filtra issues e enums desconhecidos', () => {
    const r = normalizeExtraction(
      { ...good, issues: ['blurry', 'blurry', 'xyz'], receipt_type: 'boleto', expense_kind_hint: 'hotel' },
      NOW,
    );
    expect(r.issues).toEqual(['blurry']);
    expect(r.receipt_type).toBeNull();
    expect(r.expense_kind_hint).toBeNull();
  });

  it('not_a_receipt não devolve nada para preencher', () => {
    const r = normalizeExtraction({ ...good, issues: ['not_a_receipt'] }, NOW);
    expect(r).toMatchObject({
      extracted_date: null,
      extracted_amount_cents: null,
      extracted_cnpj: null,
      extracted_supplier: null,
      receipt_type: null,
      confidence: 'low',
      issues: ['not_a_receipt'],
    });
  });

  it('entrada vazia ou lixo vira leitura low', () => {
    for (const raw of [undefined, null, 'x', {}]) {
      const r = normalizeExtraction(raw, NOW);
      expect(r.extracted_amount_cents).toBeNull();
      expect(r.confidence).toBe('low');
      expect(r.issues).toEqual([]);
    }
  });
});

describe('prompt e schema', () => {
  it('modelo e pedido determinístico com detail high', () => {
    expect(PRIMARY_MODEL).toBe('gpt-4.1');
    const body = buildChatRequest(PRIMARY_MODEL, 'data:image/jpeg;base64,x');
    expect(body.model).toBe('gpt-4.1');
    expect(body.temperature).toBe(0);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'extract_receipt_data' } });
    const image = (body.messages[1].content as Array<{ type: string; image_url?: { detail: string } }>)[1];
    expect(image.image_url?.detail).toBe('high');
  });

  it('schema mantém os campos antigos e traz os novos', () => {
    const props = Object.keys(EXTRACT_TOOL.function.parameters.properties);
    expect(props).toEqual(
      expect.arrayContaining([
        'extracted_date', 'extracted_amount_cents', 'extracted_cnpj', 'extracted_supplier',
        'receipt_type', 'confidence', 'amount_confidence', 'date_confidence', 'issues', 'expense_kind_hint',
      ]),
    );
  });

  it('prompt cobre as armadilhas de total e data', () => {
    expect(SYSTEM_PROMPT).toMatch(/VALOR A PAGAR/);
    expect(SYSTEM_PROMPT).toMatch(/subtotal/);
    expect(SYSTEM_PROMPT).toMatch(/troco/);
    expect(SYSTEM_PROMPT).toMatch(/12\.741/);
    expect(SYSTEM_PROMPT).toMatch(/vencimento/);
    expect(SYSTEM_PROMPT).toMatch(/20xx/);
    expect(SYSTEM_PROMPT).toMatch(/EMITENTE/);
    expect(SYSTEM_PROMPT).toMatch(/soma dos itens/);
  });
});
