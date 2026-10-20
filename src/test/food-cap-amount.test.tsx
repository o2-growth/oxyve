/**
 * Teto de alimentação no campo Valor: o campo é o lançado (min(nota, dias × teto)),
 * a nota fica de referência e a edição da pessoa é respeitada.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFoodCapAmount } from '@/hooks/useFoodCapAmount';
import { foodCapCents, foodCapLabel } from '@/lib/constants';

type Props = { active: boolean; days: number };

function setup(initial: Props = { active: true, days: 1 }) {
  const field = { value: '' };
  const hook = renderHook(
    (p: Props) =>
      useFoodCapAmount({ active: p.active, days: p.days, dailyLimitCents: 3000, setAmount: (v) => (field.value = v) }),
    { initialProps: initial },
  );
  /** Pessoa digita e sai do campo. */
  const type = (v: string) => {
    field.value = v;
    act(() => hook.result.current.onAmountBlur(v));
  };
  return { field, hook, type };
}

describe('foodCapCents / foodCapLabel', () => {
  it('limita a nota a dias × teto', () => {
    expect(foodCapCents(7000, 3000)).toBe(3000);
    expect(foodCapCents(2200, 3000)).toBe(2200);
    expect(foodCapCents(12000, 3000, 3)).toBe(9000);
  });
  it('texto do teto com e sem vários dias', () => {
    expect(foodCapLabel(3000).replace(/\s/g, ' ')).toBe('R$ 30,00/dia');
    expect(foodCapLabel(3000, 3).replace(/\s/g, ' ')).toBe('R$ 30,00/dia × 3 dias');
  });
});

describe('useFoodCapAmount', () => {
  it('nota de 70 lida do comprovante → campo 30, nota guardada', () => {
    const { field, hook } = setup();
    act(() => hook.result.current.applyNote(7000));
    expect(field.value).toBe('30,00');
    expect(hook.result.current.noteCents).toBe(7000);
    expect(hook.result.current.referenceCents(field.value)).toBe(7000);
  });

  it('nota de 22 digitada → campo 22', () => {
    const { field, type } = setup();
    type('22,00');
    expect(field.value).toBe('22,00');
  });

  it('nota de 70 digitada e sai do campo → 30', () => {
    const { field, type } = setup();
    type('70,00');
    expect(field.value).toBe('30,00');
  });

  it('3 dias, nota de 120 → 90', () => {
    const { field, type } = setup({ active: true, days: 3 });
    type('120,00');
    expect(field.value).toBe('90,00');
  });

  it('mudar os dias recalcula a partir da nota', () => {
    const { field, hook, type } = setup();
    type('120,00');
    expect(field.value).toBe('30,00');
    hook.rerender({ active: true, days: 3 });
    expect(field.value).toBe('90,00');
  });

  it('edição manual depois do preenchimento automático é respeitada', () => {
    const { field, hook, type } = setup();
    act(() => hook.result.current.applyNote(7000));
    type('45,00');
    expect(field.value).toBe('45,00');
    expect(hook.result.current.noteCents).toBe(7000);
    hook.rerender({ active: true, days: 1 });
    expect(field.value).toBe('45,00');
  });

  it('evento (sem teto) volta ao valor da nota; desmarcar aplica o teto de novo', () => {
    const { field, hook } = setup();
    act(() => hook.result.current.applyNote(7000));
    hook.rerender({ active: false, days: 1 });
    expect(field.value).toBe('70,00');
    hook.rerender({ active: true, days: 1 });
    expect(field.value).toBe('30,00');
  });

  it('categoria que não é alimentação: valor = nota', () => {
    const { field, type } = setup({ active: false, days: 1 });
    type('70,00');
    expect(field.value).toBe('70,00');
  });

  it('trocar para alimentação recalcula; voltar devolve a nota', () => {
    const { field, hook, type } = setup({ active: false, days: 1 });
    type('70,00');
    hook.rerender({ active: true, days: 1 });
    expect(field.value).toBe('30,00');
    hook.rerender({ active: false, days: 1 });
    expect(field.value).toBe('70,00');
  });

  it('campo apagado: o próximo valor digitado volta a ser a nota', () => {
    const { field, hook, type } = setup();
    act(() => hook.result.current.applyNote(7000));
    type('');
    type('50,00');
    expect(field.value).toBe('30,00');
    expect(hook.result.current.noteCents).toBe(5000);
  });

  it('despesa já salva: sair do campo sem mudar não recalcula', () => {
    const { field, hook } = setup();
    act(() => hook.result.current.reset(7000));
    field.value = '70,00';
    act(() => hook.result.current.onAmountBlur('70,00'));
    expect(field.value).toBe('70,00');
    expect(hook.result.current.noteCents).toBeNull();
  });
});
