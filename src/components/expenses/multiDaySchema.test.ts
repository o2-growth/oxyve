import { describe, it, expect } from 'vitest';
import { multiDaySchema } from './multiDaySchema';

const base = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    category_id: 'c1',
    start_date: today,
    end_date: today,
    amount_per_day: '30,00',
    description: 'Almoço',
    is_event: false,
    notes: '',
  };
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

describe('multiDaySchema', () => {
  it('aceita valor com ponto de milhar e período dentro da janela', () => {
    expect(multiDaySchema.safeParse({ ...base(), amount_per_day: '1.200', start_date: daysAgo(3) }).success).toBe(true);
  });

  it.each(['abc', '-5', '0'])('recusa valor inválido %s', (amount) => {
    expect(multiDaySchema.safeParse({ ...base(), amount_per_day: amount }).success).toBe(false);
  });

  it('recusa início além da janela de lançamento', () => {
    const r = multiDaySchema.safeParse({ ...base(), start_date: daysAgo(25) });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/dias atrás/);
  });

  it('recusa fim no futuro', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(multiDaySchema.safeParse({ ...base(), end_date: tomorrow }).success).toBe(false);
  });
});
