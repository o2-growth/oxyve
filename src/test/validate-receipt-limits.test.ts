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
