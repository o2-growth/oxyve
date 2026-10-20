/**
 * F2 — limites de tamanho do validate-receipt (edge function).
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGE_BASE64_CHARS,
  MAX_BODY_BYTES,
  isDeclaredBodyTooLarge,
  isImageTooLarge,
  PAYLOAD_TOO_LARGE_MESSAGE,
  QUOTA_RPC,
  RATE_LIMIT_MESSAGE,
  quotaOutcome,
} from '../../supabase/functions/validate-receipt/limits.ts';

describe('validate-receipt: limites', () => {
  it('aceita base64 até o limite e recusa acima', () => {
    expect(isImageTooLarge('a'.repeat(MAX_IMAGE_BASE64_CHARS))).toBe(false);
    expect(isImageTooLarge('a'.repeat(MAX_IMAGE_BASE64_CHARS + 1))).toBe(true);
    expect(isImageTooLarge(undefined)).toBe(false);
  });

  it('recusa pelo Content-Length antes de ler o corpo', () => {
    expect(isDeclaredBodyTooLarge(null)).toBe(false);
    expect(isDeclaredBodyTooLarge('1000')).toBe(false);
    expect(isDeclaredBodyTooLarge(String(MAX_BODY_BYTES))).toBe(false);
    expect(isDeclaredBodyTooLarge(String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(isDeclaredBodyTooLarge('lixo')).toBe(false);
  });

  it('mensagem em pt-BR', () => {
    expect(PAYLOAD_TOO_LARGE_MESSAGE).toMatch(/muito grande/);
  });
});

describe('validate-receipt: cota por usuário', () => {
  it('usa a RPC da migration de cota', () => {
    expect(QUOTA_RPC).toBe('consume_receipt_validation_quota');
  });

  it('true libera, false estoura', () => {
    expect(quotaOutcome({ data: true, error: null })).toBe('allowed');
    expect(quotaOutcome({ data: false, error: null })).toBe('exceeded');
    expect(quotaOutcome({ data: null, error: null })).toBe('exceeded');
  });

  it('função ausente no banco não derruba a leitura; outro erro recusa', () => {
    expect(quotaOutcome({ data: null, error: { code: 'PGRST202' } })).toBe('allowed');
    expect(quotaOutcome({ data: null, error: { code: '42883' } })).toBe('allowed');
    expect(quotaOutcome({ data: null, error: { code: '57014' } })).toBe('unavailable');
  });

  it('mensagem de cota em pt-BR e sem bloquear o lançamento', () => {
    expect(RATE_LIMIT_MESSAGE).toMatch(/Limite de leituras automáticas/);
    expect(RATE_LIMIT_MESSAGE).toMatch(/pode ser salva/);
  });
});
