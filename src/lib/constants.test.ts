import { describe, it, expect } from 'vitest';
import { parseAmountToCents, parseDecimalBR, formatAmountInput, amountFieldError, parseOptionalLimitCents } from './constants';

describe('parseAmountToCents', () => {
  it.each([
    ['61,40', 6140],
    ['61.40', 6140],
    ['1.500', 150000],
    ['2.000', 200000],
    ['1.500,00', 150000],
    ['1.234,56', 123456],
    ['1.234.567', 123456700],
    ['R$ 61,40', 6140],
    ['30', 3000],
    ['0,5', 50],
    ['12.5', 1250],
  ])('%s → %i centavos', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it('devolve NaN para o que não for número', () => {
    expect(parseAmountToCents('abc')).toBeNaN();
    expect(parseAmountToCents('-5')).toBeNaN();
    expect(parseAmountToCents('')).toBeNaN();
  });

  it('formatAmountInput mostra o milhar lido corretamente', () => {
    expect(formatAmountInput('1.500')).toBe('1.500,00');
    expect(amountFieldError('1.500')).toBeNull();
  });
});

describe('parseDecimalBR (km)', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['1.234', 1234],
    ['1.234,5', 1234.5],
    ['80', 80],
  ])('%s → %d', (input, n) => {
    expect(parseDecimalBR(input)).toBe(n);
  });

  it('devolve NaN para texto', () => {
    expect(parseDecimalBR('abc')).toBeNaN();
  });
});

describe('parseOptionalLimitCents', () => {
  it('vazio é sem limite', () => {
    expect(parseOptionalLimitCents('')).toBeNull();
    expect(parseOptionalLimitCents('   ')).toBeNull();
    expect(parseOptionalLimitCents(undefined)).toBeNull();
  });
  it.each([
    ['30,00', 3000],
    ['30.00', 3000],
    ['1.234,56', 123456],
    ['1.500', 150000],
    ['0', 0],
  ])('"%s" → %i centavos', (input, cents) => {
    expect(parseOptionalLimitCents(input)).toBe(cents);
  });
  it('texto ou negativo é inválido (antes virava NaN no banco)', () => {
    expect(parseOptionalLimitCents('abc')).toBe('invalid');
    expect(parseOptionalLimitCents('-5')).toBe('invalid');
  });
});
