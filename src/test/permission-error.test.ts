import { describe, it, expect } from 'vitest';
import { isPermissionError } from '@/lib/permissionError';

describe('isPermissionError', () => {
  it('reconhece RLS pelo código e pela mensagem', () => {
    expect(isPermissionError({ code: '42501', message: 'x' })).toBe(true);
    expect(
      isPermissionError({ message: 'new row violates row-level security policy (USING expression) for table "expense_reviews"' }),
    ).toBe(true);
  });

  it('reconhece o "Acesso restrito" das RPCs de gestão', () => {
    expect(isPermissionError({ code: 'P0001', message: 'Acesso restrito a administradores.' })).toBe(true);
  });

  it('erro de rede ou de servidor não é permissão', () => {
    expect(isPermissionError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPermissionError({ code: '22012', message: 'division by zero' })).toBe(false);
    expect(isPermissionError(null)).toBe(false);
  });
});
